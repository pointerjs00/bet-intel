import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsByOddsRangeRow } from '@betintel/shared';
import { Bar, CartesianChart } from 'victory-native';
import { Text as SkiaText, matchFont } from '@shopify/react-native-skia';
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
export function OddsRangeBar({ rows, onInfoPress }: OddsRangeBarProps) {
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

  const font = skiaFont;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>ROI por Range de Odds</Text>
        {onInfoPress ? (
          <Pressable hitSlop={8} onPress={onInfoPress}>
            <Ionicons color={colors.textMuted} name="information-circle-outline" size={18} />
          </Pressable>
        ) : null}
      </View>

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
              {/* Value labels above/below each bar */}
              {font && rows.map((row, i) => {
                const posP = points.positive[i];
                const negP = points.negative[i];
                if (!posP && !negP) return null;
                const point = row.roi >= 0 ? posP : negP;
                if (!point) return null;
                const label = formatPercentage(row.roi);
                const yOffset = row.roi >= 0 ? -8 : 14;
                return (
                  <SkiaText
                    key={i}
                    x={(point as unknown as { x: number }).x - 14}
                    y={(point as unknown as { y: number }).y + yOffset}
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