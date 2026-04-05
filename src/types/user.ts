export type AccessLevel = 'free' | 'premium' | 'admin';

export type AuthenticatedUser = {
  accessLevel: AccessLevel;
  birthDate: string | null;
  email: string | null;
  firstName: string | null;
  fullName: string | null;
  gender: 'D' | 'H' | null;
  lastName: string | null;
  organisationIds: string[];
  organisationName: string | null;
  personId: string | null;
  username: string;
};

export type EventorLoginInput = {
  password: string;
  username: string;
};

export type PersistedAuthSession = {
  rememberedUsername?: string | null;
  user: AuthenticatedUser;
};

export type UserAccessRecord = {
  accessLevel: AccessLevel;
  userId: string;
};

export type FriendRecord = {
  friendUserId: string;
  userId: string;
};

export type NotificationPreferenceRecord = {
  pushOnResultList: boolean;
  pushOnStartList: boolean;
  userId: string;
};

export type DevicePushTokenRecord = {
  deviceId: string;
  pushToken: string;
  userId: string;
};
