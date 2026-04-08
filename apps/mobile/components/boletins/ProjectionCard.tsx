import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PersonalStats } from '@betintel/shared';
import { Card } from '../ui/Card';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';
import type { BoletinBuilderItem } from '../../stores/boletinBuilderStore';

interface ProjectionCardProps {
  items: BoletinBuilderItem[];
  stats: PersonalStats | undefined;
}

/**
 * Shows historical performance projections for the current boletin selections,
 * cross-referencing against cached stats by sport, market, and odds range.
 */
export function ProjectionCard({ items, stats }: ProjectionCardProps) {
  const { colors, tokens } = useTheme();

  if (!stats || items.length === 0) return null;

  // Gather insights per selection
  const insights: Array<{
    label: string;
    roi: number;
    winRate: number;
    totalBets: number;
  }> = [];

  for (const item of items) {
    // Match by sport
    const sportRow = stats.bySport.find((r) => r.sport === item.sport);
    if (sportRow && sportRow.totalBets >= 3) {
      const existing = insights.find((i) => i.label === sportRow.label);
      if (!existing) {
        insights.push({
          label: sportRow.label,
          roi: sportRow.roi,
          winRate: sportRow.winRate,
          totalBets: sportRow.totalBets,
        });
      }
    }

    // Match by market
    const marketRow = stats.byMarket.find(
      (r) => r.market.toLowerCase() === item.market.toLowerCase(),
    );
    if (marketRow && marketRow.totalBets >= 3) {
      const existing = insights.find((i) => i.label === marketRow.label);
      if (!existing) {
        insights.push({
          label: marketRow.label,
          roi: marketRow.roi,
          winRate: marketRow.winRate,
          totalBets: marketRow.totalBets,
        });
      }
    }

    // Match by odds range
    const oddsRow = stats.byOddsRange.find(
      (r) =>
        (r.minOdds === null || item.oddValue >= r.minOdds) &&
        (r.maxOdds === null || item.oddValue < r.maxOdds),
    );
    if (oddsRow && oddsRow.totalBets >= 3) {
      const existing = insights.find((i) => i.label === oddsRow.label);
      if (!existing) {
        insights.push({
          label: oddsRow.label,
          roi: oddsRow.roi,
          winRate: oddsRow.winRate,
          totalBets: oddsRow.totalBets,
        });
      }
    }
  }

  if (insights.length === 0) return null;

  // Overall average ROI across all matched segments
  const avgROI = insights.reduce((sum, i) => sum + i.roi, 0) / insights.length;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons color={colors.info} name="analytics-outline" size={18} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Projeção</Text>
      </View>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Com base no teu histórico para este tipo de aposta
      </Text>

      {/* Overall signal */}
      <View
        accessibilityLabel={`ROI médio histórico: ${formatPercentage(avgROI)}`}
        style={[styles.signalRow, { backgroundColor: avgROI >= 0 ? colors.primary + '18' : colors.danger + '18', borderColor: avgROI >= 0 ? colors.primary + '40' : colors.danger + '40' }]}
      >
        <Ionicons
          color={avgROI >= 0 ? colors.primary : colors.danger}
          name={avgROI >= 0 ? 'trending-up' : 'trending-down'}
          size={20}
        />
        <Text style={[styles.signalText, { color: avgROI >= 0 ? colors.primary : colors.danger }]}>
          ROI médio histórico: {formatPercentage(avgROI)}
        </Text>
      </View>

      {/* Per-segment breakdown */}
      {insights.map((insight) => (
        <View key={insight.label} style={styles.insightRow}>
          <Text style={[styles.insightLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {insight.label}
          </Text>
          <View style={styles.insightMetrics}>
            <Text style={[styles.insightValue, { color: insight.roi >= 0 ? colors.primary : colors.danger }]}>
              {formatPercentage(insight.roi)}
            </Text>
            <Text style={[styles.insightWinRate, { color: colors.textMuted }]}>
              {formatPercentage(insight.winRate)} win · {insight.totalBets} apostas
            </Text>
          </View>
        </View>
      ))}

      {insights.some((i) => i.totalBets < 10) && (
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          ⚠️ Algumas categorias têm poucas apostas — a projeção pode ser imprecisa.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  signalRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  signalText: { fontSize: 14, fontWeight: '700' },
  insightRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  insightLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  insightMetrics: { alignItems: 'flex-end', gap: 2 },
  insightValue: { fontSize: 14, fontWeight: '800' },
  insightWinRate: { fontSize: 11, fontWeight: '500' },
  disclaimer: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});
