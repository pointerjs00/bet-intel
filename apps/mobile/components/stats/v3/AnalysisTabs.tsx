import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { BoletinDetail, PersonalStats, StatsBreakdownRow, StatsTimelinePoint } from '@betintel/shared';
import { Pressable } from '../../ui/Pressable';
import { TeamBadge } from '../../ui/TeamBadge';
import { CompetitionBadge } from '../../ui/CompetitionBadge';
import { useCardElevation } from '../../ui/ListCard';
import { useTheme } from '../../../theme/useTheme';
import { formatCurrency } from '../../../utils/formatters';
import { CalibrationChart } from '../CalibrationChart';
import { HeatmapCalendar } from '../HeatmapCalendar';
import { LegKillChart } from '../LegKillChart';
import { ROITrendChart } from '../ROITrendChart';
import { SportMarketMatrix } from '../SportMarketMatrix';
import { ColumnChart, type ColumnItem } from './ColumnChart';
import { BarModeToggle, DivergingBars, type BarMode } from './DivergingBars';
import { LastNCard } from './LastNCard';
import { ProfitCurve } from './ProfitCurve';
import { StatCard, TabHeadline } from './StatCard';
import { AnalysisHero, FigureTiles, GoodBadCard, InsightsCard, VersusCard, pct } from './SummaryBlocks';

if (Platform.OS === 'android') {
  // Expand/collapse of "Ver todos" and "Avançado" animate with LayoutAnimation.
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export type AnalysisTab = 'summary' | 'sports' | 'bets' | 'habits';

export interface TabContext {
  stats: PersonalStats;
  timeline: StatsTimelinePoint[];
  boletins: BoletinDetail[];
  periodLabel: string;
  onInfo: (metric: string, value?: number) => void;
  onFilter: (params: Record<string, string>) => void;
  onOpenTeam: (name: string) => void;
}

const euro = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v)).replace(/,00(?=\s?€)/, '')}`;
const MIN = 10;
/** Unsigned whole euros for sentences and column labels ("61 €"). */
const amount = (v: number) => `${Math.round(Math.abs(v))} €`;
/** Signed whole euros for chart labels ("+130 €"). */
const euroShort = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v))} €`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const SPORT_ICON: Record<string, string> = {
  FOOTBALL: 'soccer', BASKETBALL: 'basketball', TENNIS: 'tennis', HANDBALL: 'handball', VOLLEYBALL: 'volleyball',
  HOCKEY: 'hockey-sticks', RUGBY: 'rugby', AMERICAN_FOOTBALL: 'football', BASEBALL: 'baseball', OTHER: 'trophy-outline',
};

function SportGlyph({ sport }: { sport: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: colors.background }]}>
      <MaterialCommunityIcons color={colors.textSecondary} name={(SPORT_ICON[sport] ?? 'trophy-outline') as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={15} />
    </View>
  );
}

/** Mode toggle state shared by a card's header and its bars. */
function useMode(): [BarMode, (m: BarMode) => void] {
  return useState<BarMode>('profit');
}

const best = (rows: StatsBreakdownRow[]) => [...rows].filter((r) => r.totalBets >= MIN).sort((a, b) => b.profitLoss - a.profitLoss)[0];
const worst = (rows: StatsBreakdownRow[]) => [...rows].filter((r) => r.totalBets >= MIN).sort((a, b) => a.profitLoss - b.profitLoss)[0];

// ── Resumo ──────────────────────────────────────────────────────────────────

export function SummaryTab({ ctx, footer }: { ctx: TabContext; footer?: React.ReactNode }) {
  const { stats, timeline, boletins, periodLabel, onInfo } = ctx;
  const elevation = useCardElevation();
  const selectionHit = useMemo(() => {
    const won = stats.bySport.reduce((a, r) => a + r.won, 0);
    const lost = stats.bySport.reduce((a, r) => a + r.lost, 0);
    return won + lost > 0 ? (won / (won + lost)) * 100 : null;
  }, [stats.bySport]);
  return (
    <View style={styles.stack}>
      <AnalysisHero periodLabel={periodLabel} selectionHitRate={selectionHit} stats={stats} />
      <InsightsCard index={1} insights={stats.insights} />
      <GoodBadCard index={2} stats={stats} />
      <ProfitCurve
        best={stats.bestBoletins[0]?.profitLoss}
        data={timeline}
        index={3}
        worst={stats.worstBoletins[0]?.profitLoss}
      />
      {boletins.length > 0 ? (
        <Animated.View entering={FadeIn.delay(220).duration(300)} style={[styles.wrapCard, elevation]}>
          <HeatmapCalendar boletins={boletins} onInfoPress={() => onInfo('heatmap')} />
        </Animated.View>
      ) : null}
      <LastNCard boletins={boletins} index={5} periodRoi={stats.summary.roi} />
      {footer}
    </View>
  );
}

