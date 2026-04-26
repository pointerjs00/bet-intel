import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BoletinDetail } from '@betintel/shared';
import { BoletinStatus, ItemResult } from '@betintel/shared';
import { usePersonalStats } from '../../services/statsService';
import { useTheme } from '../../theme/useTheme';
import { Skeleton } from '../ui/Skeleton';
import { formatOdds } from '../../utils/formatters';

interface Props {
  boletin: BoletinDetail;
}

// ─── Small metric chip ────────────────────────────────────────────────────────

function Chip({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[chipStyles.chip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Text style={[chipStyles.value, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
      <Text style={[chipStyles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}
const chipStyles = StyleSheet.create({
  chip: { borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', flex: 1, gap: 2 },
  value: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
});

// ─── Insight row ──────────────────────────────────────────────────────────────

function InsightRow({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={insightRowStyles.row}>
      <View style={[insightRowStyles.iconWrap, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={[insightRowStyles.text, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}
const insightRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: { borderRadius: 6, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  text: { fontSize: 13, lineHeight: 20, flex: 1 },
});

// ─── Main component ───────────────────────────────────────────────────────────

export function BoletinInsightsSection({ boletin }: Props) {
  const { colors } = useTheme();
  const statsQuery = usePersonalStats('all', [], undefined, undefined, true);
  const stats = statsQuery.data;

  const data = useMemo(() => {
    const items = boletin.items;
    if (items.length === 0) return null;

    // Total implied probability: product of each leg's implied prob
    const impliedProbProduct = items.reduce((acc, item) => {
      const odd = parseFloat(String(item.oddValue));
      return odd > 1 ? acc * (1 / odd) : acc;
    }, 1);
    const slipImpliedProb = impliedProbProduct * 100;

    // Average leg implied probability
    const avgLegImpliedProb = slipImpliedProb > 0
      ? Math.pow(impliedProbProduct, 1 / items.length) * 100
      : 0;

    // Stats for this leg count
    const legCountRow = stats?.byLegCount.find((r) => r.legCount === items.length) ?? null;

    // Insights list
    const insights: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }> = [];

    // Leg count insight
    if (legCountRow && legCountRow.totalBets >= 3) {
      const better = legCountRow.winRate > slipImpliedProb;
      insights.push({
        icon: better ? 'trending-up' : 'trending-down',
        color: better ? colors.primary : colors.warning,
        text: `Com ${items.length} seleções, a tua taxa histórica é ${Math.round(legCountRow.winRate)}% (${legCountRow.totalBets} apostas). A odd implícita deste slip é ${slipImpliedProb.toFixed(1)}%.`,
      });
    } else if (items.length > 1) {
      insights.push({
        icon: 'information-circle-outline',
        color: colors.textMuted,
        text: `Acumulador de ${items.length} seleções. Probabilidade implícita total: ${slipImpliedProb.toFixed(1)}% (1 em ${(1 / impliedProbProduct).toFixed(0)}).`,
      });
    }

    // Summary insight
    if (stats?.summary && stats.summary.totalBets >= 5) {
      const { winRate, roi } = stats.summary;
      const roiStr = roi >= 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`;
      insights.push({
        icon: 'person-outline',
        color: roi >= 0 ? colors.primary : colors.danger,
        text: `O teu histórico geral: ${Math.round(winRate)}% de taxa e ${roiStr} ROI em ${stats.summary.totalBets} apostas.`,
      });
    }

    // Odds range insight: check each leg
    const highOddsLegs = items.filter((i) => parseFloat(String(i.oddValue)) >= 3.0);
    if (highOddsLegs.length > 0 && items.length > 1) {
      insights.push({
        icon: 'warning-outline',
        color: colors.warning,
        text: `${highOddsLegs.length} seleção(ões) com odds ≥ 3.0 aumentam o risco do acumulador. Odds altas têm menor probabilidade implícita.`,
      });
    }

    // Outcome verdict for resolved boletins
    let outcomeVerdict: { aligned: boolean; text: string } | null = null;
    if (
      stats &&
      legCountRow &&
      legCountRow.totalBets >= 3 &&
      (boletin.status === BoletinStatus.WON || boletin.status === BoletinStatus.LOST)
    ) {
      const statsExpectedWin = legCountRow.winRate > slipImpliedProb;
      const actuallyWon = boletin.status === BoletinStatus.WON;
      outcomeVerdict = {
        aligned: statsExpectedWin === actuallyWon,
        text: statsExpectedWin === actuallyWon
          ? actuallyWon
            ? 'Este resultado era o mais provável com base nos teus dados históricos.'
            : 'Este resultado era esperado — odds abaixo da tua taxa histórica neste formato.'
          : actuallyWon
            ? 'Ganhou apesar das odds estarem acima da tua taxa histórica neste formato. 🎉'
            : 'Perdeu apesar das odds estarem dentro do teu histórico vencedor.',
      };
    }

    return { slipImpliedProb, avgLegImpliedProb, legCountRow, insights, outcomeVerdict };
  }, [boletin, stats, colors]);

  if (statsQuery.isLoading) {
    return (
      <View style={[styles.section, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Insights do boletim</Text>
        <Skeleton height={60} width="100%" borderRadius={10} />
        <Skeleton height={40} width="80%" borderRadius={10} />
      </View>
    );
  }

  if (!data) return null;

  const { slipImpliedProb, legCountRow, insights, outcomeVerdict } = data;
  const items = boletin.items;

  return (
    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        <Ionicons name="analytics-outline" size={13} /> Insights do boletim
      </Text>

      {/* Metric chips */}
      <View style={styles.chipsRow}>
        <Chip
          label="Prob. implícita"
          value={`${slipImpliedProb.toFixed(1)}%`}
          valueColor={slipImpliedProb > 50 ? colors.primary : slipImpliedProb > 20 ? colors.warning : colors.danger}
        />
        <Chip
          label="Seleções"
          value={String(items.length)}
        />
        {legCountRow && legCountRow.totalBets >= 3 ? (
          <Chip
            label="Tua taxa"
            value={`${Math.round(legCountRow.winRate)}%`}
            valueColor={legCountRow.winRate > slipImpliedProb ? colors.primary : colors.warning}
          />
        ) : null}
        <Chip
          label="Total odds"
          value={formatOdds(String(boletin.totalOdds))}
          valueColor={colors.gold}
        />
      </View>

      {/* Outcome verdict (resolved) */}
      {outcomeVerdict && (
        <View style={[
          styles.verdictBanner,
          {
            backgroundColor: outcomeVerdict.aligned ? colors.primary + '15' : colors.warning + '15',
            borderColor: outcomeVerdict.aligned ? colors.primary : colors.warning,
          },
        ]}>
          <Ionicons
            name={outcomeVerdict.aligned ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color={outcomeVerdict.aligned ? colors.primary : colors.warning}
          />
          <Text style={[styles.verdictText, { color: outcomeVerdict.aligned ? colors.primary : colors.warning }]}>
            {outcomeVerdict.text}
          </Text>
        </View>
      )}

      {/* Insight rows */}
      {insights.length > 0 && (
        <View style={styles.insightsBlock}>
          {insights.map((ins, i) => (
            <InsightRow key={i} icon={ins.icon} color={ins.color} text={ins.text} />
          ))}
        </View>
      )}

      {/* Per-leg implied probabilities */}
      {items.length > 1 && (
        <View style={[styles.legsBlock, { borderColor: colors.border }]}>
          <Text style={[styles.legsTitle, { color: colors.textMuted }]}>Probabilidade por seleção</Text>
          {items.map((item, i) => {
            const odd = parseFloat(String(item.oddValue));
            const prob = odd > 1 ? (1 / odd) * 100 : 0;
            const resolved = item.result !== ItemResult.PENDING;
            const resultColor = item.result === ItemResult.WON
              ? colors.primary
              : item.result === ItemResult.LOST
                ? colors.danger
                : colors.textMuted;
            return (
              <View key={item.id} style={styles.legRow}>
                <View style={[styles.legDot, { backgroundColor: resolved ? resultColor : colors.border }]} />
                <Text numberOfLines={1} style={[styles.legName, { color: colors.textSecondary }]}>
                  {item.homeTeam} vs {item.awayTeam}
                </Text>
                <Text style={[styles.legProb, { color: prob >= 50 ? colors.primary : prob >= 30 ? colors.warning : colors.danger }]}>
                  {prob.toFixed(0)}%
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 16, borderWidth: 1, gap: 12, padding: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  chipsRow: { flexDirection: 'row', gap: 8 },
  verdictBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  verdictText: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
  insightsBlock: { gap: 8 },
  legsBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  legsTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legDot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
  legName: { flex: 1, fontSize: 12, fontWeight: '600' },
  legProb: { fontSize: 12, fontWeight: '800', minWidth: 32, textAlign: 'right' },
});
