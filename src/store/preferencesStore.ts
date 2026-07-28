import { create } from 'zustand';

import { createDefaultCalendarFilterTemplate } from '@/src/features/calendar/calendarFilters';
import { getStoredJson, setStoredJson } from '@/src/services/secureStorage';
import { normalizeEventId } from '@/src/utils/eventId';
import {
  CalendarFilterPreset,
  CalendarFilterTemplate,
  FavoriteEventSummary,
  NotificationSettings,
  PersistedPreferences,
} from '@/src/types/preferences';
import { ThemeName } from '@/src/theme/ThemeContext';

const PREFERENCES_STORAGE_KEY = 'olkollen.preferences';
const DISMISSED_ANNOUNCEMENTS_STORAGE_KEY = 'olkollen.dismissedAnnouncements';
const ANNOUNCEMENTS_BASELINE_STORAGE_KEY = 'olkollen.announcementsBaseline';

export type ServerProfile = {
  favorites: FavoriteEventSummary[];
  notificationSettings: Partial<NotificationSettings> | null;
  preferences: {
    calendarDefaultFilterTemplate?: unknown;
    calendarFilterPresets?: unknown;
    favoriteClasses?: string[];
  } | null;
};

const defaultNotificationSettings: NotificationSettings = {
  pushOnResultList: false,
  pushOnStartList: false,
  pushOnEntryDeadline: true,
};

type PreferencesData = {
  calendarDefaultFilterTemplate: CalendarFilterTemplate;
  calendarFilterPresets: CalendarFilterPreset[];
  favoriteClasses: string[];
  favoriteEvents: FavoriteEventSummary[];
  notificationSettings: NotificationSettings;
  themeName: ThemeName;
};

type PreferencesState = PreferencesData & {
  addFavoriteClass: (className: string) => Promise<{ ok: boolean; reason?: 'duplicate' | 'empty' }>;
  addCalendarFilterPreset: (
    name: string,
    template: CalendarFilterTemplate,
  ) => Promise<{ ok: boolean; reason?: 'duplicate' | 'empty' }>;
  clearAllFavorites: () => Promise<void>;
  clearLogoutSensitivePreferences: () => Promise<void>;
  dismissAnnouncement: (announcementId: string) => Promise<void>;
  dismissedAnnouncementIds: string[];
  announcementsBaselineInitialized: boolean;
  syncAnnouncements: (activeAnnouncementIds: string[]) => Promise<void>;
  hydratePreferences: () => Promise<void>;
  isFavorite: (eventId: string) => boolean;
  isHydrated: boolean;
  mergeServerFavorites: (serverFavorites: FavoriteEventSummary[]) => Promise<void>;
  restoreFromServer: (profile: ServerProfile) => Promise<void>;
  moveCalendarFilterPreset: (presetId: string, direction: 'down' | 'up') => Promise<void>;
  moveFavoriteClass: (className: string, direction: 'down' | 'up') => Promise<void>;
  notificationSettings: NotificationSettings;
  removeCalendarFilterPreset: (presetId: string) => Promise<void>;
  removeFavorite: (eventId: string) => Promise<void>;
  removeFavoriteClass: (className: string) => Promise<void>;
  setCalendarDefaultFilterTemplate: (template: CalendarFilterTemplate) => Promise<void>;
  setNotificationSetting: (key: keyof NotificationSettings, value: boolean) => Promise<void>;
  setThemeName: (themeName: ThemeName) => Promise<void>;
  toggleFavorite: (event: FavoriteEventSummary) => Promise<boolean>;
};

function createDefaultPreferencesData(): PreferencesData {
  return {
    calendarDefaultFilterTemplate: createDefaultCalendarFilterTemplate(),
    calendarFilterPresets: [],
    favoriteClasses: [],
    favoriteEvents: [],
    notificationSettings: defaultNotificationSettings,
    themeName: 'light',
  };
}

