import React, { useMemo } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss';
import { Ionicons } from '@expo/vector-icons';
import { ItemResult, Sport } from '@betintel/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalStats } from '../../services/statsService';
import { useTheme } from '../../theme/useTheme';
import { TeamBadge } from '../ui/TeamBadge';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { Skeleton } from '../ui/Skeleton';
import { formatOdds } from '../../utils/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SelectionInsightsItem {
  homeTeam: string;
  awayTeam: string;
  homeTeamImageUrl?: string | null;
  awayTeamImageUrl?: string | null;
  competition: string;
  sport: string;
  market: string;
  selection: string;
  oddValue: string | number;
  result?: string;
}

interface Props {
  visible: boolean;
  item: SelectionInsightsItem | null;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function winRateColor(winRate: number, impliedProb: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (winRate > impliedProb + 5) return colors.primary;
  if (winRate < impliedProb - 5) return colors.danger;
  return colors.warning;
}

function StatCard({
  label,
  totalBets,
  winRate,
  roi,
  impliedProb,
}: {
  label: string;
  totalBets: number;
  winRate: number;
  roi: number;
  impliedProb: number;
}) {
  const { colors } = useTheme();
  const wr = Math.round(winRate);
  const barColor = winRateColor(winRate, impliedProb, colors);
  const roiPositive = roi >= 0;

  return (
    <View style={[statCardStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <View style={statCardStyles.topRow}>
        <Text style={[statCardStyles.label, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
        <Text style={[statCardStyles.bets, { color: colors.textMuted }]}>{totalBets} aposta{totalBets !== 1 ? 's' : ''}</Text>
      </View>
      <View style={statCardStyles.metricsRow}>
        <View style={statCardStyles.metricBlock}>
          <Text style={[statCardStyles.metricValue, { color: barColor }]}>{wr}%</Text>
          <Text style={[statCardStyles.metricLabel, { color: colors.textMuted }]}>Taxa vitória</Text>
        </View>
        <View style={[statCardStyles.divider, { backgroundColor: colors.border }]} />
        <View style={statCardStyles.metricBlock}>
          <Text style={[statCardStyles.metricValue, { color: roiPositive ? colors.primary : colors.danger }]}>
            {roiPositive ? '+' : ''}{roi.toFixed(1)}%
          </Text>
          <Text style={[statCardStyles.metricLabel, { color: colors.textMuted }]}>ROI</Text>
        </View>
        <View style={[statCardStyles.divider, { backgroundColor: colors.border }]} />
        <View style={[statCardStyles.metricBlock, { flex: 2 }]}>
          <View style={[statCardStyles.barTrack, { backgroundColor: colors.border }]}>
            <View style={[statCardStyles.barFill, { width: `${Math.min(wr, 100)}%`, backgroundColor: barColor }]} />
            <View style={[statCardStyles.impliedMarker, { left: `${Math.min(impliedProb, 100)}%`, backgroundColor: colors.textMuted }]} />
          </View>
          <Text style={[statCardStyles.metricLabel, { color: colors.textMuted }]}>vs {Math.round(impliedProb)}% implícita</Text>
        </View>
      </View>
      {totalBets < 5 && (
        <Text style={[statCardStyles.lowData, { color: colors.textMuted }]}>⚠ Poucos dados — resultado pode não ser representativo</Text>
      )}
    </View>
  );
}

const statCardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '700', flex: 1 },
  bets: { fontSize: 11, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricBlock: { flex: 1, alignItems: 'center', gap: 2 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  divider: { width: StyleSheet.hairlineWidth, height: 32 },
  barTrack: { height: 6, borderRadius: 999, overflow: 'hidden', width: '100%', position: 'relative' },
  barFill: { height: 6, borderRadius: 999 },
  impliedMarker: { position: 'absolute', top: -2, width: 2, height: 10, borderRadius: 1 },
  lowData: { fontSize: 10, fontStyle: 'italic' },
});

// ─── Main component ───────────────────────────────────────────────────────────

export function SelectionInsightsSheet({ visible, item, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { panHandlers, animatedStyle } = useSwipeToDismiss(onClose);
  const statsQuery = usePersonalStats('all', [], undefined, undefined, visible && item !== null);
  const stats = statsQuery.data;

  const odd = item ? (typeof item.oddValue === 'string' ? parseFloat(item.oddValue) : item.oddValue) : 1;
  const impliedProb = odd > 1 ? (1 / odd) * 100 : 0;

  const insights = useMemo(() => {
    if (!stats || !item) return null;

    const sportRow = stats.bySport.find((r) => r.sport === item.sport) ?? null;
    const competitionRow = stats.byCompetition.find(
      (r) => r.competition.toLowerCase() === item.competition.toLowerCase(),
    ) ?? null;
    const marketRow = stats.byMarket.find(
      (r) => r.market.toLowerCase() === item.market.toLowerCase(),
    ) ?? null;
    const oddsRangeRow = stats.byOddsRange.find((r) => {
      const lo = r.minOdds ?? 0;
      const hi = r.maxOdds ?? Infinity;
      return odd >= lo && odd < hi;
    }) ?? null;
    const homeTeamRow = stats.byTeam.find(
      (r) => r.team.toLowerCase() === item.homeTeam.toLowerCase(),
    ) ?? null;
    const awayTeamRow = stats.byTeam.find(
      (r) => r.team.toLowerCase() === item.awayTeam.toLowerCase(),
    ) ?? null;

    // Weighted average of win rates across contexts that have enough data
    const rates: number[] = [];
    if (sportRow && sportRow.totalBets >= 3) rates.push(sportRow.winRate);
    if (competitionRow && competitionRow.totalBets >= 3) rates.push(competitionRow.winRate);
    if (marketRow && marketRow.totalBets >= 3) rates.push(marketRow.winRate);
    const avgWinRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
    const hasEdge = avgWinRate !== null ? avgWinRate > impliedProb : null;

    let outcomeVerdict: 'aligned' | 'surprise' | null = null;
    if ((item.result === 'WON' || item.result === 'LOST') && hasEdge !== null) {
      const statsExpectedWin = hasEdge;
      const actuallyWon = item.result === 'WON';
      outcomeVerdict = statsExpectedWin === actuallyWon ? 'aligned' : 'surprise';
    }

    return {
      sportRow, competitionRow, marketRow, oddsRangeRow, homeTeamRow, awayTeamRow,
      avgWinRate, hasEdge, outcomeVerdict,
      hasAnyData: !!(sportRow || competitionRow || marketRow),
    };
  }, [stats, item, odd, impliedProb]);

  if (!item) return null;

  const isResolved = item.result === 'WON' || item.result === 'LOST' || item.result === 'VOID';

  const cards: Array<{ label: string; row: { totalBets: number; winRate: number; roi: number } }> = [];
  if (insights?.sportRow) cards.push({ label: `Neste desporto (${item.sport})`, row: insights.sportRow });
  if (insights?.competitionRow) cards.push({ label: item.competition, row: insights.competitionRow });
  if (insights?.marketRow) cards.push({ label: `Mercado: ${item.market}`, row: insights.marketRow });
  if (insights?.oddsRangeRow) cards.push({ label: `Odds nesta gama`, row: insights.oddsRangeRow });
  if (insights?.homeTeamRow) cards.push({ label: item.homeTeam, row: insights.homeTeamRow });
  if (insights?.awayTeamRow) cards.push({ label: item.awayTeam, row: insights.awayTeamRow });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }, animatedStyle]}>
          {/* Handle */}
          <View {...panHandlers} style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.teamsBlock}>
              <View style={styles.teamsLine}>
                <TeamBadge
                  name={item.homeTeam}
                  imageUrl={item.homeTeamImageUrl}
                  size={20}
                  variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                />
                <Text numberOfLines={1} style={[styles.teamName, { color: colors.textPrimary }]}>{item.homeTeam}</Text>
                <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
                <Text numberOfLines={1} style={[styles.teamName, { color: colors.textPrimary }]}>{item.awayTeam}</Text>
                <TeamBadge
                  name={item.awayTeam}
                  imageUrl={item.awayTeamImageUrl}
                  size={20}
                  variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                />
              </View>
              <View style={styles.competitionLine}>
                <CompetitionBadge name={item.competition} size={13} />
                <Text style={[styles.competitionText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.competition}
                </Text>
              </View>
            </View>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Odd + implied probability */}
          <View style={[styles.oddRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.oddRowLabel, { color: colors.textMuted }]}>Mercado · Seleção</Text>
              <Text style={[styles.oddRowValue, { color: colors.textPrimary }]} numberOfLines={2}>
                {item.market} · {item.selection}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={[styles.oddValue, { color: colors.gold }]}>{formatOdds(odd)}</Text>
              <Text style={[styles.impliedProbText, { color: colors.textSecondary }]}>
                {impliedProb.toFixed(0)}% prob. implícita
              </Text>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Outcome / value verdict */}
            {!statsQuery.isLoading && insights?.outcomeVerdict && (
              <VerdictBanner
                verdict={insights.outcomeVerdict}
                result={item.result}
                hasEdge={insights.hasEdge}
                colors={colors}
              />
            )}
            {!statsQuery.isLoading && !isResolved && insights !== null && insights.hasEdge !== null && (
              <VerdictBanner
                verdict={insights.hasEdge ? 'value' : 'novalue'}
                result={item.result}
                hasEdge={insights.hasEdge}
                colors={colors}
              />
            )}

