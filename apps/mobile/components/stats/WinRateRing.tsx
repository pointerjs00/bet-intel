import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pie, PolarChart } from 'victory-native';
import { InfoButton } from '../ui/InfoButton';
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
export const WinRateRing = React.memo(function WinRateRing({ winRate, onInfoPress }: WinRateRingProps) {
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
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre a taxa de vitória" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Taxa de Vitória</Text>
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
});

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
    gap: 8,
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