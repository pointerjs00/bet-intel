import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { PersonalStats, StatsBySportRow, StatsPeriod } from '@betintel/shared';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { getLeagueLogoUrl } from '../../utils/sportAssets';
import { TeamBadge } from '../ui/TeamBadge';

// ── ViewShot lazy-require ────────────────────────────────────────────────────

type ViewShotRef = { capture: () => Promise<string> };
type ViewShotType = React.ComponentType<{
  ref?: React.Ref<ViewShotRef>;
  style?: object;
  children?: React.ReactNode;
}>;
let ViewShot: ViewShotType | null = null;
try {
  ViewShot = (require('react-native-view-shot') as { default: ViewShotType }).default;
} catch {}

// ── Types & constants ────────────────────────────────────────────────────────

export type ShareMode = 'simple' | 'detailed';

/** Imperative handle so StatsShareSheet can call capture() without owning state */
export type StatsShareCardHandle = {
  capture: () => Promise<string | null>;
  isReady: boolean;
};

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  week: 'Esta Semana',
  month: 'Este Mês',
  year: 'Este Ano',
  all: 'Estatísticas globais',
};

const SPORT_EMOJIS: Record<string, string> = {
  FOOTBALL: '⚽', BASKETBALL: '🏀', TENNIS: '🎾', HANDBALL: '🤾',
  VOLLEYBALL: '🏐', HOCKEY: '🏒', RUGBY: '🏉', AMERICAN_FOOTBALL: '🏈',
  BASEBALL: '⚾', OTHER: '🎯',
};

