import { Platform } from 'react-native';

// Lazy-load expo-haptics to avoid crashes in environments where the native
// module hasn't been linked yet (Expo Go, simulator without haptic engine).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HapticsModule: any | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  HapticsModule = require('expo-haptics');
} catch {
  // Haptics silently disabled
}

function runHaptic(fn: () => void) {
  if (Platform.OS === 'web' || !HapticsModule) return;
  try { fn(); } catch { /* ignore */ }
}

/** Light haptic tap — chip selection, row press. */
export function hapticLight() {
  runHaptic(() =>
    void HapticsModule.impactAsync(HapticsModule.ImpactFeedbackStyle.Light),
  );
}

/** Medium haptic — confirmations. */
export function hapticMedium() {
  runHaptic(() =>
    void HapticsModule.impactAsync(HapticsModule.ImpactFeedbackStyle.Medium),
  );
}

/** Success notification haptic — boletin saved. */
export function hapticSuccess() {
  runHaptic(() =>
    void HapticsModule.notificationAsync(HapticsModule.NotificationFeedbackType.Success),
  );
}

/** Selection-change haptic — toggles, chips. */
export function hapticSelection() {
  runHaptic(() => void HapticsModule.selectionAsync());
}

/** Error notification haptic — failed operations. */
export function hapticError() {
  runHaptic(() =>
    void HapticsModule.notificationAsync(HapticsModule.NotificationFeedbackType.Error),
  );
}
