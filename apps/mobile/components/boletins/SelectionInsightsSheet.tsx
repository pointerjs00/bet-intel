import React, { useEffect, useMemo, useState } from 'react';
import { Animated, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss';
import { Ionicons } from '@expo/vector-icons';
import { Sport } from '@betintel/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalStats } from '../../services/statsService';
import { useTeams } from '../../services/referenceService';
import { useTheme } from '../../theme/useTheme';
import { TeamBadge } from '../ui/TeamBadge';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { Skeleton } from '../ui/Skeleton';
import { formatCurrency, formatOdds } from '../../utils/formatters';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** ISO date string for the match kickoff — shown in the sheet header */
  kickoffAt?: string | null;
}

interface Props {
  visible: boolean;
  item: SelectionInsightsItem | null;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function winRateColor(winRate: number, impliedProb: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (winRate > impliedProb + 5) return colors.primary;
  if (winRate < impliedProb - 5) return colors.danger;
  return colors.warning;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  totalBets,
  won,
  lost,
  winRate,
  roi,
  profitLoss,
  impliedProb,
}: {
  label: string;
  totalBets: number;
  won?: number;
  lost?: number;
  winRate: number;
  roi: number;
  profitLoss?: number;
  impliedProb: number;
}) {
  const { colors } = useTheme();
  const wr = Math.round(winRate);
  const barColor = winRateColor(winRate, impliedProb, colors);
  const roiPositive = roi >= 0;
  const hasRecord = won !== undefined && lost !== undefined;
  const hasPL = profitLoss !== undefined;

  return (
    <View style={[scStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <View style={scStyles.topRow}>
        <Text style={[scStyles.label, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
        <Text style={[scStyles.bets, { color: colors.textMuted }]}>{totalBets} aposta{totalBets !== 1 ? 's' : ''}</Text>
      </View>

      <View style={scStyles.metricsRow}>
        <View style={scStyles.metricBlock}>
          <Text style={[scStyles.metricValue, { color: barColor }]}>{wr}%</Text>
          <Text style={[scStyles.metricLabel, { color: colors.textMuted }]}>Taxa vitória</Text>
        </View>
        <View style={[scStyles.divider, { backgroundColor: colors.border }]} />
        <View style={scStyles.metricBlock}>
          <Text style={[scStyles.metricValue, { color: roiPositive ? colors.primary : colors.danger }]}>
            {roiPositive ? '+' : ''}{roi.toFixed(1)}%
          </Text>
          <Text style={[scStyles.metricLabel, { color: colors.textMuted }]}>ROI</Text>
        </View>
        <View style={[scStyles.divider, { backgroundColor: colors.border }]} />
        <View style={[scStyles.metricBlock, { flex: 2 }]}>
          <View style={[scStyles.barTrack, { backgroundColor: colors.border }]}>
            <View style={[scStyles.barFill, { width: `${Math.min(wr, 100)}%`, backgroundColor: barColor }]} />
            <View style={[scStyles.impliedMarker, { left: `${Math.min(impliedProb, 100)}%`, backgroundColor: colors.textMuted }]} />
          </View>
          <Text style={[scStyles.metricLabel, { color: colors.textMuted }]}>vs {Math.round(impliedProb)}% implícita</Text>
        </View>
      </View>

      {(hasRecord || hasPL) && (
        <View style={[scStyles.footerRow, { borderTopColor: colors.border }]}>
          {hasRecord ? (
            <Text style={[scStyles.record, { color: colors.textMuted }]}>
              <Text style={{ color: colors.primary }}>{won}G</Text>
              {' · '}
              <Text style={{ color: colors.danger }}>{lost}P</Text>
              {totalBets - won! - lost! > 0 ? ` · ${totalBets - won! - lost!}A` : ''}
            </Text>
          ) : <View />}
          {hasPL ? (
            <Text style={[scStyles.pl, { color: profitLoss! >= 0 ? colors.primary : colors.danger }]}>
              {profitLoss! >= 0 ? '+' : ''}{formatCurrency(profitLoss!)}
            </Text>
          ) : null}
        </View>
      )}

      {totalBets < 5 && (
        <Text style={[scStyles.lowData, { color: colors.textMuted }]}>⚠ Poucos dados — pode não ser representativo</Text>
      )}
    </View>
  );
}

const scStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '700', flex: 1 },
  bets: { fontSize: 11, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricBlock: { flex: 1, alignItems: 'center', gap: 2 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  divider: { width: StyleSheet.hairlineWidth, height: 32 },
  barTrack: { height: 6, borderRadius: 999, overflow: 'hidden', width: '100%' },
  barFill: { height: 6, borderRadius: 999 },
  impliedMarker: { position: 'absolute', top: -2, width: 2, height: 10, borderRadius: 1 },
  footerRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 7,
    marginTop: 2,
  },
  record: { fontSize: 12, fontWeight: '600' },
  pl: { fontSize: 12, fontWeight: '800' },
  lowData: { fontSize: 10, fontStyle: 'italic' },
});

// ─── Verdict banner ───────────────────────────────────────────────────────────

function VerdictBanner({
  verdict,
  result,
  colors,
}: {
  verdict: 'aligned' | 'surprise' | 'value' | 'novalue';
  result?: string;
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
    cfg = { icon: 'trending-up', color: colors.primary, text: 'Valor positivo — taxa histórica acima da odd implícita' };
  } else {
    cfg = { icon: 'trending-down', color: colors.warning, text: 'Taxa histórica abaixo da probabilidade implícita' };
  }
  return (
    <View style={[vStyles.banner, { backgroundColor: cfg.color + '18', borderColor: cfg.color }]}>
      <Ionicons name={cfg.icon} size={16} color={cfg.color} />
      <Text style={[vStyles.text, { color: cfg.color }]}>{cfg.text}</Text>
    </View>
  );
}

const vStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  text: { fontSize: 12, fontWeight: '700', flex: 1 },
});

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ text, colors }: { text: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Text style={[slStyles.label, { color: colors.textMuted }]}>{text.toUpperCase()}</Text>
  );
}
const slStyles = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginTop: 4 },
});

