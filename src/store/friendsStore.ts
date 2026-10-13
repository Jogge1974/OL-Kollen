import { create } from 'zustand';

import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';

// Friends are device-scoped, not person-scoped: with no password login, any
// device can select ANY personId as "who am I", so keying the friend list by
// personId would let a new device silently inherit (and control) another
// device's friends just by picking the same person. There is ONE flat local
// list per device, independent of which person is currently selected, and it
// is never restored from the server onto a different device.
const FRIENDS_STORAGE_KEY = 'olkollen.friends';

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
  addFriend: (friend: Friend) => Promise<void>;
  clearFriends: () => Promise<void>;
  friends: Friend[];
  hydrateFriends: () => Promise<void>;
  isHydrated: boolean;
  removeFriend: (personId: number) => Promise<void>;
  setAllFriendsPush: (field: 'pushOnEntry' | 'pushOnLive' | 'pushOnResult' | 'pushOnStart', value: boolean) => Promise<void>;
  updateFriendPush: (personId: number, field: 'pushOnEntry' | 'pushOnLive' | 'pushOnResult' | 'pushOnStart', value: boolean) => Promise<void>;
};

async function persist(friends: Friend[]) {
  await setStoredJson(FRIENDS_STORAGE_KEY, { friends } satisfies PersistedFriends);
}

function withDefaults(friend: Friend): Friend {
  return {
    ...friend,
    pushOnEntry: friend.pushOnEntry ?? false,
    pushOnLive: friend.pushOnLive ?? false,
    pushOnResult: friend.pushOnResult ?? false,
    pushOnStart: friend.pushOnStart ?? false,
  };
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  isHydrated: false,

  addFriend: async (friend) => {
    const current = get().friends;
    if (current.some((f) => f.personId === friend.personId)) return;
    const updated = [...current, withDefaults(friend)].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    set({ friends: updated });
    await persist(updated);
  },

  clearFriends: async () => {
    set({ friends: [] });
    await removeStoredValue(FRIENDS_STORAGE_KEY);
  },

  hydrateFriends: async () => {
    if (get().isHydrated) {
      return;
    }

    try {
      const stored = await getStoredJson<PersistedFriends>(FRIENDS_STORAGE_KEY);
      const raw = Array.isArray(stored?.friends) ? stored.friends : [];
      set({ friends: raw.map(withDefaults), isHydrated: true });
    } catch {
      set({ friends: [], isHydrated: true });
    }
  },

  removeFriend: async (personId) => {
    const updated = get().friends.filter((f) => f.personId !== personId);
    set({ friends: updated });
    await persist(updated);
  },

  setAllFriendsPush: async (field, value) => {
    const updated = get().friends.map((f) => ({ ...f, [field]: value }));
    set({ friends: updated });
    await persist(updated);
  },

  updateFriendPush: async (personId, field, value) => {
    const updated = get().friends.map((f) =>
      f.personId === personId ? { ...f, [field]: value } : f,
    );
    set({ friends: updated });
    await persist(updated);
  },
}));
