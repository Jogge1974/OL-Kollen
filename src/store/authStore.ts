import { create } from 'zustand';

import { authenticateEventorPerson } from '@/src/api/authApi';
import { resolveAccessLevel } from '@/src/features/auth/access';
import { createFetchProfilePayload, createLogoutSyncPayload } from '@/src/features/notifications/pushSync';
import { clearStoredEventorCredentials, getStoredEventorCredentials, saveStoredEventorCredentials } from '@/src/services/eventorCredentials';
import { clearStoredEventorWebSessionCookie } from '@/src/services/eventorWebSession';
import { registerForPushNotificationsAsync } from '@/src/services/pushNotifications';
import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';
import { hasSupabaseRuntimeConfig, invokeSupabaseFunction } from '@/src/services/supabase';
import { useFriendsStore } from '@/src/store/friendsStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { AuthenticatedUser, EventorLoginInput, PersistedAuthSession } from '@/src/types/user';

const AUTH_SESSION_KEY = 'olkollen.auth.session';
const REMEMBERED_USERNAME_KEY = 'olkollen.auth.rememberedUsername';

// If a signed-in user was stored without a club (e.g. they weren't in the club
// registry at login and have since been added), silently re-authenticate in the
// background using saved credentials to refresh the club — no logout/login needed.
// The updated club then propagates to app_users via PushSyncController.
async function refreshMissingClub(
  storedUser: AuthenticatedUser,
  credentials: { password: string; username: string },
): Promise<void> {
  try {
    const refreshed = await authenticateEventorPerson({
      password: credentials.password,
      username: credentials.username,
    });

    // Only apply if Eventor now returns a club for the same person.
    if (!refreshed.organisationName || refreshed.personId !== storedUser.personId) {
      return;
    }

    const currentUser = useAuthStore.getState().user;

    // Bail if the session changed (logout/relogin) or a club already got set meanwhile.
    if (!currentUser || currentUser.personId !== storedUser.personId || currentUser.organisationName) {
      return;
    }

    const updatedUser: AuthenticatedUser = {
      ...currentUser,
      organisationIds: refreshed.organisationIds,
      organisationName: refreshed.organisationName,
    };

    useAuthStore.setState({ user: updatedUser });

    // Persist the refreshed club so future starts already have it.
    const storedSession = await getStoredJson<PersistedAuthSession>(AUTH_SESSION_KEY).catch(() => null);
    if (storedSession?.user) {
      await setStoredJson(AUTH_SESSION_KEY, {
        ...storedSession,
        user: updatedUser,
      } satisfies PersistedAuthSession);
    }
  } catch {
    // Best-effort: never block startup on a failed refresh.
  }
}

