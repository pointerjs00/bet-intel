import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsCalibrationPoint } from '@betintel/shared';
import { CartesianChart, Line } from 'victory-native';
import { Circle, DashPathEffect, Line as SkiaLine } from '@shopify/react-native-skia';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

interface CalibrationChartProps {
  data: StatsCalibrationPoint[];
  onInfoPress?: () => void;
}

interface CalibrationDatum extends Record<string, number> {
  x: number;
  actual: number;
}

export const CalibrationChart = React.memo(function CalibrationChart({ data, onInfoPress }: CalibrationChartProps) {
  const { colors } = useTheme();

  const chartData = useMemo<CalibrationDatum[]>(
    () =>
      data
        .filter((p) => p.sampleSize >= 3)
        .map((p) => ({
          x: p.impliedProbability * 100,
          actual: p.actualWinRate * 100,
        })),
    [data],
  );

  if (chartData.length < 2) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre calibração" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Calibração</Text>
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Probabilidade implícita vs taxa de acerto real
      </Text>

      <View style={styles.chartWrap}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['actual']}
          domainPadding={{ top: 10, bottom: 10, left: 5, right: 5 }}
          axisOptions={{
            font: null,
            lineColor: colors.border,
            labelColor: colors.textSecondary,
          }}
        >
          {({ points, chartBounds }) => (
            <>
              {/* Diagonal reference line (perfect calibration) */}
              <SkiaLine
                p1={{ x: chartBounds.left, y: chartBounds.bottom }}
                p2={{ x: chartBounds.right, y: chartBounds.top }}
                color={colors.textMuted}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[6, 4]} />
              </SkiaLine>

              {/* Actual calibration line */}
              <Line
                points={points.actual}
                color={colors.primary}
                strokeWidth={2.5}
                curveType="natural"
              />

              {/* Data point dots */}
              {points.actual.map((pt, i) =>
                pt ? (
                  <Circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={4}
                    color={colors.primary}
                  />
                ) : null,
              )}
            </>
          )}
        </CartesianChart>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Taxa real</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDash, { borderColor: colors.textMuted }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Calibração perfeita</Text>
        </View>
      </View>

      {/* Data summary */}
      <View style={styles.summaryRow}>
        {data.filter((p) => p.sampleSize >= 3).map((p) => (
          <View key={p.label} style={[styles.summaryCell, { borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{p.label}</Text>
            <Text style={[styles.summaryValue, { color: p.actualWinRate > p.impliedProbability ? colors.primary : colors.danger }]}>
              {formatPercentage(p.actualWinRate * 100)}
            </Text>
            <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>{p.sampleSize} apostas</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
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
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartWrap: {
    height: 220,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  legendDash: {
    borderTopWidth: 2,
    borderStyle: 'dashed',
    width: 16,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCell: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  summaryMeta: {
    fontSize: 9,
    fontWeight: '600',
  },
});
