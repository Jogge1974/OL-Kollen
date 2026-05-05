import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { sendExpoPushMessages } from '../_shared/expoPush.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FriendWatchRow = {
  friend_club: string | null;
  friend_person_id: string;
  friend_name: string;
  person_id: string;
  push_on_result: boolean;
  push_on_start: boolean;
};

type TokenRow = {
  person_id: string;
  push_token: string;
};

type ActivityStateRow = {
  event_id: string;
  friend_person_id: string;
  result_notified_at: string | null;
  start_notified_at: string | null;
  start_time: string | null;
};

// Parsed from Eventor XML
type ParsedStart = {
  eventId: string;
  eventName: string;
  startTime: string | null; // ISO 8601
};

type ParsedResult = {
  classLabel: string | null;
  eventId: string;
  eventName: string;
  position: string | null;
};

// ---------------------------------------------------------------------------
// Eventor API helpers (Deno runtime, uses env EVENTOR_API_KEY)
// ---------------------------------------------------------------------------

const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

async function fetchEventorXml(path: string): Promise<string> {
  const apiKey = Deno.env.get('EVENTOR_API_KEY');
  if (!apiKey) throw new Error('Missing EVENTOR_API_KEY.');

  const response = await fetch(`${EVENTOR_BASE_URL}${path}`, {
    headers: { ApiKey: apiKey, Accept: 'application/xml' },
  });

  if (!response.ok) {
    throw new Error(`Eventor ${path} → ${response.status}`);
  }

  return await response.text();
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  // Format as YYYY-MM-DD 00:00:00 / 23:59:59 in UTC (Eventor interprets
  // dates in Swedish time, but using the UTC date is close enough for the
  // "today" window when the cron runs during Swedish daytime).
  const dateStr = now.toISOString().slice(0, 10);
  return { from: `${dateStr} 00:00:00`, to: `${dateStr} 23:59:59` };
}

// ---------------------------------------------------------------------------
// XML parsing — minimal regex-based extraction (no dependency needed)
// ---------------------------------------------------------------------------

function parsePersonStartsXml(xml: string): ParsedStart[] {
  const results: ParsedStart[] = [];

  // Each <StartListEntry> or <PersonStart> may contain start info.
  // We look for <Event> + <StartTime> pairs inside start list structures.
  const eventBlocks = xml.split(/<(?:ClassStart|PersonStart|StartListEntry)\b/);

  for (const block of eventBlocks) {
    const eventIdMatch = block.match(/<EventId[^>]*>(\d+)<\/EventId>/);
    const eventNameMatch = block.match(/<Name>([^<]+)<\/Name>/);
    const startTimeMatch = block.match(/<StartTime>([^<]+)<\/StartTime>/);

    if (eventIdMatch) {
      results.push({
        eventId: eventIdMatch[1],
        eventName: eventNameMatch?.[1] ?? 'Okänd tävling',
        startTime: startTimeMatch?.[1]?.trim() ?? null,
      });
    }
  }

  return results;
}

