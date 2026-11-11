import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../../theme/useTheme';

export interface ColumnItem {
  key: string;
  label: string;
  value: number;
  /** Small line under the label, e.g. the number of bets. */
  sub?: string;
  /** Faded: too few bets to trust. */
  few?: boolean;
}

interface ColumnChartProps {
  items: ColumnItem[];
  format: (v: number) => string;
  /** Height of each half (above / below zero). */
  half?: number;
}

function Column({ item, h, capped, format, half, index }: { item: ColumnItem; h: number; capped: boolean; format: (v: number) => string; half: number; index: number }) {
  const { colors } = useTheme();
  const up = item.value >= 0;
  const color = up ? colors.positive : colors.negative;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(index * 55, withTiming(1, { duration: 560, easing: Easing.out(Easing.back(1.2)) }));
  }, [h, index, p]);
  const bar = useAnimatedStyle(() => ({ height: Math.max(h * p.value, 2) }));
  const label = useAnimatedStyle(() => ({ opacity: p.value }));

  return (
    <View style={styles.col}>
      <View style={[styles.halfBox, { height: half }]}>
        {up ? (
          <>
            <Animated.Text style={[styles.value, label, { color }]}>{capped ? '↑ ' : ''}{format(item.value)}</Animated.Text>
            <Animated.View style={[styles.bar, styles.barUp, bar, { backgroundColor: color, opacity: item.few ? 0.4 : 1 }]} />
          </>
        ) : null}
      </View>
      <View style={[styles.zero, { backgroundColor: colors.border }]} />
      <View style={[styles.halfBox, styles.halfDown, { height: half * 0.6 }]}>
        {!up ? (
          <>
            <Animated.View style={[styles.bar, styles.barDown, bar, { backgroundColor: color, opacity: item.few ? 0.4 : 1 }]} />
            <Animated.Text style={[styles.value, label, { color }]}>{capped ? '↓ ' : ''}{format(item.value)}</Animated.Text>
          </>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: item.few ? colors.textMuted : colors.textSecondary }]}>{item.label}</Text>
      {item.sub ? <Text numberOfLines={1} style={[styles.sub, { color: colors.textMuted }]}>{item.sub}</Text> : null}
    </View>
  );
}

/**
 * Vertical columns around a zero line (gains up, losses down) that grow in on mount.
 * One runaway value (e.g. +240% from a handful of bets) is capped so the rest stay readable.
 */
export function ColumnChart({ items, format, half = 110 }: ColumnChartProps) {
  const abs = items.map((i) => Math.abs(i.value)).sort((a, b) => b - a);
  const top = abs[0] ?? 0;
  const second = abs[1] ?? top;
  // Cap the tallest column when it is more than twice the next one.
  const cap = top > second * 2 && second > 0 ? second * 1.5 : top;
  const scale = cap > 0 ? (half - 22) / cap : 0;
  const downHalf = half * 0.6;

  return (
    <View style={styles.row}>
      {items.map((it, i) => {
        const raw = Math.abs(it.value) * scale;
        const limit = it.value >= 0 ? half - 22 : downHalf - 20;
        return (
          <Column capped={raw > limit + 0.5} format={format} h={Math.min(raw, limit)} half={half} index={i} item={it} key={it.key} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  col: { alignItems: 'stretch', flex: 1 },
  halfBox: { alignItems: 'center', justifyContent: 'flex-end' },
  halfDown: { justifyContent: 'flex-start' },
  zero: { height: 2 },
  bar: { alignSelf: 'stretch', marginHorizontal: 3 },
  barUp: { borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  barDown: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  value: { fontFamily: 'Inter_700Bold', fontSize: 11, marginVertical: 3 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 6, textAlign: 'center' },
  sub: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 1, textAlign: 'center' },
});
