import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from './apiClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowAlert: false,
  }),
});

let cachedExpoPushToken: string | null = null;
let registrationPromise: Promise<string | null> | null = null;

/** Requests permissions, obtains the Expo push token, and saves it to the API once per session. */
export async function syncDevicePushToken(): Promise<string | null> {
  if (registrationPromise) {
    return registrationPromise;
  }

  registrationPromise = (async () => {
    await ensureAndroidNotificationChannel();

    const currentPermissions = await Notifications.getPermissionsAsync();
    let finalStatus = currentPermissions.status;

    if (finalStatus !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermissions.status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId = resolveExpoProjectId();
    if (!projectId) {
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const nextToken = tokenResponse.data;

    if (!nextToken || cachedExpoPushToken === nextToken) {
      return nextToken ?? null;
    }

    await apiClient.patch('/users/me', { expoPushToken: nextToken });
    cachedExpoPushToken = nextToken;
    return nextToken;
  })().finally(() => {
    registrationPromise = null;
  });

  return registrationPromise;
}

/** Removes the current device push token from the authenticated user before logout. */
export async function detachDevicePushToken(): Promise<void> {
  try {
    await apiClient.patch('/users/me', { expoPushToken: null });
  } finally {
    cachedExpoPushToken = null;
  }
}

/** Clears the local notification registration cache. */
export function resetDevicePushTokenCache(): void {
  cachedExpoPushToken = null;
}

/** Subscribes to foreground notification deliveries. */
export function addForegroundNotificationListener(
  listener: (notification: Notifications.Notification) => void,
): () => void {
  const subscription = Notifications.addNotificationReceivedListener(listener);
  return () => subscription.remove();
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function resolveExpoProjectId(): string | undefined {
  const expoExtra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? expoExtra?.eas?.projectId;
}