import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { fetchEventDetailXml } from '../_shared/eventor.ts';
import { recordEventorApiCall } from '../_shared/eventorCallCounter.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';
import { findLiveCompetitionIdsBatch } from '../_shared/liveresultat.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FriendWatchRow = {
  device_id: string;
  friend_club: string | null;
  friend_person_id: string;
  friend_name: string;
  push_on_result: boolean;
  push_on_start: boolean;
  push_on_live: boolean;
};

type TokenRow = {
  device_id: string;
  push_token: string;
};

type ActivityStateRow = {
  event_id: string;
  event_race_id: string;
  event_name: string | null;
  friend_person_id: string;
  result_notified_at: string | null;
  start_notified_at: string | null;
  start_time: string | null;
  live_competition_id: number | null;
  live_class_name: string | null;
};

// Parsed from Eventor XML.
// eventRaceId identifies a single stage (Eventor EventRaceId). For single-day
// events it equals eventId so state stays keyed exactly as before.
type ParsedStart = {
  eventId: string;
  eventRaceId: string;
  eventName: string;
  organiserName: string | null;
  startTime: string | null; // ISO 8601
  raceDateStr: string | null; // YYYY-MM-DD of the stage
  className: string | null;
};

type ParsedResult = {
  classLabel: string | null;
  eventId: string;
  eventRaceId: string;
  eventName: string;
  organiserName: string | null;
  position: string | null;
  timeBehind: number | null;
  raceDateStr: string | null; // YYYY-MM-DD of the stage
};

// ---------------------------------------------------------------------------
// Eventor API helpers (Deno runtime, uses env EVENTOR_API_KEY)
// ---------------------------------------------------------------------------

const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