type AuthState = {
  error: string | null;
  hydrateSession: () => Promise<void>;
  isHydrated: boolean;
  isRestoringProfile: boolean;
  isSubmitting: boolean;
  rememberedUsername: string;
  signInWithEventor: (input: EventorLoginInput & { rememberMe: boolean; saveEncryptedLogin: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  user: AuthenticatedUser | null;
};

export const useAuthStore = create<AuthState>((set) => ({
  error: null,
  hydrateSession: async () => {
    try {
      const storedSession = await getStoredJson<PersistedAuthSession>(AUTH_SESSION_KEY);
      const storedRememberedUsername = await getStoredJson<string>(REMEMBERED_USERNAME_KEY).catch(() => null);
      const storedCredentials = await getStoredEventorCredentials().catch(() => null);

      set({
        error: null,
        isHydrated: true,
        rememberedUsername:
          storedRememberedUsername ?? storedSession?.rememberedUsername ?? storedSession?.user?.username ?? storedCredentials?.username ?? '',
        user: storedSession?.user ?? null,
      });

      // If the stored user has no club but we have saved credentials, refresh it
      // silently in the background (without forcing a re-login).
      const storedUser = storedSession?.user ?? null;
      if (
        storedUser?.personId &&
        !storedUser.organisationName &&
        storedCredentials?.username &&
        storedCredentials?.password
      ) {
        void refreshMissingClub(storedUser, storedCredentials);
      }
    } catch {
      set({
        error: 'Det gick inte att läsa sparad session.',
        isHydrated: true,
        rememberedUsername: '',
        user: null,
      });
    }
  },
  isHydrated: false,
  isRestoringProfile: false,
  isSubmitting: false,
  rememberedUsername: '',
  signInWithEventor: async ({ password, rememberMe, saveEncryptedLogin, username }) => {
    set({ error: null, isSubmitting: true });

    try {
      const user = await authenticateEventorPerson({ password, username });
      const enrichedUser: AuthenticatedUser = {
        ...user,
        accessLevel: resolveAccessLevel(),
      };

      if (saveEncryptedLogin) {
        await saveStoredEventorCredentials(username, password);
      } else {
        await clearStoredEventorCredentials();
      }

      if (rememberMe) {
        await setStoredJson(REMEMBERED_USERNAME_KEY, username);
      }

      const willRestore = hasSupabaseRuntimeConfig() && Boolean(enrichedUser.personId);

      set((state) => ({
        error: null,
        isRestoringProfile: willRestore,
        isSubmitting: false,
        rememberedUsername: rememberMe ? username : state.rememberedUsername,
        user: enrichedUser,
      }));

      if (rememberMe || saveEncryptedLogin) {
        await setStoredJson(AUTH_SESSION_KEY, {
          rememberedUsername: username,
          user: enrichedUser,
        } satisfies PersistedAuthSession);
      } else {
        await removeStoredValue(AUTH_SESSION_KEY);
      }

      // Fetch server-side profile (favorites, preferences, notification settings) and restore
      if (willRestore) {
        try {
          const response = await invokeSupabaseFunction<{
            ok: boolean;
            favorites?: Array<{
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
              pushOnEntry: boolean;
              pushOnResult: boolean;
              pushOnStart: boolean;
            }>;
            preferences?: {
              calendarDefaultFilterTemplate?: unknown;
              calendarFilterPresets?: unknown;
              favoriteClasses?: string[];
            } | null;
            notificationSettings?: {
              pushOnResultList: boolean;
              pushOnStartList: boolean;
              pushOnEntryDeadline?: boolean;
            } | null;
          }>('push-sync', createFetchProfilePayload(enrichedUser.personId));

          if (response?.ok) {
            const serverFavorites = (response.favorites ?? []).map((f) => ({
              classificationId: f.classificationId,
              classificationLabel: f.classificationLabel,
              dateLabel: '',
              hasPublishedResults: f.hasPublishedResults,
              hasPublishedStarts: f.hasPublishedStarts,
              id: f.id,
              name: f.name,
              organiserLabel: '',
              startDate: f.startDate,
            }));

            await usePreferencesStore.getState().restoreFromServer({
              favorites: serverFavorites,
              notificationSettings: response.notificationSettings ?? null,
              preferences: response.preferences ?? null,
            });

            await useFriendsStore.getState().restoreFromServer(enrichedUser.personId, response.friends ?? []);
          }
        } catch {
          // Best-effort: don't block login if fetch fails
        } finally {
          set({ isRestoringProfile: false });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okänt fel vid inloggning.';
      set({
        error: message,
        isSubmitting: false,
        user: null,
      });
      throw error;
    }
  },
  signOut: async () => {
    const currentUser = useAuthStore.getState().user;

    // Deactivate push token for this device before clearing local state
    if (currentUser?.personId && hasSupabaseRuntimeConfig()) {
      try {
        const registration = await registerForPushNotificationsAsync();
        const payload = createLogoutSyncPayload(currentUser.personId, {
          deviceId: registration.deviceId,
          platform: registration.platform,
          pushToken: null,
        });
        await invokeSupabaseFunction('push-sync', payload);
      } catch {
        // Best-effort: don't block logout if deactivation fails
      }
    }

    await removeStoredValue(AUTH_SESSION_KEY);
    await clearStoredEventorWebSessionCookie();
    await clearStoredEventorCredentials();
    set({
      error: null,
      user: null,
    });
  },
  user: null,
}));
