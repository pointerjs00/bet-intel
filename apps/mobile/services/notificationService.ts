import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import axios from 'axios';
import { apiClient } from './apiClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
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
  })().catch((err: unknown) => {
    // A 401 means the auth system is handling it (token refresh or session clear).
    // Reset the cache so the sync retries on the next authenticated request.
    const is401 = axios.isAxiosError(err) && err.response?.status === 401;
    if (is401) {
      cachedExpoPushToken = null;
      return null;
    }
    // For all other errors, warn in dev — these are unexpected (network, 5xx, etc.)
    if (__DEV__) {
      console.warn('[BetIntel] Push token sync failed:', err);
    }
    return null;
  }).finally(() => {
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

/** Subscribes to notification tap/response events (background & killed state). */
export function addNotificationResponseListener(
  listener: (response: Notifications.NotificationResponse) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(listener);
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