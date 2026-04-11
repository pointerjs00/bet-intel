import React, { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StatsByOddsRangeRow } from '@betintel/shared';
import { Bar, CartesianChart } from 'victory-native';
import { Text as SkiaText, matchFont } from '@shopify/react-native-skia';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const skiaFont = matchFont({ fontFamily, fontSize: 11, fontWeight: 'bold' });

interface OddsRangeBarProps {
  rows: StatsByOddsRangeRow[];
  onInfoPress?: () => void;
}

interface OddsRangeDatum extends Record<string, number> {
  index: number;
  positive: number;
  negative: number;
}

/** Bar chart for ROI by odds range. */
export const OddsRangeBar = React.memo(function OddsRangeBar({ rows, onInfoPress }: OddsRangeBarProps) {
  const { colors } = useTheme();
  const visibleRows = rows.length > 0 ? rows : [{ key: 'empty', label: 'Sem dados', roi: 0, totalBets: 0 }];

  const chartData = useMemo<OddsRangeDatum[]>(() => {
    if (visibleRows.length === 0) {
      return [{ index: 0, positive: 0, negative: 0 }];
    }

    return visibleRows.map((row, index) => ({
      index,
      positive: Math.max(row.roi, 0),
      negative: Math.min(row.roi, 0),
    }));
  }, [visibleRows]);

  const font = skiaFont;
  const chartWidth = Math.max(320, visibleRows.length * 78);
  const barWidth = Math.min(32, Math.max(20, chartWidth / Math.max(visibleRows.length * 3.4, 1)));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>ROI por Range de Odds</Text>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre ROI por range de odds" onPress={onInfoPress} />
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={visibleRows.length > 4}
        contentContainerStyle={styles.chartScrollContent}
      >
        <View style={[styles.chartWrap, { width: chartWidth }]}> 
          <CartesianChart<OddsRangeDatum, 'index', 'positive' | 'negative'>
            data={chartData}
            xKey="index"
            yKeys={["positive", "negative"]}
            domainPadding={{ bottom: 28, left: 28, right: 28, top: 24 }}
            padding={{ bottom: 24, left: 12, right: 12, top: 18 }}
          >
            {({ points, chartBounds }) => (
              <>
                <Bar barWidth={barWidth} chartBounds={chartBounds} color={colors.primary} points={points.positive} roundedCorners={{ topLeft: 8, topRight: 8 }} />
                <Bar barWidth={barWidth} chartBounds={chartBounds} color={colors.danger} points={points.negative} roundedCorners={{ bottomLeft: 8, bottomRight: 8 }} />
                {font && visibleRows.map((row, i) => {
                  const posP = points.positive[i];
                  const negP = points.negative[i];
                  const point = row.roi >= 0 ? posP : negP;
                  if (!point) return null;

                  const label = formatPercentage(row.roi);
                  const estimatedWidth = Math.max(28, label.length * 6.5);
                  const rawX = (point as unknown as { x: number }).x - estimatedWidth / 2;
                  const x = Math.max(
                    chartBounds.left + 4,
                    Math.min(chartBounds.right - estimatedWidth - 4, rawX),
                  );
                  const y = row.roi >= 0
                    ? Math.max(chartBounds.top + 12, (point as unknown as { y: number }).y - 10)
                    : Math.min(chartBounds.bottom - 4, (point as unknown as { y: number }).y + 18);

                  return (
                    <SkiaText
                      key={row.key}
                      x={x}
                      y={y}
                      text={label}
                      font={font}
                      color={row.roi >= 0 ? colors.primary : colors.danger}
                    />
                  );
                })}
              </>
            )}
          </CartesianChart>
        </View>
      </ScrollView>

      <View style={styles.legendList}>
        {visibleRows.map((row) => (
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
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
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
    height: 200,
    overflow: 'visible',
  },
  chartScrollContent: {
    minWidth: '100%',
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