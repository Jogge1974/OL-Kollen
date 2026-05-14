import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

type SyncPayload = {
  action?: 'sync' | 'logout' | 'fetch-profile';
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
    pushOnResult: boolean;
    pushOnStart: boolean;
  }>;
  notificationSettings: {
    pushOnResultList: boolean;
    pushOnStartList: boolean;
  };
  preferences?: {
    calendarDefaultFilterTemplate?: unknown;
    calendarFilterPresets?: unknown;
    favoriteClasses?: string[];
  } | null;
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

    const personId = payload.user.personId;
    const action = payload.action ?? 'sync';

    // --- LOGOUT: deactivate device token for this person+device ---
    if (action === 'logout') {
      if (payload.device?.deviceId) {
        await supabase
          .from('device_push_tokens')
          .update({ is_active: false, push_token: null, updated_at: new Date().toISOString() })
          .eq('person_id', personId)
          .eq('device_id', payload.device.deviceId);
      }

      return new Response(
        JSON.stringify({ ok: true, action: 'logout' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- FETCH PROFILE: return favorites + preferences for this person ---
    if (action === 'fetch-profile') {
      const [{ data: serverFavorites, error: fetchError }, { data: userRow, error: userError }, { data: notifRow, error: notifError }, { data: friendRows, error: friendError }] =
        await Promise.all([
          supabase
            .from('favorite_event_watches')
            .select('event_id, event_name, event_date, classification_id, classification_label, has_published_results, has_published_starts')
            .eq('person_id', personId),
          supabase
            .from('app_users')
            .select('preferences_json')
            .eq('person_id', personId)
            .maybeSingle(),
          supabase
            .from('notification_preferences')
            .select('push_on_start_list, push_on_result_list')
            .eq('person_id', personId)
            .maybeSingle(),
          supabase
            .from('friend_watches')
            .select('friend_person_id, friend_name, friend_club, friend_gender, friend_birth_year, push_on_entry, push_on_result, push_on_start')
            .eq('person_id', personId),
        ]);

      if (fetchError) {
        throw fetchError;
      }

      const preferencesJson = (userRow?.preferences_json ?? null) as Record<string, unknown> | null;

      return new Response(
        JSON.stringify({
          ok: true,
          action: 'fetch-profile',
          favorites: (serverFavorites ?? []).map((row) => ({
            classificationId: row.classification_id,
            classificationLabel: row.classification_label ?? '',
            hasPublishedResults: Boolean(row.has_published_results),
            hasPublishedStarts: Boolean(row.has_published_starts),
            id: row.event_id,
            name: row.event_name ?? '',
            startDate: row.event_date ?? '',
          })),
          friends: (friendRows ?? []).map((row) => ({
            birthYear: row.friend_birth_year ?? null,
            club: row.friend_club ?? '',
            gender: row.friend_gender ?? '',
            name: row.friend_name ?? '',
            personId: Number(row.friend_person_id),
            pushOnEntry: Boolean(row.push_on_entry),
            pushOnResult: Boolean(row.push_on_result),
            pushOnStart: Boolean(row.push_on_start),
          })),
          preferences: preferencesJson,
          notificationSettings: notifRow
            ? {
                pushOnResultList: Boolean(notifRow.push_on_result_list),
                pushOnStartList: Boolean(notifRow.push_on_start_list),
              }
            : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- SYNC (default): full sync of favorites, tokens, preferences ---

    const { data: existingWatches, error: existingWatchesError } = await supabase
      .from('favorite_event_watches')
      .select('event_id, has_published_results, has_published_starts')
      .eq('person_id', personId);

    if (existingWatchesError) {
      throw existingWatchesError;
    }

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

    await supabase.from('app_users').upsert({
      club_id: payload.user.clubId,
      club_name: payload.user.clubName,
      email: payload.user.email,
      full_name: payload.user.fullName,
      person_id: personId,
      preferences_json: payload.preferences ?? null,
      updated_at: new Date().toISOString(),
      username: payload.user.username,
    });

    await supabase.from('notification_preferences').upsert({
      person_id: personId,
      push_on_result_list: payload.notificationSettings.pushOnResultList,
      push_on_start_list: payload.notificationSettings.pushOnStartList,
      updated_at: new Date().toISOString(),
    });

    await supabase.from('favorite_event_watches').delete().eq('person_id', personId).not('event_id', 'in', `(${favoriteEventIds.map((id) => `"${id}"`).join(',') || '""'})`);

    if (payload.favoriteEvents.length > 0) {
      await supabase.from('favorite_event_watches').upsert(
        payload.favoriteEvents.map((event) => {
          const existingState = watchStateByEventId.get(event.id);

          return {
            classification_id: event.classificationId,
            classification_label: event.classificationLabel,
            event_date: event.startDate,
            event_id: event.id,
            event_name: event.name,
            has_published_results: existingState?.hasPublishedResults ?? event.hasPublishedResults,
            has_published_starts: existingState?.hasPublishedStarts ?? event.hasPublishedStarts,
            person_id: personId,
            updated_at: new Date().toISOString(),
          };
        }),
        { onConflict: 'person_id,event_id' },
      );
    } else {
      await supabase.from('favorite_event_watches').delete().eq('person_id', personId);
    }

    if (payload.device) {
      await supabase.from('device_push_tokens').upsert(
        {
          device_id: payload.device.deviceId,
          is_active: Boolean(payload.device.pushToken),
          last_seen_at: new Date().toISOString(),
          person_id: personId,
          platform: payload.device.platform,
          push_token: payload.device.pushToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'person_id,device_id' },
      );
    }

    // --- FRIENDS: sync friend_watches ---
    // Only touch friend_watches if the payload explicitly includes friends.
    // If friends is undefined/null (e.g. older client or partial sync), skip.
    if (payload.friends != null) {
      const friends = payload.friends;
      const friendPersonIds = friends.map((f) => String(f.personId));

      // Delete friends that were removed locally
      if (friendPersonIds.length > 0) {
        await supabase
          .from('friend_watches')
          .delete()
          .eq('person_id', personId)
          .not('friend_person_id', 'in', `(${friendPersonIds.map((id) => `"${id}"`).join(',')})`);
      } else {
        await supabase.from('friend_watches').delete().eq('person_id', personId);
      }

      // Upsert current friends
    if (friends.length > 0) {
      const friendRows = friends.map((f) => ({
        friend_birth_year: f.birthYear,
        friend_club: f.club,
        friend_gender: f.gender,
        friend_name: f.name,
        friend_person_id: String(f.personId),
        person_id: personId,
        push_on_entry: f.pushOnEntry ?? false,
        push_on_result: f.pushOnResult ?? true,
        push_on_start: f.pushOnStart ?? true,
      }));
      await supabase.from('friend_watches').upsert(
        friendRows,
        { onConflict: 'person_id,friend_person_id' },
      );
    }
    } // end if (payload.friends != null)

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
