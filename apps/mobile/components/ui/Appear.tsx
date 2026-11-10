import React, { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Entry animation for cards and rows: fade in while rising 8 px, staggered by `index`
 * (40 ms each, capped so long lists don't wait).
 */
export function Appear({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    // Only the first screenful animates in; rows mounted while scrolling appear at once, so
    // fast scrolling never queues entering animations.
    <Animated.View
      entering={index < 8 ? FadeInDown.duration(260).delay(index * 35).withInitialValues({ transform: [{ translateY: 8 }] }) : undefined}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Pulsing dot for live matches. */
export function LiveDot({ color, size = 8 }: { color: string; size?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false);
  }, [t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.value), transform: [{ scale: 1 + t.value * 1.6 }] }));
  return (
    <Animated.View style={{ height: size, width: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: size / 2 }, ring]} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: size / 2 }]} />
    </Animated.View>
  );
}
