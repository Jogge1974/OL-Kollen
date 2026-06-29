import * as React from 'react';

import { createPushSyncPayload } from '@/src/features/notifications/pushSync';
import { registerForPushNotificationsAsync } from '@/src/services/pushNotifications';
import { hasSupabaseRuntimeConfig, invokeSupabaseFunction } from '@/src/services/supabase';
import { useAuthStore } from '@/src/store/authStore';
import { useFriendsStore } from '@/src/store/friendsStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';

type PushSyncResponse = {
  activeFavorites: number;
  hasDeviceToken: boolean;
  ok: boolean;
};

export function PushSyncController() {
  const user = useAuthStore((state) => state.user);
  const isRestoringProfile = useAuthStore((state) => state.isRestoringProfile);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const notificationSettings = usePreferencesStore((state) => state.notificationSettings);
  const favoriteClasses = usePreferencesStore((state) => state.favoriteClasses);
  const calendarFilterPresets = usePreferencesStore((state) => state.calendarFilterPresets);
  const calendarDefaultFilterTemplate = usePreferencesStore((state) => state.calendarDefaultFilterTemplate);
  const friends = useFriendsStore((state) => state.friends);
  const lastFingerprintRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const personId = user?.personId;

    if (!personId) {
      lastFingerprintRef.current = null;
      return;
    }

    if (!hasSupabaseRuntimeConfig()) {
      return;
    }

    // Don't sync while the login flow is still restoring server data
    if (isRestoringProfile) {
      return;
    }

    const fingerprint = JSON.stringify({
      calendarDefaultFilterTemplate,
      calendarFilterPresets,
      favoriteClasses,
      favoriteEvents: favoriteEvents.map((event) => event.id),
      friends: friends.map((f) => ({ id: f.personId, e: f.pushOnEntry, l: f.pushOnLive, r: f.pushOnResult, s: f.pushOnStart })),
      notificationSettings,
      personId: user.personId,
    });

    if (lastFingerprintRef.current === fingerprint) {
      return;
    }

    let isCancelled = false;

    const runSync = async () => {
      try {
        let device: ReturnType<typeof createPushSyncPayload>['device'] = null;

        // Always try to register a push token for every signed-in device, even when
        // no push settings are enabled, so we have a token on file the moment the
        // user opts into anything later.
        try {
          const registration = await registerForPushNotificationsAsync();
          console.log('[PushSync] Token registrerat:', registration.pushToken, 'Device:', registration.deviceId, 'Platform:', registration.platform);

          device = {
            deviceId: registration.deviceId,
            platform: registration.platform,
            pushToken: registration.pushToken,
          };
        } catch (registrationError) {
          console.warn('[PushSync] Kunde inte registrera Expo push-token.', {
            message: registrationError instanceof Error ? registrationError.message : 'Okant fel',
          });
        }

        const payload = createPushSyncPayload({
          clubId: user.organisationIds[0] ?? null,
          clubName: user.organisationName,
          device,
          email: user.email,
          favoriteEvents,
          friends,
          fullName: user.fullName,
          notificationSettings,
          personId,
          preferences: {
            calendarDefaultFilterTemplate,
            calendarFilterPresets,
            favoriteClasses,
          },
          username: user.username,
        });

        await invokeSupabaseFunction<PushSyncResponse>('push-sync', payload);

        if (!isCancelled) {
          lastFingerprintRef.current = fingerprint;
        }
      } catch (error) {
        if (!isCancelled) {
          console.warn('[PushSync] Synk misslyckades.', {
            message: error instanceof Error ? error.message : 'Okant fel',
          });
        }
      }
    };

    void runSync();

    return () => {
      isCancelled = true;
    };
  }, [calendarDefaultFilterTemplate, calendarFilterPresets, favoriteClasses, favoriteEvents, friends, isRestoringProfile, notificationSettings, user]);

  return null;
}
