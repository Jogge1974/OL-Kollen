import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type PushRegistration = {
  deviceId: string;
  permissionGranted: boolean;
  platform: string;
  pushToken: string | null;
};

let isNotificationHandlerConfigured = false;

type NotificationEventData = {
  eventId?: string | number;
  friendPersonId?: string | number;
  friendPersonIds?: string[];
  type?: string;
};

export type NotificationData = NotificationEventData;

export function ensureNotificationHandler() {
  if (isNotificationHandlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  isNotificationHandlerConfigured = true;
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistration> {
  ensureNotificationHandler();

  const deviceId = await getDeviceIdentifier();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#4C8B47',
      name: 'default',
      vibrationPattern: [0, 250, 200, 250],
    });
  }

  if (!Device.isDevice) {
    return {
      deviceId,
      permissionGranted: false,
      platform: Platform.OS,
      pushToken: null,
    };
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== 'granted') {
    return {
      deviceId,
      permissionGranted: false,
      platform: Platform.OS,
      pushToken: null,
    };
  }

  const projectId =
    Constants.easConfig?.projectId ??
    ((Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? null) ??
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ??
    null;

  if (!projectId) {
    throw new Error('Saknar Expo projectId för push. Lägg in EXPO_PUBLIC_EXPO_PROJECT_ID eller koppla projektet till EAS.');
  }

  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  return {
    deviceId,
    permissionGranted: true,
    platform: Platform.OS,
    pushToken,
  };
}

export async function getLastNotificationEventId() {
  const response = await Notifications.getLastNotificationResponseAsync();
  return extractNotificationEventId(response);
}

export function addNotificationEventListener(onEventId: (eventId: string) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const eventId = extractNotificationEventId(response);

    if (eventId) {
      onEventId(eventId);
    }
  });
}

export function addNotificationDataListener(onData: (data: NotificationData) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification.request.content.data as NotificationData | undefined;
    if (data) {
      onData(data);
    }
  });
}

function extractNotificationEventId(response: Notifications.NotificationResponse | null) {
  const data = response?.notification.request.content.data as NotificationEventData | undefined;
  const eventId = data?.eventId;

  if (typeof eventId === 'string' && eventId.length > 0) {
    return eventId;
  }

  if (typeof eventId === 'number') {
    return `${eventId}`;
  }

  return null;
}

async function getDeviceIdentifier() {
  if (Platform.OS === 'android') {
    return Application.getAndroidId() ?? 'android-unknown';
  }

  if (Platform.OS === 'ios') {
    return (await Application.getIosIdForVendorAsync()) ?? 'ios-unknown';
  }

  return `${Platform.OS}-${Device.modelName ?? 'unknown-device'}`;
}
