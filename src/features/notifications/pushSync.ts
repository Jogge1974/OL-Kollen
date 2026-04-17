import { FavoriteEventSummary, NotificationSettings } from '@/src/types/preferences';
import { DevicePushTokenRecord, NotificationPreferenceRecord } from '@/src/types/user';
import { normalizeEventId } from '@/src/utils/eventId';

export type FavoriteWatchRecord = {
  clubId: string | null;
  classificationId: number;
  classificationLabel: string;
  eventDate: string;
  eventId: string;
  eventName: string;
  hasPublishedResults: boolean;
  hasPublishedStarts: boolean;
  lastCheckedAt: string | null;
  personId: string | null;
};

export type PushSyncPayload = {
  device: {
    deviceId: string;
    platform: string;
    pushToken: string | null;
  } | null;
  favoriteEvents: FavoriteEventSummary[];
  notificationSettings: NotificationSettings;
  user: {
    clubId: string | null;
    clubName: string | null;
    email: string | null;
    fullName: string | null;
    personId: string;
    username: string;
  };
};

export function createNotificationPreferenceRecord(userId: string, settings: NotificationSettings): NotificationPreferenceRecord {
  return {
    pushOnResultList: settings.pushOnResultList,
    pushOnStartList: settings.pushOnStartList,
    userId,
  };
}

export function createFavoriteWatchSeed(
  event: FavoriteEventSummary,
  personId: string | null,
  clubId: string | null,
): FavoriteWatchRecord {
  return {
    clubId,
    classificationId: event.classificationId,
    classificationLabel: event.classificationLabel,
    eventDate: event.startDate,
    eventId: normalizeEventId(event.id),
    eventName: event.name,
    hasPublishedResults: event.hasPublishedResults,
    hasPublishedStarts: event.hasPublishedStarts,
    lastCheckedAt: null,
    personId,
  };
}

export function createDevicePushTokenRecord(userId: string, deviceId: string, pushToken: string): DevicePushTokenRecord {
  return {
    deviceId,
    pushToken,
    userId,
  };
}

export function createPushSyncPayload(args: {
  clubId: string | null;
  clubName: string | null;
  device: PushSyncPayload['device'];
  email: string | null;
  favoriteEvents: FavoriteEventSummary[];
  fullName: string | null;
  notificationSettings: NotificationSettings;
  personId: string;
  preferences?: {
    calendarDefaultFilterTemplate?: unknown;
    calendarFilterPresets?: unknown;
    favoriteClasses?: string[];
  } | null;
  username: string;
}): Record<string, unknown> {
  return {
    device: args.device,
    favoriteEvents: args.favoriteEvents,
    notificationSettings: args.notificationSettings,
    preferences: args.preferences ?? null,
    user: {
      clubId: args.clubId,
      clubName: args.clubName,
      email: args.email,
      fullName: args.fullName,
      personId: args.personId,
      username: args.username,
    },
  };
}

export function createLogoutSyncPayload(personId: string, device: PushSyncPayload['device']): Record<string, unknown> {
  return {
    action: 'logout',
    device,
    favoriteEvents: [],
    notificationSettings: { pushOnResultList: false, pushOnStartList: false },
    user: {
      clubId: null,
      clubName: null,
      email: null,
      fullName: null,
      personId,
      username: '',
    },
  };
}

export function createFetchProfilePayload(personId: string): Record<string, unknown> {
  return {
    action: 'fetch-profile',
    device: null,
    favoriteEvents: [],
    notificationSettings: { pushOnResultList: false, pushOnStartList: false },
    user: {
      clubId: null,
      clubName: null,
      email: null,
      fullName: null,
      personId,
      username: '',
    },
  };
}

// TODO: Bind push sync requests to real Supabase auth before production release.
