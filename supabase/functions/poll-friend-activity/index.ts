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
  const dateStr = now.toISOString().slice(0, 10);
  return { from: `${dateStr} 00:00:00`, to: `${dateStr} 23:59:59` };
}

// ---------------------------------------------------------------------------
// XML parsing — minimal regex-based extraction (no dependency needed)
// ---------------------------------------------------------------------------

function parsePersonStartsXml(xml: string): ParsedStart[] {
  const results: ParsedStart[] = [];
  const seen = new Set<string>();

  // /starts/person returns StartListList > StartList > ClassStart > PersonStart
  // Split on StartList to get per-event context
  const eventBlocks = xml.split(/<StartList\b/);

  for (let i = 1; i < eventBlocks.length; i++) {
    const eventBlock = eventBlocks[i];

    const eventIdMatch = eventBlock.match(/<EventId[^>]*>(\d+)<\/EventId>/);
    if (!eventIdMatch) continue;
    const eventId = eventIdMatch[1];
    if (seen.has(eventId)) continue;
    seen.add(eventId);

    // Event name
    const eventNameMatch = eventBlock.match(/<Name>([^<]+)<\/Name>/);
    const eventName = eventNameMatch?.[1] ?? 'Okänd tävling';

    // Find the person's start time within <Start>...<StartTime>
    // Eventor format: <StartTime><Date>YYYY-MM-DD</Date><Clock>HH:MM:SS</Clock></StartTime>
    // IOF 3.0 format: <StartTime><Date>YYYY-MM-DD</Date><Time>HH:MM:SSZ</Time></StartTime>
    // Flat format: <StartTime>ISO-STRING</StartTime>
    let startTime: string | null = null;

    // Look within <PersonStart>...<Start> blocks for the start time
    const personStartMatch = eventBlock.match(/<PersonStart\b[\s\S]*?<Start\b[\s\S]*?<StartTime>([\s\S]*?)<\/StartTime>/);
    if (personStartMatch) {
      const stBlock = personStartMatch[1];
      // Eventor native: <Date>...</Date><Clock>...</Clock>
      const dateClockMatch = stBlock.match(/<Date>([^<]+)<\/Date>\s*<Clock>([^<]+)<\/Clock>/);
      if (dateClockMatch) {
        startTime = `${dateClockMatch[1].trim()}T${dateClockMatch[2].trim()}`;
      } else {
        // IOF 3.0: <Date>...</Date><Time>...</Time>
        const dateTimeMatch = stBlock.match(/<Date>([^<]+)<\/Date>\s*<Time>([^<]+)<\/Time>/);
        if (dateTimeMatch) {
          startTime = `${dateTimeMatch[1].trim()}T${dateTimeMatch[2].trim()}`;
        } else {
          // Flat ISO string
          const flat = stBlock.trim();
          if (flat.match(/^\d{4}-\d{2}-\d{2}T/)) {
            startTime = flat;
          }
        }
      }
    }

    // Fallback: any StartTime with Date+Clock anywhere in the event block
    if (!startTime) {
      const anyMatch = eventBlock.match(/<StartTime>\s*<Date>([^<]+)<\/Date>\s*<Clock>([^<]+)<\/Clock>/);
      if (anyMatch) {
        startTime = `${anyMatch[1].trim()}T${anyMatch[2].trim()}`;
      }
    }

    results.push({
      eventId,
      eventName,
      startTime,
    });
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

    // Event name — first <Name> inside <Event>
    const eventNameMatch = eventBlock.match(/<Event\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
    const eventName = eventNameMatch?.[1] ?? 'Okänd tävling';

    // Find ClassResult blocks within this event
    const classBlocks = eventBlock.split(/<ClassResult\b/);
    let foundResult = false;

    for (let c = 1; c < classBlocks.length; c++) {
      if (foundResult) break;
      const classBlock = classBlocks[c];

      // Verify there's an actual completed result for this person.
      // /results/person returns only this person's ClassResult, so we look
      // at the FIRST PersonResult block specifically (not other competitors).
      // Eventor native: <CompetitorStatus value="OK" /> or value="MisPunch" etc.
      // IOF 3.0: <Status>OK</Status>
      // Extract the first PersonResult block to check status
      const personResultMatch = classBlock.match(/<PersonResult\b[\s\S]*?<\/PersonResult>/);
      const personResult = personResultMatch?.[0] ?? classBlock;

      const hasEventorStatus = /<CompetitorStatus\s+value="(OK|MisPunch|MissingPunch|Overtime|Disqualified|DidNotFinish|DidNotStart)"/.test(personResult);
      const hasIofStatus = /<Status>(OK|MisPunch|Overtime|Disqualified|DidNotFinish|DidNotStart)<\/Status>/.test(personResult);
      const hasTime = /<Time>[^<]+<\/Time>/.test(personResult);
      if (!hasEventorStatus && !hasIofStatus && !hasTime) continue;

      // Class name from <EventClass><Name> or <Class><Name>
      const classNameMatch =
        classBlock.match(/<(?:EventClass|Class)\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
      const classLabel = classNameMatch?.[1] ?? null;

      // Position: Eventor native uses <ResultPosition>, IOF 3.0 uses <Position> inside <Result>
      const positionMatch =
        classBlock.match(/<ResultPosition>(\d+)<\/ResultPosition>/) ??
        classBlock.match(/<Result\b[\s\S]*?<Position>(\d+)<\/Position>/);
      const position = positionMatch?.[1] ?? null;

      seen.add(eventId);
      foundResult = true;
      results.push({
        classLabel,
        eventId,
        eventName,
        position,
      });
    }

    // Fallback: if no ClassResult found, check eventBlock directly for a result
    if (!foundResult && classBlocks.length <= 1) {
      const personResult = eventBlock.match(/<PersonResult\b[\s\S]*?<\/PersonResult>/)?.[0] ?? eventBlock;
      const hasStatus = /<CompetitorStatus\s+value="(OK|MisPunch|MissingPunch|Overtime|Disqualified|DidNotFinish|DidNotStart)"/.test(personResult);
      const hasTime = /<Time>[^<]+<\/Time>/.test(personResult);

      if (hasStatus || hasTime) {
        const classLabel = eventBlock.match(/<(?:EventClass|Class)\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/)?.[1] ?? null;
        const position = eventBlock.match(/<ResultPosition>(\d+)<\/ResultPosition>/)?.[1] ?? null;
        seen.add(eventId);
        results.push({ classLabel, eventId, eventName, position });
      }
    }
  }

  return results;
}

function parseStartTimeIso(raw: string | null): Date | null {
  if (!raw) return null;
  // Eventor returns times without timezone — they are Swedish local time.
  // If no timezone indicator (Z or +/-), assume Europe/Stockholm (CET/CEST).
  let normalized = raw;
  if (!raw.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(raw)) {
    // Summer: CEST = UTC+2, Winter: CET = UTC+1
    // Determine if date is in DST (rough: last Sunday of March to last Sunday of October)
    const month = new Date(raw + 'Z').getUTCMonth(); // 0-based
    const offset = (month >= 2 && month <= 9) ? '+02:00' : '+01:00';
    normalized = raw + offset;
  }
  const d = new Date(normalized);
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

    // Debug: log parsed starts
    for (const [friendId, starts] of friendStartsMap) {
      if (starts.length > 0) {
        console.log(`[poll-friend] Friend ${friendId} starts:`, JSON.stringify(starts));
      }
    }

    // 5. Determine what needs notification
    const now = new Date();
    const nowIso = now.toISOString();
    // Notify if start is within the next 5 minutes (cron runs every 3 min)
    const START_WINDOW_MS = 5 * 60 * 1000;

    // Collect per-user grouped notifications
    type StartNotifItem = { friendClub: string; friendName: string; eventName: string; startTime: string };
    type ResultNotifItem = { classLabel: string | null; eventName: string; friendClub: string; friendName: string; position: string | null };
    const startNotifs = new Map<string, StartNotifItem[]>();
    const resultNotifs = new Map<string, ResultNotifItem[]>();

    // State rows to upsert after sending
    const stateUpserts: Array<Record<string, unknown>> = [];

    // Track which friend+event combos already got state upserted (avoid duplicates
    // when multiple users watch the same friend).
    const startStateTracked = new Set<string>();
    const resultStateTracked = new Set<string>();

    for (const watch of allWatches) {
      const userTokens = tokensByPerson.get(watch.person_id);
      if (!userTokens || userTokens.length === 0) continue;

      const friendId = watch.friend_person_id;

      // --- Start activity tracking & notifications ---
      const starts = friendStartsMap.get(friendId) ?? [];
      for (const start of starts) {
        const key = `${friendId}::${start.eventId}`;
        const existing = stateMap.get(key);
        if (existing?.start_notified_at) continue; // already tracked

        const startDate = parseStartTimeIso(start.startTime);
        if (!startDate) continue;

        const diffMs = startDate.getTime() - now.getTime();
        if (diffMs > 0 && diffMs <= START_WINDOW_MS) {
          // Always update state so the app can show the yellow dot
          if (!startStateTracked.has(key)) {
            startStateTracked.add(key);
            stateUpserts.push({
              event_date: todayStr,
              event_id: start.eventId,
              friend_person_id: friendId,
              start_notified_at: nowIso,
              start_time: start.startTime,
              updated_at: nowIso,
            });
          }

          // Only send push if enabled
          if (watch.push_on_start) {
            const arr = startNotifs.get(watch.person_id) ?? [];
            const timeStr = startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
            arr.push({ friendClub: watch.friend_club ?? '', friendName: watch.friend_name, eventName: start.eventName, startTime: timeStr });
            startNotifs.set(watch.person_id, arr);
          }
        } else if (!existing && !startStateTracked.has(key)) {
          // Save start time for future checks (no notification yet)
          startStateTracked.add(key);
          stateUpserts.push({
            event_date: todayStr,
            event_id: start.eventId,
            friend_person_id: friendId,
            start_time: start.startTime,
            updated_at: nowIso,
          });
        }
      }

      // --- Result activity tracking & notifications ---
      const results = friendResultsMap.get(friendId) ?? [];
      for (const result of results) {
        const key = `${friendId}::${result.eventId}`;
        const existing = stateMap.get(key);
        if (existing?.result_notified_at) continue; // already tracked

        // Always update state so the app can show the green dot
        if (!resultStateTracked.has(key)) {
          resultStateTracked.add(key);
          stateUpserts.push({
            event_date: todayStr,
            event_id: result.eventId,
            friend_person_id: friendId,
            result_notified_at: nowIso,
            updated_at: nowIso,
          });
        }

        // Only send push if enabled
        if (watch.push_on_result) {
          const arr = resultNotifs.get(watch.person_id) ?? [];
          arr.push({
            classLabel: result.classLabel,
            eventName: result.eventName,
            friendClub: watch.friend_club ?? '',
            friendName: watch.friend_name,
            position: result.position,
          });
          resultNotifs.set(watch.person_id, arr);
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
            body: `${item.friendName}${clubSuffix} startar ${item.startTime} i ${item.eventName}.`,
            data: { type: 'friend-start' },
            sound: 'default',
            title: `Dags för start!`,
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

    // Debug: collect starts info for response
    const debugStarts: Record<string, unknown[]> = {};
    for (const [friendId, starts] of friendStartsMap) {
      if (starts.length > 0) {
        debugStarts[friendId] = starts;
      }
    }

    // Debug: collect results info
    const debugResults: Record<string, unknown[]> = {};
    for (const [friendId, results] of friendResultsMap) {
      if (results.length > 0) {
        debugResults[friendId] = results;
      }
    }

    return jsonOk({
      checkedFriends: uniqueFriendIds.length,
      debug: { now: now.toISOString(), resultsFound: debugResults, startsFound: debugStarts },
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