async function fetchEventorXml(path: string): Promise<string> {
  await recordEventorApiCall('poll-friend-activity', path);

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

// ---------------------------------------------------------------------------
// XML parsing — minimal regex-based extraction (no dependency needed)
// ---------------------------------------------------------------------------

/**
 * Extract a start time string from a StartTime XML fragment.
 * Supports Eventor native (<Date>+<Clock>), IOF 3.0 (<Date>+<Time>), and flat ISO.
 */
function extractStartTimeFromBlock(stBlock: string): string | null {
  const dateClockMatch = stBlock.match(/<Date>([^<]+)<\/Date>\s*<Clock>([^<]+)<\/Clock>/);
  if (dateClockMatch) {
    return `${dateClockMatch[1].trim()}T${dateClockMatch[2].trim()}`;
  }
  const dateTimeMatch = stBlock.match(/<Date>([^<]+)<\/Date>\s*<Time>([^<]+)<\/Time>/);
  if (dateTimeMatch) {
    return `${dateTimeMatch[1].trim()}T${dateTimeMatch[2].trim()}`;
  }
  const flat = stBlock.trim();
  if (flat.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return flat;
  }
  return null;
}

/**
 * Build a map of EventRaceId → race date (YYYY-MM-DD) from an <Event> block.
 * Multi-day events list one <EventRace> per stage, each with <EventRaceId> and
 * <RaceDate><Date>. Used to attribute each start/result to the right stage day.
 */
function buildRaceDateMap(eventBlock: string): Map<string, string> {
  const map = new Map<string, string>();
  const raceBlocks = eventBlock.match(/<EventRace\b[\s\S]*?<\/EventRace>/g);
  if (!raceBlocks) return map;
  for (const block of raceBlocks) {
    const idMatch = block.match(/<EventRaceId[^>]*>(\d+)<\/EventRaceId>/);
    const dateMatch = block.match(/<RaceDate>[\s\S]*?<Date>([^<]+)<\/Date>/);
    if (idMatch && dateMatch) {
      map.set(idMatch[1], dateMatch[1].trim());
    }
  }
  return map;
}

/**
 * Build a map of EventRaceId → stage name (e.g. "Etapp 3") from an <Event> block.
 * Multi-day events list one <EventRace> per stage, each with <EventRaceId> and a
 * <Name>. Used to suffix the push title as "Event.Name - EventRace.Name".
 */
function buildRaceNameMap(eventBlock: string): Map<string, string> {
  const map = new Map<string, string>();
  const raceBlocks = eventBlock.match(/<EventRace\b[\s\S]*?<\/EventRace>/g);
  if (!raceBlocks) return map;
  for (const block of raceBlocks) {
    const idMatch = block.match(/<EventRaceId[^>]*>(\d+)<\/EventRaceId>/);
    const nameMatch = block.match(/<Name>([^<]*)<\/Name>/);
    if (idMatch && nameMatch) {
      const name = nameMatch[1].trim();
      if (name) map.set(idMatch[1], name);
    }
  }
  return map;
}

/**
 * Compose the display name for a stage. For multi-stage events the EventRace
 * carries a stage name (e.g. "Etapp 3") which we append as "Event - Etapp 3".
 * Single-day events have no stage name, so the plain event name is returned.
 */
function composeStageName(eventName: string, raceName: string | undefined): string {
  return raceName ? `${eventName} - ${raceName}` : eventName;
}

/**
 * Extract the event ORGANISER's name from an <Event> block.
 *
 * Eventor wraps it as `<Organiser><Organisation>…<Name>OK X</Name>`. We scope to
 * the <Organiser> element so we never pick up the competitor's own
 * `<Organisation><Name>` (their club) that appears later under <PersonStart> /
 * <PersonResult>. Returns null when only an <OrganisationId> is present (no name)
 * so the caller can fall back to name-only matching.
 */
function extractOrganiserName(eventBlock: string): string | null {
  const orgBlock = eventBlock.match(/<Organiser\b[\s\S]*?<\/Organiser>/)?.[0];
  if (!orgBlock) return null;
  const nameMatch = orgBlock.match(/<Name>([^<]+)<\/Name>/);
  return nameMatch?.[1]?.trim() ?? null;
}

/**
 * Split friend ids into chunks whose comma-joined length stays within a safe URL
 * budget, so batching many personIds never produces an over-long request URL.
 */
function chunkIdsByLength(ids: string[], maxJoinedLen = 1500): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let joinedLen = 0;
  for (const id of ids) {
    const addLen = current.length > 0 ? id.length + 1 : id.length;
    if (current.length > 0 && joinedLen + addLen > maxJoinedLen) {
      chunks.push(current);
      current = [];
      joinedLen = 0;
    }
    joinedLen += current.length > 0 ? id.length + 1 : id.length;
    current.push(id);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function parseEntryEventsXml(xml: string): Array<{ personId: string; eventId: string; eventName: string; eventDateStr: string | null }> {
  const seen = new Map<string, { personId: string; eventId: string; eventName: string; eventDateStr: string | null }>();
  const entryBlocks = xml.split(/<Entry\b/);

  for (let i = 1; i < entryBlocks.length; i++) {
    const block = entryBlocks[i];

    // PersonId identifies which friend the entry belongs to (a batched response
    // carries several people), taken from the <Competitor> element.
    const personId = block.match(/<Competitor\b[\s\S]*?<PersonId>(\d+)<\/PersonId>/)?.[1] ?? block.match(/<PersonId>(\d+)<\/PersonId>/)?.[1];
    if (!personId) continue;

    const eventBlock = block.match(/<Event\b[\s\S]*?<\/Event>/)?.[0];
    if (!eventBlock) continue;

    const eventId = eventBlock.match(/<EventId>(\d+)<\/EventId>/)?.[1];
    if (!eventId) continue;

    const eventName = eventBlock.match(/<Name>([^<]+)<\/Name>/)?.[1]?.trim() ?? 'Okänd tävling';
    const eventDateStr = eventBlock.match(/<StartDate>[\s\S]*?<Date>([^<]+)<\/Date>/)?.[1]?.trim() ?? null;

    const key = `${personId}::${eventId}`;
    if (!seen.has(key)) seen.set(key, { personId, eventId, eventName, eventDateStr });
  }

  return [...seen.values()];
}

/**
 * Parse a full event start list (/starts/event/iofxml) into each competitor's
 * start(s) — one entry per (personId, stage). The caller keeps only the friends
 * it cares about. This lets us fetch ONE start list per event instead of one
 * per friend.
 *
 * NOTE: grounded in the app's formatStartsXml structure (StartList > ClassStart >
 * PersonStart > Person > Id, Start > StartTime as flat ISO). No individual start
 * list sample was available here, so validate against a real response before
 * trusting it once real Eventor calls are re-enabled. Relay start lists use
 * TeamStart (no PersonStart) and are intentionally not covered.
 */
function parseEventStartListXml(xml: string, eventId: string, fallbackEventName: string): Array<{ personId: string; start: ParsedStart }> {
  const out: Array<{ personId: string; start: ParsedStart }> = [];

  const eventBlock = xml.match(/<Event\b[\s\S]*?<\/Event>/)?.[0] ?? '';
  const eventName = eventBlock.match(/<Name>([^<]+)<\/Name>/)?.[1]?.trim() || fallbackEventName;
  const organiserName = extractOrganiserName(eventBlock);
  const raceDateMap = buildRaceDateMap(eventBlock);
  const raceNameMap = buildRaceNameMap(eventBlock);

  const classBlocks = xml.match(/<ClassStart\b[\s\S]*?<\/ClassStart>/g) ?? [];
  for (const classBlock of classBlocks) {
    const className = classBlock.match(/<(?:Class|EventClass)\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/)?.[1]?.trim() ?? null;

    const personBlocks = classBlock.match(/<PersonStart\b[\s\S]*?<\/PersonStart>/g) ?? [];
    for (const pBlock of personBlocks) {
      const personId =
        pBlock.match(/<Person\b[\s\S]*?<Id[^>]*>(\d+)<\/Id>/)?.[1] ?? pBlock.match(/<PersonId>(\d+)<\/PersonId>/)?.[1];
      if (!personId) continue;

      // Multi-day: one <RaceStart><EventRaceId>…<StartTime>. Single-day: <Start><StartTime>.
      const raceStartBlocks = pBlock.match(/<RaceStart\b[\s\S]*?<\/RaceStart>/g);
      if (raceStartBlocks && raceStartBlocks.length > 0) {
        for (const rBlock of raceStartBlocks) {
          const eventRaceId = rBlock.match(/<EventRaceId[^>]*>(\d+)<\/EventRaceId>/)?.[1];
          if (!eventRaceId) continue;
          const stMatch = rBlock.match(/<StartTime>([\s\S]*?)<\/StartTime>/);
          const startTime = stMatch ? extractStartTimeFromBlock(stMatch[1]) : null;
          const raceDateStr = raceDateMap.get(eventRaceId) ?? startTime?.slice(0, 10) ?? null;
          out.push({ personId, start: { eventId, eventRaceId, eventName: composeStageName(eventName, raceNameMap.get(eventRaceId)), organiserName, startTime, raceDateStr, className } });
        }
        continue;
      }

      const stMatch = pBlock.match(/<StartTime>([\s\S]*?)<\/StartTime>/);
      const startTime = stMatch ? extractStartTimeFromBlock(stMatch[1]) : null;
      const raceDateStr = startTime?.slice(0, 10) ?? null;
      out.push({ personId, start: { eventId, eventRaceId: eventId, eventName, organiserName, startTime, raceDateStr, className } });
    }
  }

  return out;
}

/**
 * Parse a duration like "1:54:47" (h:mm:ss) or "12:21" (mm:ss) into seconds.
 */
function parseDurationToSeconds(raw: string): number | null {
  const parts = raw.trim().split(':').map((p) => Number(p));
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/** True if a result block represents a completed (or terminal) result. */
function hasCompletedResult(block: string): boolean {
  return (
    /<CompetitorStatus\s+value="(OK|MisPunch|MissingPunch|Overtime|Disqualified|DidNotFinish|DidNotStart)"/.test(block) ||
    /<Status>(OK|MisPunch|Overtime|Disqualified|DidNotFinish|DidNotStart)<\/Status>/.test(block) ||
    /<Time>[^<]+<\/Time>/.test(block)
  );
}

/** Extract position + time-behind (seconds) from a result block. */
function extractResultFields(block: string): { position: string | null; timeBehind: number | null } {
  const positionMatch =
    block.match(/<ResultPosition>(\d+)<\/ResultPosition>/) ??
    block.match(/<Result\b[\s\S]*?<Position>(\d+)<\/Position>/);
  const position = positionMatch?.[1] ?? null;

  // Eventor publishes the gap as <TimeDiff> (h:mm:ss / mm:ss); fall back to the
  // numeric <TimeBehind> (seconds) used by some IOF feeds.
  let timeBehind: number | null = null;
  const timeDiffMatch = block.match(/<TimeDiff>([^<]+)<\/TimeDiff>/);
  if (timeDiffMatch) {
    timeBehind = parseDurationToSeconds(timeDiffMatch[1]);
  } else {
    const tbMatch = block.match(/<TimeBehind>(\d+)<\/TimeBehind>/);
    if (tbMatch) timeBehind = Number(tbMatch[1]);
  }
  return { position, timeBehind };
}

/**
 * Parse the person's result list into one entry PER stage (Eventor EventRaceId).
 *
 * Multi-day events wrap each stage in <RaceResult><EventRaceId>…<Result>.
 * Single-day events use <PersonResult>…<Result> directly (no RaceResult); for
 * those we use event_id as the race id so state stays keyed exactly as before.
 * The caller filters to today's stage by raceDateStr.
 */
function parsePersonResultsXml(xml: string): ParsedResult[] {
  const results: ParsedResult[] = [];
  const seenRace = new Set<string>();

  // /results/person returns <ResultListList><ResultList>…</ResultList>…</ResultListList>
  // Each <ResultList> is one event. Split on it first to get event context.
  const eventBlocks = xml.split(/<ResultList\b/);

  for (let i = 1; i < eventBlocks.length; i++) {
    const eventBlock = eventBlocks[i];

    const eventIdMatch = eventBlock.match(/<EventId[^>]*>(\d+)<\/EventId>/);
    if (!eventIdMatch) continue;
    const eventId = eventIdMatch[1];

    // Event name — first <Name> inside <Event>
    const eventNameMatch = eventBlock.match(/<Event\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
    const eventName = eventNameMatch?.[1] ?? 'Okänd tävling';

    // Class name from <EventClass><Name> or <Class><Name> (same for all stages)
    const classLabel =
      eventBlock.match(/<(?:EventClass|Class)\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/)?.[1] ?? null;

    const organiserName = extractOrganiserName(eventBlock);

    const raceDateMap = buildRaceDateMap(eventBlock);
    const raceNameMap = buildRaceNameMap(eventBlock);

    // Multi-day: one <RaceResult> per stage, each with <EventRaceId> + <Result>.
    const raceResultBlocks = eventBlock.match(/<RaceResult\b[\s\S]*?<\/RaceResult>/g);

    if (raceResultBlocks && raceResultBlocks.length > 0) {
      for (const block of raceResultBlocks) {
        const raceIdMatch = block.match(/<EventRaceId[^>]*>(\d+)<\/EventRaceId>/);
        if (!raceIdMatch) continue;
        const eventRaceId = raceIdMatch[1];
        const dedupKey = `${eventId}::${eventRaceId}`;
        if (seenRace.has(dedupKey)) continue;
        if (!hasCompletedResult(block)) continue;
        seenRace.add(dedupKey);
        const { position, timeBehind } = extractResultFields(block);
        // Date from the EventRace metadata, else from the <Result> block's
        // StartTime/FinishTime. (Scoped to <Result> so we never read a Person
        // <BirthDate>.)
        const resultBlock = block.match(/<Result\b[\s\S]*?<\/Result>/)?.[0] ?? '';
        const raceDateStr =
          raceDateMap.get(eventRaceId) ?? resultBlock.match(/<Date>([^<]+)<\/Date>/)?.[1]?.trim() ?? null;
        const stageName = composeStageName(eventName, raceNameMap.get(eventRaceId));
        results.push({ classLabel, eventId, eventRaceId, eventName: stageName, organiserName, position, timeBehind, raceDateStr });
      }
      continue;
    }

    // Single-day: <PersonResult>…<Result> directly. Use event_id as race id.
    const dedupKey = `${eventId}::${eventId}`;
    if (seenRace.has(dedupKey)) continue;
    const personResult = eventBlock.match(/<PersonResult\b[\s\S]*?<\/PersonResult>/)?.[0] ?? eventBlock;
    if (!hasCompletedResult(personResult)) continue;
    seenRace.add(dedupKey);
    const { position, timeBehind } = extractResultFields(personResult);
    // Scope the date to the <Result> block so we read the race's StartTime/
    // FinishTime date, not the Person <BirthDate> that precedes it.
    const resultBlock = personResult.match(/<Result\b[\s\S]*?<\/Result>/)?.[0] ?? '';
    const raceDateStr = resultBlock.match(/<Date>([^<]+)<\/Date>/)?.[1]?.trim() ?? null;
    results.push({ classLabel, eventId, eventRaceId: eventId, eventName, organiserName, position, timeBehind, raceDateStr });
  }

  return results;
}

function formatTimeBehind(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
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

    // 1. Load all friend watches (device-scoped) and device tokens
    const [
      { data: watches, error: watchesErr },
      { data: tokens, error: tokensErr },
    ] = await Promise.all([
      supabase.from('device_friend_watches').select('friend_club, friend_person_id, friend_name, device_id, push_on_result, push_on_start, push_on_live'),
      supabase
        .from('device_push_tokens')
        .select('device_id, push_token')
        .eq('is_active', true)
        .not('push_token', 'is', null)
        .order('updated_at', { ascending: false }),
    ]);

    if (watchesErr) throw watchesErr;
    if (tokensErr) throw tokensErr;

    const allWatches = (watches ?? []) as FriendWatchRow[];
    // Build token map: only keep the most recently seen token per device.
    const tokensByDevice = new Map<string, string[]>();
    const seenTokens = new Set<string>();
    for (const row of (tokens ?? []) as TokenRow[]) {
      if (seenTokens.has(row.push_token)) continue;
      seenTokens.add(row.push_token);
      const arr = tokensByDevice.get(row.device_id) ?? [];
      arr.push(row.push_token);
      tokensByDevice.set(row.device_id, arr);
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
      .select('event_id, event_race_id, event_name, friend_person_id, result_notified_at, start_notified_at, start_time, live_competition_id, live_class_name')
      .eq('event_date', todayStr);

    const stateMap = new Map<string, ActivityStateRow>();
    for (const row of (existingStates ?? []) as ActivityStateRow[]) {
      stateMap.set(`${row.friend_person_id}::${row.event_id}::${row.event_race_id}`, row);
    }

    // 4. Discover today's activity at a coarse cadence. Cron runs every 3 min;
    // start reminders still fire every run from cached start_time (section 5c),
    // so we only hit Eventor ~every 15 min. To avoid polling friends who aren't
    // racing today, first find who is entered TODAY with a few batched /entries
    // calls, then fetch start lists only for those friends. Results are no longer
    // polled here — poll-friend-result-publication reports "results available"
    // from a single /events call instead.
    const DISCOVERY_INTERVAL_MIN = 15;
    const nowMinute = new Date().getUTCMinutes();
    const shouldDiscover = nowMinute % DISCOVERY_INTERVAL_MIN < 3;
    const friendStartsMap = new Map<string, ParsedStart[]>();
    const friendResultsMap = new Map<string, ParsedResult[]>(); // kept empty; results handled by poll-friend-result-publication
    const entriesByFriend = new Map<string, Array<{ eventId: string; eventName: string }>>();

    const BATCH_SIZE = 5;
    if (shouldDiscover) {
      // 4a. One (chunked) /entries call for ALL friends → who is entered today.
      for (const chunk of chunkIdsByLength(uniqueFriendIds)) {
        try {
          const xml = await fetchEventorXml(
            `/entries?personIds=${chunk.join(',')}&includeEventElement=true&fromEventDate=${todayStr}&toEventDate=${todayStr}`,
          );
          for (const e of parseEntryEventsXml(xml)) {
            if (e.eventDateStr && e.eventDateStr !== todayStr) continue;
            const arr = entriesByFriend.get(e.personId) ?? [];
            arr.push({ eventId: e.eventId, eventName: e.eventName });
            entriesByFriend.set(e.personId, arr);
          }
        } catch (err) {
          console.warn('[poll-friend] Eventor entries fetch failed for chunk:', err);
        }
      }

      // 4b. Start lists per EVENT (not per friend): one /starts/event/iofxml call
      // returns every competitor's start time, from which we pick our friends'.
      // This scales with the number of events today, not the number of racing
      // friends — one big event with 200 friends costs one call. Front-loading:
      // mid-hour we skip an event whose friends all already have a cached start
      // time; the top-of-hour run re-fetches to catch re-draws / late changes.
      const racingFriendSet = new Set(entriesByFriend.keys());
      const eventsToday = new Map<string, { name: string; friendIds: Set<string> }>();
      for (const [friendId, events] of entriesByFriend) {
        for (const ev of events) {
          const rec = eventsToday.get(ev.eventId) ?? { name: ev.eventName, friendIds: new Set<string>() };
          rec.friendIds.add(friendId);
          eventsToday.set(ev.eventId, rec);
        }
      }

      const refreshAllStarts = nowMinute < DISCOVERY_INTERVAL_MIN;
      const friendsWithCachedStart = new Set(
        [...stateMap.values()].filter((s) => s.start_time).map((s) => s.friend_person_id),
      );

      const eventIds = [...eventsToday.keys()];
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batch = eventIds.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (eventId) => {
            const rec = eventsToday.get(eventId)!;
            const needsFetch = refreshAllStarts || [...rec.friendIds].some((id) => !friendsWithCachedStart.has(id));
            if (!needsFetch) return;
            try {
              const xml = await fetchEventorXml(`/starts/event/iofxml?eventId=${eventId}`);
              for (const { personId, start } of parseEventStartListXml(xml, eventId, rec.name)) {
                if (!racingFriendSet.has(personId)) continue; // only keep our friends
                const arr = friendStartsMap.get(personId) ?? [];
                arr.push(start);
                friendStartsMap.set(personId, arr);
              }
            } catch (err) {
              console.warn(`[poll-friend] Eventor event start list fetch failed for event ${eventId}:`, err);
            }
          }),
        );
      }
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
    type ResultNotifItem = { classLabel: string | null; eventName: string; friendClub: string; friendName: string; position: string | null; timeBehind: number | null };
    const startNotifs = new Map<string, StartNotifItem[]>();
    const resultNotifs = new Map<string, ResultNotifItem[]>();

    // State rows to upsert after sending
    const stateUpserts: Array<Record<string, unknown>> = [];

    // Track which friend+event combos already got state upserted (avoid duplicates
    // when multiple users watch the same friend).
    const startStateTracked = new Set<string>();
    const resultStateTracked = new Set<string>();

    for (const watch of allWatches) {
      const userTokens = tokensByDevice.get(watch.device_id);
      if (!userTokens || userTokens.length === 0) continue;

      const friendId = watch.friend_person_id;

      // --- Start activity tracking & notifications ---
      const starts = friendStartsMap.get(friendId) ?? [];
      for (const start of starts) {
        // Multi-stage safety: only act on the stage that belongs to today.
        // raceDateStr is the stage's date; skip any other stage so a future
        // (or past) stage never notifies on the wrong day.
        if (start.raceDateStr && start.raceDateStr !== todayStr) continue;
        const key = `${friendId}::${start.eventId}::${start.eventRaceId}`;
        const existing = stateMap.get(key);
        if (existing?.start_notified_at) continue; // already notified

        const startDate = parseStartTimeIso(start.startTime);

        // Always record that the friend has a start today (even without parseable time)
        if (!existing && !startStateTracked.has(key)) {
          startStateTracked.add(key);
          stateUpserts.push({
            event_date: todayStr,
            event_id: start.eventId,
            event_race_id: start.eventRaceId,
            event_name: start.eventName,
            friend_person_id: friendId,
            start_time: start.startTime,
            updated_at: nowIso,
          });
        }

        // Notification: only if within 5 min window and time is parseable
        if (!startDate) continue;
        const diffMs = startDate.getTime() - now.getTime();
        if (diffMs > 0 && diffMs <= START_WINDOW_MS) {
          // Only send the push AND mark start_notified_at when this watcher
          // actually wants the Eventor start reminder. start_notified_at is the
          // shared "start has been announced" flag; keeping it honest lets the
          // live poller send a "har startat" push when no Eventor reminder was
          // delivered, while still preventing two separate start notifications.
          if (watch.push_on_start) {
            const idx = stateUpserts.findIndex((u) => u.friend_person_id === friendId && u.event_id === start.eventId && u.event_race_id === start.eventRaceId);
            if (idx !== -1) {
              stateUpserts[idx].start_notified_at = nowIso;
            } else {
              startStateTracked.add(key);
              stateUpserts.push({
                event_date: todayStr,
                event_id: start.eventId,
                event_race_id: start.eventRaceId,
                event_name: start.eventName,
                friend_person_id: friendId,
                start_notified_at: nowIso,
                start_time: start.startTime,
                updated_at: nowIso,
              });
            }

            const arr = startNotifs.get(watch.device_id) ?? [];
            const timeStr = startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
            arr.push({ friendClub: watch.friend_club ?? '', friendName: watch.friend_name, eventName: start.eventName, startTime: timeStr });
            startNotifs.set(watch.device_id, arr);
          }
        }
      }

      // --- Result activity tracking & notifications ---
      const results = friendResultsMap.get(friendId) ?? [];
      for (const result of results) {
        // Only act on today's stage result.
        if (result.raceDateStr && result.raceDateStr !== todayStr) continue;
        const key = `${friendId}::${result.eventId}::${result.eventRaceId}`;
        const existing = stateMap.get(key);
        if (existing?.result_notified_at) continue; // already tracked

        // Always update state so the app can show the green dot
        if (!resultStateTracked.has(key)) {
          resultStateTracked.add(key);
          stateUpserts.push({
            event_date: todayStr,
            event_id: result.eventId,
            event_race_id: result.eventRaceId,
            event_name: result.eventName,
            friend_person_id: friendId,
            result_notified_at: nowIso,
            updated_at: nowIso,
          });
        }

        // Only send push if enabled
        if (watch.push_on_result) {
          const arr = resultNotifs.get(watch.device_id) ?? [];
          arr.push({
            classLabel: result.classLabel,
            eventName: result.eventName,
            friendClub: watch.friend_club ?? '',
            friendName: watch.friend_name,
            position: result.position,
            timeBehind: result.timeBehind,
          });
          resultNotifs.set(watch.device_id, arr);
        }
      }
    }

    // Ensure a state row exists for every event a friend is entered in today so
    // poll-friend-result-publication can check its result-list publication (this
    // also covers free-start events that have no allocated start time).
    const watchedFriendIdSet = new Set(allWatches.map((w) => w.friend_person_id));
    for (const [friendId, events] of entriesByFriend) {
      if (!watchedFriendIdSet.has(friendId)) continue;
      for (const ev of events) {
        const key = `${friendId}::${ev.eventId}::${ev.eventId}`;
        if (stateMap.has(key)) continue;
        if (stateUpserts.some((u) => u.friend_person_id === friendId && u.event_id === ev.eventId && u.event_race_id === ev.eventId)) continue;
        stateUpserts.push({
          event_date: todayStr,
          event_id: ev.eventId,
          event_race_id: ev.eventId,
          event_name: ev.eventName,
          friend_person_id: friendId,
          updated_at: nowIso,
        });
      }
    }

    // 5b. Live competition matching — for friends that at least one user wants
    // live push for, match today's event to a liveresultat competition and store
    // the competition id + class name on the state row. The dedicated
    // poll-live-friends function reads these rows to send live notifications,
    // so the (rate-limited) Eventor calls happen only here.
    const liveWatchedFriendIds = new Set(
      allWatches.filter((w) => w.push_on_live).map((w) => w.friend_person_id),
    );
    if (shouldDiscover && liveWatchedFriendIds.size > 0) {
      // Entries were already fetched in section 4 (batched for all friends), so
      // reuse them here as the free-start matching source instead of fetching per
      // live-watched friend. Entries carry no organiser, so it is resolved via
      // /event/{id} further down.
      const entryEventsByFriend = entriesByFriend;

      // Collect one candidate per friend + stage (EventRaceId) for TODAY,
      // preferring the start list (has class during the race) but falling back
      // to the result list, then to entries (free-start, no start/result yet).
      type LiveCandidate = { friendId: string; eventId: string; eventRaceId: string; eventName: string; organiserName: string | null; className: string | null };
      const candidates = new Map<string, LiveCandidate>();
      for (const friendId of liveWatchedFriendIds) {
        for (const start of friendStartsMap.get(friendId) ?? []) {
          if (start.raceDateStr && start.raceDateStr !== todayStr) continue;
          candidates.set(`${friendId}::${start.eventRaceId}`, {
            friendId, eventId: start.eventId, eventRaceId: start.eventRaceId, eventName: start.eventName, organiserName: start.organiserName, className: start.className,
          });
        }
        for (const result of friendResultsMap.get(friendId) ?? []) {
          if (result.raceDateStr && result.raceDateStr !== todayStr) continue;
          const key = `${friendId}::${result.eventRaceId}`;
          if (!candidates.has(key)) {
            candidates.set(key, {
              friendId, eventId: result.eventId, eventRaceId: result.eventRaceId, eventName: result.eventName, organiserName: result.organiserName, className: result.classLabel,
            });
          }
        }
        for (const entryEvent of entryEventsByFriend.get(friendId) ?? []) {
          // Free-start events are single-day, so event_race_id == event_id (the
          // same convention parsePersonStartsXml uses for single-day stages).
          const key = `${friendId}::${entryEvent.eventId}`;
          if (!candidates.has(key)) {
            candidates.set(key, {
              friendId, eventId: entryEvent.eventId, eventRaceId: entryEvent.eventId, eventName: entryEvent.eventName, organiserName: null, className: null,
            });
          }
        }
      }

      if (candidates.size > 0) {
        // Match unique events once (liveresultat matches per event/day).
        const uniqueEvents = new Map<string, { eventId: string; eventName: string; eventDate: string; organizer: string | null }>();
        for (const c of candidates.values()) {
          const existing = uniqueEvents.get(c.eventId);
          if (!existing) {
            uniqueEvents.set(c.eventId, { eventId: c.eventId, eventName: c.eventName, eventDate: todayStr, organizer: c.organiserName });
          } else if (!existing.organizer && c.organiserName) {
            // Prefer a real organiser from any candidate (starts/results) over a
            // null from an entry-only candidate.
            existing.organizer = c.organiserName;
          }
        }

        // Resolve the organiser for events that still lack one (entry-only,
        // free-start). /event/{id} returns <Organiser><Organisation><Name>,
        // which the organiser-boosted matcher uses to relax the name threshold.
        for (const ev of uniqueEvents.values()) {
          if (ev.organizer) continue;
          try {
            ev.organizer = extractOrganiserName(await fetchEventDetailXml(ev.eventId, 'poll-friend-activity:event-organiser'));
          } catch (err) {
            console.warn(`[poll-friend] Eventor event detail fetch failed for ${ev.eventId}:`, err);
          }
        }

        const liveIdByEvent = await findLiveCompetitionIdsBatch([...uniqueEvents.values()]);

        for (const c of candidates.values()) {
          const existing = stateMap.get(`${c.friendId}::${c.eventId}::${c.eventRaceId}`);
          const freshId = liveIdByEvent.get(c.eventId);
          // Never DOWNGRADE a confirmed match (>0) back to 0. The match can miss
          // on any cycle where liveresultat is momentarily unavailable, drops the
          // event from today's list, or the name similarity dips. Writing 0 in
          // that case would push live_competition_id below poll-live-friends'
          // `> 0` filter and permanently stop every further live push (splits,
          // finish) for the rest of the event. Keep the prior match instead.
          const liveId = (freshId && freshId > 0)
            ? freshId
            : (existing?.live_competition_id && existing.live_competition_id > 0 ? existing.live_competition_id : 0);
          // Likewise never wipe a known class name with a null from a thinner candidate.
          const liveClassName = c.className ?? existing?.live_class_name ?? null;
          // Carry forward start/result flags from the existing row. The bulk
          // upsert builds its column list from the union of all object keys and
          // writes NULL for any key an object omits (ON CONFLICT DO UPDATE), so
          // omitting these here would let another row's start_notified_at column
          // wipe this friend's already-sent start flag → duplicate live "har
          // startat" pushes. Seeding from state keeps the array safe.
          stateUpserts.push({
            event_date: todayStr,
            event_id: c.eventId,
            event_race_id: c.eventRaceId,
            event_name: c.eventName,
            friend_person_id: c.friendId,
            live_class_name: liveClassName,
            live_competition_id: liveId,
            result_notified_at: existing?.result_notified_at ?? null,
            start_notified_at: existing?.start_notified_at ?? null,
            updated_at: nowIso,
          });
        }
      }
    }

    // 5c. Cache-driven start reminders. Runs on the frequent ticks BETWEEN the
    // coarse discovery cycles, firing "startar snart" from the start_time already
    // stored on friend_activity_state — no Eventor call needed to remind.
    if (!shouldDiscover) {
      for (const watch of allWatches) {
        if (!watch.push_on_start) continue;
        const userTokens = tokensByDevice.get(watch.device_id);
        if (!userTokens || userTokens.length === 0) continue;

        for (const state of stateMap.values()) {
          if (state.friend_person_id !== watch.friend_person_id) continue;
          if (state.start_notified_at || !state.start_time) continue;

          const startDate = parseStartTimeIso(state.start_time);
          if (!startDate) continue;
          const diffMs = startDate.getTime() - now.getTime();
          if (diffMs <= 0 || diffMs > START_WINDOW_MS) continue;

          const idx = stateUpserts.findIndex(
            (u) => u.friend_person_id === state.friend_person_id && u.event_id === state.event_id && u.event_race_id === state.event_race_id,
          );
          if (idx !== -1) {
            stateUpserts[idx].start_notified_at = nowIso;
          } else {
            stateUpserts.push({
              event_date: todayStr,
              event_id: state.event_id,
              event_race_id: state.event_race_id,
              event_name: state.event_name ?? '',
              friend_person_id: state.friend_person_id,
              start_notified_at: nowIso,
              start_time: state.start_time,
              updated_at: nowIso,
            });
          }

          const arr = startNotifs.get(watch.device_id) ?? [];
          const timeStr = startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
          arr.push({ friendClub: watch.friend_club ?? '', friendName: watch.friend_name, eventName: state.event_name ?? 'en tävling', startTime: timeStr });
          startNotifs.set(watch.device_id, arr);
        }
      }
    }

    // 6. Build and send push messages
    const allMessages: Array<{ body: string; data: Record<string, unknown>; sound: 'default'; title: string; to: string }> = [];

    // Start notifications — one per friend per device
    for (const [deviceId, items] of startNotifs) {
      const pushTokens = tokensByDevice.get(deviceId) ?? [];
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
    for (const [deviceId, items] of resultNotifs) {
      const pushTokens = tokensByDevice.get(deviceId) ?? [];
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
          title = `Res. ${f.friendName}${clubSuffix}.`;
          const posStr = f.position ? `Plac. ${f.position}` : 'Resultat';
          const timeBehindStr = f.timeBehind != null && f.timeBehind > 0 ? ` (+${formatTimeBehind(f.timeBehind)})` : '';
          const classStr = f.classLabel ? ` i ${f.classLabel}` : '';
          body = `${posStr}${timeBehindStr}${classStr} (${eventName}).`;
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
      const { invalidTokens } = await sendExpoPushMessages(allMessages);
      await deactivateInvalidTokens(supabase, invalidTokens);
    }

    // 7. Upsert activity state (deduplicate by friend_person_id + event_id + race)
    if (stateUpserts.length > 0) {
      // Deduplicate: keep the one with the most info (notified timestamps).
      // Include event_race_id in the key so multi-day events (which share one
      // event_id across stages) get one row per stage (Eventor EventRaceId).
      const deduped = new Map<string, Record<string, unknown>>();
      for (const row of stateUpserts) {
        const key = `${row.friend_person_id}::${row.event_id}::${row.event_race_id}`;
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
        .upsert([...deduped.values()], { onConflict: 'friend_person_id,event_id,event_race_id' });
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
