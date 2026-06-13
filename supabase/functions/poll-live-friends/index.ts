import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';
import { formatCentis, getCompetitionClasses, getLiveFavoriteResults, LiveFavorite, LiveFavoriteResult } from '../_shared/liveresultat.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FriendWatchRow = {
  friend_club: string | null;
  friend_name: string;
  friend_person_id: string;
  person_id: string;
  push_on_live: boolean;
};

type TokenRow = {
  person_id: string;
  push_token: string;
};

type LiveStateRow = {
  event_id: string;
  event_race_id: string;
  event_name: string | null;
  friend_person_id: string;
  last_live_status: number | null;
  live_class_name: string | null;
  live_competition_id: number | null;
  live_result_notified_at: string | null;
  notified_split_codes: number[] | null;
  start_notified_at: string | null;
};

type PushMessage = { body: string; data: Record<string, unknown>; sound: 'default'; title: string; to: string };

const LIVE_TITLE = 'LIVE-rapport';

// Liveresultat status codes
const STATUS_FINISHED = 0;
const RUNNING_STATUSES = new Set([9, 10]);
// Terminal statuses that should stop further polling for this friend+event.
const TERMINAL_STATUSES = new Set([0, 1, 2, 3, 4, 5, 11, 12]);

function normalizeKeyPart(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function favoriteKey(competitionId: number, name: string, className: string): string {
  return `${competitionId}::${normalizeKeyPart(name)}::${normalizeKeyPart(className)}`;
}

// Stockholm wall-clock time expressed in centiseconds since midnight, used to
// tell whether a runner with a "running/not-started" status has actually begun.
function stockholmNowCentis(now: Date): number {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Europe/Stockholm',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return ((get('hour') * 3600) + (get('minute') * 60) + get('second')) * 100;
}

function terminalStatusText(status: number): string | null {
  switch (status) {
    case 2: return 'bröt loppet';
    case 3: return 'felstämplade';
    case 4: return 'diskvalificerades';
    case 5: return 'översteg maxtiden';
    default: return null; // DNS / WO / MovedUp → silent terminal
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth: require CRON_SECRET header (same pattern as poll-friend-activity).
    const cronSecret = Deno.env.get('CRON_SECRET');
    const incomingSecret = request.headers.get('x-cron-secret');
    if (cronSecret && incomingSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Load live-enabled watches + active device tokens.
    const [
      { data: watches, error: watchesErr },
      { data: tokens, error: tokensErr },
    ] = await Promise.all([
      supabase
        .from('friend_watches')
        .select('friend_club, friend_name, friend_person_id, person_id, push_on_live')
        .eq('push_on_live', true),
      supabase
        .from('device_push_tokens')
        .select('person_id, push_token')
        .eq('is_active', true)
        .not('push_token', 'is', null)
        .order('updated_at', { ascending: false }),
    ]);

    if (watchesErr) throw watchesErr;
    if (tokensErr) throw tokensErr;

    const liveWatches = (watches ?? []) as FriendWatchRow[];
    if (liveWatches.length === 0) {
      return jsonOk({ ok: true, activeFriends: 0, pushCount: 0, reason: 'no-live-watches' });
    }

    // Token map: one token per device, most recent person wins.
    const tokensByPerson = new Map<string, string[]>();
    const seenTokens = new Set<string>();
    for (const row of (tokens ?? []) as TokenRow[]) {
      if (seenTokens.has(row.push_token)) continue;
      seenTokens.add(row.push_token);
      const arr = tokensByPerson.get(row.person_id) ?? [];
      arr.push(row.push_token);
      tokensByPerson.set(row.person_id, arr);
    }

    // Per friend: who watches them (person ids) + display name/club.
    const watchersByFriend = new Map<string, Set<string>>();
    const friendMeta = new Map<string, { name: string; club: string }>();
    for (const w of liveWatches) {
      const set = watchersByFriend.get(w.friend_person_id) ?? new Set<string>();
      set.add(w.person_id);
      watchersByFriend.set(w.friend_person_id, set);
      if (!friendMeta.has(w.friend_person_id)) {
        friendMeta.set(w.friend_person_id, { name: w.friend_name, club: w.friend_club ?? '' });
      }
    }

    const liveFriendIds = [...watchersByFriend.keys()];

    // 2. Load active live state rows (matched competition, not yet finished).
    const { data: states, error: statesErr } = await supabase
      .from('friend_activity_state')
      .select('event_id, event_race_id, event_name, friend_person_id, last_live_status, live_class_name, live_competition_id, live_result_notified_at, notified_split_codes, start_notified_at')
      .eq('event_date', todayStr)
      .gt('live_competition_id', 0)
      .is('live_result_notified_at', null)
      .in('friend_person_id', liveFriendIds);

    if (statesErr) throw statesErr;

    const activeStates = (states ?? []) as LiveStateRow[];
    if (activeStates.length === 0) {
      return jsonOk({ ok: true, activeFriends: 0, pushCount: 0, reason: 'no-active-live-rows' });
    }

    // 3. Build favorites for the batch query + an index back to the state row.
    //
    // getFavoriteresult matches STRICTLY on name + club + className, and the
    // className must be liveresultat's own label (e.g. "Lång"), which often
    // differs from the Eventor class we store on the row (e.g. an age class) —
    // or is unknown entirely for free-start runners who only appear at the
    // finish. A wrong/empty className makes getFavoriteresult silently return
    // nothing → no finish push ever. So we "shotgun": fetch each competition's
    // class list and submit one favorite per class. The backend returns only the
    // matching class, and we join results back by competition+name (below).
    const competitionIds = [...new Set(
      activeStates.map((r) => r.live_competition_id).filter((id): id is number => !!id && id > 0),
    )];
    const classesByComp = new Map<number, string[]>();
    await Promise.all(competitionIds.map(async (compId) => {
      classesByComp.set(compId, await getCompetitionClasses(compId));
    }));

    const favorites: LiveFavorite[] = [];
    const stateByFavorite = new Map<string, LiveStateRow>();
    // Fallback index keyed by competition + runner name only. Eventor and
    // liveresultat frequently spell class names differently (e.g. Eventor
    // "Herrar 21 Lång" vs liveresultat "H21L"), which would break the strict
    // competition+name+class join and silently drop every push. Name within one
    // competition is unique enough to recover the state row in that case.
    const stateByNameKey = new Map<string, LiveStateRow>();
    const seenFavorites = new Set<string>();
    for (const row of activeStates) {
      const meta = friendMeta.get(row.friend_person_id);
      if (!meta || !row.live_competition_id) continue;
      const nameKey = `${row.live_competition_id}::${normalizeKeyPart(meta.name)}`;
      if (!stateByNameKey.has(nameKey)) stateByNameKey.set(nameKey, row);

      // Candidate class names: the stored one first (cheap hit), then every
      // class in the competition so we still match when the stored class differs
      // or is missing.
      const classCandidates = new Set<string>();
      if (row.live_class_name) classCandidates.add(row.live_class_name);
      for (const c of classesByComp.get(row.live_competition_id) ?? []) classCandidates.add(c);
      if (classCandidates.size === 0) classCandidates.add(row.live_class_name ?? '');

      for (const className of classCandidates) {
        const key = favoriteKey(row.live_competition_id, meta.name, className);
        if (seenFavorites.has(key)) continue;
        seenFavorites.add(key);
        favorites.push({
          club: meta.club,
          className,
          competitionId: row.live_competition_id,
          competitionName: row.event_name ?? '',
          name: meta.name,
        });
        stateByFavorite.set(key, row);
      }
    }

    if (favorites.length === 0) {
      return jsonOk({ ok: true, activeFriends: 0, pushCount: 0, reason: 'no-favorites' });
    }

    // 4. Query the liveresultat backend once.
    const results = await getLiveFavoriteResults(favorites);

    const now = new Date();
    const nowIso = now.toISOString();
    const nowCentis = stockholmNowCentis(now);

    const messages: PushMessage[] = [];
    const stateUpserts: Array<Record<string, unknown>> = [];

    const queueForFriend = (friendId: string, body: string, type: string) => {
      const watchers = watchersByFriend.get(friendId);
      if (!watchers) return;
      for (const personId of watchers) {
        for (const token of tokensByPerson.get(personId) ?? []) {
          messages.push({ body, data: { type }, sound: 'default', title: LIVE_TITLE, to: token });
        }
      }
    };

    // Build an upsert object that carries forward EVERY stateful column from the
    // existing row. This keeps the bulk-upsert array homogeneous: PostgREST builds
    // its column list from the union of all object keys and writes NULL for any
    // key a given object omits (via ON CONFLICT DO UPDATE). Seeding from the row
    // guarantees we never accidentally wipe another row's start_notified_at,
    // notified_split_codes, etc. Each branch then overrides only what it changes.
    const baseUpsertFor = (row: LiveStateRow, status: number): Record<string, unknown> => ({
      event_date: todayStr,
      event_id: row.event_id,
      event_race_id: row.event_race_id,
      friend_person_id: row.friend_person_id,
      last_live_status: status,
      live_competition_id: row.live_competition_id,
      live_class_name: row.live_class_name,
      live_result_notified_at: row.live_result_notified_at,
      notified_split_codes: Array.isArray(row.notified_split_codes) ? row.notified_split_codes : [],
      start_notified_at: row.start_notified_at,
      updated_at: nowIso,
    });

    // 5. Evaluate each live result against stored state.
    //
    // A single state row can be hit by MORE THAN ONE result entry: the shotgun
    // submits one favorite per class, and a FINISHED runner is returned by the
    // backend for several of those class favorites at once (while running, only
    // the exact class matches — which is why start/split pushes were single but
    // the finish fired twice). Processing the same row twice would queue a
    // duplicate push for every watcher and push two upsert objects sharing the
    // same ON CONFLICT key (which makes the whole upsert throw). Guard with a
    // per-cycle set so each friend+event row is evaluated exactly once.
    let matchedResults = 0;
    let unmatchedResults = 0;
    const processedRowKeys = new Set<string>();
    for (const result of results) {
      const key = favoriteKey(result.competitionId, result.name, result.className);
      // Strict (competition+name+class) first, then fall back to competition+name
      // so a class-name spelling mismatch can't silently drop the push.
      const row = stateByFavorite.get(key)
        ?? stateByNameKey.get(`${result.competitionId}::${normalizeKeyPart(result.name)}`);
      if (!row) {
        unmatchedResults++;
        continue;
      }
      const rowKey = `${row.friend_person_id}::${row.event_id}::${row.event_race_id}`;
      if (processedRowKeys.has(rowKey)) continue; // duplicate result for an already-handled row
      processedRowKeys.add(rowKey);
      matchedResults++;

      const meta = friendMeta.get(row.friend_person_id);
      const friendName = meta?.name ?? result.name;
      const clubSuffix = meta?.club ? `, ${meta.club}` : '';
      const eventName = row.event_name ?? result.competitionName;
      const status = result.status;

      // A finished runner exposes a RESULT split with a real time. Free-start
      // runners (fri starttid) frequently KEEP a running status (9/10) at the
      // finish while liveresultat backfills their start time and the RESULT
      // split, so the status code alone never turns terminal. Detect the finish
      // from the RESULT split too — otherwise the running branch below fires a
      // bogus "har startat" push (the start time only appears at finish) and the
      // result push is never sent.
      const resultSplit = (result.splitresults ?? []).find(
        (s) => s.splitname === 'RESULT' && s.splitresult && s.splitresult !== '0',
      );
      const isFinished = TERMINAL_STATUSES.has(status) || !!resultSplit;

      // --- Result first: a finish/terminal status suppresses any backfilled
      //     start/split passings (these often appear when the runner reads out
      //     their card at the finish). ---
      if (isFinished) {
        const upsert = baseUpsertFor(row, status);
        upsert.live_result_notified_at = nowIso; // stop polling this friend+event

        // Textual reason only applies to the real terminal failure statuses
        // (DNF/MP/DSQ/OT). A RESULT split on a still-"running" status is a normal
        // finish.
        const terminalText = TERMINAL_STATUSES.has(status) ? terminalStatusText(status) : null;
        const isOkFinish = status === STATUS_FINISHED || (!TERMINAL_STATUSES.has(status) && !!resultSplit);

        if (isOkFinish) {
          const place = result.place || resultSplit?.splitplace || '';
          const placeStr = place && place !== '0' ? `plats ${place}` : 'mål';
          let timeStr = '';
          if (result.result && result.result !== '0') timeStr = `, tid ${formatCentis(Number(result.result))}`;
          else if (resultSplit?.splitresult) timeStr = `, tid ${resultSplit.splitresult}`;
          queueForFriend(row.friend_person_id, `${friendName}${clubSuffix} gick i mål på ${placeStr}${timeStr} (${eventName}).`, 'friend-live-result');
        } else if (terminalText) {
          queueForFriend(row.friend_person_id, `${friendName}${clubSuffix} ${terminalText} i ${eventName}.`, 'friend-live-result');
        }

        stateUpserts.push(upsert);
        continue;
      }

      // --- Running: start + split passings. ---
      if (!RUNNING_STATUSES.has(status)) {
        // Unknown / not-yet-running status — just record it.
        stateUpserts.push(baseUpsertFor(row, status));
        continue;
      }

      // A runner is "started" once their allotted start time has passed. Runners
      // with a free start time (fri starttid) have no allotted time, so
      // liveresultat reports start <= 0; for them a running status (9/10) is
      // itself proof they have started (the backend only flips to running after a
      // punch). Without this, free-start runners never got a "har startat" push,
      // any split pushes, and the running clock was meaningless.
      const hasAllottedStart = result.start > 0;
      const hasStarted = hasAllottedStart ? result.start <= nowCentis : true;
      if (!hasStarted) {
        stateUpserts.push(baseUpsertFor(row, status));
        continue;
      }

      const upsert = baseUpsertFor(row, status);

      // Start notification — synced with the Eventor start via the shared
      // start_notified_at flag so only one start push is ever delivered.
      if (!row.start_notified_at) {
        queueForFriend(row.friend_person_id, `${friendName}${clubSuffix} har startat ${result.className} (${eventName}).`, 'friend-live-start');
        upsert.start_notified_at = nowIso;
      }

      // Split passings.
      const prevCodes = Array.isArray(row.notified_split_codes) ? row.notified_split_codes.map(Number) : [];
      const prevSet = new Set(prevCodes);
      const validSplits = (result.splitresults ?? []).filter(
        (s) => s.splitstatus === 0 && s.code > 0 && s.splitresult && s.splitresult !== '0',
      );
      // First time we observe this runner live: baseline existing splits silently
      // so we only push passings that happen from now on (avoids a burst when we
      // start polling mid-race).
      const isFirstObservation = prevCodes.length === 0 && row.last_live_status == null;
      if (!isFirstObservation) {
        for (const s of validSplits) {
          if (prevSet.has(s.code)) continue;
          const placeStr = s.splitplace && s.splitplace !== '0' ? `, plats ${s.splitplace}` : '';
          queueForFriend(
            row.friend_person_id,
            `${friendName}${clubSuffix} passerade ${s.splitname} på ${formatCentis(Number(s.splitresult))}${placeStr} (${eventName}).`,
            'friend-live-split',
          );
        }
      }
      const allCodes = [...new Set([...prevCodes, ...validSplits.map((s) => s.code)])];
      upsert.notified_split_codes = allCodes;

      stateUpserts.push(upsert);
    }

    // 6. Send push messages.
    if (messages.length > 0) {
      const { invalidTokens } = await sendExpoPushMessages(messages);
      await deactivateInvalidTokens(supabase, invalidTokens);
    }

    // 7. Persist state.
    if (stateUpserts.length > 0) {
      const { error: upsertErr } = await supabase
        .from('friend_activity_state')
        .upsert(stateUpserts, { onConflict: 'friend_person_id,event_id,event_race_id' });
      if (upsertErr) console.error('[poll-live-friends] state upsert failed:', upsertErr);
    }

    console.log(
      `[poll-live-friends] favorites=${favorites.length} results=${results.length} ` +
      `matched=${matchedResults} unmatched=${unmatchedResults} pushes=${messages.length}`,
    );

    return jsonOk({
      ok: true,
      activeFriends: activeStates.length,
      favorites: favorites.length,
      results: results.length,
      matched: matchedResults,
      unmatched: unmatchedResults,
      pushCount: messages.length,
    });
  } catch (error) {
    console.error('[poll-live-friends] Error:', error);
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});

function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
