import * as React from 'react';

import { createPushSyncPayload } from '@/src/features/notifications/pushSync';
import { registerForPushNotificationsAsync } from '@/src/services/pushNotifications';
import { hasSupabaseRuntimeConfig, invokeSupabaseFunction } from '@/src/services/supabase';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';

type PushSyncResponse = {
  activeFavorites: number;
  hasDeviceToken: boolean;
  ok: boolean;
};

export function PushSyncController() {
  const user = useAuthStore((state) => state.user);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const notificationSettings = usePreferencesStore((state) => state.notificationSettings);
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

    const fingerprint = JSON.stringify({
      favoriteEvents: favoriteEvents.map((event) => event.id),
      notificationSettings,
      personId: user.personId,
    });

    if (lastFingerprintRef.current === fingerprint) {
      return;
    }

    let isCancelled = false;

    const runSync = async () => {
      try {
        const wantsPush = notificationSettings.pushOnResultList || notificationSettings.pushOnStartList;
        let device: ReturnType<typeof createPushSyncPayload>['device'] = null;

        if (wantsPush) {
          try {
            const registration = await registerForPushNotificationsAsync();

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
        }

        const payload = createPushSyncPayload({
          clubId: user.organisationIds[0] ?? null,
          clubName: user.organisationName,
          device,
          email: user.email,
          favoriteEvents,
          fullName: user.fullName,
          notificationSettings,
          personId,
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
  }, [favoriteEvents, notificationSettings, user]);

  return null;
}
