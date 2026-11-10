import React, { useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../../ui/Pressable';
import { useTheme } from '../../../theme/useTheme';
import { formatCurrency } from '../../../utils/formatters';
import { MiniToggle } from './StatCard';

export interface BarRow {
  key: string;
  label: string;
  totalBets: number;
  profitLoss: number;
  roi: number;
  winRate: number;
  settledStake: number;
}

export type BarMode = 'profit' | 'roi';

interface DivergingBarsProps<R extends BarRow> {
  rows: R[];
  /** "seleções" or "boletins": the unit counted by totalBets. */
  unit?: string;
  /** Rows with fewer bets are merged into "Outros" so tiny samples don't dominate. */
  minBets?: number;
  maxRows?: number;
  /** Keep rows in the given order (weekday, leg count) instead of sorting by value. */
  keepOrder?: boolean;
  renderLeft?: (row: R) => React.ReactNode;
  onRowPress?: (row: R) => void;
  /** Rendered in the card header next to the title (the mode toggle goes here). */
  showToggle?: boolean;
  mode?: BarMode;
  onModeChange?: (m: BarMode) => void;
}

const signed = (v: number, unit: '€' | '%') =>
  unit === '€' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}` : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}%`;

/** The Lucro / Retorno toggle, for card headers. */
export function BarModeToggle({ mode, onChange }: { mode: BarMode; onChange: (m: BarMode) => void }) {
  return <MiniToggle onChange={onChange} options={[{ value: 'profit', label: 'Lucro' }, { value: 'roi', label: 'Retorno' }]} value={mode} />;
}

function Bar({ fraction, positive, faded, delay }: { fraction: number; positive: boolean; faded: boolean; delay: number }) {
  const { colors } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(delay, withTiming(fraction, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [fraction, delay, p]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(p.value * 100, fraction > 0 ? 1.5 : 0)}%` }));
  return (
    <View style={styles.track}>
      <View style={[styles.half, styles.halfLeft, { borderRightColor: colors.border }]}>
        {!positive ? <Animated.View style={[styles.bar, styles.barLeft, style, { backgroundColor: colors.negative, opacity: faded ? 0.4 : 1 }]} /> : null}
      </View>
      <View style={styles.half}>
        {positive ? <Animated.View style={[styles.bar, styles.barRight, style, { backgroundColor: colors.positive, opacity: faded ? 0.4 : 1 }]} /> : null}
      </View>
    </View>
  );
}

/**
 * Diverging bar list replacing the old Bets/Win/ROI tables: one row per group, a bar growing
 * from a centre zero line (profit right, loss left), the value in € or %, and a plain-language
 * line under it. Small samples are merged into "Outros" and drawn faded.
 */
export function DivergingBars<R extends BarRow>({
  rows,
  unit = 'seleções',
  minBets = 10,
  maxRows = 6,
  keepOrder = false,
  renderLeft,
  onRowPress,
  mode: modeProp,
}: DivergingBarsProps<R>) {
  const { colors } = useTheme();
  const mode = modeProp ?? 'profit';
  const [expanded, setExpanded] = useState(false);

  const { main, others } = useMemo(() => {
    const big = rows.filter((r) => r.totalBets >= minBets);
    const small = rows.filter((r) => r.totalBets < minBets);
    const sorted = keepOrder ? big : [...big].sort((a, b) => (mode === 'profit' ? b.profitLoss - a.profitLoss : b.roi - a.roi));
    const agg = small.length
      ? small.reduce(
          (acc, r) => ({ bets: acc.bets + r.totalBets, profit: acc.profit + r.profitLoss, stake: acc.stake + r.settledStake, labels: [...acc.labels, r.label] }),
          { bets: 0, profit: 0, stake: 0, labels: [] as string[] },
        )
      : null;
    return { main: sorted, others: agg };
  }, [rows, minBets, keepOrder, mode]);

  const visible = expanded ? main : main.slice(0, maxRows);
  const valueOf = (profit: number, roi: number) => (mode === 'profit' ? profit : roi);
  const othersRoi = others && others.stake > 0 ? (others.profit / others.stake) * 100 : 0;
  const max = Math.max(
    1,
    ...visible.map((r) => Math.abs(valueOf(r.profitLoss, r.roi))),
    others ? Math.abs(valueOf(others.profit, othersRoi)) : 0,
  );

  if (rows.length === 0) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>Ainda sem dados suficientes.</Text>;
  }

  return (
    <View style={styles.list}>
      {visible.map((r, i) => {
        const v = valueOf(r.profitLoss, r.roi);
        return (
          <Pressable disabled={!onRowPress} feedback={onRowPress ? 'press' : 'none'} key={r.key} onPress={() => onRowPress?.(r)} style={styles.row}>
            <View style={styles.rowHead}>
              {renderLeft ? renderLeft(r) : null}
              <Text numberOfLines={1} style={[styles.label, { color: colors.textPrimary }]}>{r.label}</Text>
              <Text style={[styles.value, { color: v > 0 ? colors.positive : v < 0 ? colors.negative : colors.textSecondary }]}>
                {signed(v, mode === 'profit' ? '€' : '%')}
              </Text>
            </View>
            <Bar delay={i * 60} faded={false} fraction={Math.abs(v) / max} positive={v >= 0} />
            <Text numberOfLines={1} style={[styles.sub, { color: colors.textMuted }]}>
              {r.totalBets} {unit} · {Math.round(r.winRate)}% certas · {mode === 'profit' ? `retorno ${signed(r.roi, '%')}` : `lucro ${signed(r.profitLoss, '€')}`}
            </Text>
          </Pressable>
        );
      })}

      {others && others.bets > 0 && (expanded || main.length <= maxRows) ? (
        <View style={styles.row}>
          <View style={styles.rowHead}>
            <Text numberOfLines={1} style={[styles.label, { color: colors.textSecondary }]}>Outros</Text>
            <Text style={[styles.value, { color: others.profit >= 0 ? colors.positive : colors.negative, opacity: 0.7 }]}>
              {signed(valueOf(others.profit, othersRoi), mode === 'profit' ? '€' : '%')}
            </Text>
          </View>
          <Bar delay={visible.length * 60} faded fraction={Math.abs(valueOf(others.profit, othersRoi)) / max} positive={others.profit >= 0} />
          <Text numberOfLines={1} style={[styles.sub, { color: colors.textMuted }]}>
            {others.labels.slice(0, 3).join(', ')}{others.labels.length > 3 ? '…' : ''} · {others.bets} {unit} · poucos dados
          </Text>
        </View>
      ) : null}

      {main.length > maxRows ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded((v) => !v); }}
          style={[styles.more, { backgroundColor: colors.background }]}
        >
          <Text style={[styles.moreText, { color: colors.textSecondary }]}>{expanded ? 'Mostrar menos' : `Ver todos (${main.length + (others ? 1 : 0)})`}</Text>
          <Ionicons color={colors.textSecondary} name={expanded ? 'chevron-up' : 'chevron-down'} size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  row: { gap: 6 },
  rowHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  value: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  track: { flexDirection: 'row', height: 10 },
  half: { flex: 1, flexDirection: 'row' },
  halfLeft: { borderRightWidth: 2, justifyContent: 'flex-end' },
  bar: { height: 10 },
  barLeft: { borderBottomLeftRadius: 6, borderTopLeftRadius: 6 },
  barRight: { borderBottomRightRadius: 6, borderTopRightRadius: 6 },
  sub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  empty: { fontSize: 13, paddingVertical: 8 },
  more: { alignItems: 'center', alignSelf: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  moreText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
