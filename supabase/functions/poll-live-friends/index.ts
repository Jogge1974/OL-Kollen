import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';
import { formatCentis, getLiveFavoriteResults, LiveFavorite, LiveFavoriteResult } from '../_shared/liveresultat.ts';

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
    const favorites: LiveFavorite[] = [];
    const stateByFavorite = new Map<string, LiveStateRow>();
    const seenFavorites = new Set<string>();
    for (const row of activeStates) {
      const meta = friendMeta.get(row.friend_person_id);
      if (!meta || !row.live_competition_id) continue;
      const className = row.live_class_name ?? '';
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

    // 5. Evaluate each live result against stored state.
    for (const result of results) {
      const key = favoriteKey(result.competitionId, result.name, result.className);
      const row = stateByFavorite.get(key);
      if (!row) continue;

      const meta = friendMeta.get(row.friend_person_id);
      const friendName = meta?.name ?? result.name;
      const clubSuffix = meta?.club ? `, ${meta.club}` : '';
      const eventName = row.event_name ?? result.competitionName;
      const status = result.status;

      // --- Result first: a finish/terminal status suppresses any backfilled
      //     start/split passings (these often appear when the runner reads out
      //     their card at the finish). ---
      if (TERMINAL_STATUSES.has(status)) {
        const upsert: Record<string, unknown> = {
          event_date: todayStr,
          event_id: row.event_id,
          event_race_id: row.event_race_id,
          friend_person_id: row.friend_person_id,
          last_live_status: status,
          live_result_notified_at: nowIso, // stop polling this friend+event
          updated_at: nowIso,
        };

        if (status === STATUS_FINISHED) {
          const placeStr = result.place ? `plats ${result.place}` : 'mål';
          const timeStr = result.result ? `, tid ${formatCentis(Number(result.result))}` : '';
          queueForFriend(row.friend_person_id, `${friendName}${clubSuffix} gick i mål på ${placeStr}${timeStr} (${eventName}).`, 'friend-live-result');
        } else {
          const text = terminalStatusText(status);
          if (text) {
            queueForFriend(row.friend_person_id, `${friendName}${clubSuffix} ${text} i ${eventName}.`, 'friend-live-result');
          }
        }

        stateUpserts.push(upsert);
        continue;
      }

      // --- Running: start + split passings. ---
      if (!RUNNING_STATUSES.has(status)) {
        // Unknown / not-yet-running status — just record it.
        stateUpserts.push({
          event_date: todayStr,
          event_id: row.event_id,
          event_race_id: row.event_race_id,
          friend_person_id: row.friend_person_id,
          last_live_status: status,
          updated_at: nowIso,
        });
        continue;
      }

      const hasStarted = result.start > 0 && result.start <= nowCentis;
      if (!hasStarted) {
        stateUpserts.push({
          event_date: todayStr,
          event_id: row.event_id,
          event_race_id: row.event_race_id,
          friend_person_id: row.friend_person_id,
          last_live_status: status,
          updated_at: nowIso,
        });
        continue;
      }

      const upsert: Record<string, unknown> = {
        event_date: todayStr,
        event_id: row.event_id,
        event_race_id: row.event_race_id,
        friend_person_id: row.friend_person_id,
        last_live_status: status,
        updated_at: nowIso,
      };

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
      await supabase
        .from('friend_activity_state')
        .upsert(stateUpserts, { onConflict: 'friend_person_id,event_id,event_race_id' });
    }

    return jsonOk({
      ok: true,
      activeFriends: activeStates.length,
      favorites: favorites.length,
      results: results.length,
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
