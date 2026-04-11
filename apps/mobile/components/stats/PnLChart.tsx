import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsTimelinePoint } from '@betintel/shared';
import { Area, CartesianChart, Line } from 'victory-native';
import { DashPathEffect, Line as SkiaLine } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

export type TimelineGranularity = 'daily' | 'weekly' | 'monthly';

const GRANULARITY_OPTIONS: Array<{ key: TimelineGranularity; label: string }> = [
  { key: 'daily', label: 'Diário' },
  { key: 'weekly', label: 'Semanal' },
  { key: 'monthly', label: 'Mensal' },
];

// Max number of axis labels shown below the chart
const MAX_AXIS_LABELS = 5;

interface PnLChartProps {
  data: StatsTimelinePoint[];
  granularity?: TimelineGranularity;
  onGranularityChange?: (g: TimelineGranularity) => void;
  onInfoPress?: () => void;
}

// x is a Unix timestamp in seconds — Victory Native needs a numeric x
interface TimelineDatum extends Record<string, number> {
  x: number;
  profitLoss: number;
}

function toEpochSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/** Area chart for period P&L trend with optional cumulative mode. */
export const PnLChart = React.memo(function PnLChart({ data, granularity = 'weekly', onGranularityChange, onInfoPress }: PnLChartProps) {
  const { colors } = useTheme();
  const [cumulative, setCumulative] = useState(false);

  // Trim leading empty buckets so active data fills the chart width
  const visibleData = useMemo<StatsTimelinePoint[]>(() => {
    if (data.length <= 3) return data;
    const firstActive = data.findIndex((d) => d.totalStaked > 0 || d.profitLoss !== 0);
    // Keep 1 zero-bucket before the first active point for visual context
    if (firstActive > 1) return data.slice(firstActive - 1);
    return data;
  }, [data]);

  // Map real bucket timestamps → x values so Victory Native spaces data in real time
  const chartData = useMemo<TimelineDatum[]>(() => {
    let mapped: TimelineDatum[];

    if (cumulative) {
      let runningTotal = 0;
      mapped = visibleData.map((item) => {
        runningTotal += item.profitLoss;
        return { x: toEpochSeconds(item.bucketStart), profitLoss: runningTotal };
      });
    } else {
      mapped = visibleData.map((item) => ({
        x: toEpochSeconds(item.bucketStart),
        profitLoss: item.profitLoss,
      }));
    }

    // CartesianChart requires >= 2 points with a non-zero x-domain
    if (mapped.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      return [{ x: now - 86_400, profitLoss: 0 }, { x: now, profitLoss: 0 }];
    }
    if (mapped.length === 1) {
      return [{ x: mapped[0]!.x - 86_400, profitLoss: 0 }, mapped[0]!];
    }
    return mapped;
  }, [visibleData, cumulative]);

  const maxValue = useMemo(
    () => Math.max(...visibleData.map((item) => Math.abs(item.profitLoss)), 0),
    [visibleData],
  );

  // Compute Y-axis ticks: min, 0, max (3 labels)
  const yDomain = useMemo(() => {
    const values = chartData.map((d) => d.profitLoss);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    return { min, max };
  }, [chartData]);

  const yTickLabels = useMemo<string[]>(() => {
    const { min, max } = yDomain;
    if (min === 0 && max === 0) return ['€0'];
    const ticks: number[] = [];
    if (min < 0) ticks.push(min);
    ticks.push(0);
    if (max > 0) ticks.push(max);
    return ticks.map((v) => formatCurrency(v));
  }, [yDomain]);

  // Sample up to MAX_AXIS_LABELS evenly distributed labels (always include first + last)
  const axisLabels = useMemo<string[]>(() => {
    if (visibleData.length === 0) return [];
    if (visibleData.length <= MAX_AXIS_LABELS) return visibleData.map((item) => item.label);
    const step = (visibleData.length - 1) / (MAX_AXIS_LABELS - 1);
    return Array.from({ length: MAX_AXIS_LABELS }, (_, i) => {
      const idx = Math.min(Math.round(i * step), visibleData.length - 1);
      return visibleData[idx]!.label;
    });
  }, [visibleData]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {cumulative ? 'P&L Acumulado' : 'Evolução P&L'}
          </Text>
          <View style={styles.headerActions}>
            {onInfoPress ? (
              <Pressable hitSlop={8} onPress={onInfoPress}>
                <Ionicons color={colors.textMuted} name="information-circle-outline" size={18} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setCumulative((v) => !v)}
              style={[
                styles.cumulativeBtn,
                {
                  backgroundColor: cumulative ? colors.primary : colors.surfaceRaised,
                  borderColor: cumulative ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.cumulativeBtnText, { color: cumulative ? '#fff' : colors.textSecondary }]}>
                Acumulado
              </Text>
            </Pressable>
          </View>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Amplitude: {formatCurrency(maxValue)}</Text>
      </View>

      {onGranularityChange ? (
        <View style={styles.granularityRow}>
          {GRANULARITY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => onGranularityChange(opt.key)}
              style={[
                styles.granularityBtn,
                {
                  backgroundColor: granularity === opt.key ? colors.primary : colors.surfaceRaised,
                  borderColor: granularity === opt.key ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.granularityLabel,
                  { color: granularity === opt.key ? '#fff' : colors.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.chartRow}>
        {/* Y-axis labels */}
        <View style={styles.yAxisLabels}>
          {yTickLabels.map((label, i) => (
            <Text key={`y-${i}`} style={[styles.yLabel, { color: colors.textMuted }]}>{label}</Text>
          ))}
        </View>
        <View style={styles.chartWrap}>
          <CartesianChart<TimelineDatum, 'x', 'profitLoss'>
            data={chartData}
            xKey="x"
            yKeys={["profitLoss"]}
          >
            {({ points, chartBounds }) => {
              // Compute zero-line Y position via interpolation
              const yMin = yDomain.min;
              const yMax = yDomain.max;
              const range = yMax - yMin || 1;
              const zeroFraction = (yMax - 0) / range;
              const zeroY = chartBounds.top + zeroFraction * (chartBounds.bottom - chartBounds.top);

              return (
                <>
                  {/* Dashed zero reference line */}
                  <SkiaLine
                    p1={{ x: chartBounds.left, y: zeroY }}
                    p2={{ x: chartBounds.right, y: zeroY }}
                    color={colors.textMuted}
                    strokeWidth={1}
                    style="stroke"
                  >
                    <DashPathEffect intervals={[6, 4]} />
                  </SkiaLine>
                  <Area
                    color="rgba(0, 168, 67, 0.18)"
                    points={points.profitLoss}
                    y0={chartBounds.bottom}
                  />
                  <Line color={colors.primary} points={points.profitLoss} strokeWidth={3} />
                </>
              );
            }}
          </CartesianChart>
        </View>
      </View>

      {/* Evenly-distributed axis labels aligned to chart width */}
      {axisLabels.length > 0 && (
        <View style={styles.labelsRow}>
          {axisLabels.map((label, i) => (
            <Text
              key={`${label}-${i}`}
              numberOfLines={1}
              style={[styles.axisLabel, { color: colors.textSecondary }]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
});

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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
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
  granularityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  granularityBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  granularityLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  cumulativeBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cumulativeBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chartRow: {
    flexDirection: 'row',
    gap: 4,
  },
  yAxisLabels: {
    justifyContent: 'space-between',
    paddingVertical: 4,
    width: 48,
  },
  yLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
  chartWrap: {
    flex: 1,
    height: 190,
    overflow: 'hidden',
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});