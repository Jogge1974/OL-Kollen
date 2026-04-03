import { create } from 'zustand';

import { authenticateEventorPerson } from '@/src/api/authApi';
import { resolveAccessLevel } from '@/src/features/auth/access';
import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';
import { AuthenticatedUser, EventorLoginInput, PersistedAuthSession } from '@/src/types/user';

const AUTH_SESSION_KEY = 'olkollen.auth.session';

type AuthState = {
  error: string | null;
  hydrateSession: () => Promise<void>;
  isHydrated: boolean;
  isSubmitting: boolean;
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
        user: storedSession?.user ?? null,
      });
    } catch {
      set({
        error: 'Det gick inte att läsa sparad session.',
        isHydrated: true,
        user: null,
      });
    }
  },
  isHydrated: false,
  isSubmitting: false,
  signInWithEventor: async ({ password, rememberMe, username }) => {
    set({ error: null, isSubmitting: true });

    try {
      const user = await authenticateEventorPerson({ password, username });
      const enrichedUser: AuthenticatedUser = {
        ...user,
        accessLevel: resolveAccessLevel(),
      };

      set({
        error: null,
        isSubmitting: false,
        user: enrichedUser,
      });

      if (rememberMe) {
        await setStoredJson(AUTH_SESSION_KEY, { user: enrichedUser });
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
    set({
      error: null,
      user: null,
    });
  },
  user: null,
}));
