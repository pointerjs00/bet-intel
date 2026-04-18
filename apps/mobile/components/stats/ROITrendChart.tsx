import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsROITrendPoint } from '@betintel/shared';
import { CartesianChart, Line } from 'victory-native';
import { DashPathEffect, Line as SkiaLine } from '@shopify/react-native-skia';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

interface ROITrendChartProps {
  data: StatsROITrendPoint[];
  onInfoPress?: () => void;
}

interface TrendDatum extends Record<string, number> {
  x: number;
  roi: number;
}

export const ROITrendChart = React.memo(function ROITrendChart({ data, onInfoPress }: ROITrendChartProps) {
  const { colors } = useTheme();

  const chartData = useMemo<TrendDatum[]>(
    () => data.map((p) => ({ x: p.betIndex, roi: p.roi })),
    [data],
  );

  if (chartData.length < 2) return null;

  const latestROI = chartData[chartData.length - 1]?.roi ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre tendência de ROI" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Tendência ROI</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Janela deslizante de 20 apostas
        </Text>
        <Text style={[styles.currentROI, { color: latestROI >= 0 ? colors.primary : colors.danger }]}>
          Atual: {formatPercentage(latestROI)}
        </Text>
      </View>

      <View style={styles.chartWrap}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['roi']}
          domainPadding={{ top: 10, bottom: 10, left: 5, right: 5 }}
          axisOptions={{
            font: null,
            lineColor: colors.border,
            labelColor: colors.textSecondary,
          }}
        >
          {({ points, chartBounds }) => (
            <>
              {/* Zero reference line */}
              {(() => {
                const yRange = chartBounds.bottom - chartBounds.top;
                const dataMax = Math.max(...data.map((d) => d.roi));
                const dataMin = Math.min(...data.map((d) => d.roi));
                const range = dataMax - dataMin || 1;
                const zeroY = chartBounds.top + ((dataMax - 0) / range) * yRange;
                return (
                  <SkiaLine
                    p1={{ x: chartBounds.left, y: zeroY }}
                    p2={{ x: chartBounds.right, y: zeroY }}
                    color={colors.textMuted}
                    strokeWidth={1}
                  >
                    <DashPathEffect intervals={[6, 4]} />
                  </SkiaLine>
                );
              })()}

              {/* ROI trend line */}
              <Line
                points={points.roi}
                color={latestROI >= 0 ? colors.primary : colors.danger}
                strokeWidth={2.5}
                curveType="natural"
              />
            </>
          )}
        </CartesianChart>
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  currentROI: {
    fontSize: 14,
    fontWeight: '800',
  },
  chartWrap: {
    height: 200,
  },
});
