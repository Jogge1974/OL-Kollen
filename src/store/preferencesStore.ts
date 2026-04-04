import { create } from 'zustand';

import { getStoredJson, setStoredJson } from '@/src/services/secureStorage';
import { FavoriteEventSummary, NotificationSettings, PersistedPreferences } from '@/src/types/preferences';

const PREFERENCES_STORAGE_KEY = 'olkollen.preferences';

const defaultNotificationSettings: NotificationSettings = {
  pushOnResultList: false,
  pushOnStartList: false,
};

type PreferencesState = {
  favoriteEvents: FavoriteEventSummary[];
  hydratePreferences: () => Promise<void>;
  isFavorite: (eventId: string) => boolean;
  isHydrated: boolean;
  notificationSettings: NotificationSettings;
  removeFavorite: (eventId: string) => Promise<void>;
  setNotificationSetting: (key: keyof NotificationSettings, value: boolean) => Promise<void>;
  toggleFavorite: (event: FavoriteEventSummary) => Promise<boolean>;
};

function sortFavorites(favorites: FavoriteEventSummary[]) {
  return [...favorites].sort((left, right) => {
    const byDate = left.startDate.localeCompare(right.startDate);

    if (byDate !== 0) {
      return byDate;
    }

    return left.name.localeCompare(right.name, 'sv');
  });
}

async function persistPreferences(preferences: PersistedPreferences) {
  await setStoredJson(PREFERENCES_STORAGE_KEY, preferences);
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  favoriteEvents: [],
  hydratePreferences: async () => {
    try {
      const storedPreferences = await getStoredJson<PersistedPreferences>(PREFERENCES_STORAGE_KEY);

      set({
        favoriteEvents: sortFavorites(storedPreferences?.favoriteEvents ?? []),
        isHydrated: true,
        notificationSettings: storedPreferences?.notificationSettings ?? defaultNotificationSettings,
      });
    } catch {
      set({
        favoriteEvents: [],
        isHydrated: true,
        notificationSettings: defaultNotificationSettings,
      });
    }
  },
  isFavorite: (eventId: string) => {
    return get().favoriteEvents.some((event) => event.id === eventId);
  },
  isHydrated: false,
  notificationSettings: defaultNotificationSettings,
  removeFavorite: async (eventId: string) => {
    const current = get();
    const favoriteEvents = current.favoriteEvents.filter((event) => event.id !== eventId);

    set({ favoriteEvents });
    await persistPreferences({
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  setNotificationSetting: async (key, value) => {
    const current = get();
    const notificationSettings = {
      ...current.notificationSettings,
      [key]: value,
    };

    set({ notificationSettings });
    await persistPreferences({
      favoriteEvents: current.favoriteEvents,
      notificationSettings,
    });
  },
  toggleFavorite: async (event) => {
    const current = get();
    const exists = current.favoriteEvents.some((favoriteEvent) => favoriteEvent.id === event.id);
    const favoriteEvents = exists
      ? current.favoriteEvents.filter((favoriteEvent) => favoriteEvent.id !== event.id)
      : sortFavorites([event, ...current.favoriteEvents]);

    set({ favoriteEvents });
    await persistPreferences({
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });

    // TODO: Sync favorites + push preferences + device push token to Supabase before enabling server-driven push notifications.
    return !exists;
  },
}));
