import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsBySiteRow } from '@betintel/shared';
import { CartesianChart, Line } from 'victory-native';
import { Card } from '../ui/Card';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface SiteROITableProps {
  rows: StatsBySiteRow[];
  onInfoPress?: () => void;
}

interface SparkDatum extends Record<string, number> {
  x: number;
  roi: number;
}

function Sparkline({ data, color }: { data: SparkDatum[]; color: string }) {
  if (data.length < 2) return null;

  return (
    <View style={styles.sparkWrap}>
      <CartesianChart<SparkDatum, 'x', 'roi'>
        data={data}
        xKey="x"
        yKeys={['roi']}
      >
        {({ points }) => (
          <Line color={color} points={points.roi} strokeWidth={1.5} />
        )}
      </CartesianChart>
    </View>
  );
}

export function SiteROITable({ rows, onInfoPress }: SiteROITableProps) {
  const { colors } = useTheme();

  if (rows.length === 0) return null;

  return (
    <Card style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Por casa de apostas</Text>
        {onInfoPress ? (
          <Pressable hitSlop={8} onPress={onInfoPress}>
            <Ionicons color={colors.textMuted} name="information-circle-outline" size={18} />
          </Pressable>
        ) : null}
      </View>

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.siteCol, { color: colors.textMuted }]}>Casa</Text>
        <Text style={[styles.headerCell, styles.numCol, { color: colors.textMuted }]}>Ap.</Text>
        <Text style={[styles.headerCell, styles.numCol, { color: colors.textMuted }]}>ROI</Text>
        <Text style={[styles.headerCell, styles.numCol, { color: colors.textMuted }]}>Odd ø</Text>
        <View style={styles.sparkCol}>
          <Text style={[styles.headerCell, { color: colors.textMuted }]}>Tendência</Text>
        </View>
      </View>

      {rows.map((row) => (
        <SiteRow key={row.key} row={row} />
      ))}
    </Card>
  );
}

function SiteRow({ row }: { row: StatsBySiteRow }) {
  const { colors } = useTheme();

  const sparkData = useMemo<SparkDatum[]>(() => {
    if (row.monthlySeries.length < 2) return [];
    return row.monthlySeries.map((m, i) => ({ x: i, roi: m.roi }));
  }, [row.monthlySeries]);

  const sparkColor = row.roi >= 0 ? colors.primary : colors.danger;

  return (
    <View style={[styles.dataRow, { borderTopColor: colors.border }]}>
      <Text numberOfLines={1} style={[styles.siteCol, styles.siteText, { color: colors.textPrimary }]}>
        {row.label === 'unknown' ? 'Outra casa' : row.label}
      </Text>
      <Text style={[styles.numCol, styles.numText, { color: colors.textSecondary }]}>
        {row.totalBets}
      </Text>
      <Text style={[styles.numCol, styles.numText, { color: row.roi >= 0 ? colors.primary : colors.danger }]}>
        {row.roi > 0 ? '+' : ''}{formatPercentage(row.roi)}
      </Text>
      <Text style={[styles.numCol, styles.numText, { color: colors.textSecondary }]}>
        {row.averageOdds.toFixed(2)}
      </Text>
      <View style={styles.sparkCol}>
        <Sparkline color={sparkColor} data={sparkData} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '900' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  headerCell: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  siteCol: { flex: 1 },
  numCol: { width: 48, textAlign: 'right' },
  sparkCol: { width: 60, alignItems: 'center', justifyContent: 'center' },
  dataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1 },
  siteText: { fontSize: 13, fontWeight: '700' },
  numText: { fontSize: 12, fontWeight: '600' },
  sparkWrap: { width: 56, height: 24, overflow: 'hidden' },
});
