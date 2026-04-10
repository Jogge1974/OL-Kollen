import { create } from 'zustand';

import { authenticateEventorPerson } from '@/src/api/authApi';
import { resolveAccessLevel } from '@/src/features/auth/access';
import { clearStoredEventorWebSessionCookie, refreshStoredEventorWebSessionCookie } from '@/src/services/eventorWebSession';
import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';
import { AuthenticatedUser, EventorLoginInput, PersistedAuthSession } from '@/src/types/user';

const AUTH_SESSION_KEY = 'olkollen.auth.session';

type AuthState = {
  error: string | null;
  hydrateSession: () => Promise<void>;
  isHydrated: boolean;
  isSubmitting: boolean;
  rememberedUsername: string;
  signInWithEventor: (input: EventorLoginInput & { rememberMe: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  user: AuthenticatedUser | null;
};

export const useAuthStore = create<AuthState>((set) => ({
  error: null,
  hydrateSession: async () => {
    try {
      const storedSession = await getStoredJson<PersistedAuthSession>(AUTH_SESSION_KEY);

      set({
        error: null,
        isHydrated: true,
        rememberedUsername: storedSession?.rememberedUsername ?? storedSession?.user?.username ?? '',
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
  signInWithEventor: async ({ password, rememberMe, username }) => {
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

      set({
        error: null,
        isSubmitting: false,
        rememberedUsername: rememberMe ? username : '',
        user: enrichedUser,
      });

      if (rememberMe) {
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
    set({
      error: null,
      rememberedUsername: '',
      user: null,
    });
  },
  user: null,
}));
