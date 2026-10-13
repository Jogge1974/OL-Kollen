import { create } from 'zustand';

import { fetchOrganisationList } from '@/src/api/organisationTree';
import { PersonSearchResult } from '@/src/components/PersonSearchPicker';
import { resolveAccessLevel } from '@/src/features/auth/access';
import { createLogoutSyncPayload } from '@/src/features/notifications/pushSync';
import { getDeviceIdentifier, registerForPushNotificationsAsync } from '@/src/services/pushNotifications';
import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';
import { hasSupabaseRuntimeConfig, invokeSupabaseFunction } from '@/src/services/supabase';
import { AuthenticatedUser, PersistedIdentitySession } from '@/src/types/user';

const IDENTITY_SESSION_KEY = 'olkollen.identity.session';

// The person's club is only a text name (PersonregisterEventor has no org id),
// so match it against the local OrganisationRegister mirror to get a numeric
// organisationId. Foreign clubs (not imported into the register) just keep the
// club text as the display name with no id.
async function resolveOrganisation(club: string): Promise<{ organisationId: string | null; organisationName: string | null }> {
  if (!club) {
    return { organisationId: null, organisationName: null };
  }

  try {
    const organisations = await fetchOrganisationList();
    const match = organisations.find((organisation) => organisation.name === club || organisation.shortName === club);
    return {
      organisationId: match ? `${match.id}` : null,
      organisationName: match?.shortName ?? match?.name ?? club,
    };
  } catch {
    return { organisationId: null, organisationName: club };
  }
}

async function deactivateDevicePushToken() {
  if (!hasSupabaseRuntimeConfig()) {
    return;
  }

  try {
    const registration = await registerForPushNotificationsAsync();
    const payload = createLogoutSyncPayload(registration.deviceId, {
      deviceId: registration.deviceId,
      platform: registration.platform,
      pushToken: null,
    });
    await invokeSupabaseFunction('push-sync', payload);
  } catch {
    // Best-effort: don't block clearing the identity if deactivation fails.
  }
}

// Records which person this device picked (device_identities), separate from
// the per-person app_users row that PushSyncController keeps in sync.
async function recordDeviceIdentity(user: AuthenticatedUser) {
  if (!hasSupabaseRuntimeConfig() || !user.personId) {
    return;
  }

  try {
    const registration = await registerForPushNotificationsAsync();
    await invokeSupabaseFunction('select-identity', {
      clubName: user.organisationName,
      deviceId: registration.deviceId,
      organisationId: user.organisationIds[0] ?? null,
      personId: user.personId,
      username: user.username,
    });
  } catch {
    // Best-effort: never block selection on this.
  }
}

// Ensures every device has a device_identities row from first launch, even
// before any person is ever selected (so device counts and 'last seen' are
// accurate) — never touches an existing row's person_id/username, just
// updated_at. Uses the bare device id, no push-permission prompt.
export async function touchDeviceIdentity() {
  if (!hasSupabaseRuntimeConfig()) {
    return;
  }

  try {
    const deviceId = await getDeviceIdentifier();
    await invokeSupabaseFunction('touch-device-identity', { deviceId });
  } catch {
    // Best-effort: never block app startup on this.
  }
}

type AuthState = {
  error: string | null;
  hydrateSession: () => Promise<void>;
  isHydrated: boolean;
  isSubmitting: boolean;
  selectPerson: (result: PersonSearchResult) => Promise<void>;
  signOut: () => Promise<void>;
  user: AuthenticatedUser | null;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  error: null,
  hydrateSession: async () => {
    try {
      const storedSession = await getStoredJson<PersistedIdentitySession>(IDENTITY_SESSION_KEY);
      set({ error: null, isHydrated: true, user: storedSession?.user ?? null });
    } catch {
      set({ error: 'Det gick inte att läsa sparat val.', isHydrated: true, user: null });
    }
  },
  isHydrated: false,
  isSubmitting: false,
  selectPerson: async (result) => {
    set({ error: null, isSubmitting: true });

    try {
      const { organisationId, organisationName } = await resolveOrganisation(result.club);
      const nameParts = result.name.trim().split(/\s+/).filter(Boolean);
      const gender = result.gender === 'D' || result.gender === 'H' ? result.gender : null;

      const user: AuthenticatedUser = {
        accessLevel: resolveAccessLevel(),
        birthDate: result.birthYear ? `${result.birthYear}` : null,
        email: null,
        firstName: nameParts[0] ?? null,
        fullName: result.name,
        gender,
        lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
        organisationIds: organisationId ? [organisationId] : [],
        organisationName,
        personId: `${result.personId}`,
        username: result.name,
      };

      set({
        error: null,
        isSubmitting: false,
        user,
      });

      await setStoredJson(IDENTITY_SESSION_KEY, { user } satisfies PersistedIdentitySession);
      void recordDeviceIdentity(user);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okänt fel vid val av person.';
      set({
        error: message,
        isSubmitting: false,
      });
      throw error;
    }
  },
  signOut: async () => {
    const currentUser = get().user;

    if (currentUser?.personId) {
      await deactivateDevicePushToken();
    }

    await removeStoredValue(IDENTITY_SESSION_KEY);
    set({
      error: null,
      user: null,
    });
  },
  user: null,
}));
