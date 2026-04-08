import * as React from 'react';

import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoadingState } from '@/src/components/LoadingState';
import { PushSyncController } from '@/src/features/notifications/PushSyncController';
import { addNotificationEventListener, getLastNotificationEventId } from '@/src/services/pushNotifications';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors } from '@/src/theme/colors';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  const isHydrated = useAuthStore((state) => state.isHydrated);
  const hydrateSession = useAuthStore((state) => state.hydrateSession);
  const isPreferencesHydrated = usePreferencesStore((state) => state.isHydrated);
  const hydratePreferences = usePreferencesStore((state) => state.hydratePreferences);

  React.useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  React.useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

  if (!fontsLoaded || !isHydrated || !isPreferencesHydrated) {
    return <LoadingState label="Startar OL-Kollen..." fullScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <PushNotificationNavigator />
      <PushSyncController />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}

function PushNotificationNavigator() {
  const lastHandledEventIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    const navigateToEvent = (eventId: string) => {
      if (!eventId || lastHandledEventIdRef.current === eventId) {
        return;
      }

      lastHandledEventIdRef.current = eventId;
      if (typeof router.replace !== 'function' || typeof router.push !== 'function') {
        return;
      }

      setTimeout(() => {
        if (!isMounted) {
          return;
        }

        try {
          router.replace('/calendar');
          router.push({
            params: { id: eventId },
            pathname: '/event/[id]',
          });
        } catch {
          // Ignore navigation errors on startup; the app must not crash here.
        }
      }, 0);
    };

    void getLastNotificationEventId().then((eventId) => {
      if (eventId) {
        navigateToEvent(eventId);
      }
    });

    const subscription = addNotificationEventListener((eventId) => {
      navigateToEvent(eventId);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [router]);

  return null;
}
