import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Bar, CartesianChart, Line } from 'victory-native';
import type { PersonalStats, StatsTimelinePoint } from '@betintel/shared';

import { Card } from '../ui/Card';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds, formatPercentage } from '../../utils/formatters';
import type {
  BreakdownMetric,
  CustomMetricDef,
  MetricFormat,
} from '../../types/customMetric';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(value: number, fmt: MetricFormat): string {
  switch (fmt) {
    case 'currency':
      return formatCurrency(value);
    case 'percentage':
      return formatPercentage(value);
    case 'odds':
      return formatOdds(value);
    default:
      return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '–';
  }
}

function getBreakdownMetricValue(row: Record<string, unknown>, metric: BreakdownMetric): number {
  const v = row[metric];
  return typeof v === 'number' ? v : 0;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface CustomMetricCardProps {
  metric: CustomMetricDef;
  stats: PersonalStats;
  timeline?: StatsTimelinePoint[];
  onEdit?: () => void;
  onLongPress?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const CustomMetricCard = React.memo(function CustomMetricCard({
  metric,
  stats,
  timeline,
  onEdit,
  onLongPress,
}: CustomMetricCardProps) {
  const { colors } = useTheme();

  const content = useMemo(() => {
    switch (metric.dataSource.type) {
      case 'summary':
        return renderSummary(metric, stats, colors);
      case 'breakdown':
        return renderBreakdown(metric, stats, colors);
      case 'timeline':
        return renderTimeline(metric, stats, timeline, colors);
      default:
        return null;
    }
  }, [metric, stats, timeline, colors]);

  return (
    <Card onPress={onEdit}>
      <Pressable onLongPress={onLongPress} style={styles.cardInner}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${metric.color}22` }]}>
            <Ionicons color={metric.color} name={metric.icon} size={18} />
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {metric.name}
          </Text>
          {onEdit && (
            <Pressable hitSlop={12} onPress={onEdit}>
              <Ionicons color={colors.textMuted} name="create-outline" size={16} />
            </Pressable>
          )}
        </View>
        {content}
      </Pressable>
    </Card>
  );
});

// ── Summary value renderer ──────────────────────────────────────────────────

function renderSummary(
  metric: CustomMetricDef,
  stats: PersonalStats,
  colors: Record<string, string>,
) {
  if (metric.dataSource.type !== 'summary') return null;
  const raw = (stats.summary as Record<string, unknown>)[metric.dataSource.field];
  const value = typeof raw === 'number' ? raw : 0;
  const formatted = formatValue(value, metric.format);

  if (metric.visualization === 'progress-ring') {
    // Simple progress ring for percentage values (0-100 range)
    const pct = Math.max(0, Math.min(100, value));
    const radius = 36;
    const stroke = 7;
    const circumference = 2 * Math.PI * (radius - stroke / 2);
    const progress = (pct / 100) * circumference;

    return (
      <View style={styles.ringContainer}>
        <View style={styles.ringWrap}>
          {/* Background ring */}
          <View
            style={[
              styles.ringOuter,
              {
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
                borderWidth: stroke,
                borderColor: `${metric.color}22`,
              },
            ]}
          />
          {/* Just show the number in the center */}
          <Text style={[styles.ringValue, { color: metric.color }]}>{formatted}</Text>
        </View>
      </View>
    );
  }

  // Default: big number
  const valueColor = metric.format === 'currency'
    ? value >= 0 ? colors.primary : colors.danger
    : metric.color;

  return (
    <View style={styles.numberContainer}>
      <Text style={[styles.bigNumber, { color: valueColor }]}>{formatted}</Text>
    </View>
  );
}

// ── Breakdown renderer ──────────────────────────────────────────────────────

interface BarDatum extends Record<string, number> {
  x: number;
  value: number;
}

function renderBreakdown(
  metric: CustomMetricDef,
  stats: PersonalStats,
  colors: Record<string, string>,
) {
  if (metric.dataSource.type !== 'breakdown') return null;
  const { source, topN } = metric.dataSource;
  const rawRows = (stats as Record<string, unknown>)[source];
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textMuted }]}>Sem dados</Text>;
  }

  const metricKey = metric.dataSource.metric;
  const sorted = [...rawRows]
    .sort((a, b) => getBreakdownMetricValue(b, metricKey) - getBreakdownMetricValue(a, metricKey))
    .slice(0, topN);

  if (metric.visualization === 'bar-chart') {
    const barData: BarDatum[] = sorted.map((row, i) => ({
      x: i,
      value: getBreakdownMetricValue(row, metricKey),
    }));

    if (barData.length < 2) {
      // Add a dummy point so CartesianChart doesn't crash
      barData.push({ x: 1, value: 0 });
    }

    return (
      <View style={styles.breakdownChart}>
        <View style={styles.miniChart}>
          <CartesianChart<BarDatum, 'x', 'value'>
            data={barData}
            xKey="x"
            yKeys={['value']}
          >
            {({ points, chartBounds }) => (
              <Bar
                color={metric.color}
                points={points.value}
                chartBounds={chartBounds}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
              />
            )}
          </CartesianChart>
        </View>
        <View style={styles.barLabels}>
          {sorted.map((row, i) => (
            <View key={i} style={styles.barLabelRow}>
              <View style={[styles.barLabelDot, { backgroundColor: metric.color }]} />
              <Text style={[styles.barLabelText, { color: colors.textPrimary }]} numberOfLines={1}>
                {(row as Record<string, unknown>).label as string ?? `#${i + 1}`}
              </Text>
              <Text style={[styles.barLabelValue, { color: colors.textSecondary }]}>
                {formatValue(getBreakdownMetricValue(row, metricKey), metric.format)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Default: show as a mini table (top-N list)
  const topRow = sorted[0];
  const topValue = topRow ? getBreakdownMetricValue(topRow, metricKey) : 0;
  const topLabel = topRow ? ((topRow as Record<string, unknown>).label as string ?? '–') : '–';

  return (
    <View style={styles.numberContainer}>
      <Text style={[styles.bigNumber, { color: metric.color }]}>
        {formatValue(topValue, metric.format)}
      </Text>
      <Text style={[styles.topLabel, { color: colors.textSecondary }]}>{topLabel}</Text>
    </View>
  );
}

// ── Timeline renderer ───────────────────────────────────────────────────────

interface TimelineBarDatum extends Record<string, number> {
  x: number;
  value: number;
}

function renderTimeline(
  metric: CustomMetricDef,
  stats: PersonalStats,
  timeline: StatsTimelinePoint[] | undefined,
  colors: Record<string, string>,
) {
  if (metric.dataSource.type !== 'timeline') return null;
  const data = timeline ?? stats.timeline ?? [];
  if (data.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textMuted }]}>Sem dados</Text>;
  }

  const { cumulative } = metric.dataSource;
  const metricKey = metric.dataSource.metric;

  let runningTotal = 0;
  const chartData: TimelineBarDatum[] = data.map((point, i) => {
    const raw = (point as Record<string, unknown>)[metricKey];
    const val = typeof raw === 'number' ? raw : 0;
    if (cumulative) {
      runningTotal += val;
      return { x: i, value: runningTotal };
    }
    return { x: i, value: val };
  });

  // Ensure at least 2 points
  if (chartData.length === 1) {
    chartData.unshift({ x: -1, value: 0 });
  }

  const lastValue = chartData[chartData.length - 1]?.value ?? 0;

  return (
    <View style={styles.timelineContainer}>
      <Text style={[styles.timelineValue, { color: metric.color }]}>
        {formatValue(lastValue, metric.format)}
      </Text>
      <View style={styles.miniChart}>
        <CartesianChart<TimelineBarDatum, 'x', 'value'>
          data={chartData}
          xKey="x"
          yKeys={['value']}
        >
          {({ points, chartBounds }) =>
            metric.visualization === 'bar-chart' ? (
              <Bar
                color={metric.color}
                points={points.value}
                chartBounds={chartBounds}
                roundedCorners={{ topLeft: 3, topRight: 3 }}
              />
            ) : (
              <Line color={metric.color} points={points.value} strokeWidth={2} />
            )
          }
        </CartesianChart>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardInner: { gap: 10 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  name: { flex: 1, fontSize: 14, fontWeight: '800' },
  // Number viz
  numberContainer: { gap: 2 },
  bigNumber: { fontSize: 22, fontWeight: '900' },
  topLabel: { fontSize: 12, fontWeight: '600' },
  // Ring viz
  ringContainer: { alignItems: 'center', paddingVertical: 8 },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringOuter: { position: 'absolute' },
  ringValue: { fontSize: 18, fontWeight: '900' },
  // Breakdown chart
  breakdownChart: { gap: 10 },
  barLabels: { gap: 6 },
  barLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  barLabelDot: { borderRadius: 3, height: 6, width: 6 },
  barLabelText: { flex: 1, fontSize: 13, fontWeight: '600' },
  barLabelValue: { fontSize: 13, fontWeight: '700' },
  // Timeline
  timelineContainer: { gap: 6 },
  timelineValue: { fontSize: 18, fontWeight: '900' },
  // Shared
  miniChart: { height: 100 },
  emptyText: { fontSize: 13, fontWeight: '600', paddingVertical: 8 },
});
