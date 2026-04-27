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
 
// Map structure: boletinId → { notificationIds: string[] }
interface ReminderEntry {
  notificationIds: string[];
}
 
async function getScheduledReminderMap(): Promise<Record<string, ReminderEntry>> {
  try {
    const raw = await AsyncStorage.getItem(KICKOFF_REMINDER_MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReminderEntry>) : {};
  } catch {
    return {};
  }
}
 
async function saveScheduledReminderMap(map: Record<string, ReminderEntry>): Promise<void> {
  try {
    await AsyncStorage.setItem(KICKOFF_REMINDER_MAP_KEY, JSON.stringify(map));
  } catch {}
}
 
/**
 * Schedules two local notifications per selection that has a future eventDate:
 *   1. 15 minutes before kick-off  — "Jogo em 15 minutos"
 *   2. At kick-off                 — "Jogo a começar agora!"
 *
 * Replaces any existing reminders for the boletin (handles edit/reschedule).
 * Safe to call even when reminders are disabled or permissions are missing.
 */
export async function scheduleSelectionReminders(
  boletinId: string,
  selections: Array<{ id: string; eventDate: string }>,
  boletinName?: string | null,
): Promise<void> {
  // Cancel any previously scheduled reminders for this boletin first
  await cancelBoletinReminders(boletinId);
 
  if (!selections.length) return;
 
  const enabled = await getKickoffRemindersEnabled();
  if (!enabled) return;
 
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
 
  const now = Date.now();
  const scheduledIds: string[] = [];
  const label = boletinName ? `"${boletinName}"` : 'o teu boletim';
 
  for (const sel of selections) {
    const kickoffMs = new Date(sel.eventDate).getTime();
    if (isNaN(kickoffMs)) continue;
 
    // ── Reminder 1: 15 minutes before ────────────────────────────────────────
    const warningMs = kickoffMs - 15 * 60 * 1000;
    if (warningMs > now) {
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚽ Jogo em 15 minutos!',
            body: `Um jogo de ${label} começa em breve. Verifica o boletim.`,
            sound: 'default',
            data: { type: 'KICKOFF_REMINDER', boletinId, selectionId: sel.id },
            ...(Platform.OS === 'android' ? { channelId: 'kickoff-reminders' } : {}),
          },
          trigger: { date: new Date(warningMs) } as unknown as Notifications.DateTriggerInput,
        });
        scheduledIds.push(id);
      } catch (err) {
        if (__DEV__) console.warn('[BetIntel] Failed to schedule warning reminder:', err);
      }
    }
 
    // ── Reminder 2: At kick-off ───────────────────────────────────────────────
    if (kickoffMs > now) {
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: '🟢 Jogo a começar!',
            body: `Um jogo de ${label} está a começar agora. Acompanha o resultado.`,
            sound: 'default',
            data: { type: 'KICKOFF_REMINDER', boletinId, selectionId: sel.id },
            ...(Platform.OS === 'android' ? { channelId: 'kickoff-reminders' } : {}),
          },
          trigger: { date: new Date(kickoffMs) } as unknown as Notifications.DateTriggerInput,
        });
        scheduledIds.push(id);
      } catch (err) {
        if (__DEV__) console.warn('[BetIntel] Failed to schedule kickoff reminder:', err);
      }
    }
  }
 
  if (scheduledIds.length > 0) {
    const map = await getScheduledReminderMap();
    map[boletinId] = { notificationIds: scheduledIds };
    await saveScheduledReminderMap(map);
  }
}
 
/**
 * Cancels ALL scheduled reminders for a specific boletin.
 * Safe to call even if no reminders exist.
 */
export async function cancelBoletinReminders(boletinId: string): Promise<void> {
  try {
    const map = await getScheduledReminderMap();
    const entry = map[boletinId];
    if (!entry) return;
 
    await Promise.all(
      entry.notificationIds.map((id) =>
        Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
      ),
    );
 
    delete map[boletinId];
    await saveScheduledReminderMap(map);
  } catch {}
}
 
/** Cancels ALL scheduled kickoff reminders across all boletins. */
export async function cancelAllKickoffReminders(): Promise<void> {
  try {
    const map = await getScheduledReminderMap();
    const allIds = Object.values(map).flatMap((entry) => entry.notificationIds);
 
    await Promise.all(
      allIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
    );
 
    await saveScheduledReminderMap({});
  } catch {}
}