import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';
import { hapticError, hapticLight } from '../../utils/haptics';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  /** Optional inline action, e.g. { label: 'Anular', onPress: undo }. */
  action?: { label: string; onPress: () => void };
  /** Override the auto-dismiss delay (ms). */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Reading time: short confirmations go quickly, long errors stay longer. */
function autoDuration(t: ToastState): number {
  if (t.duration) return t.duration;
  const base = 2200 + t.message.length * 45;
  const min = t.type === 'error' || t.type === 'warning' ? 4000 : 2400;
  return Math.min(Math.max(base, min), t.action ? 8000 : 7000);
}

/**
 * Modern toast: a compact floating card that springs down from under the status bar, can be
 * swiped up or tapped away, sizes its duration to the message, and swaps in place when a new
 * one arrives (the same message just restarts its timer).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    if (type === 'error' || type === 'warning') hapticError();
    AccessibilityInfo.announceForAccessibility(message);
    idRef.current += 1;
    setToast({ id: idRef.current, message, type, ...options });
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} onDone={(id) => setToast((t) => (t?.id === id ? null : t))} toast={toast} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: ToastState; onDone: (id: number) => void }) {
  const { colors, isDark } = useTheme();
  const { top } = useSafeAreaInsets();
  const y = useSharedValue(-140);
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);
  const drag = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accent = accentColor(toast.type, colors);

  const finish = useCallback(() => onDone(toast.id), [onDone, toast.id]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    y.value = withTiming(-140, { duration: 220, easing: Easing.in(Easing.cubic) });
    scale.value = withTiming(0.94, { duration: 220 });
    opacity.value = withTiming(0, { duration: 200 }, (done) => { if (done) runOnJS(finish)(); });
  }, [finish, opacity, scale, y]);

  useEffect(() => {
    y.value = withSpring(0, { damping: 18, mass: 0.8, stiffness: 220 });
    scale.value = withSpring(1, { damping: 16, stiffness: 240 });
    opacity.value = withTiming(1, { duration: 160 });
    timer.current = setTimeout(hide, autoDuration(toast));
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipe up to dismiss; a downward pull only stretches a little and snaps back.
  const pan = Gesture.Pan()
    .onUpdate((e) => { drag.value = e.translationY < 0 ? e.translationY : e.translationY * 0.15; })
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -500) runOnJS(hide)();
      else drag.value = withSpring(0, { damping: 18, stiffness: 260 });
    });
  const tap = Gesture.Tap().onEnd(() => { runOnJS(hide)(); });
  const gesture = Gesture.Exclusive(pan, tap);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value + drag.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.card,
          style,
          {
            backgroundColor: isDark ? colors.surfaceRaised : colors.surface,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            top: top + 8,
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: `${accent}22` }]}>
          <Ionicons color={accent} name={iconName(toast.type)} size={18} />
        </View>
        <Text numberOfLines={4} style={[styles.text, { color: colors.textPrimary }]}>{toast.message}</Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => { hapticLight(); toast.action?.onPress(); hide(); }}
            style={({ pressed }) => [styles.action, { backgroundColor: pressed ? `${accent}33` : `${accent}1F` }]}
          >
            <Text style={[styles.actionText, { color: accent }]}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}

function accentColor(type: ToastType, colors: ReturnType<typeof useTheme>['colors']) {
  switch (type) {
    case 'success': return colors.positive;
    case 'error': return colors.negative;
    case 'warning': return colors.warning;
    default: return colors.info;
  }
}

function iconName(type: ToastType): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'success': return 'checkmark-circle';
    case 'error': return 'close-circle';
    case 'warning': return 'warning';
    default: return 'information-circle';
  }
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    flexDirection: 'row',
    gap: 10,
    left: 16,
    maxWidth: 560,
    minHeight: 52,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 10,
    position: 'absolute',
    right: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    zIndex: 9999,
  },
  icon: { alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
  text: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  action: { borderRadius: 10, marginLeft: 2, paddingHorizontal: 10, paddingVertical: 6 },
  actionText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});
