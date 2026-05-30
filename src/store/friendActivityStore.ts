import { create } from 'zustand';

import { getSupabaseClient } from '@/src/services/supabase';

/**
 * Ephemeral store that tracks friend activity received via push notifications
 * or fetched from Supabase on startup.
 * Entries are only valid for the current day (the date the result was published).
 * Used to show a highlight badge on friend cards in the friends list.
 */

export type FriendActivityEntry = {
  /** ISO date string YYYY-MM-DD */
  date: string;
  eventId: string;
  /** ISO datetime string for the friend's start time (Swedish local, e.g. "2026-05-30T10:30:00") */
  startTime: string | null;
  type: 'friend-results' | 'friend-start';
};

type FriendActivityState = {
  /** Map from friend personId (as string) → activity entry */
  activityByFriendId: Record<string, FriendActivityEntry>;
  clearOldEntries: () => void;
  fetchTodayActivity: (friendPersonIds: string[]) => Promise<void>;
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

  fetchTodayActivity: async (friendPersonIds: string[]) => {
    if (friendPersonIds.length === 0) return;
    const client = getSupabaseClient();
    if (!client) return;

    const today = todayStr();
    const { data } = await client
      .from('friend_activity_state')
      .select('friend_person_id, event_id, result_notified_at, start_notified_at, start_time')
      .eq('event_date', today)
      .in('friend_person_id', friendPersonIds);

    const fresh: Record<string, FriendActivityEntry> = {};
    for (const row of data ?? []) {
      const id = row.friend_person_id;
      if (row.result_notified_at) {
        fresh[id] = { date: today, eventId: row.event_id, startTime: null, type: 'friend-results' };
      } else if (row.start_notified_at || row.start_time) {
        fresh[id] = { date: today, eventId: row.event_id, startTime: row.start_time ?? null, type: 'friend-start' };
      }
    }
    set({ activityByFriendId: fresh });
  },

  hasTodayActivity: (personId: number) => {
    const entry = get().activityByFriendId[String(personId)];
    return entry != null && entry.date === todayStr();
  },

  recordActivity: (friendPersonIds, eventId, type) => {
    const today = todayStr();
    const current = { ...get().activityByFriendId };
    for (const id of friendPersonIds) {
      current[id] = { date: today, eventId, startTime: null, type };
    }
    set({ activityByFriendId: current });
  },
}));
