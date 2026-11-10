import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Pressable } from './Pressable';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';
import { AppText } from './AppText';
import { useGlow } from './ListCard';

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

const PAD = 4;
const GAP = 2;

/** Segmented control with a sliding primary-coloured thumb (period pickers, list filters). */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors, isDark } = useTheme();
  const glow = useGlow();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const itemW = width > 0 ? (width - PAD * 2 - GAP * (options.length - 1)) / options.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(index * (itemW + GAP), { damping: 20, stiffness: 260 });
  }, [index, itemW, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  // Dark: filled neon thumb. Light: white thumb on a grey track (Clean Pro).
  const thumbColor = isDark ? colors.primary : colors.surface;
  const trackColor = isDark ? colors.surface : colors.surfaceRaised;

  return (
    <View accessibilityRole="tablist" onLayout={onLayout} style={[styles.wrap, { backgroundColor: trackColor }]}>
      {itemW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { width: itemW, backgroundColor: thumbColor }, isDark ? glow : styles.lightThumb, thumbStyle]}
        />
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => { if (!active) { hapticLight(); onChange(o.value); } }}
            style={styles.item}
          >
            <AppText
              variant={active ? 'bodyStrong' : 'body'}
              style={[styles.text, { color: active ? (isDark ? colors.onPrimary : colors.textPrimary) : colors.textSecondary }]}
              numberOfLines={1}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, flexDirection: 'row', gap: GAP, padding: PAD },
  thumb: { borderRadius: 10, bottom: PAD, left: PAD, position: 'absolute', top: PAD },
  lightThumb: { elevation: 2, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 },
  item: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 6 },
  text: { fontSize: 13 },
});
