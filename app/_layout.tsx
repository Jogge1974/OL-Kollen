import * as React from 'react';

import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoadingState } from '@/src/components/LoadingState';
import { PushSyncController } from '@/src/features/notifications/PushSyncController';
import { addNotificationDataListener, getLastNotificationEventId, NotificationData } from '@/src/services/pushNotifications';
import { useAuthStore } from '@/src/store/authStore';
import { useFriendActivityStore } from '@/src/store/friendActivityStore';
import { useFriendsStore } from '@/src/store/friendsStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { ThemeProvider, useColors, useTheme } from '@/src/theme/ThemeContext';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  const isHydrated = useAuthStore((state) => state.isHydrated);
  const hydrateSession = useAuthStore((state) => state.hydrateSession);
  const user = useAuthStore((state) => state.user);
  const isRestoringProfile = useAuthStore((state) => state.isRestoringProfile);
  const isPreferencesHydrated = usePreferencesStore((state) => state.isHydrated);
  const hydratePreferences = usePreferencesStore((state) => state.hydratePreferences);
  const isFriendsHydrated = useFriendsStore((state) => state.isHydrated);
  const hydrateFriends = useFriendsStore((state) => state.hydrateFriends);
  const clearFriends = useFriendsStore((state) => state.clearFriends);
  const themeName = usePreferencesStore((state) => state.themeName);

  React.useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  React.useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

  React.useEffect(() => {
    if (!isHydrated) return;
    // Don't hydrate friends from local storage while signIn is restoring from server
    if (isRestoringProfile) return;
    if (user?.personId) {
      void hydrateFriends(user.personId);
    } else {
      clearFriends();
    }
  }, [isHydrated, isRestoringProfile, user?.personId, hydrateFriends, clearFriends]);

  // Friends hydration depends on user; treat as ready when logged out, no personId, or restore in progress (friends will be set by restoreFromServer)
  const friendsReady = isFriendsHydrated || isRestoringProfile || (isHydrated && !user) || (isHydrated && !!user && !user.personId);

  console.log('[DEBUG] Layout state:', { fontsLoaded, isHydrated, isPreferencesHydrated, friendsReady, isFriendsHydrated, hasUser: !!user });

  if (!fontsLoaded || !isHydrated || !isPreferencesHydrated || !friendsReady) {
    return <LoadingState label="Startar Kontrollen..." fullScreen />;
  }

  return (
    <ThemeProvider themeName={themeName}>
      <RootContent />
    </ThemeProvider>
  );
}

function RootContent() {
  const colors = useColors();
  const { isDark } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <PushNotificationNavigator />
      <PushSyncController />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="about" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

function PushNotificationNavigator() {
  React.useEffect(() => {
    let isMounted = true;

    const handleNotificationData = (data: NotificationData) => {
      if (!isMounted) return;

      const notifType = data.type;
      const eventId = typeof data.eventId === 'string' ? data.eventId : typeof data.eventId === 'number' ? `${data.eventId}` : null;

      // Record friend activity for badge display
      if ((notifType === 'friend-results' || notifType === 'friend-start') && Array.isArray(data.friendPersonIds) && data.friendPersonIds.length > 0 && eventId) {
        useFriendActivityStore.getState().recordActivity(data.friendPersonIds, eventId, notifType as 'friend-results' | 'friend-start');
      }

      // Navigate based on type
      if (notifType === 'friend-entry') {
        // Navigate to the friend's detail page if we have a friendPersonId
        const friendPersonId = typeof data.friendPersonId === 'string' ? data.friendPersonId : typeof data.friendPersonId === 'number' ? `${data.friendPersonId}` : null;
        setTimeout(() => {
          if (!isMounted) return;
          try {
            if (friendPersonId) {
              router.push(`/(tabs)/friend/${friendPersonId}`);
            } else {
              router.push('/(tabs)/friends');
            }
          } catch {
            // Ignore navigation errors
          }
        }, 300);
      } else if (notifType === 'friend-results' || notifType === 'friend-start') {
        // Navigate to friends list so the user sees the badges
        setTimeout(() => {
          if (!isMounted) return;
          try {
            router.push('/(tabs)/friends');
          } catch {
            // Ignore navigation errors
          }
        }, 300);
      } else if (eventId) {
        // Default: navigate to event detail (existing behavior)
        setTimeout(() => {
          if (!isMounted) return;
          try {
            router.push({
              params: { id: eventId, returnTo: '/(tabs)/calendar' },
              pathname: '/event/[id]',
            });
          } catch {
            // Ignore navigation errors on startup
          }
        }, 300);
      }
    };

    void getLastNotificationEventId().then((eventId) => {
      if (eventId) {
        handleNotificationData({ eventId });
      }
    });

    const subscription = addNotificationDataListener(handleNotificationData);

    // Clear stale activity entries on mount
    useFriendActivityStore.getState().clearOldEntries();

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return null;
}
