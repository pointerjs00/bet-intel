import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PersonalStats } from '@betintel/shared';
import { Card } from '../ui/Card';
import { useTheme } from '../../theme/useTheme';
import { formatOdds } from '../../utils/formatters';
import type { BoletinBuilderItem } from '../../stores/boletinBuilderStore';

interface LegAnalysis {
  index: number;
  label: string;
  oddValue: number;
  oddsRangeLabel: string | null;
  historicalWinRate: number | null; // 0–100
  ev: number | null; // positive = value bet vs history, negative = below expectation
  sampleSize: number;
}

function analyseLeg(item: BoletinBuilderItem, stats: PersonalStats, index: number): LegAnalysis {
  const label = item.homeTeam && item.awayTeam
    ? `${item.homeTeam} vs ${item.awayTeam}`
    : item.selection || `Seleção ${index + 1}`;

  const oddsRow = stats.byOddsRange.find(
    (r) =>
      (r.minOdds === null || item.oddValue >= r.minOdds) &&
      (r.maxOdds === null || item.oddValue < r.maxOdds),
  );

  if (!oddsRow || oddsRow.totalBets < 5) {
    return { index, label, oddValue: item.oddValue, oddsRangeLabel: oddsRow?.label ?? null, historicalWinRate: null, ev: null, sampleSize: oddsRow?.totalBets ?? 0 };
  }

  const p = oddsRow.winRate / 100;
  const ev = p * item.oddValue - 1;

  return {
    index,
    label,
    oddValue: item.oddValue,
    oddsRangeLabel: oddsRow.label,
    historicalWinRate: oddsRow.winRate,
    ev,
    sampleSize: oddsRow.totalBets,
  };
}

interface Props {
  items: BoletinBuilderItem[];
  stats: PersonalStats;
}

export function ParlayOptimiserCard({ items, stats }: Props) {
  const { colors } = useTheme();

  const legs = useMemo(
    () => items.map((item, i) => analyseLeg(item, stats, i)),
    [items, stats],
  );

  const legsWithData = legs.filter((l) => l.ev !== null);
  const negativeLegs = legsWithData.filter((l) => l.ev! < -0.03).sort((a, b) => a.ev! - b.ev!);
  const worstLeg = negativeLegs[0] ?? null;

  // Not enough coverage — skip rendering
  if (legsWithData.length < 2) return null;

  const allPositive = negativeLegs.length === 0;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons color={colors.warning} name="options-outline" size={18} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Optimizador</Text>
      </View>

      {allPositive ? (
        <View style={[styles.banner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '35' }]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.bannerText, { color: colors.primary }]}>
            Todas as seleções têm valor positivo com base no teu histórico.
          </Text>
        </View>
      ) : (
        <>
          {worstLeg && (
            <View style={[styles.banner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '35' }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <Text style={[styles.bannerText, { color: colors.textPrimary, flex: 1 }]}>
                <Text style={{ fontWeight: '800' }}>Seleção {worstLeg.index + 1}</Text>
                {' '}({formatOdds(worstLeg.oddValue)}) arrasta o acumulador — EV histórico{' '}
                <Text style={{ color: colors.danger, fontWeight: '800' }}>{(worstLeg.ev! * 100).toFixed(1)}%</Text>
                {worstLeg.oddsRangeLabel ? ` em odds ${worstLeg.oddsRangeLabel}` : ''}.
              </Text>
            </View>
          )}
        </>
      )}

      {/* Per-leg breakdown */}
      <View style={styles.legList}>
        {legs.map((leg) => {
          const hasEV = leg.ev !== null;
          const isNegative = hasEV && leg.ev! < -0.03;
          const evColor = !hasEV ? colors.textMuted : isNegative ? colors.danger : colors.primary;

          return (
            <View key={leg.index} style={[styles.legRow, { borderBottomColor: colors.border }]}>
              <View style={styles.legLeft}>
                <Text numberOfLines={1} style={[styles.legLabel, { color: colors.textSecondary }]}>
                  {leg.index + 1}. {leg.label}
                </Text>
                {leg.oddsRangeLabel ? (
                  <Text style={[styles.legMeta, { color: colors.textMuted }]}>
                    odds {leg.oddsRangeLabel} · {leg.sampleSize} apostas
                  </Text>
                ) : (
                  <Text style={[styles.legMeta, { color: colors.textMuted }]}>Sem dados suficientes</Text>
                )}
              </View>
              <View style={styles.legRight}>
                <Text style={[styles.legOdds, { color: colors.gold }]}>{formatOdds(leg.oddValue)}</Text>
                {hasEV ? (
                  <Text style={[styles.legEV, { color: evColor }]}>
                    {leg.ev! >= 0 ? '+' : ''}{(leg.ev! * 100).toFixed(1)}% EV
                  </Text>
                ) : (
                  <Text style={[styles.legEV, { color: colors.textMuted }]}>— EV</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[styles.footnote, { color: colors.textMuted }]}>
        EV calculado com base na tua taxa histórica de vitórias por range de odds.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  title: { fontSize: 16, fontWeight: '800' },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  bannerText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  legList: { gap: 0 },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  legLeft: { flex: 1, gap: 2 },
  legLabel: { fontSize: 13, fontWeight: '600' },
  legMeta: { fontSize: 11, fontWeight: '500' },
  legRight: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  legOdds: { fontSize: 13, fontWeight: '800' },
  legEV: { fontSize: 12, fontWeight: '700' },
  footnote: { fontSize: 11, lineHeight: 16 },
});
