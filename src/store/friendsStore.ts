import { create } from 'zustand';

import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';

const FRIENDS_KEY_PREFIX = 'olkollen.friends';
const LEGACY_FRIENDS_KEY = 'olkollen.friends';

export type Friend = {
  birthYear: number | null;
  club: string;
  gender: string;
  name: string;
  personId: number;
  pushOnEntry: boolean;
  pushOnLive: boolean;
  pushOnResult: boolean;
  pushOnStart: boolean;
};

type PersistedFriends = {
  friends: Friend[];
};

type FriendsState = {
  activePersonId: string | null;
  addFriend: (friend: Friend) => Promise<void>;
  clearFriends: () => void;
  friends: Friend[];
  hydrateFriends: (ownerPersonId: string) => Promise<void>;
  isHydrated: boolean;
  removeFriend: (personId: number) => Promise<void>;
  restoreFromServer: (ownerPersonId: string, serverFriends: Friend[]) => Promise<void>;
  setAllFriendsPush: (field: 'pushOnEntry' | 'pushOnLive' | 'pushOnResult' | 'pushOnStart', value: boolean) => Promise<void>;
  updateFriendPush: (personId: number, field: 'pushOnEntry' | 'pushOnLive' | 'pushOnResult' | 'pushOnStart', value: boolean) => Promise<void>;
};

function storageKey(ownerPersonId: string) {
  return `${FRIENDS_KEY_PREFIX}.${ownerPersonId}`;
}

async function persist(ownerPersonId: string, friends: Friend[]) {
  await setStoredJson<PersistedFriends>(storageKey(ownerPersonId), { friends });
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  activePersonId: null,
  friends: [],
  isHydrated: false,

  addFriend: async (friend) => {
    const { activePersonId, friends: current } = get();
    if (!activePersonId) return;
    if (current.some((f) => f.personId === friend.personId)) return;
    const withDefaults: Friend = {
      ...friend,
      pushOnEntry: friend.pushOnEntry ?? false,
      pushOnLive: friend.pushOnLive ?? false,
      pushOnResult: friend.pushOnResult ?? true,
      pushOnStart: friend.pushOnStart ?? true,
    };
    const updated = [...current, withDefaults].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    set({ friends: updated });
    await persist(activePersonId, updated);
  },

  clearFriends: () => {
    set({ activePersonId: null, friends: [], isHydrated: false });
  },

  hydrateFriends: async (ownerPersonId) => {
    // Skip if already hydrated for this person (e.g. by restoreFromServer during login)
    if (get().isHydrated && get().activePersonId === ownerPersonId) {
      return;
    }

    try {
      let stored = await getStoredJson<PersistedFriends>(storageKey(ownerPersonId));

      // Re-check after async gap: restoreFromServer may have completed while we were reading
      if (get().isHydrated && get().activePersonId === ownerPersonId) {
        return;
      }

      // Migrate from legacy (non-user-scoped) key if the new key has no data
      if (!stored || !Array.isArray(stored.friends) || stored.friends.length === 0) {
        const legacy = await getStoredJson<PersistedFriends>(LEGACY_FRIENDS_KEY);

        // Re-check again after second async gap
        if (get().isHydrated && get().activePersonId === ownerPersonId) return;

        if (legacy && Array.isArray(legacy.friends) && legacy.friends.length > 0) {
          stored = legacy;
          await setStoredJson<PersistedFriends>(storageKey(ownerPersonId), legacy);
          await removeStoredValue(LEGACY_FRIENDS_KEY);
        }
      }

      const raw = Array.isArray(stored?.friends) ? stored.friends : [];
      const migrated = raw.map((f) => ({
        ...f,
        pushOnEntry: f.pushOnEntry ?? false,
        pushOnLive: f.pushOnLive ?? false,
        pushOnResult: f.pushOnResult ?? true,
        pushOnStart: f.pushOnStart ?? true,
      }));
      set({ activePersonId: ownerPersonId, friends: migrated, isHydrated: true });
    } catch {
      set({ activePersonId: ownerPersonId, friends: [], isHydrated: true });
    }
  },

  removeFriend: async (personId) => {
    const { activePersonId } = get();
    if (!activePersonId) return;
    const updated = get().friends.filter((f) => f.personId !== personId);
    set({ friends: updated });
    await persist(activePersonId, updated);
  },

  restoreFromServer: async (ownerPersonId, serverFriends) => {
    // Server is authoritative after login — use server data as truth
    const sorted = [...serverFriends].sort((a, b) => a.name.localeCompare(b.name, 'sv'));

    set({ activePersonId: ownerPersonId, friends: sorted, isHydrated: true });
    await persist(ownerPersonId, sorted);
  },

  setAllFriendsPush: async (field, value) => {
    const { activePersonId } = get();
    if (!activePersonId) return;
    const updated = get().friends.map((f) => ({ ...f, [field]: value }));
    set({ friends: updated });
    await persist(activePersonId, updated);
  },

  updateFriendPush: async (personId, field, value) => {
    const { activePersonId } = get();
    if (!activePersonId) return;
    const updated = get().friends.map((f) =>
      f.personId === personId ? { ...f, [field]: value } : f,
    );
    set({ friends: updated });
    await persist(activePersonId, updated);
  },
}));
