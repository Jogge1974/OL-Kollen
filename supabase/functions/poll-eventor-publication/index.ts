import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { extractPublicationFlags, isPublicationAfterFavorite } from '../_shared/eventor.ts';
import { recordEventorApiCall } from '../_shared/eventorCallCounter.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';

type WatchRow = {
  created_at: string;
  device_id: string;
  event_id: string;
  event_name: string;
  has_published_results: boolean;
  has_published_starts: boolean;
};

type PreferenceRow = {
  device_id: string;
  push_on_result_list: boolean;
  push_on_start_list: boolean;
};

type TokenRow = {
  device_id: string;
  push_token: string | null;
};

const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

async function fetchEventsRangeXml(fromDate: string, toDate: string): Promise<string> {
  const path = `/events?fromDate=${fromDate}&toDate=${toDate}`;
  await recordEventorApiCall('poll-eventor-publication', path);

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
    const incomingCronSecret = request.headers.get('x-cron-secret');

    if (cronSecret && incomingCronSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized cron request.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const [{ data: watches, error: watchesError }, { data: preferences, error: preferencesError }, { data: tokens, error: tokensError }] =
      await Promise.all([
        supabase
          .from('device_favorite_watches')
          .select('created_at, device_id, event_id, event_name, has_published_results, has_published_starts'),
        supabase
          .from('device_notification_preferences')
          .select('device_id, push_on_result_list, push_on_start_list')
          .or('push_on_result_list.eq.true,push_on_start_list.eq.true'),
        supabase.from('device_push_tokens').select('device_id, push_token').eq('is_active', true).not('push_token', 'is', null).order('updated_at', { ascending: false }),
      ]);

    if (watchesError) {
      throw watchesError;
    }

    if (preferencesError) {
      throw preferencesError;
    }

    if (tokensError) {
      throw tokensError;
    }

    const preferenceByDeviceId = new Map((preferences as PreferenceRow[] | null | undefined)?.map((row) => [row.device_id, row]) ?? []);
    const tokensByDeviceId = new Map<string, string[]>();
    const seenTokens = new Set<string>();

    ((tokens as TokenRow[] | null | undefined) ?? []).forEach((row) => {
      if (!row.push_token || seenTokens.has(row.push_token)) {
        return;
      }
      seenTokens.add(row.push_token);

      const existing = tokensByDeviceId.get(row.device_id) ?? [];
      existing.push(row.push_token);
      tokensByDeviceId.set(row.device_id, existing);
    });

    let checkedEvents = 0;
    let pushCount = 0;

    // Group watches by event_id so we fetch each event only once. For
    // multi-stage events each stage is favorited as its own watch with a
    // composite event_id ("<eventId>::<eventRaceId>"), so each stage forms its
    // own group and is evaluated independently.
    const watchesByEventId = new Map<string, WatchRow[]>();

    for (const watch of (watches as WatchRow[] | null | undefined) ?? []) {
      const existing = watchesByEventId.get(watch.event_id) ?? [];
      existing.push(watch);
      watchesByEventId.set(watch.event_id, existing);
    }

    // One /events call for the whole publication-relevant window returns the
    // publication flags for every event at once, so we never fetch per event.
    // Favourites outside this window are skipped this cycle (their lists can't
    // have published yet / are long past) rather than fetched individually.
    const fromDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const toDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const eventBlocks = splitEventBlocksById(await fetchEventsRangeXml(fromDate, toDate));

    for (const [eventId, eventWatches] of watchesByEventId) {
      const baseEventId = eventId.split('::')[0] ?? eventId;
      const eventRaceId = eventId.includes('::') ? eventId.split('::')[1] || null : null;

      const eventXml = eventBlocks.get(baseEventId);
      if (eventXml === undefined) {
        // Not in the checked window (or not yet in Eventor): skip without zeroing
        // the stored publication flags.
        continue;
      }

      const flags = extractPublicationFlags(eventXml, eventRaceId);
      const messages: Array<{ body: string; title: string; to: string }> = [];

      for (const watch of eventWatches) {
        const preferencesForUser = preferenceByDeviceId.get(watch.device_id);

        if (preferencesForUser) {
          const pushTokens = tokensByDeviceId.get(watch.device_id) ?? [];
          const shouldNotifyStartPublication = isPublicationAfterFavorite(flags.startPublishedAt, watch.created_at);
          const shouldNotifyResultPublication = isPublicationAfterFavorite(flags.resultPublishedAt, watch.created_at);

          if (!watch.has_published_starts && flags.hasPublishedStarts && shouldNotifyStartPublication && preferencesForUser.push_on_start_list) {
            pushTokens.forEach((pushToken) => {
              messages.push({
                body: `${watch.event_name} har nu publicerat startlista.`,
                data: {
                  eventId: watch.event_id,
                  kind: 'starts',
                },
                title: 'Startlista publicerad',
                to: pushToken,
              });
            });
          }

          if (!watch.has_published_results && flags.hasPublishedResults && shouldNotifyResultPublication && preferencesForUser.push_on_result_list) {
            pushTokens.forEach((pushToken) => {
              messages.push({
                body: `${watch.event_name} har nu publicerat resultatlista.`,
                data: {
                  eventId: watch.event_id,
                  kind: 'results',
                },
                title: 'Resultatlista publicerad',
                to: pushToken,
              });
            });
          }
        }
      }

      // Send all push messages for this event in one batch
      if (messages.length > 0) {
        const { invalidTokens } = await sendExpoPushMessages(
          messages.map((message) => ({
            ...message,
            sound: 'default',
          })),
        );
        await deactivateInvalidTokens(supabase, invalidTokens);

        pushCount += messages.length;
      }

      // Update ALL watch rows for this event at once
      const now = new Date().toISOString();

      await supabase
        .from('device_favorite_watches')
        .update({
          has_published_results: flags.hasPublishedResults,
          has_published_starts: flags.hasPublishedStarts,
          updated_at: now,
        })
        .eq('event_id', eventId);

      checkedEvents += 1;
    }

    return new Response(
      JSON.stringify({
        checkedEvents,
        ok: true,
        pushCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown poll error.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
