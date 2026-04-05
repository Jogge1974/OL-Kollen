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

export type PersistedPreferences = {
  favoriteEvents: FavoriteEventSummary[];
  favoriteClasses: string[];
  notificationSettings: NotificationSettings;
};
