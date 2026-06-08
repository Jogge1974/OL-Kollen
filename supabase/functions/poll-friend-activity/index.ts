import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';
import { findLiveCompetitionIdsBatch } from '../_shared/liveresultat.ts';

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
  push_on_live: boolean;
};

type TokenRow = {
  person_id: string;
  push_token: string;
};

type ActivityStateRow = {
  event_id: string;
  event_race_id: string;
  friend_person_id: string;
  result_notified_at: string | null;
  start_notified_at: string | null;
  start_time: string | null;
};

// Parsed from Eventor XML.
// eventRaceId identifies a single stage (Eventor EventRaceId). For single-day
// events it equals eventId so state stays keyed exactly as before.
type ParsedStart = {
  eventId: string;
  eventRaceId: string;
  eventName: string;
  startTime: string | null; // ISO 8601
  raceDateStr: string | null; // YYYY-MM-DD of the stage
  className: string | null;
};

type ParsedResult = {
  classLabel: string | null;
  eventId: string;
  eventRaceId: string;
  eventName: string;
  position: string | null;
  timeBehind: number | null;
  raceDateStr: string | null; // YYYY-MM-DD of the stage
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
 * Parse the person's start list into one entry PER stage (Eventor EventRaceId).
 *
 * Multi-day events wrap each stage in <RaceStart><EventRaceId>…<Start><StartTime>.
 * Single-day events use <PersonStart>…<Start><StartTime> directly (no RaceStart);
 * for those we use event_id as the race id so state stays keyed exactly as
 * before. The caller filters to today's stage by raceDateStr.
 */
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

    // Class name from <EventClass><Name> or <Class><Name> (used for live matching)
    const classNameMatch =
      eventBlock.match(/<(?:EventClass|Class)\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
    const className = classNameMatch?.[1]?.trim() ?? null;

    const raceDateMap = buildRaceDateMap(eventBlock);

    // Multi-day events wrap each stage in <RaceStart><EventRaceId>…<Start><StartTime>.
    const raceStartBlocks = eventBlock.match(/<RaceStart\b[\s\S]*?<\/RaceStart>/g);

    if (raceStartBlocks && raceStartBlocks.length > 0) {
      for (const block of raceStartBlocks) {
        const raceIdMatch = block.match(/<EventRaceId[^>]*>(\d+)<\/EventRaceId>/);
        if (!raceIdMatch) continue;
        const eventRaceId = raceIdMatch[1];
        const stMatch = block.match(/<StartTime>([\s\S]*?)<\/StartTime>/);
        const startTime = stMatch ? extractStartTimeFromBlock(stMatch[1]) : null;
        const raceDateStr = raceDateMap.get(eventRaceId) ?? startTime?.slice(0, 10) ?? null;
        results.push({ eventId, eventRaceId, eventName, startTime, raceDateStr, className });
      }
      continue;
    }

    // Single-day fallback: one <Start><StartTime> directly under <PersonStart>.
    // Use event_id as the race id so single-day state is keyed exactly as before.
    const personStartBlock =
      eventBlock.match(/<PersonStart\b[\s\S]*?<\/PersonStart>/)?.[0] ?? eventBlock;
    const stMatch = personStartBlock.match(/<StartTime>([\s\S]*?)<\/StartTime>/);
    const startTime = stMatch ? extractStartTimeFromBlock(stMatch[1]) : null;
    const raceDateStr = startTime?.slice(0, 10) ?? null;
    results.push({ eventId, eventRaceId: eventId, eventName, startTime, raceDateStr, className });
  }

  return results;
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

    const raceDateMap = buildRaceDateMap(eventBlock);

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
        results.push({ classLabel, eventId, eventRaceId, eventName, position, timeBehind, raceDateStr });
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
    results.push({ classLabel, eventId, eventRaceId: eventId, eventName, position, timeBehind, raceDateStr });
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

    // 1. Load all friend watches and device tokens
    const [
      { data: watches, error: watchesErr },
      { data: tokens, error: tokensErr },
    ] = await Promise.all([
      supabase.from('friend_watches').select('friend_club, friend_person_id, friend_name, person_id, push_on_result, push_on_start, push_on_live'),
      supabase
        .from('device_push_tokens')
        .select('person_id, push_token')
        .eq('is_active', true)
        .not('push_token', 'is', null)
        .order('updated_at', { ascending: false }),
    ]);

    if (watchesErr) throw watchesErr;
    if (tokensErr) throw tokensErr;

    const allWatches = (watches ?? []) as FriendWatchRow[];
    // Build token map: only keep the most recently seen token per device.
    // If multiple persons share a device, only the last active one gets push.
    const tokensByPerson = new Map<string, string[]>();
    const seenTokens = new Set<string>();
    for (const row of (tokens ?? []) as TokenRow[]) {
      if (seenTokens.has(row.push_token)) continue;
      seenTokens.add(row.push_token);
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
      .select('event_id, event_race_id, friend_person_id, result_notified_at, start_notified_at, start_time')
      .eq('event_date', todayStr);

    const stateMap = new Map<string, ActivityStateRow>();
    for (const row of (existingStates ?? []) as ActivityStateRow[]) {
      stateMap.set(`${row.friend_person_id}::${row.event_id}::${row.event_race_id}`, row);
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
      const userTokens = tokensByPerson.get(watch.person_id);
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

            const arr = startNotifs.get(watch.person_id) ?? [];
            const timeStr = startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
            arr.push({ friendClub: watch.friend_club ?? '', friendName: watch.friend_name, eventName: start.eventName, startTime: timeStr });
            startNotifs.set(watch.person_id, arr);
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
          const arr = resultNotifs.get(watch.person_id) ?? [];
          arr.push({
            classLabel: result.classLabel,
            eventName: result.eventName,
            friendClub: watch.friend_club ?? '',
            friendName: watch.friend_name,
            position: result.position,
            timeBehind: result.timeBehind,
          });
          resultNotifs.set(watch.person_id, arr);
        }
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
    if (liveWatchedFriendIds.size > 0) {
      // Collect one candidate per friend + stage (EventRaceId) for TODAY,
      // preferring the start list (has class during the race) but falling back
      // to the result list.
      type LiveCandidate = { friendId: string; eventId: string; eventRaceId: string; eventName: string; className: string | null };
      const candidates = new Map<string, LiveCandidate>();
      for (const friendId of liveWatchedFriendIds) {
        for (const start of friendStartsMap.get(friendId) ?? []) {
          if (start.raceDateStr && start.raceDateStr !== todayStr) continue;
          candidates.set(`${friendId}::${start.eventRaceId}`, {
            friendId, eventId: start.eventId, eventRaceId: start.eventRaceId, eventName: start.eventName, className: start.className,
          });
        }
        for (const result of friendResultsMap.get(friendId) ?? []) {
          if (result.raceDateStr && result.raceDateStr !== todayStr) continue;
          const key = `${friendId}::${result.eventRaceId}`;
          if (!candidates.has(key)) {
            candidates.set(key, {
              friendId, eventId: result.eventId, eventRaceId: result.eventRaceId, eventName: result.eventName, className: result.classLabel,
            });
          }
        }
      }

      if (candidates.size > 0) {
        // Match unique events once (liveresultat matches per event/day).
        const uniqueEvents = new Map<string, { eventId: string; eventName: string; eventDate: string }>();
        for (const c of candidates.values()) {
          if (!uniqueEvents.has(c.eventId)) {
            uniqueEvents.set(c.eventId, { eventId: c.eventId, eventName: c.eventName, eventDate: todayStr });
          }
        }
        const liveIdByEvent = await findLiveCompetitionIdsBatch([...uniqueEvents.values()]);

        for (const c of candidates.values()) {
          const liveId = liveIdByEvent.get(c.eventId) ?? 0; // 0 = checked, no match
          stateUpserts.push({
            event_date: todayStr,
            event_id: c.eventId,
            event_race_id: c.eventRaceId,
            event_name: c.eventName,
            friend_person_id: c.friendId,
            live_class_name: c.className,
            live_competition_id: liveId,
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
