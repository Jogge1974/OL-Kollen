import { create } from 'zustand';

import { authenticateEventorPerson } from '@/src/api/authApi';
import { resolveAccessLevel } from '@/src/features/auth/access';
import { clearStoredEventorCredentials, getStoredEventorCredentials, saveStoredEventorCredentials } from '@/src/services/eventorCredentials';
import { clearStoredEventorWebSessionCookie, refreshStoredEventorWebSessionCookie } from '@/src/services/eventorWebSession';
import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';
import { AuthenticatedUser, EventorLoginInput, PersistedAuthSession } from '@/src/types/user';

const AUTH_SESSION_KEY = 'olkollen.auth.session';
const REMEMBERED_USERNAME_KEY = 'olkollen.auth.rememberedUsername';

type AuthState = {
  error: string | null;
  hydrateSession: () => Promise<void>;
  isHydrated: boolean;
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

      await refreshStoredEventorWebSessionCookie(username, password).catch(() => {
        // Best-effort only. The app login itself should still succeed.
        return null;
      });

      if (saveEncryptedLogin) {
        await saveStoredEventorCredentials(username, password);
      } else {
        await clearStoredEventorCredentials();
      }

      if (rememberMe) {
        await setStoredJson(REMEMBERED_USERNAME_KEY, username);
      }

      set((state) => ({
        error: null,
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
