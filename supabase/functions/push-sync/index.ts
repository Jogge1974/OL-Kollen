import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

type SyncPayload = {
  action?: 'sync' | 'logout';
  device: {
    deviceId: string;
    platform: string;
    pushToken: string | null;
  } | null;
  favoriteEvents: Array<{
    classificationId: number;
    classificationLabel: string;
    hasPublishedResults: boolean;
    hasPublishedStarts: boolean;
    id: string;
    name: string;
    startDate: string;
  }>;
  friends?: Array<{
    birthYear: number | null;
    club: string;
    gender: string;
    name: string;
    personId: number;
    pushOnEntry?: boolean;
    pushOnLive?: boolean;
    pushOnResult: boolean;
    pushOnStart: boolean;
  }>;
  notificationSettings: {
    pushOnResultList: boolean;
    pushOnStartList: boolean;
    pushOnEntryDeadline: boolean;
  };
  user: {
    clubId: string | null;
    clubName: string | null;
    email: string | null;
    fullName: string | null;
    personId: string;
    username: string;
  };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = (await request.json()) as SyncPayload;

    if (!payload.user?.personId) {
      return new Response(JSON.stringify({ error: 'Missing personId.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
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

    const action = payload.action ?? 'sync';

    // --- LOGOUT: deactivate this device's push token ---
    if (action === 'logout') {
      if (payload.device?.deviceId) {
        await supabase
          .from('device_push_tokens')
          .update({ is_active: false, push_token: null, updated_at: new Date().toISOString() })
          .eq('device_id', payload.device.deviceId);
      }

      return new Response(
        JSON.stringify({ ok: true, action: 'logout' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- SYNC (default): full sync of favorites, tokens, preferences ---

    if (payload.device) {
      // device_push_tokens is keyed by device_id alone — a device has exactly
      // one token row, independent of which person is currently selected on it.
      await supabase.from('device_push_tokens').upsert(
        {
          device_id: payload.device.deviceId,
          is_active: Boolean(payload.device.pushToken),
          last_seen_at: new Date().toISOString(),
          platform: payload.device.platform,
          push_token: payload.device.pushToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'device_id' },
      );
    }

    // --- NOTIFICATION SETTINGS: sync device_notification_preferences, keyed by
    // device — NOT by person, since these toggles apply to the phone, not to
    // whichever person is currently selected on it.
    if (payload.device?.deviceId) {
      await supabase.from('device_notification_preferences').upsert({
        device_id: payload.device.deviceId,
        push_on_result_list: payload.notificationSettings.pushOnResultList,
        push_on_start_list: payload.notificationSettings.pushOnStartList,
        push_on_entry_deadline: payload.notificationSettings.pushOnEntryDeadline,
        updated_at: new Date().toISOString(),
      });
    }

    // --- FAVORITES: sync device_favorite_watches, keyed by device — NOT by
    // person, for the same reason as friends (see block below): no password
    // login means any device can pick any personId, so syncing by personId would
    // let a new device silently inherit another device's favorited events.
    if (payload.device?.deviceId) {
      const deviceId = payload.device.deviceId;

      const { data: existingWatches } = await supabase
        .from('device_favorite_watches')
        .select('event_id, has_published_results, has_published_starts')
        .eq('device_id', deviceId);

      const watchStateByEventId = new Map(
        (existingWatches ?? []).map((watch) => [
          String(watch.event_id),
          {
            hasPublishedResults: Boolean(watch.has_published_results),
            hasPublishedStarts: Boolean(watch.has_published_starts),
          },
        ]),
      );

      const favoriteEventIds = payload.favoriteEvents.map((event) => event.id);

      if (favoriteEventIds.length > 0) {
        await supabase
          .from('device_favorite_watches')
          .delete()
          .eq('device_id', deviceId)
          .not('event_id', 'in', `(${favoriteEventIds.map((id) => `"${id}"`).join(',')})`);
      } else {
        await supabase.from('device_favorite_watches').delete().eq('device_id', deviceId);
      }

      if (payload.favoriteEvents.length > 0) {
        await supabase.from('device_favorite_watches').upsert(
          payload.favoriteEvents.map((event) => {
            const existingState = watchStateByEventId.get(event.id);

            return {
              classification_id: event.classificationId,
              classification_label: event.classificationLabel,
              device_id: deviceId,
              event_date: event.startDate,
              event_id: event.id,
              event_name: event.name,
              has_published_results: existingState?.hasPublishedResults ?? event.hasPublishedResults,
              has_published_starts: existingState?.hasPublishedStarts ?? event.hasPublishedStarts,
              updated_at: new Date().toISOString(),
            };
          }),
          { onConflict: 'device_id,event_id' },
        );
      }
    }

    // --- FRIENDS: sync device_friend_watches, keyed by device — NOT by person.
    // Friends must stay private to the physical device that added them (there is
    // no password login any more, so syncing by personId would let any device
    // that picks the same person silently inherit/control that list).
    // Only touch device_friend_watches if the payload explicitly includes
    // friends AND we know which device this is.
    if (payload.friends != null && payload.device?.deviceId) {
      const deviceId = payload.device.deviceId;
      const friends = payload.friends;
      const friendPersonIds = friends.map((f) => String(f.personId));

      // Delete friends that were removed locally
      if (friendPersonIds.length > 0) {
        await supabase
          .from('device_friend_watches')
          .delete()
          .eq('device_id', deviceId)
          .not('friend_person_id', 'in', `(${friendPersonIds.map((id) => `"${id}"`).join(',')})`);
      } else {
        await supabase.from('device_friend_watches').delete().eq('device_id', deviceId);
      }

      // Upsert current friends
      if (friends.length > 0) {
        const friendRows = friends.map((f) => ({
          device_id: deviceId,
          friend_birth_year: f.birthYear,
          friend_club: f.club,
          friend_gender: f.gender,
          friend_name: f.name,
          friend_person_id: String(f.personId),
          push_on_entry: f.pushOnEntry ?? false,
          push_on_live: f.pushOnLive ?? false,
          push_on_result: f.pushOnResult ?? false,
          push_on_start: f.pushOnStart ?? false,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from('device_friend_watches').upsert(
          friendRows,
          { onConflict: 'device_id,friend_person_id' },
        );
      }
    }

    return new Response(
      JSON.stringify({
        activeFavorites: payload.favoriteEvents.length,
        hasDeviceToken: Boolean(payload.device?.pushToken),
        ok: true,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown push sync error.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