function parsePersonResultsXml(xml: string): ParsedResult[] {
  const results: ParsedResult[] = [];
  const seen = new Set<string>();

  // /results/person returns <ResultListList><ResultList>…</ResultList>…</ResultListList>
  // Each <ResultList> is one event. Split on it first to get event context.
  const eventBlocks = xml.split(/<ResultList\b/);

  for (let i = 1; i < eventBlocks.length; i++) {
    const eventBlock = eventBlocks[i];

    // Extract event ID and name from within this ResultList
    const eventIdMatch = eventBlock.match(/<EventId[^>]*>(\d+)<\/EventId>/);
    if (!eventIdMatch) continue;
    const eventId = eventIdMatch[1];
    if (seen.has(eventId)) continue;

    // Event name is typically in <Event><Name>...</Name>
    const eventNameMatch = eventBlock.match(/<Event\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
    const eventName = eventNameMatch?.[1] ?? 'Okänd tävling';

    // Find ClassResult blocks within this event
    const classBlocks = eventBlock.split(/<ClassResult\b/);
    for (let c = 1; c < classBlocks.length; c++) {
      const classBlock = classBlocks[c];

      // Class name from <EventClass><Name> or <Class><Name>
      const classNameMatch =
        classBlock.match(/<(?:EventClass|Class)\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
      const classLabel = classNameMatch?.[1] ?? null;

      // Position from <Result>...<Position>X</Position> (IOF 3.0)
      const positionMatch = classBlock.match(/<Position>(\d+)<\/Position>/) ??
        classBlock.match(/<ResultPosition>([^<]+)<\/ResultPosition>/);
      const position = positionMatch?.[1] ?? null;

      // Only take first class match per event (the person's own result)
      if (!seen.has(eventId)) {
        seen.add(eventId);
        results.push({
          classLabel,
          eventId,
          eventName,
          position,
        });
      }
    }
  }

  return results;
}

function parseStartTimeIso(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth: require CRON_SECRET header (same pattern as poll-eventor-publication)
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

    // 1. Load all friend watches and device tokens
    const [
      { data: watches, error: watchesErr },
      { data: tokens, error: tokensErr },
    ] = await Promise.all([
      supabase.from('friend_watches').select('friend_club, friend_person_id, friend_name, person_id, push_on_result, push_on_start'),
      supabase
        .from('device_push_tokens')
        .select('person_id, push_token')
        .eq('is_active', true)
        .not('push_token', 'is', null),
    ]);

    if (watchesErr) throw watchesErr;
    if (tokensErr) throw tokensErr;

    const allWatches = (watches ?? []) as FriendWatchRow[];
    const tokensByPerson = new Map<string, string[]>();
    for (const row of (tokens ?? []) as TokenRow[]) {
      const arr = tokensByPerson.get(row.person_id) ?? [];
      arr.push(row.push_token);
      tokensByPerson.set(row.person_id, arr);
    }

    // 2. Collect unique friend person IDs across all users
    const uniqueFriendIds = [...new Set(allWatches.map((w) => w.friend_person_id))];

    if (uniqueFriendIds.length === 0) {
      return jsonOk({ checkedFriends: 0, ok: true, pushCount: 0 });
    }

    // 3. Load existing activity state for today
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: existingStates } = await supabase
      .from('friend_activity_state')
      .select('event_id, friend_person_id, result_notified_at, start_notified_at, start_time')
      .eq('event_date', todayStr);

    const stateMap = new Map<string, ActivityStateRow>();
    for (const row of (existingStates ?? []) as ActivityStateRow[]) {
      stateMap.set(`${row.friend_person_id}::${row.event_id}`, row);
    }

    // 4. Fetch starts and results for each unique friend from Eventor
    const { from, to } = todayRange();
    const friendStartsMap = new Map<string, ParsedStart[]>();
    const friendResultsMap = new Map<string, ParsedResult[]>();

    // Process friends in small batches to avoid overwhelming Eventor
    const BATCH_SIZE = 5;
    for (let i = 0; i < uniqueFriendIds.length; i += BATCH_SIZE) {
      const batch = uniqueFriendIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (friendId) => {
          try {
            const [startsXml, resultsXml] = await Promise.all([
              fetchEventorXml(`/starts/person?personId=${friendId}&fromDate=${encodeURIComponent(from)}&toDate=${encodeURIComponent(to)}`),
              fetchEventorXml(`/results/person?personId=${friendId}&fromDate=${encodeURIComponent(from)}&toDate=${encodeURIComponent(to)}`),
            ]);
            friendStartsMap.set(friendId, parsePersonStartsXml(startsXml));
            friendResultsMap.set(friendId, parsePersonResultsXml(resultsXml));
          } catch (err) {
            console.warn(`[poll-friend] Eventor fetch failed for friend ${friendId}:`, err);
            // Non-fatal: skip this friend this cycle
          }
        }),
      );
    }

    // 5. Determine what needs notification
    const now = new Date();
    const nowIso = now.toISOString();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;

    // Collect per-user grouped notifications
    type StartNotifItem = { friendClub: string; friendName: string; eventName: string; startTime: string };
    type ResultNotifItem = { classLabel: string | null; eventName: string; friendClub: string; friendName: string; position: string | null };
    const startNotifs = new Map<string, StartNotifItem[]>();
    const resultNotifs = new Map<string, ResultNotifItem[]>();

    // State rows to upsert after sending
    const stateUpserts: Array<Record<string, unknown>> = [];

    for (const watch of allWatches) {
      const userTokens = tokensByPerson.get(watch.person_id);
      if (!userTokens || userTokens.length === 0) continue;

      const friendId = watch.friend_person_id;

      // --- Start notifications (5 min before) ---
      if (watch.push_on_start) {
        const starts = friendStartsMap.get(friendId) ?? [];
        for (const start of starts) {
          const key = `${friendId}::${start.eventId}`;
          const existing = stateMap.get(key);
          if (existing?.start_notified_at) continue; // already notified

          const startDate = parseStartTimeIso(start.startTime);
          if (!startDate) continue;

          const diffMs = startDate.getTime() - now.getTime();
          if (diffMs > 0 && diffMs <= FIVE_MINUTES_MS) {
            const arr = startNotifs.get(watch.person_id) ?? [];
            const timeStr = startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
            arr.push({ friendClub: watch.friend_club ?? '', friendName: watch.friend_name, eventName: start.eventName, startTime: timeStr });
            startNotifs.set(watch.person_id, arr);

            stateUpserts.push({
              event_date: todayStr,
              event_id: start.eventId,
              friend_person_id: friendId,
              start_notified_at: nowIso,
              start_time: start.startTime,
              updated_at: nowIso,
            });
          } else if (!existing) {
            // Save start time for future checks (no notification yet)
            stateUpserts.push({
              event_date: todayStr,
              event_id: start.eventId,
              friend_person_id: friendId,
              start_time: start.startTime,
              updated_at: nowIso,
            });
          }
        }
      }

      // --- Result notifications ---
      if (watch.push_on_result) {
        const results = friendResultsMap.get(friendId) ?? [];
        for (const result of results) {
          const key = `${friendId}::${result.eventId}`;
          const existing = stateMap.get(key);
          if (existing?.result_notified_at) continue; // already notified

          const arr = resultNotifs.get(watch.person_id) ?? [];
          arr.push({
            classLabel: result.classLabel,
            eventName: result.eventName,
            friendClub: watch.friend_club ?? '',
            friendName: watch.friend_name,
            position: result.position,
          });
          resultNotifs.set(watch.person_id, arr);

          stateUpserts.push({
            event_date: todayStr,
            event_id: result.eventId,
            friend_person_id: friendId,
            result_notified_at: nowIso,
            updated_at: nowIso,
          });
        }
      }
    }

    // 6. Build and send push messages
    const allMessages: Array<{ body: string; data: Record<string, unknown>; sound: 'default'; title: string; to: string }> = [];

    // Start notifications — one per friend per user
    for (const [personId, items] of startNotifs) {
      const pushTokens = tokensByPerson.get(personId) ?? [];
      for (const item of items) {
        const clubSuffix = item.friendClub ? `, ${item.friendClub}` : '';
        for (const token of pushTokens) {
          allMessages.push({
            body: `Startar ${item.startTime} i ${item.eventName}.`,
            data: { type: 'friend-start' },
            sound: 'default',
            title: `${item.friendName}${clubSuffix}, startar snart.`,
            to: token,
          });
        }
      }
    }

    // Result notifications
    for (const [personId, items] of resultNotifs) {
      const pushTokens = tokensByPerson.get(personId) ?? [];
      if (pushTokens.length === 0) continue;

      // Group by event
      const byEvent = new Map<string, ResultNotifItem[]>();
      for (const item of items) {
        const arr = byEvent.get(item.eventName) ?? [];
        arr.push(item);
        byEvent.set(item.eventName, arr);
      }

      const eventEntries = [...byEvent.entries()];
      const displayEntries = eventEntries.slice(0, 3);
      const remaining = eventEntries.length - displayEntries.length;

      for (const [eventName, eventItems] of displayEntries) {
        const uniqueFriends = [...new Map(eventItems.map((i) => [i.friendName, i])).values()];

        let title: string;
        let body: string;

        if (uniqueFriends.length === 1) {
          const f = uniqueFriends[0];
          const clubSuffix = f.friendClub ? `, ${f.friendClub}` : '';
          title = `Resultat för ${f.friendName}${clubSuffix}.`;
          const posStr = f.position ? `Plac. ${f.position}` : 'Resultat';
          const classStr = f.classLabel ? ` i ${f.classLabel}` : '';
          body = `${posStr}${classStr}. Tävling ${eventName}.`;
        } else {
          title = 'Nya resultat för dina vänner.';
          body = `${uniqueFriends.length} vänner har resultat från ${eventName}.`;
        }

        for (const token of pushTokens) {
          allMessages.push({
            body,
            data: { type: 'friend-results' },
            sound: 'default',
            title,
            to: token,
          });
        }
      }

      if (remaining > 0 && displayEntries.length > 0) {
        const firstName = items[0]?.friendName ?? 'vän';
        const firstEventName = displayEntries[0][0];
        for (const token of pushTokens) {
          allMessages.push({
            body: `${firstEventName} och ${remaining} ${remaining === 1 ? 'tävling' : 'tävlingar'} till.`,
            data: { type: 'friend-results' },
            sound: 'default',
            title: `Resultat för ${firstName}.`,
            to: token,
          });
        }
      }
    }

    if (allMessages.length > 0) {
      await sendExpoPushMessages(allMessages);
    }

    // 7. Upsert activity state (deduplicate by friend_person_id + event_id)
    if (stateUpserts.length > 0) {
      // Deduplicate: keep the one with the most info (notified timestamps)
      const deduped = new Map<string, Record<string, unknown>>();
      for (const row of stateUpserts) {
        const key = `${row.friend_person_id}::${row.event_id}`;
        const prev = deduped.get(key);
        if (prev) {
          // Merge: keep non-null values
          deduped.set(key, {
            ...prev,
            ...Object.fromEntries(
              Object.entries(row).filter(([, v]) => v != null),
            ),
          });
        } else {
          deduped.set(key, row);
        }
      }

      await supabase
        .from('friend_activity_state')
        .upsert([...deduped.values()], { onConflict: 'friend_person_id,event_id' });
    }

    return jsonOk({
      checkedFriends: uniqueFriendIds.length,
      ok: true,
      pushCount: allMessages.length,
    });
  } catch (error) {
    console.error('[poll-friend-activity] Error:', error);
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
