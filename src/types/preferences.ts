export type FavoriteEventSummary = {
  classificationId: number;
  classificationLabel: string;
  dateLabel: string;
  hasPublishedResults: boolean;
  hasPublishedStarts: boolean;
  id: string;
  name: string;
  startDate: string;
};

export type NotificationSettings = {
  pushOnResultList: boolean;
  pushOnStartList: boolean;
};

export type CalendarFilterTemplate = {
  classificationIds: number[];
  districtIds: number[];
  fromOffsetDays: number;
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
};