// ── Desportos ───────────────────────────────────────────────────────────────

export function SportsTab({ ctx }: { ctx: TabContext }) {
  const { stats, onInfo, onFilter, onOpenTeam } = ctx;
  const { colors } = useTheme();
  const [sportMode, setSportMode] = useMode();
  const [compMode, setCompMode] = useMode();
  const [teamMode, setTeamMode] = useMode();
  const b = best(stats.bySport);
  const w = worst(stats.bySport);
  // A sport where most picks hit but money is still lost: worth explaining.
  const paradox = stats.bySport.find((r) => r.totalBets >= MIN && r.winRate >= 60 && r.roi < 0);
  const s = stats.summary;
  return (
    <View style={styles.stack}>
      {b ? (
        <TabHeadline
          parts={[
            { text: 'O ' }, { text: b.label.toLowerCase(), tone: 'positive' }, { text: ` dá-te ${amount(b.profitLoss)}.` },
            ...(w && w.profitLoss < 0 ? [{ text: ' O ' }, { text: w.label.toLowerCase(), tone: 'negative' as const }, { text: ` tira-te ${amount(w.profitLoss)}.` }] : []),
          ]}
        />
      ) : null}
      <StatCard icon={{ name: 'mci:trophy-variant', tone: 'green' }} index={1} onInfoPress={() => onInfo('by-sport')} right={<BarModeToggle mode={sportMode} onChange={setSportMode} />} title="Por desporto">
        <DivergingBars mode={sportMode} onRowPress={(r) => onFilter({ filterSport: r.key })} renderLeft={(r) => <SportGlyph sport={r.sport} />} rows={stats.bySport} />
      </StatCard>
      {paradox ? (
        <StatCard index={2} tint={`${colors.info}14`}>
          <View style={styles.noteRow}>
            <Ionicons color={colors.info} name="information-circle" size={22} />
            <Text style={[styles.noteText, { color: colors.textPrimary }]}>
              No {paradox.label.toLowerCase()} acertas {Math.round(paradox.winRate)}% das seleções e mesmo assim perdes: as odds são baixas para o risco que corres.
            </Text>
          </View>
        </StatCard>
      ) : null}
      {s.homeBets + s.awayBets > 0 ? (
        <VersusCard
          icon={{ name: 'mci:stadium-variant', tone: 'teal' }}
          index={3}
          left={{ label: 'Equipa da casa', roi: s.homeROI, hit: s.homeWinRate, bets: s.homeBets }}
          note={Math.abs(s.homeROI - s.awayROI) < 5 ? 'Quase igual: não é aqui que está a diferença.' : s.homeROI > s.awayROI ? 'Rendes mais a apostar na equipa da casa.' : 'Rendes mais a apostar na equipa de fora.'}
          right={{ label: 'Equipa de fora', roi: s.awayROI, hit: s.awayWinRate, bets: s.awayBets }}
          title="Casa vs fora"
        />
      ) : null}
      <StatCard icon={{ name: 'mci:podium-gold', tone: 'amber' }} index={4} right={<BarModeToggle mode={compMode} onChange={setCompMode} />} subtitle={`${stats.byCompetition.length} competições`} title="Competições">
        <DivergingBars mode={compMode} onRowPress={(r) => onFilter({ filterCompetition: r.label })} renderLeft={(r) => <CompetitionBadge name={r.label} size={18} />} rows={stats.byCompetition} />
      </StatCard>
      <StatCard icon={{ name: 'mci:shield-half-full', tone: 'purple' }} index={5} right={<BarModeToggle mode={teamMode} onChange={setTeamMode} />} subtitle="Toca para ver o histórico da equipa" title="Equipas e jogadores">
        <DivergingBars maxRows={6} mode={teamMode} onRowPress={(r) => onOpenTeam(r.label)} renderLeft={(r) => <TeamBadge name={r.label} size={20} />} rows={stats.byTeam} />
      </StatCard>
    </View>
  );
}

