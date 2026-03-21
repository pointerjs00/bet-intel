import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsTimelinePoint } from '@betintel/shared';
import { Area, CartesianChart, Line } from 'victory-native';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

interface PnLChartProps {
  data: StatsTimelinePoint[];
}

interface TimelineDatum extends Record<string, number> {
  index: number;
  profitLoss: number;
}

/** Area chart for period P&L trend. */
export function PnLChart({ data }: PnLChartProps) {
  const { colors } = useTheme();

  const chartData = useMemo<TimelineDatum[]>(() => {
    if (data.length === 0) {
      return [{ index: 0, profitLoss: 0 }];
    }

    return data.map((item, index) => ({
      index,
      profitLoss: item.profitLoss,
    }));
  }, [data]);

  const maxValue = useMemo(
    () => Math.max(...chartData.map((item) => Math.abs(item.profitLoss)), 0),
    [chartData],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Timeline P&amp;L</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Amplitude: {formatCurrency(maxValue)}</Text>
      </View>

      <View style={styles.chartWrap}>
        <CartesianChart<TimelineDatum, 'index', 'profitLoss'>
          data={chartData}
          xKey="index"
          yKeys={["profitLoss"]}
        >
          {({ points, chartBounds }) => (
            <>
              <Area
                color="rgba(0, 168, 67, 0.18)"
                points={points.profitLoss}
                y0={chartBounds.bottom}
              />
              <Line color={colors.primary} points={points.profitLoss} strokeWidth={3} />
            </>
          )}
        </CartesianChart>
      </View>

      <View style={styles.labelsRow}>
        {data.slice(0, 6).map((item) => (
          <Text key={item.key} numberOfLines={1} style={[styles.axisLabel, { color: colors.textSecondary }]}>
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartWrap: {
    height: 190,
    overflow: 'hidden',
  },
  labelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  axisLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});