import { create } from 'zustand';

import { createDefaultCalendarFilterTemplate } from '@/src/features/calendar/calendarFilters';
import { getStoredJson, setStoredJson } from '@/src/services/secureStorage';
import {
  CalendarFilterPreset,
  CalendarFilterTemplate,
  FavoriteEventSummary,
  NotificationSettings,
  PersistedPreferences,
} from '@/src/types/preferences';

const PREFERENCES_STORAGE_KEY = 'olkollen.preferences';

const defaultNotificationSettings: NotificationSettings = {
  pushOnResultList: false,
  pushOnStartList: false,
};

type PreferencesData = {
  calendarDefaultFilterTemplate: CalendarFilterTemplate;
  calendarFilterPresets: CalendarFilterPreset[];
  favoriteClasses: string[];
  favoriteEvents: FavoriteEventSummary[];
  notificationSettings: NotificationSettings;
};

type PreferencesState = PreferencesData & {
  addFavoriteClass: (className: string) => Promise<{ ok: boolean; reason?: 'duplicate' | 'empty' }>;
  addCalendarFilterPreset: (
    name: string,
    template: CalendarFilterTemplate,
  ) => Promise<{ ok: boolean; reason?: 'duplicate' | 'empty' }>;
  clearAllFavorites: () => Promise<void>;
  clearLogoutSensitivePreferences: () => Promise<void>;
  hydratePreferences: () => Promise<void>;
  isFavorite: (eventId: string) => boolean;
  isHydrated: boolean;
  moveCalendarFilterPreset: (presetId: string, direction: 'down' | 'up') => Promise<void>;
  moveFavoriteClass: (className: string, direction: 'down' | 'up') => Promise<void>;
  notificationSettings: NotificationSettings;
  removeCalendarFilterPreset: (presetId: string) => Promise<void>;
  removeFavorite: (eventId: string) => Promise<void>;
  removeFavoriteClass: (className: string) => Promise<void>;
  setCalendarDefaultFilterTemplate: (template: CalendarFilterTemplate) => Promise<void>;
  setNotificationSetting: (key: keyof NotificationSettings, value: boolean) => Promise<void>;
  toggleFavorite: (event: FavoriteEventSummary) => Promise<boolean>;
};

function createDefaultPreferencesData(): PreferencesData {
  return {
    calendarDefaultFilterTemplate: createDefaultCalendarFilterTemplate(),
    calendarFilterPresets: [],
    favoriteClasses: [],
    favoriteEvents: [],
    notificationSettings: defaultNotificationSettings,
  };
}

function normalizeCalendarFilterTemplate(template?: Partial<CalendarFilterTemplate> | null): CalendarFilterTemplate {
  const fallback = createDefaultCalendarFilterTemplate();

  return {
    classificationIds: normalizeNumberArray(template?.classificationIds, fallback.classificationIds),
    districtIds: normalizeNumberArray(template?.districtIds, fallback.districtIds),
    fromOffsetDays: normalizeOffset(template?.fromOffsetDays, fallback.fromOffsetDays),
    toOffsetDays: normalizeOffset(template?.toOffsetDays, fallback.toOffsetDays),
  };
}