// ── Apostas ─────────────────────────────────────────────────────────────────

function Advanced({ stats, onInfo }: { stats: PersonalStats; onInfo: TabContext['onInfo'] }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const s = stats.summary;
  return (
    <View style={[styles.advanced, { borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen((v) => !v); }}
        style={styles.advancedHead}
      >
        <MaterialCommunityIcons color={colors.textSecondary} name="flask-outline" size={20} />
        <View style={styles.flex}>
          <Text style={[styles.advancedTitle, { color: colors.textPrimary }]}>Avançado</Text>
          <Text style={[styles.advancedSub, { color: colors.textMuted }]}>Calibração, seleção que falha, variância…</Text>
        </View>
        <Ionicons color={colors.textMuted} name={open ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(250)} style={styles.advancedBody}>
          <FigureTiles
            items={[
              { value: s.oddsEfficiency > 0 ? `${Math.round(s.oddsEfficiency)}%` : '–', label: 'eficiência de odds', color: s.oddsEfficiency >= 100 ? colors.positive : colors.negative },
              { value: formatCurrency(s.stdDev), label: 'desvio padrão por boletim' },
            ]}
          />
          {stats.roiTrend.length >= 2 ? <ROITrendChart data={stats.roiTrend} onInfoPress={() => onInfo('roi-trend')} /> : null}
          {stats.calibration.length >= 2 ? <CalibrationChart data={stats.calibration} onInfoPress={() => onInfo('calibration')} /> : null}
          {stats.legKillDistribution.length > 0 ? <LegKillChart data={stats.legKillDistribution} onInfoPress={() => onInfo('leg-kill')} /> : null}
          {stats.bySportMarket.length > 0 ? <SportMarketMatrix cells={stats.bySportMarket} onInfoPress={() => onInfo('sport-market-matrix')} /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

export function BetsTab({ ctx }: { ctx: TabContext }) {
  const { stats, onInfo, onFilter } = ctx;
  const { colors } = useTheme();
  const [legMode, setLegMode] = useMode();
  const [mktMode, setMktMode] = useMode();
  const [siteMode, setSiteMode] = useMode();
  const [stakeMode, setStakeMode] = useMode();
  const s = stats.summary;
  const legs = useMemo(() => [...stats.byLegCount].sort((a, b) => a.legCount - b.legCount), [stats.byLegCount]);
  const single = legs.find((r) => r.legCount === 1);
  const multi = legs.filter((r) => r.legCount >= 2 && r.totalBets >= 5).sort((a, b) => a.roi - b.roi)[0];
  const odds = useMemo<ColumnItem[]>(
    () => [...stats.byOddsRange]
      .sort((a, b) => (a.minOdds ?? 0) - (b.minOdds ?? 0))
      .map((r) => ({ key: r.key, label: r.label.replace(/\./g, ',').replace('<', '<'), value: r.roi, sub: `${r.totalBets}`, few: r.totalBets < MIN })),
    [stats.byOddsRange],
  );
  const fs = s.freebetSummary;
  return (
    <View style={styles.stack}>
      <TabHeadline
        parts={[
          ...(single && single.roi > 0 ? [{ text: 'Ganhas com ' }, { text: 'simples', tone: 'positive' as const }] : [{ text: 'As tuas apostas' }]),
          ...(s.underdogROI > s.favouriteROI && s.underdogBets >= MIN ? [{ text: ' e ' }, { text: 'odds acima de 2', tone: 'positive' as const }] : []),
          { text: '.' },
          ...(multi && multi.roi < 0 ? [{ text: ' Perdes nas ' }, { text: `múltiplas de ${multi.label}`, tone: 'negative' as const }, { text: '.' }] : []),
        ]}
      />
      <StatCard icon={{ name: 'mci:layers-triple', tone: 'purple' }} index={1} onInfoPress={() => onInfo('by-leg-count')} right={<BarModeToggle mode={legMode} onChange={setLegMode} />} title="Simples vs múltiplas">
        <DivergingBars keepOrder mode={legMode} onRowPress={(r) => onFilter({ filterLegCount: String(r.legCount) })} rows={legs} unit="boletins" />
      </StatCard>
      {odds.length > 0 ? (
        <StatCard icon={{ name: 'mci:scale-balance', tone: 'blue' }} index={2} onInfoPress={() => onInfo('by-odds-range')} subtitle="Retorno por intervalo de odd · nº de seleções por baixo" title="Retorno por odd">
          <ColumnChart format={(v) => pct(v, 0)} items={odds} />
        </StatCard>
      ) : null}
      {s.favouriteBets + s.underdogBets > 0 ? (
        <VersusCard
          icon={{ name: 'mci:sword-cross', tone: 'pink' }}
          index={3}
          left={{ label: 'Favorito · odd < 2', roi: s.favouriteROI, hit: s.favouriteWinRate, bets: s.favouriteBets }}
          note={
            s.favouriteBets > s.underdogBets && s.favouriteROI < s.underdogROI
              ? `${Math.round((s.favouriteBets / (s.favouriteBets + s.underdogBets)) * 100)}% das tuas seleções são favoritos, que é onde rendes menos.`
              : undefined
          }
          right={{ label: 'Underdog · odd ≥ 2', roi: s.underdogROI, hit: s.underdogWinRate, bets: s.underdogBets }}
          title="Favoritos vs underdogs"
        />
      ) : null}
      <StatCard icon={{ name: 'mci:format-list-bulleted-type', tone: 'teal' }} index={4} right={<BarModeToggle mode={mktMode} onChange={setMktMode} />} subtitle={`${stats.byMarket.length} mercados`} title="Mercados">
        <DivergingBars maxRows={5} mode={mktMode} onRowPress={(r) => onFilter({ filterMarket: r.label })} rows={stats.byMarket} />
      </StatCard>
      {stats.bySite.length > 0 ? (
        <StatCard icon={{ name: 'mci:storefront-outline', tone: 'amber' }} index={5} right={<BarModeToggle mode={siteMode} onChange={setSiteMode} />} title="Casas de apostas">
          <DivergingBars minBets={3} mode={siteMode} onRowPress={(r) => onFilter({ filterSite: r.siteSlug })} rows={stats.bySite} unit="boletins" />
        </StatCard>
      ) : null}
      {stats.byStakeBracket.length > 0 ? (
        <StatCard icon={{ name: 'mci:cash-multiple', tone: 'green' }} index={6} right={<BarModeToggle mode={stakeMode} onChange={setStakeMode} />} title="Por valor apostado">
          <DivergingBars keepOrder minBets={3} mode={stakeMode} rows={[...stats.byStakeBracket].sort((a, b) => a.minStake - b.minStake)} unit="boletins" />
        </StatCard>
      ) : null}
      {fs.totalFreebets > 0 ? (
        <StatCard icon={{ name: 'gift', tone: 'pink' }} index={7} onInfoPress={() => onInfo('freebet', fs.totalFreebets)} title="Freebets">
          <FigureTiles
            items={[
              { value: `${fs.wonFreebets}/${fs.totalFreebets}`, label: 'ganhas' },
              { value: euro(fs.profitLoss), label: 'lucro', color: fs.profitLoss >= 0 ? colors.positive : colors.negative },
            ]}
          />
        </StatCard>
      ) : null}
      <Advanced onInfo={onInfo} stats={stats} />
    </View>
  );
}

// ── Hábitos ─────────────────────────────────────────────────────────────────

const DAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const BLOCKS: Array<{ label: string; from: number; to: number }> = [
  { label: 'Madrugada', from: 0, to: 6 },
  { label: 'Manhã', from: 6, to: 12 },
  { label: 'Tarde', from: 12, to: 18 },
  { label: 'Noite', from: 18, to: 24 },
];

export function HabitsTab({ ctx }: { ctx: TabContext }) {
  const { stats, onInfo } = ctx;
  const { colors } = useTheme();
  const [dayMode, setDayMode] = useState<BarMode>('profit');
  const s = stats.summary;
  // Monday first.
  const days = useMemo(() => [...stats.byWeekday].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)), [stats.byWeekday]);
  const dayItems = days.map((d) => ({ key: d.key, label: DAY_SHORT[d.weekday] ?? d.label.slice(0, 1), value: dayMode === 'profit' ? d.profitLoss : d.roi, sub: String(d.totalBets), few: d.totalBets < 5 }));
  const hourItems = useMemo<ColumnItem[]>(() => BLOCKS.map((blk) => {
    const rows = stats.byHour.filter((h) => h.hour >= blk.from && h.hour < blk.to);
    const profit = rows.reduce((a, r) => a + r.profitLoss, 0);
    const bets = rows.reduce((a, r) => a + r.totalBets, 0);
    return { key: blk.label, label: blk.label, value: profit, sub: `${bets}`, few: bets < 5 };
  }), [stats.byHour]);
  const bestDay = days.filter((d) => d.totalBets >= 5).sort((a, b) => b.profitLoss - a.profitLoss)[0];
  const badDays = days.filter((d) => d.totalBets >= 5 && d.profitLoss < 0);
  const badTotal = badDays.reduce((a, d) => a + d.profitLoss, 0);
  const streak = s.streaks;
  return (
    <View style={styles.stack}>
      {bestDay ? (
        <TabHeadline
          parts={[
            { text: 'O teu melhor dia é ' }, { text: bestDay.label.toLowerCase(), tone: 'positive' }, { text: '.' },
            ...(badDays.length ? [{ text: ' ' }, { text: cap(badDays.map((d) => `${d.label.toLowerCase()}s`).join(' e ')), tone: 'negative' as const }, { text: ` custam-te ${amount(badTotal)}.` }] : []),
          ]}
        />
      ) : null}
      {days.length > 0 ? (
        <StatCard icon={{ name: 'calendar', tone: 'blue' }} index={1} onInfoPress={() => onInfo('by-weekday')} right={<BarModeToggle mode={dayMode} onChange={setDayMode} />} subtitle="Nº de boletins por baixo de cada dia" title="Por dia da semana">
          <ColumnChart format={(v) => (dayMode === 'profit' ? euroShort(v) : pct(v, 0))} items={dayItems} />
        </StatCard>
      ) : null}
      {stats.byHour.length > 0 ? (
        <StatCard icon={{ name: 'time', tone: 'purple' }} index={2} onInfoPress={() => onInfo('by-hour')} subtitle="Lucro por altura do dia" title="Por hora">
          <ColumnChart format={euroShort} items={hourItems} />
        </StatCard>
      ) : null}
      <StatCard icon={{ name: 'flame', tone: 'amber' }} index={3} onInfoPress={() => onInfo('streaks')} title="Sequências">
        <FigureTiles
          items={[
            {
              value: String(streak.currentCount),
              label: streak.currentType === 'WON' ? `vitória${streak.currentCount === 1 ? '' : 's'} seguida${streak.currentCount === 1 ? '' : 's'} agora` : streak.currentType === 'LOST' ? `derrota${streak.currentCount === 1 ? '' : 's'} seguida${streak.currentCount === 1 ? '' : 's'} agora` : 'sequência atual',
              color: streak.currentType === 'WON' ? colors.positive : streak.currentType === 'LOST' ? colors.negative : undefined,
            },
            { value: String(streak.longestWin), label: 'recorde de vitórias' },
            { value: String(streak.longestLoss), label: 'pior série', color: colors.negative },
          ]}
        />
      </StatCard>
      <StatCard icon={{ name: 'mci:hand-coin', tone: 'teal' }} index={4} onInfoPress={() => onInfo('avg-stake-outcome')} subtitle="Apostas mais quando estás confiante?" title="Valor apostado: ganhas vs perdidas">
        <FigureTiles
          items={[
            { value: formatCurrency(s.averageWonStake), label: 'média nas ganhas', color: colors.positive },
            { value: formatCurrency(s.averageLostStake), label: 'média nas perdidas', color: colors.negative },
          ]}
        />
      </StatCard>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  flex: { flex: 1 },
  wrapCard: { borderRadius: 22 },
  glyph: { alignItems: 'center', borderRadius: 8, height: 24, justifyContent: 'center', width: 24 },
  noteRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  noteText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
  advanced: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  advancedHead: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 60, paddingHorizontal: 16 },
  advancedTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  advancedSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  advancedBody: { gap: 12, padding: 12, paddingTop: 0 },
});
