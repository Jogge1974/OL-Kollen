export type FavoriteEventSummary = {
  classificationId: number;
  classificationLabel: string;
  dateLabel: string;
  hasPublishedResults: boolean;
  hasPublishedStarts: boolean;
  id: string;
  organiserLabel?: string;
  name: string;
  startDate: string;
};

export type NotificationSettings = {
  pushOnResultList: boolean;
  pushOnStartList: boolean;
  pushOnEntryDeadline: boolean;
};

export type CalendarFilterTemplate = {
  classificationIds: number[];
  disciplineIds?: number[];
  districtIds: number[];
  fromOffsetDays: number;
  showEntryCountsInList?: boolean;
  toOffsetDays: number;
};

export type CalendarFilterPreset = {
  id: string;
  name: string;
  template: CalendarFilterTemplate;
};

export type PersistedPreferences = {
  calendarDefaultFilterTemplate: CalendarFilterTemplate;
  calendarFilterPresets: CalendarFilterPreset[];
  favoriteEvents: FavoriteEventSummary[];
  favoriteClasses: string[];
  notificationSettings: NotificationSettings;
  themeName?: 'light' | 'dark' | 'soft' | 'soft-dark';
};
