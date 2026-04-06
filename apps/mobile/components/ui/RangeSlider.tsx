import React, { useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';

const THUMB = 24;

interface RangeSliderProps {
  label?: string;
  min: number;
  max: number;
  step?: number;
  low: number;
  high: number;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
  formatValue?: (v: number) => string;
}

export function RangeSlider({
  label,
  min,
  max,
  step = 0.01,
  low,
  high,
  onLowChange,
  onHighChange,
  formatValue,
}: RangeSliderProps) {
  const { colors } = useTheme();
  const fmt = formatValue ?? ((v: number) => v.toFixed(2));

  const trackW = useSharedValue(0);
  const lowP = useSharedValue((low - min) / (max - min));
  const highP = useSharedValue((high - min) / (max - min));
  const lowStart = useSharedValue(0);
  const highStart = useSharedValue(0);

  // Sync shared values when controlled props change (e.g. filter reset).
  // Must NOT use withTiming here: during a drag, onLowChange fires → parent updates low prop →
  // useEffect fires → withTiming would fight the gesture and cause visible stepping.
  useEffect(() => {
    lowP.value = Math.max(0, Math.min(1, (low - min) / (max - min)));
  }, [low, min, max]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    highP.value = Math.max(0, Math.min(1, (high - min) / (max - min)));
  }, [high, min, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const lowGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onBegin(() => {
      lowStart.value = lowP.value;
    })
    .onUpdate((e) => {
      const tw = trackW.value;
      if (!tw) return;
      // Only update the visual position — no JS thread calls during drag
      lowP.value = Math.max(0, Math.min(highP.value - 0.02, lowStart.value + e.translationX / tw));
    })
    .onEnd(() => {
      // Snap to grid and notify parent once on release
      const raw = min + lowP.value * (max - min);
      const snapped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, snapped));
      lowP.value = (clamped - min) / (max - min);
      runOnJS(onLowChange)(clamped);
    });

  const highGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onBegin(() => {
      highStart.value = highP.value;
    })
    .onUpdate((e) => {
      const tw = trackW.value;
      if (!tw) return;
      // Only update the visual position — no JS thread calls during drag
      highP.value = Math.max(lowP.value + 0.02, Math.min(1, highStart.value + e.translationX / tw));
    })
    .onEnd(() => {
      // Snap to grid and notify parent once on release
      const raw = min + highP.value * (max - min);
      const snapped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, snapped));
      highP.value = (clamped - min) / (max - min);
      runOnJS(onHighChange)(clamped);
    });

  const lowThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lowP.value * trackW.value - THUMB / 2 }],
  }));

  const highThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highP.value * trackW.value - THUMB / 2 }],
  }));

  const activeStyle = useAnimatedStyle(() => ({
    left: lowP.value * trackW.value,
    right: (1 - highP.value) * trackW.value,
  }));

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}

      <View
        onLayout={(e) => {
          trackW.value = e.nativeEvent.layout.width;
        }}
        style={styles.trackOuter}
      >
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.active, { backgroundColor: colors.primary }, activeStyle]} />
        </View>

        <Animated.View style={[styles.thumbWrap, lowThumbStyle]}>
          <GestureDetector gesture={lowGesture}>
            <View
              style={[styles.thumb, { backgroundColor: colors.primary, borderColor: colors.background }]}
            />
          </GestureDetector>
        </Animated.View>

        <Animated.View style={[styles.thumbWrap, highThumbStyle]}>
          <GestureDetector gesture={highGesture}>
            <View
              style={[styles.thumb, { backgroundColor: colors.primary, borderColor: colors.background }]}
            />
          </GestureDetector>
        </Animated.View>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          defaultValue={fmt(low)}
          keyboardType="decimal-pad"
          onEndEditing={(e) => {
            const n = parseFloat(e.nativeEvent.text.replace(',', '.'));
            if (!isNaN(n) && n >= min && n < high) {
              const v = Math.max(min, Math.min(high - step, n));
              onLowChange(v);
              lowP.value = withTiming((v - min) / (max - min), { duration: 150 });
            }
          }}
          style={[
            styles.input,
            { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
          ]}
        />
        <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
        <TextInput
          defaultValue={fmt(high)}
          keyboardType="decimal-pad"
          onEndEditing={(e) => {
            const n = parseFloat(e.nativeEvent.text.replace(',', '.'));
            if (!isNaN(n) && n > low && n <= max) {
              const v = Math.min(max, Math.max(low + step, n));
              onHighChange(v);
              highP.value = withTiming((v - min) / (max - min), { duration: 150 });
            }
          }}
          style={[
            styles.input,
            { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  trackOuter: {
    height: THUMB,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    borderRadius: 4,
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  active: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    borderRadius: 4,
  },
  thumbWrap: {
    height: THUMB,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: THUMB,
  },
  thumb: {
    borderRadius: THUMB / 2,
    borderWidth: 3,
    height: THUMB,
    width: THUMB,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
  },
  dash: {
    borderRadius: 1,
    height: 2,
    width: 10,
  },
});