            {/* Stats section */}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>As tuas estatísticas</Text>

            {statsQuery.isLoading ? (
              <View style={{ gap: 10 }}>
                <Skeleton height={80} width="100%" borderRadius={12} />
                <Skeleton height={80} width="100%" borderRadius={12} />
                <Skeleton height={80} width="100%" borderRadius={12} />
              </View>
            ) : cards.length > 0 ? (
              <View style={{ gap: 10 }}>
                {cards.map((c, i) => (
                  <StatCard
                    key={i}
                    label={c.label}
                    totalBets={c.row.totalBets}
                    winRate={c.row.winRate}
                    roi={c.row.roi}
                    impliedProb={impliedProb}
                  />
                ))}
              </View>
            ) : (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Ionicons name="bar-chart-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Sem dados suficientes</Text>
                <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                  Ainda não tens apostas resolvidas neste contexto. Continua a registar apostas para ver os teus padrões.
                </Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Verdict banner ───────────────────────────────────────────────────────────

function VerdictBanner({
  verdict,
  result,
  hasEdge,
  colors,
}: {
  verdict: 'aligned' | 'surprise' | 'value' | 'novalue';
  result?: string;
  hasEdge: boolean | null;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  type Config = { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string };
  let cfg: Config;

  if (verdict === 'aligned') {
    const won = result === 'WON';
    cfg = won
      ? { icon: 'checkmark-circle', color: colors.primary, text: 'Resultado apoiado pelo teu histórico' }
      : { icon: 'information-circle', color: colors.textSecondary, text: 'Resultado consistente com o teu histórico' };
  } else if (verdict === 'surprise') {
    const won = result === 'WON';
    cfg = won
      ? { icon: 'star', color: colors.gold, text: 'Ganhou contra as probabilidades históricas! 🎉' }
      : { icon: 'alert-circle', color: colors.warning, text: 'Perdeu apesar do teu edge histórico' };
  } else if (verdict === 'value') {
    cfg = { icon: 'trending-up', color: colors.primary, text: 'Aposta com valor positivo — taxa histórica acima da odd implícita' };
  } else {
    cfg = { icon: 'trending-down', color: colors.warning, text: 'Taxa histórica abaixo da probabilidade implícita neste contexto' };
  }

  return (
    <View style={[verdictStyles.banner, { backgroundColor: cfg.color + '18', borderColor: cfg.color }]}>
      <Ionicons name={cfg.icon} size={18} color={cfg.color} />
      <Text style={[verdictStyles.text, { color: cfg.color }]}>{cfg.text}</Text>
    </View>
  );
}

const verdictStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 4 },
  text: { fontSize: 13, fontWeight: '700', flex: 1 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', gap: 0 },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { borderRadius: 999, height: 4, width: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  teamsBlock: { flex: 1, gap: 4 },
  teamsLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  teamName: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  vsText: { fontSize: 11, fontWeight: '600' },
  competitionLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  competitionText: { fontSize: 12, fontWeight: '600' },
  oddRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 4 },
  oddRowLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  oddRowValue: { fontSize: 13, fontWeight: '700' },
  oddValue: { fontSize: 22, fontWeight: '900' },
  impliedProbText: { fontSize: 11, fontWeight: '600' },
  scrollContent: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  emptyBox: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '700' },
  emptyBody: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
