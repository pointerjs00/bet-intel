import { Platform } from 'react-native';

type HapticsApi = typeof import('expo-haptics');

// Lazy-load expo-haptics to avoid crashes in environments where the native
// module hasn't been linked yet (Expo Go, an older dev build without the module).
let HapticsModule: HapticsApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  HapticsModule = require('expo-haptics') as HapticsApi;
} catch {
  // Haptics silently disabled
}

function runHaptic(fn: (h: HapticsApi) => Promise<void>) {
  if (Platform.OS === 'web' || !HapticsModule) return;
  try { fn(HapticsModule).catch(() => { /* ignore */ }); } catch { /* ignore */ }
}

/** Light haptic tap — chip selection, row press. */
export function hapticLight() {
  runHaptic((h) => h.impactAsync(h.ImpactFeedbackStyle.Light));
}

/** Medium haptic — confirmations. */
export function hapticMedium() {
  runHaptic((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium));
}

/** Success notification haptic — boletin saved. */
export function hapticSuccess() {
  runHaptic((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
}

/** Selection-change haptic — toggles, chips. */
export function hapticSelection() {
  runHaptic((h) => h.selectionAsync());
}

/** Error notification haptic — failed operations. */
export function hapticError() {
  runHaptic((h) => h.notificationAsync(h.NotificationFeedbackType.Error));
}
