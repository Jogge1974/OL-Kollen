import { create } from 'zustand';

/**
 * Ephemeral store that tracks friend activity received via push notifications.
 * Entries are only valid for the current day (the date the result was published).
 * Used to show a highlight badge on friend cards in the friends list.
 */

export type FriendActivityEntry = {
  /** ISO date string YYYY-MM-DD */
  date: string;
  eventId: string;
  type: 'friend-results' | 'friend-start';
};

type FriendActivityState = {
  /** Map from friend personId (as string) → activity entry */
  activityByFriendId: Record<string, FriendActivityEntry>;
  clearOldEntries: () => void;
  hasTodayActivity: (personId: number) => boolean;
  recordActivity: (friendPersonIds: string[], eventId: string, type: FriendActivityEntry['type']) => void;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export const useFriendActivityStore = create<FriendActivityState>((set, get) => ({
  activityByFriendId: {},

  clearOldEntries: () => {
    const today = todayStr();
    const current = get().activityByFriendId;
    const cleaned: Record<string, FriendActivityEntry> = {};
    for (const [key, entry] of Object.entries(current)) {
      if (entry.date === today) {
        cleaned[key] = entry;
      }
    }
    set({ activityByFriendId: cleaned });
  },

  hasTodayActivity: (personId: number) => {
    const entry = get().activityByFriendId[String(personId)];
    return entry != null && entry.date === todayStr();
  },

  recordActivity: (friendPersonIds, eventId, type) => {
    const today = todayStr();
    const current = { ...get().activityByFriendId };
    for (const id of friendPersonIds) {
      current[id] = { date: today, eventId, type };
    }
    set({ activityByFriendId: current });
  },
}));