function normalizeCalendarFilterTemplate(template?: Partial<CalendarFilterTemplate> | null): CalendarFilterTemplate {
  const fallback = createDefaultCalendarFilterTemplate();

  return {
    classificationIds: normalizeNumberArray(template?.classificationIds, fallback.classificationIds),
    disciplineIds: normalizeNumberArray(template?.disciplineIds, fallback.disciplineIds ?? []),
    districtIds: normalizeNumberArray(template?.districtIds, fallback.districtIds),
    fromOffsetDays: normalizeOffset(template?.fromOffsetDays, fallback.fromOffsetDays),
    showEntryCountsInList: template?.showEntryCountsInList !== false,
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

function normalizeFavoriteEventSummary(event: FavoriteEventSummary): FavoriteEventSummary {
  return {
    ...event,
  };
}

function mergeFavoriteEventSummaries(existing: FavoriteEventSummary, incoming: FavoriteEventSummary): FavoriteEventSummary {
  return {
    classificationId: existing.classificationId || incoming.classificationId,
    classificationLabel: existing.classificationLabel || incoming.classificationLabel,
    dateLabel: existing.dateLabel || incoming.dateLabel,
    hasPublishedResults: existing.hasPublishedResults || incoming.hasPublishedResults,
    hasPublishedStarts: existing.hasPublishedStarts || incoming.hasPublishedStarts,
    id: existing.id,
    organiserLabel: existing.organiserLabel || incoming.organiserLabel,
    name: existing.name || incoming.name,
    startDate: existing.startDate || incoming.startDate,
  };
}

function normalizeFavoriteEvents(favoriteEvents: FavoriteEventSummary[]) {
  const favoritesById = new Map<string, FavoriteEventSummary>();

  for (const favoriteEvent of favoriteEvents) {
    const normalized = normalizeFavoriteEventSummary(favoriteEvent);
    const existing = favoritesById.get(normalized.id);

    favoritesById.set(normalized.id, existing ? mergeFavoriteEventSummaries(existing, normalized) : normalized);
  }

  return sortFavorites(Array.from(favoritesById.values()));
}

function buildPersistedPreferences(state: PreferencesData): PersistedPreferences {
  return {
    calendarDefaultFilterTemplate: state.calendarDefaultFilterTemplate,
    calendarFilterPresets: state.calendarFilterPresets,
    favoriteClasses: state.favoriteClasses,
    favoriteEvents: state.favoriteEvents,
    notificationSettings: state.notificationSettings,
    themeName: state.themeName,
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
      themeName: current.themeName,
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
      themeName: current.themeName,
    });

    return { ok: true };
  },
  calendarDefaultFilterTemplate: createDefaultCalendarFilterTemplate(),
  calendarFilterPresets: [],
  favoriteClasses: [],
  favoriteEvents: [],
  themeName: 'light',
  dismissedAnnouncementIds: [],
  announcementsBaselineInitialized: false,
  dismissAnnouncement: async (announcementId) => {
    const current = get().dismissedAnnouncementIds;
    if (current.includes(announcementId)) {
      return;
    }

    const next = [...current, announcementId];
    set({ dismissedAnnouncementIds: next });
    await setStoredJson(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, next);
  },
  syncAnnouncements: async (activeAnnouncementIds) => {
    const { dismissedAnnouncementIds, announcementsBaselineInitialized } = get();

    let nextDismissed = dismissedAnnouncementIds;
    let baselineChanged = false;

    if (!announcementsBaselineInitialized) {
      // First launch after install: treat everything currently active as already
      // seen so a fresh download doesn't banner historical messages. They stay
      // visible in the message history, and any message created later banners.
      nextDismissed = [...activeAnnouncementIds];
      baselineChanged = true;
    } else {
      // Drop dismissed ids that no longer match an active announcement so the
      // stored list doesn't accumulate ids for deleted messages.
      const activeSet = new Set(activeAnnouncementIds);
      const pruned = dismissedAnnouncementIds.filter((id) => activeSet.has(id));
      if (pruned.length !== dismissedAnnouncementIds.length) {
        nextDismissed = pruned;
      }
    }

    if (nextDismissed === dismissedAnnouncementIds && !baselineChanged) {
      return;
    }

    set({ dismissedAnnouncementIds: nextDismissed, announcementsBaselineInitialized: true });
    await setStoredJson(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, nextDismissed);
    if (baselineChanged) {
      await setStoredJson(ANNOUNCEMENTS_BASELINE_STORAGE_KEY, true);
    }
  },
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
      themeName: current.themeName,
    });
  },
  clearLogoutSensitivePreferences: async () => {
    const current = get();
    const defaults = createDefaultPreferencesData();

    set({
      calendarFilterPresets: [],
      favoriteClasses: [],
      favoriteEvents: [],
      notificationSettings: defaultNotificationSettings,
    });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: defaults.calendarDefaultFilterTemplate,
      calendarFilterPresets: [],
      favoriteClasses: [],
      favoriteEvents: [],
      notificationSettings: defaultNotificationSettings,
      themeName: current.themeName,
    });
  },
  hydratePreferences: async () => {
    try {
      const storedPreferences = await getStoredJson<PersistedPreferences>(PREFERENCES_STORAGE_KEY);
      const defaultPreferences = createDefaultPreferencesData();

      const calendarDefaultFilterTemplate = normalizeCalendarFilterTemplate(storedPreferences?.calendarDefaultFilterTemplate);
      const calendarFilterPresets = normalizeCalendarFilterPresets(storedPreferences?.calendarFilterPresets);
      const favoriteEvents = normalizeFavoriteEvents(storedPreferences?.favoriteEvents ?? defaultPreferences.favoriteEvents);
      const dismissedAnnouncementIds = await getStoredJson<string[]>(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY);
      const announcementsBaselineInitialized = await getStoredJson<boolean>(ANNOUNCEMENTS_BASELINE_STORAGE_KEY);

      set({
        calendarDefaultFilterTemplate,
        calendarFilterPresets,
        dismissedAnnouncementIds: Array.isArray(dismissedAnnouncementIds) ? dismissedAnnouncementIds : [],
        announcementsBaselineInitialized: announcementsBaselineInitialized === true,
        favoriteClasses: storedPreferences?.favoriteClasses ?? defaultPreferences.favoriteClasses,
        favoriteEvents,
        isHydrated: true,
        notificationSettings: { ...defaultNotificationSettings, ...(storedPreferences?.notificationSettings ?? {}) },
        themeName: storedPreferences?.themeName ?? defaultPreferences.themeName,
      });
    } catch {
      const fallback = createDefaultPreferencesData();

      set({
        ...fallback,
        isHydrated: true,
      });
    }
  },
  mergeServerFavorites: async (serverFavorites: FavoriteEventSummary[]) => {
    const current = get();
    const merged = normalizeFavoriteEvents([...current.favoriteEvents, ...serverFavorites]);

    set({ favoriteEvents: merged });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents: merged,
      notificationSettings: current.notificationSettings,
      themeName: current.themeName,
    });
  },
  restoreFromServer: async (profile: ServerProfile) => {
    const current = get();
    const serverPrefs = profile.preferences;

    const favoriteEvents = normalizeFavoriteEvents([
      ...current.favoriteEvents,
      ...profile.favorites,
    ]);

    const notificationSettings = profile.notificationSettings
      ? { ...defaultNotificationSettings, ...profile.notificationSettings }
      : current.notificationSettings;

    const calendarDefaultFilterTemplate = serverPrefs?.calendarDefaultFilterTemplate
      ? normalizeCalendarFilterTemplate(serverPrefs.calendarDefaultFilterTemplate as Partial<CalendarFilterTemplate>)
      : current.calendarDefaultFilterTemplate;

    const calendarFilterPresets = serverPrefs?.calendarFilterPresets
      ? normalizeCalendarFilterPresets(serverPrefs.calendarFilterPresets)
      : current.calendarFilterPresets;

    const favoriteClasses = Array.isArray(serverPrefs?.favoriteClasses) && serverPrefs.favoriteClasses.length > 0
      ? serverPrefs.favoriteClasses
      : current.favoriteClasses;

    set({
      calendarDefaultFilterTemplate,
      calendarFilterPresets,
      favoriteClasses,
      favoriteEvents,
      notificationSettings,
    });

    await persistCurrentPreferences({
      calendarDefaultFilterTemplate,
      calendarFilterPresets,
      favoriteClasses,
      favoriteEvents,
      notificationSettings,
      themeName: current.themeName,
    });
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
      themeName: current.themeName,
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
      themeName: current.themeName,
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
      themeName: current.themeName,
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
      themeName: current.themeName,
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
      themeName: current.themeName,
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
      themeName: current.themeName,
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
      themeName: current.themeName,
    });
  },
  setThemeName: async (themeName) => {
    const current = get();

    set({ themeName });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents: current.favoriteEvents,
      notificationSettings: current.notificationSettings,
      themeName,
    });
  },
  toggleFavorite: async (event) => {
    const current = get();
    const normalizedEvent = normalizeFavoriteEventSummary(event);
    const exists = current.favoriteEvents.some((favoriteEvent) => favoriteEvent.id === normalizedEvent.id);
    const favoriteEvents = exists
      ? current.favoriteEvents.filter((favoriteEvent) => favoriteEvent.id !== normalizedEvent.id)
      : sortFavorites([normalizedEvent, ...current.favoriteEvents.map(normalizeFavoriteEventSummary)]);

    set({ favoriteEvents });
    await persistCurrentPreferences({
      calendarDefaultFilterTemplate: current.calendarDefaultFilterTemplate,
      calendarFilterPresets: current.calendarFilterPresets,
      favoriteClasses: current.favoriteClasses,
      favoriteEvents,
      notificationSettings: current.notificationSettings,
      themeName: current.themeName,
    });

    // TODO: Sync favorites + push preferences + device push token to Supabase before enabling server-driven push notifications.
    return !exists;
  },
}));
