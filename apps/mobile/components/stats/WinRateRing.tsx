import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pie, PolarChart } from 'victory-native';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

interface WinRateRingProps {
  winRate: number;
  onInfoPress?: () => void;
}

interface RingDatum extends Record<string, string | number> {
  label: string;
  value: number;
  color: string;
}

/** Donut chart for the current win rate. */
export function WinRateRing({ winRate, onInfoPress }: WinRateRingProps) {
  const { colors } = useTheme();

  const data = useMemo<RingDatum[]>(() => {
    const clamped = Math.max(0, Math.min(winRate, 100));
    return [
      { label: 'Vitórias', value: clamped, color: colors.primary },
      { label: 'Restante', value: Math.max(0, 100 - clamped), color: colors.surfaceRaised },
    ];
  }, [colors.primary, colors.surfaceRaised, winRate]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Taxa de Vitória</Text>
        {onInfoPress ? (
          <Pressable hitSlop={8} onPress={onInfoPress}>
            <Ionicons color={colors.textMuted} name="information-circle-outline" size={18} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chartWrap}>
        <PolarChart<RingDatum, 'label', 'value', 'color'>
          colorKey="color"
          data={data}
          labelKey="label"
          valueKey="value"
          containerStyle={styles.chart}
        >
          <Pie.Chart innerRadius="72%">{() => <Pie.Slice />}</Pie.Chart>
        </PolarChart>
        <View pointerEvents="none" style={styles.centerLabel}>
          <Text style={[styles.rateValue, { color: colors.textPrimary }]}>{formatPercentage(winRate)}</Text>
          <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>resolvido</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  chartWrap: {
    alignItems: 'center',
    height: 190,
    justifyContent: 'center',
  },
  chart: {
    height: 180,
    width: 180,
  },
  centerLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  rateValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  rateLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});