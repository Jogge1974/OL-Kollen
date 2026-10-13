import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { extractPublicationFlags } from '../_shared/eventor.ts';
import { recordEventorApiCall } from '../_shared/eventorCallCounter.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';

// ---------------------------------------------------------------------------
// "Result list published" poller.
//
// Instead of polling /results/person per friend (which scales with the number
// of friends and runs every few minutes), this reads the events that watched
// friends are entered in TODAY (already recorded on friend_activity_state by
// poll-friend-activity's discovery) and checks their result-list publication
// status with a SINGLE /events?fromDate=today&toDate=today call. The events list
// carries the same officialResult_<raceId> HashTableEntry flags as /event/{id},
// so one request covers every tracked event. When an event's result list is
// newly published we push "results available" (no placement needed) to every
// user watching a friend in that event.
// ---------------------------------------------------------------------------

type FriendWatchRow = {
  device_id: string;
  friend_club: string | null;
  friend_person_id: string;
  friend_name: string;
  push_on_result: boolean;
};

type TokenRow = {
  device_id: string;
  push_token: string;
};

type ActivityStateRow = {
  id: number;
  friend_person_id: string;
  event_id: string;
  event_race_id: string;
  event_name: string | null;
  result_list_notified_at: string | null;
};

const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

async function fetchTodaysEventsXml(todayStr: string): Promise<string> {
  const path = `/events?fromDate=${todayStr}&toDate=${todayStr}`;
  await recordEventorApiCall('poll-friend-result-publication', path);

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

/** Split an <EventList> response into one <Event> block per EventId. */
function splitEventBlocksById(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = xml.match(/<Event\b[^>]*>[\s\S]*?<\/Event>/g) ?? [];
  for (const block of blocks) {
    const id = block.match(/<EventId>(\d+)<\/EventId>/)?.[1];
    if (id && !map.has(id)) map.set(id, block);
  }
  return map;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    // 1. Today's tracked friend events that have NOT yet had a "result list
    //    published" push. If there are none, skip the Eventor call entirely.
    const { data: stateData, error: stateErr } = await supabase
      .from('friend_activity_state')
      .select('id, friend_person_id, event_id, event_race_id, event_name, result_list_notified_at')
      .eq('event_date', todayStr)
      .is('result_list_notified_at', null);
    if (stateErr) throw stateErr;

    const stateRows = (stateData ?? []) as ActivityStateRow[];
    if (stateRows.length === 0) {
      return jsonOk({ checkedEvents: 0, ok: true, pushCount: 0, reason: 'no-tracked-events' });
    }

    // 2. Watchers (who wants result push for which friend) + device tokens.
    const [
      { data: watches, error: watchesErr },
      { data: tokens, error: tokensErr },
    ] = await Promise.all([
      supabase.from('device_friend_watches').select('friend_club, friend_person_id, friend_name, device_id, push_on_result'),
      supabase
        .from('device_push_tokens')
        .select('device_id, push_token')
        .eq('is_active', true)
        .not('push_token', 'is', null)
        .order('updated_at', { ascending: false }),
    ]);
    if (watchesErr) throw watchesErr;
    if (tokensErr) throw tokensErr;

    // Token map: keep only the most recently seen token per device.
    const tokensByDevice = new Map<string, string[]>();
    const seenTokens = new Set<string>();
    for (const row of (tokens ?? []) as TokenRow[]) {
      if (seenTokens.has(row.push_token)) continue;
      seenTokens.add(row.push_token);
      const arr = tokensByDevice.get(row.device_id) ?? [];
      arr.push(row.push_token);
      tokensByDevice.set(row.device_id, arr);
    }

    // Watchers per friend that actually want the result push and have a token.
    const watchersByFriend = new Map<string, FriendWatchRow[]>();
    for (const w of (watches ?? []) as FriendWatchRow[]) {
      if (!w.push_on_result) continue;
      if (!tokensByDevice.has(w.device_id)) continue;
      const arr = watchersByFriend.get(w.friend_person_id) ?? [];
      arr.push(w);
      watchersByFriend.set(w.friend_person_id, arr);
    }

    // Only bother checking events that at least one user wants a result push for.
    const relevantRows = stateRows.filter((r) => watchersByFriend.has(r.friend_person_id));
    if (relevantRows.length === 0) {
      return jsonOk({ checkedEvents: 0, ok: true, pushCount: 0, reason: 'no-result-watchers' });
    }

    // 3. ONE Eventor call for today's events, then read publication flags per event.
    const eventsXml = await fetchTodaysEventsXml(todayStr);
    const eventBlocks = splitEventBlocksById(eventsXml);

    // 4. For each tracked event whose result list is published, queue a push per
    //    watching user and mark the row.
    type ResultNotifItem = { friendName: string; friendClub: string; eventName: string };
    const notifsByUser = new Map<string, ResultNotifItem[]>();
    const rowIdsToMark: number[] = [];

    for (const row of relevantRows) {
      const block = eventBlocks.get(row.event_id);
      if (!block) continue;

      // Single-day rows store event_race_id = event_id, but the publication key
      // is suffixed with the real EventRaceId — so match any officialResult key
      // (no eventRaceId) for single-day, and the exact stage for multi-day.
      const isSingleDay = row.event_race_id === row.event_id;
      const { hasPublishedResults } = extractPublicationFlags(block, isSingleDay ? null : row.event_race_id);
      if (!hasPublishedResults) continue;

      rowIdsToMark.push(row.id);

      const eventName = row.event_name ?? 'en tävling';
      for (const w of watchersByFriend.get(row.friend_person_id) ?? []) {
        const arr = notifsByUser.get(w.device_id) ?? [];
        arr.push({ friendName: w.friend_name, friendClub: w.friend_club ?? '', eventName });
        notifsByUser.set(w.device_id, arr);
      }
    }

    // 5. Build and send push messages (no placement — just "results available").
    const allMessages: Array<{ body: string; data: Record<string, unknown>; sound: 'default'; title: string; to: string }> = [];
    for (const [deviceId, items] of notifsByUser) {
      const pushTokens = tokensByDevice.get(deviceId) ?? [];
      if (pushTokens.length === 0) continue;

      const unique = [...new Map(items.map((i) => [`${i.friendName}::${i.eventName}`, i])).values()];
      const uniqueFriends = new Set(unique.map((i) => i.friendName)).size;

      let title: string;
      let body: string;
      if (unique.length === 1) {
        const f = unique[0];
        const clubSuffix = f.friendClub ? `, ${f.friendClub}` : '';
        title = `Resultat: ${f.friendName}${clubSuffix}.`;
        body = `Resultatlistan för ${f.eventName} är publicerad.`;
      } else {
        title = 'Nya resultat för dina vänner.';
        body = `Resultatlistor är publicerade för ${uniqueFriends} ${uniqueFriends === 1 ? 'vän' : 'vänner'}.`;
      }

      for (const token of pushTokens) {
        allMessages.push({ body, data: { type: 'friend-results' }, sound: 'default', title, to: token });
      }
    }

    if (allMessages.length > 0) {
      const { invalidTokens } = await sendExpoPushMessages(allMessages);
      await deactivateInvalidTokens(supabase, invalidTokens);
    }

    // 6. Mark the notified rows so we never push twice for the same list.
    if (rowIdsToMark.length > 0) {
      const markedAt = new Date().toISOString();
      await supabase
        .from('friend_activity_state')
        // result_notified_at also drives the app's "has results" indicator.
        .update({ result_list_notified_at: markedAt, result_notified_at: markedAt })
        .in('id', rowIdsToMark);
    }

    return jsonOk({
      checkedEvents: new Set(relevantRows.map((r) => r.event_id)).size,
      ok: true,
      publishedRows: rowIdsToMark.length,
      pushCount: allMessages.length,
    });
  } catch (error) {
    console.error('[poll-friend-result-publication] Error:', error);
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
