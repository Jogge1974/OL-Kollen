import { create } from 'zustand';

import { getStoredJson, setStoredJson } from '@/src/services/secureStorage';
import { FavoriteEventSummary, NotificationSettings, PersistedPreferences } from '@/src/types/preferences';

const PREFERENCES_STORAGE_KEY = 'olkollen.preferences';

const defaultNotificationSettings: NotificationSettings = {
  pushOnResultList: false,
  pushOnStartList: false,
};

type PreferencesState = {
  addFavoriteClass: (className: string) => Promise<{ ok: boolean; reason?: 'duplicate' | 'empty' }>;
  clearAllFavorites: () => Promise<void>;
  clearLogoutSensitivePreferences: () => Promise<void>;
  favoriteClasses: string[];
  favoriteEvents: FavoriteEventSummary[];
  hydratePreferences: () => Promise<void>;
  isFavorite: (eventId: string) => boolean;
  isHydrated: boolean;
  moveFavoriteClass: (className: string, direction: 'down' | 'up') => Promise<void>;
  notificationSettings: NotificationSettings;
  removeFavorite: (eventId: string) => Promise<void>;
  removeFavoriteClass: (className: string) => Promise<void>;
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
  addFavoriteClass: async (className) => {
    const normalizedClassName = normalizeFavoriteClassName(className);

    if (!normalizedClassName) {
      return { ok: false, reason: 'empty' };
    }

    const current = get();
    const exists = current.favoriteClasses.some((favoriteClass) => favoriteClass.localeCompare(normalizedClassName, 'sv', { sensitivity: 'accent' }) === 0);

    if (exists) {
      return { ok: false, reason: 'duplicate' };
    }

    const favoriteClasses = [...current.favoriteClasses, normalizedClassName];
    set({ favoriteClasses });
    await persistPreferences({
      favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });

    return { ok: true };
  },
  clearAllFavorites: async () => {
    const current = get();
    const favoriteEvents: FavoriteEventSummary[] = [];

    set({ favoriteEvents });
    await persistPreferences({
      favoriteClasses: current.favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  clearLogoutSensitivePreferences: async () => {
    const current = get();
    const favoriteClasses: string[] = [];
    const favoriteEvents: FavoriteEventSummary[] = [];

    set({ favoriteClasses, favoriteEvents });
    await persistPreferences({
      favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  favoriteClasses: [],
  favoriteEvents: [],
  hydratePreferences: async () => {
    try {
      const storedPreferences = await getStoredJson<PersistedPreferences>(PREFERENCES_STORAGE_KEY);

      set({
        favoriteClasses: storedPreferences?.favoriteClasses ?? [],
        favoriteEvents: sortFavorites(storedPreferences?.favoriteEvents ?? []),
        isHydrated: true,
        notificationSettings: storedPreferences?.notificationSettings ?? defaultNotificationSettings,
      });
    } catch {
      set({
        favoriteClasses: [],
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
  moveFavoriteClass: async (className, direction) => {
    const current = get();
    const index = current.favoriteClasses.findIndex((favoriteClass) => favoriteClass === className);

    if (index < 0) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= current.favoriteClasses.length) {
      return;
    }

    const favoriteClasses = [...current.favoriteClasses];
    [favoriteClasses[index], favoriteClasses[targetIndex]] = [favoriteClasses[targetIndex], favoriteClasses[index]];

    set({ favoriteClasses });
    await persistPreferences({
      favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  notificationSettings: defaultNotificationSettings,
  removeFavorite: async (eventId: string) => {
    const current = get();
    const favoriteEvents = current.favoriteEvents.filter((event) => event.id !== eventId);

    set({ favoriteEvents });
    await persistPreferences({
      favoriteClasses: current.favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  removeFavoriteClass: async (className) => {
    const current = get();
    const favoriteClasses = current.favoriteClasses.filter((favoriteClass) => favoriteClass !== className);

    set({ favoriteClasses });
    await persistPreferences({
      favoriteClasses,
      favoriteEvents: current.favoriteEvents,
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
      favoriteClasses: current.favoriteClasses,
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
      favoriteClasses: current.favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });

    // TODO: Sync favorites + push preferences + device push token to Supabase before enabling server-driven push notifications.
    return !exists;
  },
}));

function normalizeFavoriteClassName(className: string) {
  return className.replace(/\s+/g, ' ').trim();
}
