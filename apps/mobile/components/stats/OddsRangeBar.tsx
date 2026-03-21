import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsByOddsRangeRow } from '@betintel/shared';
import { Bar, CartesianChart } from 'victory-native';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

interface OddsRangeBarProps {
  rows: StatsByOddsRangeRow[];
}

interface OddsRangeDatum extends Record<string, number> {
  index: number;
  positive: number;
  negative: number;
}

/** Bar chart for ROI by odds range. */
export function OddsRangeBar({ rows }: OddsRangeBarProps) {
  const { colors } = useTheme();

  const chartData = useMemo<OddsRangeDatum[]>(() => {
    if (rows.length === 0) {
      return [{ index: 0, positive: 0, negative: 0 }];
    }

    return rows.map((row, index) => ({
      index,
      positive: Math.max(row.roi, 0),
      negative: Math.min(row.roi, 0),
    }));
  }, [rows]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>ROI por Range de Odds</Text>

      <View style={styles.chartWrap}>
        <CartesianChart<OddsRangeDatum, 'index', 'positive' | 'negative'>
          data={chartData}
          xKey="index"
          yKeys={["positive", "negative"]}
        >
          {({ points, chartBounds }) => (
            <>
              <Bar chartBounds={chartBounds} color={colors.primary} points={points.positive} />
              <Bar chartBounds={chartBounds} color={colors.danger} points={points.negative} />
            </>
          )}
        </CartesianChart>
      </View>

      <View style={styles.legendList}>
        {rows.map((row) => (
          <View key={row.key} style={styles.legendRow}>
            <Text style={[styles.legendLabel, { color: colors.textPrimary }]}>{row.label}</Text>
            <Text style={[styles.legendValue, { color: row.roi >= 0 ? colors.primary : colors.danger }]}>
              {formatPercentage(row.roi)}
            </Text>
          </View>
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
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  chartWrap: {
    height: 200,
    overflow: 'hidden',
  },
  legendList: {
    gap: 8,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  legendValue: {
    fontSize: 13,
    fontWeight: '800',
  },
});