function normalizeNumberArray(value: number[] | undefined | null, fallback: number[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return [...new Set(value.filter((item) => Number.isFinite(item)))].sort((a, b) => a - b);
}

function normalizeOffset(value: number | undefined | null, fallback: number) {
  return Number.isFinite(value ?? Number.NaN) ? (value as number) : fallback;
}

function normalizeCalendarFilterPreset(preset: Partial<CalendarFilterPreset> | null | undefined): CalendarFilterPreset | null {
  if (!preset?.id || !preset.name) {
    return null;
  }

  return {
    id: preset.id,
    name: preset.name.trim(),
    template: normalizeCalendarFilterTemplate(preset.template),
  };
}

function normalizeCalendarFilterPresets(presets: unknown): CalendarFilterPreset[] {
  if (!Array.isArray(presets)) {
    return [];
  }

  return presets
    .map((preset) => normalizeCalendarFilterPreset(preset as Partial<CalendarFilterPreset>))
    .filter((preset): preset is CalendarFilterPreset => preset !== null);
}

function sortFavorites(favorites: FavoriteEventSummary[]) {
  return [...favorites].sort((left, right) => {
    const byDate = left.startDate.localeCompare(right.startDate);

    if (byDate !== 0) {
      return byDate;
    }

    return left.name.localeCompare(right.name, 'sv');
  });
}

function normalizeFavoriteClassName(className: string) {
  return className.replace(/\s+/g, ' ').trim();
}

function buildPersistedPreferences(state: PreferencesData): PersistedPreferences {
  return {
    calendarDefaultFilterTemplate: state.calendarDefaultFilterTemplate,
    calendarFilterPresets: state.calendarFilterPresets,
    favoriteClasses: state.favoriteClasses,
    favoriteEvents: state.favoriteEvents,
    notificationSettings: state.notificationSettings,
  };
}

async function persistCurrentPreferences(state: PreferencesData) {
  await setStoredJson(PREFERENCES_STORAGE_KEY, buildPersistedPreferences(state));
}

function createPresetId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePresetName(name: string) {
  return name.replace(/\s+/g, ' ').trim();
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
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });

    return { ok: true };
  },
  addCalendarFilterPreset: async (name, template) => {
    const normalizedName = normalizePresetName(name);

    if (!normalizedName) {
      return { ok: false, reason: 'empty' };
    }

    const current = get();
    const exists = current.calendarFilterPresets.some((preset) => preset.name.localeCompare(normalizedName, 'sv', { sensitivity: 'accent' }) === 0);

    if (exists) {
      return { ok: false, reason: 'duplicate' };
    }

    const calendarFilterPresets = [
      ...current.calendarFilterPresets,
      {
        id: createPresetId(),
        name: normalizedName,
        template: normalizeCalendarFilterTemplate(template),
      },
    ];

    set({ calendarFilterPresets });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });

    return { ok: true };
  },
  calendarDefaultFilterTemplate: createDefaultCalendarFilterTemplate(),
  calendarFilterPresets: [],
  favoriteClasses: [],
  favoriteEvents: [],
  clearAllFavorites: async () => {
    const current = get();
    const favoriteEvents: FavoriteEventSummary[] = [];

    set({ favoriteEvents });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
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
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  hydratePreferences: async () => {
    try {
      const storedPreferences = await getStoredJson<PersistedPreferences>(PREFERENCES_STORAGE_KEY);
      const defaultPreferences = createDefaultPreferencesData();

      const calendarDefaultFilterTemplate = normalizeCalendarFilterTemplate(storedPreferences?.calendarDefaultFilterTemplate);
      const calendarFilterPresets = normalizeCalendarFilterPresets(storedPreferences?.calendarFilterPresets);

      set({
        calendarDefaultFilterTemplate,
        calendarFilterPresets,
        favoriteClasses: storedPreferences?.favoriteClasses ?? defaultPreferences.favoriteClasses,
        favoriteEvents: sortFavorites(storedPreferences?.favoriteEvents ?? defaultPreferences.favoriteEvents),
        isHydrated: true,
        notificationSettings: storedPreferences?.notificationSettings ?? defaultPreferences.notificationSettings,
      });
    } catch {
      const fallback = createDefaultPreferencesData();

      set({
        ...fallback,
        isHydrated: true,
      });
    }
  },
  isFavorite: (eventId: string) => {
    return get().favoriteEvents.some((event) => event.id === eventId);
  },
  isHydrated: false,
  moveCalendarFilterPreset: async (presetId, direction) => {
    const current = get();
    const index = current.calendarFilterPresets.findIndex((preset) => preset.id === presetId);

    if (index < 0) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= current.calendarFilterPresets.length) {
      return;
    }

    const calendarFilterPresets = [...current.calendarFilterPresets];
    [calendarFilterPresets[index], calendarFilterPresets[targetIndex]] = [calendarFilterPresets[targetIndex], calendarFilterPresets[index]];

    set({ calendarFilterPresets });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
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
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  notificationSettings: defaultNotificationSettings,
  removeCalendarFilterPreset: async (presetId) => {
    const current = get();
    const calendarFilterPresets = current.calendarFilterPresets.filter((preset) => preset.id !== presetId);

    set({ calendarFilterPresets });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  removeFavorite: async (eventId: string) => {
    const current = get();
    const favoriteEvents = current.favoriteEvents.filter((event) => event.id !== eventId);

    set({ favoriteEvents });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  removeFavoriteClass: async (className) => {
    const current = get();
    const favoriteClasses = current.favoriteClasses.filter((favoriteClass) => favoriteClass !== className);

    set({ favoriteClasses });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
    });
  },
  setCalendarDefaultFilterTemplate: async (template) => {
    const current = get();
    const calendarDefaultFilterTemplate = normalizeCalendarFilterTemplate(template);

    set({ calendarDefaultFilterTemplate });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
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
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
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
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
    });

    // TODO: Sync favorites + push preferences + device push token to Supabase before enabling server-driven push notifications.
    return !exists;
  },
}));