const DETAILED_PAGE_COUNT = 4;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 45%, 32%)`;
}

function CompBadge({ name, size }: { name: string; size: number }) {
  const logoUrl = getLeagueLogoUrl(name);
  const initials = name.slice(0, 2).toUpperCase();
  if (logoUrl) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 3, height: size, justifyContent: 'center', width: size }}>
        <Image resizeMode="contain" source={{ uri: logoUrl }} style={{ height: size * 0.86, width: size * 0.86 }} />
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', backgroundColor: nameToColor(name), borderRadius: 3, height: size, justifyContent: 'center', width: size }}>
      <Text style={{ color: '#fff', fontSize: Math.max(size * 0.35, 7), fontWeight: '800' }}>{initials}</Text>
    </View>
  );
}

// ── Shared card sub-components ───────────────────────────────────────────────

function CardHeader({ period, pageTitle, pageNum }: { period: StatsPeriod; pageTitle?: string; pageNum?: number }) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.brand}>BetIntel</Text>
        {pageTitle ? <Text style={s.pageSubtitle}>{pageTitle}</Text> : null}
      </View>
      <View style={s.headerRight}>
        {pageNum !== undefined ? <Text style={s.pageNum}>{pageNum}/{DETAILED_PAGE_COUNT}</Text> : null}
        <View style={s.periodBadge}>
          <Text style={s.periodText}>{PERIOD_LABEL[period]}</Text>
        </View>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function BoletinList({ items, color }: { items: PersonalStats['bestBoletins']; color: string }) {
  return (
    <>
      {items.slice(0, 5).map((b, i) => (
        <View key={b.id} style={s.listRow}>
          <Text style={s.listRank}>{i + 1}</Text>
          <View style={s.listNameCol}>
            <Text numberOfLines={1} style={s.listName}>{b.name ?? 'Boletim sem nome'}</Text>
            <Text style={s.listDate}>{fmtDate(b.createdAt)}</Text>
          </View>
          <Text style={[s.listValue, { color }]}>
            {b.profitLoss >= 0 ? '+' : ''}{formatCurrency(b.profitLoss)}
          </Text>
        </View>
      ))}
    </>
  );
}

// ── Detailed page cards ──────────────────────────────────────────────────────

function Page1({ stats, period, cardWidth }: { stats: PersonalStats; period: StatsPeriod; cardWidth: number }) {
  const { summary } = stats;
  const roiColor = summary.roi >= 0 ? '#00C851' : '#FF3B30';
  const plColor = summary.profitLoss >= 0 ? '#00C851' : '#FF3B30';
  const { streaks } = summary;
  const showStreak = streaks.currentCount >= 3 && streaks.currentType !== null;

  return (
    <View style={[s.card, { width: cardWidth }]}>
      <CardHeader period={period} pageTitle="Resumo" pageNum={1} />
      <View style={s.roiSection}>
        <Text style={s.roiLabel}>ROI</Text>
        <Text style={[s.roiValue, { color: roiColor }]}>
          {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(1)}%
        </Text>
      </View>
      <Divider />
      <View style={s.metricsRow}>
        <View style={s.metric}>
          <Text style={s.metricValue}>{summary.winRate.toFixed(0)}%</Text>
          <Text style={s.metricLabel}>Taxa vitória</Text>
        </View>
        <View style={s.metricSep} />
        <View style={s.metric}>
          <Text style={[s.metricValue, { color: plColor }]}>
            {summary.profitLoss >= 0 ? '+' : ''}{formatCurrency(summary.profitLoss)}
          </Text>
          <Text style={s.metricLabel}>P&L</Text>
        </View>
        <View style={s.metricSep} />
        <View style={s.metric}>
          <Text style={s.metricValue}>{summary.settledBoletins}</Text>
          <Text style={s.metricLabel}>Boletins</Text>
        </View>
      </View>
      {showStreak && (
        <View style={[s.streakBadge, { backgroundColor: streaks.currentType === 'WON' ? 'rgba(0,200,81,0.15)' : 'rgba(255,59,48,0.15)' }]}>
          <Text style={s.streakEmoji}>{streaks.currentType === 'WON' ? '🔥' : '❄️'}</Text>
          <Text style={[s.streakText, { color: streaks.currentType === 'WON' ? '#00C851' : '#FF3B30' }]}>
            Série de {streaks.currentCount} {streaks.currentType === 'WON' ? 'vitórias' : 'derrotas'}
          </Text>
        </View>
      )}
      <Divider />
      <View style={s.metricsRow}>
        <View style={s.metric}>
          <Text style={s.metricValue}>{formatCurrency(summary.totalStaked)}</Text>
          <Text style={s.metricLabel}>Total apostado</Text>
        </View>
        <View style={s.metricSep} />
        <View style={s.metric}>
          <Text style={s.metricValue}>{formatOdds(summary.averageOdds)}</Text>
          <Text style={s.metricLabel}>Odd média</Text>
        </View>
        <View style={s.metricSep} />
        <View style={s.metric}>
          <Text style={s.metricValue}>{formatCurrency(summary.averageStake)}</Text>
          <Text style={s.metricLabel}>Stake média</Text>
        </View>
      </View>
      <Text style={s.watermark}>betintel.app</Text>
    </View>
  );
}

function Page2({ stats, period, cardWidth }: { stats: PersonalStats; period: StatsPeriod; cardWidth: number }) {
  return (
    <View style={[s.card, { width: cardWidth }]}>
      <CardHeader period={period} pageTitle="Boletins" pageNum={2} />
      <View style={s.section}>
        <SectionLabel>🏆  Melhores boletins</SectionLabel>
        <BoletinList items={stats.bestBoletins} color="#00C851" />
      </View>
      <Divider />
      <View style={s.section}>
        <SectionLabel>💸  Piores boletins</SectionLabel>
        <BoletinList items={stats.worstBoletins} color="#FF3B30" />
      </View>
      <Text style={s.watermark}>betintel.app</Text>
    </View>
  );
}

function Page3({ stats, period, cardWidth }: { stats: PersonalStats; period: StatsPeriod; cardWidth: number }) {
  const topSports = [...stats.bySport].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topCompetitions = [...stats.byCompetition].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topTeams = [...stats.byTeam].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);

  return (
    <View style={[s.card, { width: cardWidth }]}>
      <CardHeader period={period} pageTitle="Desporto & Equipas" pageNum={3} />
      {topSports.length > 0 && (
        <View style={s.section}>
          <SectionLabel>⚽  Por desporto</SectionLabel>
          {topSports.map((row) => (
            <View key={row.key} style={s.breakdownRow}>
              <Text style={s.sportEmoji}>{SPORT_EMOJIS[(row as StatsBySportRow).sport] ?? '🎯'}</Text>
              <Text numberOfLines={1} style={s.breakdownLabel}>{row.label}</Text>
              <Text style={s.breakdownCount}>{row.totalBets} ap.</Text>
              <Text style={[s.breakdownROI, { color: row.roi >= 0 ? '#00C851' : '#FF3B30' }]}>
                {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      )}
      {topCompetitions.length > 0 && (
        <>
          <Divider />
          <View style={s.section}>
            <SectionLabel>🏅  Por competição</SectionLabel>
            {topCompetitions.map((row) => (
              <View key={row.key} style={s.breakdownRow}>
                <CompBadge name={row.label} size={18} />
                <Text numberOfLines={1} style={s.breakdownLabel}>{row.label}</Text>
                <Text style={s.breakdownCount}>{row.totalBets} ap.</Text>
                <Text style={[s.breakdownROI, { color: row.roi >= 0 ? '#00C851' : '#FF3B30' }]}>
                  {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      {topTeams.length > 0 && (
        <>
          <Divider />
          <View style={s.section}>
            <SectionLabel>👥  Por equipa / jogador</SectionLabel>
            {topTeams.map((row) => (
              <View key={row.key} style={s.breakdownRow}>
                <TeamBadge disableRemoteFallback name={row.label} size={18} />
                <Text numberOfLines={1} style={s.breakdownLabel}>{row.label}</Text>
                <Text style={s.breakdownCount}>{row.totalBets} ap.</Text>
                <Text style={[s.breakdownROI, { color: row.roi >= 0 ? '#00C851' : '#FF3B30' }]}>
                  {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      <Text style={s.watermark}>betintel.app</Text>
    </View>
  );
}

function Page4({ stats, period, cardWidth }: { stats: PersonalStats; period: StatsPeriod; cardWidth: number }) {
  const topMarkets = [...stats.byMarket].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const bestPoint = stats.timeline.length > 0
    ? stats.timeline.reduce((best, p) => p.profitLoss > best.profitLoss ? p : best)
    : null;
  const worstPoint = stats.timeline.length > 1
    ? stats.timeline.reduce((worst, p) => p.profitLoss < worst.profitLoss ? p : worst)
    : null;
  const showWorst = worstPoint && worstPoint !== bestPoint;

  return (
    <View style={[s.card, { width: cardWidth }]}>
      <CardHeader period={period} pageTitle="Mercados & Dias" pageNum={4} />
      {topMarkets.length > 0 && (
        <View style={s.section}>
          <SectionLabel>📋  Por mercado</SectionLabel>
          {topMarkets.map((row) => (
            <View key={row.key} style={s.breakdownRow}>
              <Text numberOfLines={1} style={s.breakdownLabel}>{row.label}</Text>
              <Text style={s.breakdownCount}>{row.totalBets} ap.</Text>
              <Text style={[s.breakdownROI, { color: row.roi >= 0 ? '#00C851' : '#FF3B30' }]}>
                {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      )}
      {(bestPoint || showWorst) && (
        <>
          <Divider />
          <View style={s.section}>
            <SectionLabel>📅  Dias de destaque</SectionLabel>
            {bestPoint && (
              <View style={s.dayRow}>
                <View>
                  <Text style={s.dayRoleLabel}>Mais lucrativo</Text>
                  <Text style={s.dayDate}>{fmtDate(bestPoint.bucketStart)}</Text>
                </View>
                <Text style={[s.dayValue, { color: '#00C851' }]}>
                  {bestPoint.profitLoss >= 0 ? '+' : ''}{formatCurrency(bestPoint.profitLoss)}
                </Text>
              </View>
            )}
            {showWorst && (
              <View style={s.dayRow}>
                <View>
                  <Text style={s.dayRoleLabel}>Mais perdas</Text>
                  <Text style={s.dayDate}>{fmtDate(worstPoint!.bucketStart)}</Text>
                </View>
                <Text style={[s.dayValue, { color: '#FF3B30' }]}>{formatCurrency(worstPoint!.profitLoss)}</Text>
              </View>
            )}
          </View>
        </>
      )}
      <Text style={s.watermark}>betintel.app</Text>
    </View>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

interface StatsShareCardProps {
  stats: PersonalStats;
  period: StatsPeriod;
  mode: ShareMode;
  /** Notifies the sheet when the active page changes (for the dot indicator) */
  onPageChange?: (page: number) => void;
}

export const StatsShareCard = forwardRef<StatsShareCardHandle, StatsShareCardProps>(
  function StatsShareCard({ stats, period, mode, onPageChange }, ref) {
    const { width: screenWidth } = useWindowDimensions();
    const cardWidth = screenWidth - 40;

    // Simple mode — single ViewShot ref
    const simpleRef = useRef<ViewShotRef>(null);

    // Detailed mode — one ViewShot ref per page (stable, never in array literal)
    const pageRef0 = useRef<ViewShotRef>(null);
    const pageRef1 = useRef<ViewShotRef>(null);
    const pageRef2 = useRef<ViewShotRef>(null);
    const pageRef3 = useRef<ViewShotRef>(null);
    const detailRefs = [pageRef0, pageRef1, pageRef2, pageRef3];

    // Ref so the imperative handle always sees the latest page without stale closures
    const currentPageRef = useRef(0);

    // Expose capture() to the parent sheet so it can trigger share/download
    useImperativeHandle(ref, () => ({
      capture: async () => {
        const activeRef = mode === 'simple' ? simpleRef : detailRefs[currentPageRef.current];
        if (!activeRef.current?.capture) return null;
        return activeRef.current.capture();
      },
      isReady: !!ViewShot,
    }), [mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Simple card content ──────────────────────────────────────────────────

    const { summary } = stats;
    const roiColor = summary.roi >= 0 ? '#00C851' : '#FF3B30';
    const plColor = summary.profitLoss >= 0 ? '#00C851' : '#FF3B30';
    const { streaks } = summary;
    const showStreak = streaks.currentCount >= 3 && streaks.currentType !== null;

    const simpleCardContent = (
      <View style={[s.card, { width: cardWidth }]}>
        <CardHeader period={period} />
        <View style={s.roiSection}>
          <Text style={s.roiLabel}>ROI</Text>
          <Text style={[s.roiValue, { color: roiColor }]}>
            {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(1)}%
          </Text>
        </View>
        <Divider />
        <View style={s.metricsRow}>
          <View style={s.metric}>
            <Text style={s.metricValue}>{summary.winRate.toFixed(0)}%</Text>
            <Text style={s.metricLabel}>Taxa vitória</Text>
          </View>
          <View style={s.metricSep} />
          <View style={s.metric}>
            <Text style={[s.metricValue, { color: plColor }]}>
              {summary.profitLoss >= 0 ? '+' : ''}{formatCurrency(summary.profitLoss)}
            </Text>
            <Text style={s.metricLabel}>P&L</Text>
          </View>
          <View style={s.metricSep} />
          <View style={s.metric}>
            <Text style={s.metricValue}>{summary.settledBoletins}</Text>
            <Text style={s.metricLabel}>Boletins</Text>
          </View>
        </View>
        {showStreak && (
          <View style={[s.streakBadge, { backgroundColor: streaks.currentType === 'WON' ? 'rgba(0,200,81,0.15)' : 'rgba(255,59,48,0.15)' }]}>
            <Text style={s.streakEmoji}>{streaks.currentType === 'WON' ? '🔥' : '❄️'}</Text>
            <Text style={[s.streakText, { color: streaks.currentType === 'WON' ? '#00C851' : '#FF3B30' }]}>
              Série de {streaks.currentCount} {streaks.currentType === 'WON' ? 'vitórias' : 'derrotas'}
            </Text>
          </View>
        )}
        {stats.bestBoletins[0] && stats.bestBoletins[0].profitLoss > 0 && (
          <View style={s.simpleBest}>
            <Text style={s.sectionLabel}>🏆  Melhor boletim</Text>
            <Text numberOfLines={1} style={s.simpleBestName}>{stats.bestBoletins[0].name ?? 'Boletim sem nome'}</Text>
            <Text style={s.simpleBestSub}>
              {fmtDate(stats.bestBoletins[0].createdAt)} · +{formatCurrency(stats.bestBoletins[0].profitLoss)} · Odds {formatOdds(stats.bestBoletins[0].totalOdds)}
            </Text>
          </View>
        )}
        <View style={s.footer}>
          <Text style={s.footerStat}>Odd média <Text style={s.footerStatVal}>{formatOdds(summary.averageOdds)}</Text></Text>
          <Text style={s.footerDot}>·</Text>
          <Text style={s.footerStat}>Stake média <Text style={s.footerStatVal}>{formatCurrency(summary.averageStake)}</Text></Text>
        </View>
        <Text style={s.watermark}>betintel.app</Text>
      </View>
    );

    // ── Simple mode render ───────────────────────────────────────────────────

    if (mode === 'simple') {
      return ViewShot ? (
        <ViewShot ref={simpleRef} style={s.shotContainer}>
          {simpleCardContent}
        </ViewShot>
      ) : (
        <View style={s.shotContainer}>{simpleCardContent}</View>
      );
    }

    // ── Detailed — native horizontal pager, one ViewShot per page ───────────

    const pages = [
      { ref: pageRef0, key: 'p1', node: <Page1 cardWidth={cardWidth} period={period} stats={stats} /> },
      { ref: pageRef1, key: 'p2', node: <Page2 cardWidth={cardWidth} period={period} stats={stats} /> },
      { ref: pageRef2, key: 'p3', node: <Page3 cardWidth={cardWidth} period={period} stats={stats} /> },
      { ref: pageRef3, key: 'p4', node: <Page4 cardWidth={cardWidth} period={period} stats={stats} /> },
    ];

    return (
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
          currentPageRef.current = page;
          onPageChange?.(page);
        }}
        contentContainerStyle={s.pagerContent}
        style={{ borderRadius: 20 }}
      >
        {pages.map(({ ref, key, node }) =>
          ViewShot ? (
            <ViewShot key={key} ref={ref} style={s.pageShot}>{node}</ViewShot>
          ) : (
            <View key={key} style={s.pageShot}>{node}</View>
          ),
        )}
      </ScrollView>
    );
  },
);

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  shotContainer: { borderRadius: 20, overflow: 'hidden' },
  pagerContent: { alignItems: 'flex-start' },
  pageShot: { alignSelf: 'flex-start', borderRadius: 20, overflow: 'hidden' },
  card: { backgroundColor: '#0D0D0D', borderRadius: 20, overflow: 'hidden' },

  header: {
    alignItems: 'center',
    backgroundColor: '#141414',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  brand: { color: '#00C851', fontSize: 17, fontWeight: '900', letterSpacing: -0.5 },
  pageSubtitle: { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 1, textTransform: 'uppercase' },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  pageNum: { color: '#444', fontSize: 11, fontWeight: '700' },
  periodBadge: { backgroundColor: '#00C85122', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  periodText: { color: '#00C851', fontSize: 11, fontWeight: '700' },

  roiSection: { alignItems: 'center', paddingBottom: 22, paddingTop: 26 },
  roiLabel: { color: '#555', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' },
  roiValue: { fontSize: 54, fontWeight: '900', letterSpacing: -2, lineHeight: 60 },

  divider: { backgroundColor: '#1E1E1E', height: 1, marginHorizontal: 20 },

  metricsRow: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 18 },
  metric: { alignItems: 'center', flex: 1, gap: 4 },
  metricValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  metricLabel: { color: '#555', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  metricSep: { backgroundColor: '#1E1E1E', height: 30, width: 1 },

  streakBadge: {
    alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8,
    marginBottom: 14, marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 9,
  },
  streakEmoji: { fontSize: 16 },
  streakText: { fontSize: 13, fontWeight: '800' },

  simpleBest: {
    backgroundColor: '#141414', borderRadius: 12, gap: 3,
    marginBottom: 14, marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 11,
  },
  simpleBestName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  simpleBestSub: { color: '#00C851', fontSize: 11, fontWeight: '600' },

  footer: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8, paddingHorizontal: 20 },
  footerStat: { color: '#444', fontSize: 11, fontWeight: '600' },
  footerStatVal: { color: '#666', fontWeight: '800' },
  footerDot: { color: '#333', fontSize: 11 },

  section: { gap: 9, paddingHorizontal: 20, paddingVertical: 14 },
  sectionLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  listRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  listRank: { color: '#444', fontSize: 12, fontWeight: '800', textAlign: 'center', width: 16 },
  listNameCol: { flex: 1, gap: 1 },
  listName: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  listDate: { color: '#3a3a3a', fontSize: 10, fontWeight: '600' },
  listValue: { fontSize: 13, fontWeight: '900' },

  breakdownRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  sportEmoji: { fontSize: 14, textAlign: 'center', width: 18 },
  breakdownLabel: { color: '#ccc', flex: 1, fontSize: 12, fontWeight: '700' },
  breakdownCount: { color: '#555', fontSize: 11, fontWeight: '600', minWidth: 44, textAlign: 'right' },
  breakdownROI: { fontSize: 12, fontWeight: '900', minWidth: 52, textAlign: 'right' },

  dayRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  dayRoleLabel: { color: '#555', fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  dayDate: { color: '#bbb', fontSize: 14, fontWeight: '800', marginTop: 1 },
  dayValue: { fontSize: 16, fontWeight: '900' },

  watermark: { color: '#1E1E1E', fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingBottom: 12, paddingTop: 8, textAlign: 'center' },
});
