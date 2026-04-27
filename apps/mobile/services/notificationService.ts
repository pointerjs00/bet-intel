import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { apiClient } from './apiClient';

// ─── Notification handler ────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
  }),
});

// ─── Push token sync ─────────────────────────────────────────────────────────

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

// ─── Android channel setup ───────────────────────────────────────────────────

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // MAX importance ensures heads-up / banner notifications appear on screen.
  // NOTE: Once a channel is created on a device, its importance level is locked
  // by Android. Users who already have the app installed with DEFAULT importance
  // will need to clear app data or reinstall for this to take effect.
  await Notifications.setNotificationChannelAsync('default', {
    name: 'BetIntel',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00C851',
  });

  // Dedicated channel for kickoff reminders so users can silence them independently
  await Notifications.setNotificationChannelAsync('kickoff-reminders', {
    name: 'Lembretes de jogos',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 150, 150, 150],
    lightColor: '#FFB300',
  });
}

function resolveExpoProjectId(): string | undefined {
  const expoExtra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? expoExtra?.eas?.projectId;
}

// ─── Kickoff reminder preference ─────────────────────────────────────────────

const KICKOFF_REMINDERS_PREF_KEY = '@betintel/kickoff_reminders_enabled';

/** Returns true if the user has kickoff reminders enabled (default: true). */
export async function getKickoffRemindersEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KICKOFF_REMINDERS_PREF_KEY);
    // Default to enabled if never explicitly set
    return value === null ? true : value === 'true';
  } catch {
    return true;
  }
}

/** Persists the user's kickoff reminder preference. */
export async function setKickoffRemindersEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KICKOFF_REMINDERS_PREF_KEY, enabled ? 'true' : 'false');
    if (!enabled) {
      // Cancel all pending kickoff reminders when the feature is disabled
      await cancelAllKickoffReminders();
    }
  } catch {
    // Non-critical — preference falls back to default
  }
}

// ─── Kickoff reminder scheduling ─────────────────────────────────────────────

// We track scheduled notification IDs keyed by boletin ID so we can cancel them.
const KICKOFF_REMINDER_MAP_KEY = '@betintel/kickoff_reminder_map';

async function getScheduledReminderMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KICKOFF_REMINDER_MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function saveScheduledReminderMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(KICKOFF_REMINDER_MAP_KEY, JSON.stringify(map));
  } catch {
    // Non-critical
  }
}

/**
 * Schedules a local "kick-off reminder" notification for a boletin.
 *
 * The notification fires 15 minutes before `betDate`. If a reminder is already
 * scheduled for this boletin (from a previous save/edit), it is cancelled first.
 *
 * Silently no-ops when:
 *  - The user has disabled kickoff reminders in settings
 *  - Notification permission has not been granted
 *  - betDate is null / in the past (including the 15-min window)
 */
export async function scheduleKickoffReminder(
  boletinId: string,
  betDate: string | null | undefined,
  boletinName?: string | null,
): Promise<void> {
  // Always cancel any existing reminder for this boletin first (handles reschedule on edit)
  await cancelKickoffReminder(boletinId);

  if (!betDate) return;

  const enabled = await getKickoffRemindersEnabled();
  if (!enabled) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const eventTime = new Date(betDate).getTime();
  const reminderTime = eventTime - 15 * 60 * 1000; // 15 minutes before
  const now = Date.now();

  if (reminderTime <= now) return; // Already past the reminder window

  const title = '⚽ Jogo a começar em breve!';
  const body = boletinName
    ? `O teu boletim "${boletinName}" tem um jogo em 15 minutos.`
    : 'Tens um jogo em 15 minutos. Não te esqueças de verificar o teu boletim.';

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: {
          type: 'KICKOFF_REMINDER',
          boletinId,
        },
        // Android channel
        ...(Platform.OS === 'android' ? { channelId: 'kickoff-reminders' } : {}),
      },
      trigger: {
        date: new Date(reminderTime),
      } as { date: Date },   // expo-notifications 0.28.x accepts { date: Date } directly
    });

    // Persist the mapping so we can cancel it later
    const map = await getScheduledReminderMap();
    map[boletinId] = notificationId;
    await saveScheduledReminderMap(map);
  } catch (err) {
    if (__DEV__) {
      console.warn('[BetIntel] Failed to schedule kickoff reminder:', err);
    }
  }
}

/**
 * Cancels the kickoff reminder for a specific boletin, if one is scheduled.
 * Safe to call even if no reminder exists for the boletin.
 */
export async function cancelKickoffReminder(boletinId: string): Promise<void> {
  try {
    const map = await getScheduledReminderMap();
    const notificationId = map[boletinId];
    if (!notificationId) return;

    await Notifications.cancelScheduledNotificationAsync(notificationId);

    delete map[boletinId];
    await saveScheduledReminderMap(map);
  } catch {
    // Non-critical
  }
}

/** Cancels all scheduled kickoff reminders across all boletins. */
export async function cancelAllKickoffReminders(): Promise<void> {
  try {
    const map = await getScheduledReminderMap();
    const ids = Object.values(map);

    await Promise.all(
      ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
    );

    await saveScheduledReminderMap({});
  } catch {
    // Non-critical
  }
}