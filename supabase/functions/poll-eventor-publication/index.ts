import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { extractPublicationFlags, fetchEventDetailXml } from '../_shared/eventor.ts';
import { sendExpoPushMessages } from '../_shared/expoPush.ts';

type WatchRow = {
  event_id: string;
  event_name: string;
  has_published_results: boolean;
  has_published_starts: boolean;
  person_id: string;
};

type PreferenceRow = {
  person_id: string;
  push_on_result_list: boolean;
  push_on_start_list: boolean;
};

type TokenRow = {
  person_id: string;
  push_token: string | null;
};

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
          .from('favorite_event_watches')
          .select('event_id, event_name, has_published_results, has_published_starts, person_id'),
        supabase
          .from('notification_preferences')
          .select('person_id, push_on_result_list, push_on_start_list')
          .or('push_on_result_list.eq.true,push_on_start_list.eq.true'),
        supabase.from('device_push_tokens').select('person_id, push_token').eq('is_active', true).not('push_token', 'is', null),
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

    const preferenceByPersonId = new Map((preferences as PreferenceRow[] | null | undefined)?.map((row) => [row.person_id, row]) ?? []);
    const tokensByPersonId = new Map<string, string[]>();

    ((tokens as TokenRow[] | null | undefined) ?? []).forEach((row) => {
      if (!row.push_token) {
        return;
      }

      const existing = tokensByPersonId.get(row.person_id) ?? [];
      existing.push(row.push_token);
      tokensByPersonId.set(row.person_id, existing);
    });

    let checkedEvents = 0;
    let pushCount = 0;

    for (const watch of (watches as WatchRow[] | null | undefined) ?? []) {
      const preferencesForUser = preferenceByPersonId.get(watch.person_id);

      if (!preferencesForUser) {
        continue;
      }

      const eventXml = await fetchEventDetailXml(watch.event_id);
      const flags = extractPublicationFlags(eventXml);
      const messages: Array<{ body: string; title: string; to: string }> = [];
      const pushTokens = tokensByPersonId.get(watch.person_id) ?? [];

      if (!watch.has_published_starts && flags.hasPublishedStarts && preferencesForUser.push_on_start_list) {
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

      if (!watch.has_published_results && flags.hasPublishedResults && preferencesForUser.push_on_result_list) {
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

      if (messages.length > 0) {
        await sendExpoPushMessages(
          messages.map((message) => ({
            ...message,
            sound: 'default',
          })),
        );

        pushCount += messages.length;
      }

      await supabase
        .from('favorite_event_watches')
        .update({
          has_published_results: flags.hasPublishedResults,
          has_published_starts: flags.hasPublishedStarts,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('person_id', watch.person_id)
        .eq('event_id', watch.event_id);

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