// ─── Quick context chips ──────────────────────────────────────────────────────

function ContextChip({ icon, label, color, bg }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[chipStyles.chip, { backgroundColor: bg, borderColor: color + '40' }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[chipStyles.text, { color }]}>{label}</Text>
    </View>
  );
}
const chipStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontSize: 12, fontWeight: '700' },
});

// ─── Tennis photo hook ────────────────────────────────────────────────────────

/**
 * Fetches ATP + WTA player photo URLs and returns a name→imageUrl lookup map.
 * Only fires when the sheet is visible and the sport is tennis.
 */
function useTennisPhotoLookup(sport: string, enabled: boolean): Map<string, string> {
  const isTennis = sport === Sport.TENNIS && enabled;

  const atpQuery = useTeams(
    { sport: Sport.TENNIS, competition: 'ATP Tour' },
    { enabled: isTennis },
  );
  const wtaQuery = useTeams(
    { sport: Sport.TENNIS, competition: 'WTA Tour' },
    { enabled: isTennis },
  );

  return useMemo(() => {
    if (!isTennis) return new Map();
    const map = new Map<string, string>();
    for (const t of [...(atpQuery.data ?? []), ...(wtaQuery.data ?? [])]) {
      if (!t.imageUrl) continue;
      map.set(t.name, t.imageUrl);
      if (t.displayName) map.set(t.displayName, t.imageUrl);
    }
    return map;
  }, [isTennis, atpQuery.data, wtaQuery.data]);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SelectionInsightsSheet({ visible, item, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { panHandlers, animatedStyle } = useSwipeToDismiss(onClose, { visible });
  const statsQuery = usePersonalStats('all', [], undefined, undefined, visible && item !== null);
  const stats = statsQuery.data;

  const [insightsExpanded, setInsightsExpanded] = useState(false);

  useEffect(() => {
    if (item !== null) setInsightsExpanded(false);
  }, [item]);

  // ── Tennis photo resolution ───────────────────────────────────────────────
  // Fetch ATP/WTA photos internally so this sheet works correctly from ANY
  // parent (home screen, detail screen, etc.) regardless of whether the caller
  // passes imageUrl props.
  const tennisLookup = useTennisPhotoLookup(item?.sport ?? '', visible && item !== null);

  // Resolve final image URLs: prefer explicitly passed props, then fall back to
  // the internally-fetched lookup map.
  const homeTeamImageUrl = item?.homeTeamImageUrl ?? (item ? (tennisLookup.get(item.homeTeam) ?? null) : null);
  const awayTeamImageUrl = item?.awayTeamImageUrl ?? (item ? (tennisLookup.get(item.awayTeam) ?? null) : null);

  const odd = item ? (typeof item.oddValue === 'string' ? parseFloat(item.oddValue) : item.oddValue) : 1;
  const impliedProb = odd > 1 ? (1 / odd) * 100 : 0;
  const isFavourite = odd < 2.0;

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
    const sportMarketCell = stats.bySportMarket.find(
      (c) => c.sport === item.sport && c.market.toLowerCase() === item.market.toLowerCase(),
    ) ?? null;

    const rates: number[] = [];
    if (sportRow && sportRow.totalBets >= 3) rates.push(sportRow.winRate);
    if (competitionRow && competitionRow.totalBets >= 3) rates.push(competitionRow.winRate);
    if (marketRow && marketRow.totalBets >= 3) rates.push(marketRow.winRate);
    const avgWinRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
    const hasEdge = avgWinRate !== null ? avgWinRate > impliedProb : null;

    let outcomeVerdict: 'aligned' | 'surprise' | null = null;
    if ((item.result === 'WON' || item.result === 'LOST') && hasEdge !== null) {
      outcomeVerdict = (hasEdge === (item.result === 'WON')) ? 'aligned' : 'surprise';
    }

    return {
      sportRow, competitionRow, marketRow, oddsRangeRow, homeTeamRow, awayTeamRow,
      sportMarketCell, avgWinRate, hasEdge, outcomeVerdict,
      hasAnyData: !!(sportRow || competitionRow || marketRow),
    };
  }, [stats, item, odd, impliedProb]);

  if (!item) return null;

  const isResolved = item.result === 'WON' || item.result === 'LOST' || item.result === 'VOID';
  const summary = stats?.summary;

  const betTypeWinRate = isFavourite ? (summary?.favouriteWinRate ?? 0) : (summary?.underdogWinRate ?? 0);
  const betTypeROI = isFavourite ? (summary?.favouriteROI ?? 0) : (summary?.underdogROI ?? 0);
  const betTypeBets = isFavourite ? (summary?.favouriteBets ?? 0) : (summary?.underdogBets ?? 0);

  const oddsRangeLabel = insights?.oddsRangeRow
    ? (() => {
        const r = insights.oddsRangeRow;
        if (r.minOdds === null) return `Odds < ${r.maxOdds}`;
        if (r.maxOdds === null) return `Odds ≥ ${r.minOdds}`;
        return `Odds ${r.minOdds}–${r.maxOdds}`;
      })()
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }, animatedStyle, insightsExpanded && styles.sheetExpanded]}>
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
                  imageUrl={homeTeamImageUrl}
                  size={20}
                  variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                />
                <Text numberOfLines={1} style={[styles.teamName, { color: colors.textPrimary }]}>{item.homeTeam}</Text>
                <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
                <Text numberOfLines={1} style={[styles.teamName, { color: colors.textPrimary }]}>{item.awayTeam}</Text>
                <TeamBadge
                  name={item.awayTeam}
                  imageUrl={awayTeamImageUrl}
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

          {/* Kickoff date/time */}
          {item.kickoffAt ? (() => {
            const d = new Date(item.kickoffAt);
            const past = d.getTime() < Date.now();
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            const kickoffColor = past ? colors.danger : colors.textSecondary;
            return (
              <View style={[styles.kickoffBadge, { backgroundColor: kickoffColor + '18', borderColor: kickoffColor + '40', marginHorizontal: 16, marginBottom: 4 }]}>
                <Ionicons name={past ? 'radio-button-on' : 'time-outline'} size={13} color={kickoffColor} />
                <Text style={[styles.kickoffBadgeText, { color: kickoffColor }]}>
                  {past ? 'Em curso · ' : ''}{`${dd}/${mm}  ${hh}:${min}`}
                </Text>
              </View>
            );
          })() : null}

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

          {/* Collapsible toggle — always visible */}
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext({
                duration: 240,
                update: { type: LayoutAnimation.Types.easeInEaseOut },
                create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
              });
              setInsightsExpanded((v) => !v);
            }}
            style={[styles.insightsToggle, { borderColor: insightsExpanded ? colors.primary : colors.border, backgroundColor: insightsExpanded ? colors.primary + '12' : colors.surfaceRaised }]}
          >
            <Ionicons name="stats-chart-outline" size={16} color={insightsExpanded ? colors.primary : colors.textSecondary} />
            <Text style={[styles.insightsToggleText, { color: insightsExpanded ? colors.primary : colors.textPrimary }]}>
              As tuas estatísticas
            </Text>
            <Ionicons name={insightsExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={insightsExpanded ? colors.primary : colors.textSecondary} />
          </Pressable>

          {/* Expanded content */}
          {insightsExpanded && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {statsQuery.isLoading ? (
                <View style={{ gap: 10 }}>
                  <Skeleton height={36} width="60%" borderRadius={20} />
                  <Skeleton height={90} width="100%" borderRadius={12} />
                  <Skeleton height={90} width="100%" borderRadius={12} />
                  <Skeleton height={90} width="100%" borderRadius={12} />
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {/* Quick context chips */}
                  <View style={styles.chipsRow}>
                    <ContextChip
                      icon={isFavourite ? 'star' : 'rocket-outline'}
                      label={isFavourite ? 'Favorito' : 'Azarão'}
                      color={isFavourite ? colors.primary : colors.warning}
                      bg={isFavourite ? colors.primary + '15' : colors.warning + '15'}
                    />
                    {oddsRangeLabel && (
                      <ContextChip
                        icon="options-outline"
                        label={oddsRangeLabel}
                        color={colors.textSecondary}
                        bg={colors.surfaceRaised}
                      />
                    )}
                    {summary && (
                      <ContextChip
                        icon="trophy-outline"
                        label={`${Math.round(summary.winRate)}% win global`}
                        color={colors.textSecondary}
                        bg={colors.surfaceRaised}
                      />
                    )}
                  </View>

                  {/* Verdict banners */}
                  {insights?.outcomeVerdict && (
                    <VerdictBanner
                      verdict={insights.outcomeVerdict}
                      result={item.result}
                      colors={colors}
                    />
                  )}
                  {!isResolved && insights !== null && insights.hasEdge !== null && (
                    <VerdictBanner
                      verdict={insights.hasEdge ? 'value' : 'novalue'}
                      result={item.result}
                      colors={colors}
                    />
                  )}

                  {/* Bet type section */}
                  {betTypeBets > 0 && (
                    <>
                      <SectionLabel
                        text={isFavourite ? 'As tuas apostas em favoritos' : 'As tuas apostas em azarões'}
                        colors={colors}
                      />
                      <StatCard
                        label={isFavourite ? `Favoritos (odd < 2.00)` : `Azarões (odd ≥ 2.00)`}
                        totalBets={betTypeBets}
                        winRate={betTypeWinRate}
                        roi={betTypeROI}
                        impliedProb={impliedProb}
                      />
                    </>
                  )}

                  {/* Context breakdowns */}
                  {insights?.hasAnyData && (
                    <SectionLabel text="Por contexto" colors={colors} />
                  )}

                  {insights?.sportRow && (
                    <StatCard
                      label={`${item.sport}`}
                      totalBets={insights.sportRow.totalBets}
                      won={insights.sportRow.won}
                      lost={insights.sportRow.lost}
                      winRate={insights.sportRow.winRate}
                      roi={insights.sportRow.roi}
                      profitLoss={insights.sportRow.profitLoss}
                      impliedProb={impliedProb}
                    />
                  )}

                  {insights?.competitionRow && (
                    <StatCard
                      label={item.competition}
                      totalBets={insights.competitionRow.totalBets}
                      won={insights.competitionRow.won}
                      lost={insights.competitionRow.lost}
                      winRate={insights.competitionRow.winRate}
                      roi={insights.competitionRow.roi}
                      profitLoss={insights.competitionRow.profitLoss}
                      impliedProb={impliedProb}
                    />
                  )}

                  {insights?.marketRow && (
                    <StatCard
                      label={`Mercado: ${item.market}`}
                      totalBets={insights.marketRow.totalBets}
                      won={insights.marketRow.won}
                      lost={insights.marketRow.lost}
                      winRate={insights.marketRow.winRate}
                      roi={insights.marketRow.roi}
                      profitLoss={insights.marketRow.profitLoss}
                      impliedProb={impliedProb}
                    />
                  )}

                  {insights?.sportMarketCell && (
                    <StatCard
                      label={`${item.sport} + ${item.market}`}
                      totalBets={insights.sportMarketCell.totalBets}
                      won={insights.sportMarketCell.won}
                      lost={insights.sportMarketCell.lost}
                      winRate={insights.sportMarketCell.winRate}
                      roi={insights.sportMarketCell.roi}
                      impliedProb={impliedProb}
                    />
                  )}

                  {insights?.oddsRangeRow && (
                    <StatCard
                      label={`Odds nesta gama`}
                      totalBets={insights.oddsRangeRow.totalBets}
                      won={insights.oddsRangeRow.won}
                      lost={insights.oddsRangeRow.lost}
                      winRate={insights.oddsRangeRow.winRate}
                      roi={insights.oddsRangeRow.roi}
                      profitLoss={insights.oddsRangeRow.profitLoss}
                      impliedProb={impliedProb}
                    />
                  )}

                  {(insights?.homeTeamRow || insights?.awayTeamRow) && (
                    <SectionLabel text="Por equipa" colors={colors} />
                  )}

                  {insights?.homeTeamRow && (
                    <StatCard
                      label={item.homeTeam}
                      totalBets={insights.homeTeamRow.totalBets}
                      won={insights.homeTeamRow.won}
                      lost={insights.homeTeamRow.lost}
                      winRate={insights.homeTeamRow.winRate}
                      roi={insights.homeTeamRow.roi}
                      profitLoss={insights.homeTeamRow.profitLoss}
                      impliedProb={impliedProb}
                    />
                  )}

                  {insights?.awayTeamRow && (
                    <StatCard
                      label={item.awayTeam}
                      totalBets={insights.awayTeamRow.totalBets}
                      won={insights.awayTeamRow.won}
                      lost={insights.awayTeamRow.lost}
                      winRate={insights.awayTeamRow.winRate}
                      roi={insights.awayTeamRow.roi}
                      profitLoss={insights.awayTeamRow.profitLoss}
                      impliedProb={impliedProb}
                    />
                  )}

                  {!insights?.hasAnyData && betTypeBets === 0 && (
                    <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                      <Ionicons name="bar-chart-outline" size={28} color={colors.textMuted} />
                      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Sem dados suficientes</Text>
                      <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                        Continua a registar apostas para veres os teus padrões neste contexto.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  sheetExpanded: { flex: 1 },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { borderRadius: 999, height: 4, width: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  teamsBlock: { flex: 1, gap: 4 },
  teamsLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  teamName: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  vsText: { fontSize: 11, fontWeight: '600' },
  competitionLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  competitionText: { fontSize: 12, fontWeight: '600' },
  kickoffBadge: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  kickoffBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
  oddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  oddRowLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  oddRowValue: { fontSize: 13, fontWeight: '700' },
  oddValue: { fontSize: 22, fontWeight: '900' },
  impliedProbText: { fontSize: 11, fontWeight: '600' },
  insightsToggle: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  insightsToggleText: { flex: 1, fontSize: 14, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyBox: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '700' },
  emptyBody: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
