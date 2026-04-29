import React, { useCallback, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { PersonalStats, StatsBySportRow, StatsPeriod } from '@betintel/shared';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { getLeagueLogoUrl } from '../../utils/sportAssets';
import { Button } from '../ui/Button';
import { TeamBadge } from '../ui/TeamBadge';

type ViewShotType = React.ComponentType<{
  ref?: React.Ref<{ capture: () => Promise<string> }>;
  style?: object;
  children?: React.ReactNode;
}>;
let ViewShot: ViewShotType | null = null;
try {
  ViewShot = (require('react-native-view-shot') as { default: ViewShotType }).default;
} catch {}

export type ShareMode = 'simple' | 'detailed';

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

const DETAILED_PAGE_TITLES = ['Resumo', 'Boletins', 'Desporto & Equipas', 'Mercados & Dias'];
const DETAILED_PAGE_COUNT = 4;

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

// ── Shared sub-components ────────────────────────────────────────────────────

function CardHeader({ period, pageTitle, pageNum, pageCount }: { period: StatsPeriod; pageTitle?: string; pageNum?: number; pageCount?: number }) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.brand}>BetIntel</Text>
        {pageTitle && <Text style={s.pageSubtitle}>{pageTitle}</Text>}
      </View>
      <View style={s.headerRight}>
        {pageNum !== undefined && pageCount !== undefined && (
          <Text style={s.pageNum}>{pageNum}/{pageCount}</Text>
        )}
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

function BoletinList({ boletins, color }: { boletins: PersonalStats['bestBoletins']; color: string }) {
  return (
    <>
      {boletins.slice(0, 5).map((b, i) => (
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

function BreakdownRows({ rows }: { rows: Array<{ key: string; label: string; totalBets: number; roi: number }> }) {
  return (
    <>
      {rows.map((row) => (
        <View key={row.key} style={s.breakdownRow}>
          <Text numberOfLines={1} style={s.breakdownLabel}>{row.label}</Text>
          <Text style={s.breakdownCount}>{row.totalBets} ap.</Text>
          <Text style={[s.breakdownROI, { color: row.roi >= 0 ? '#00C851' : '#FF3B30' }]}>
            {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
          </Text>
        </View>
      ))}
    </>
  );
}

// ── Detailed page cards ─────────────────────────────────────────────────────

function Page1({ stats, period, cardWidth }: { stats: PersonalStats; period: StatsPeriod; cardWidth: number }) {
  const { summary } = stats;
  const roiColor = summary.roi >= 0 ? '#00C851' : '#FF3B30';
  const plColor = summary.profitLoss >= 0 ? '#00C851' : '#FF3B30';
  const { streaks } = summary;
  const showStreak = streaks.currentCount >= 3 && streaks.currentType !== null;

  return (
    <View style={[s.card, { width: cardWidth }]}>
      <CardHeader period={period} pageTitle="Resumo" pageNum={1} pageCount={DETAILED_PAGE_COUNT} />

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
        <View style={[s.streakBadge, {
          backgroundColor: streaks.currentType === 'WON' ? 'rgba(0,200,81,0.15)' : 'rgba(255,59,48,0.15)',
        }]}>
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
      <CardHeader period={period} pageTitle="Boletins" pageNum={2} pageCount={DETAILED_PAGE_COUNT} />
      <View style={s.section}>
        <SectionLabel>🏆  Melhores boletins</SectionLabel>
        <BoletinList boletins={stats.bestBoletins} color="#00C851" />
      </View>
      <Divider />
      <View style={s.section}>
        <SectionLabel>💸  Piores boletins</SectionLabel>
        <BoletinList boletins={stats.worstBoletins} color="#FF3B30" />
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
      <CardHeader period={period} pageTitle="Desporto & Equipas" pageNum={3} pageCount={DETAILED_PAGE_COUNT} />

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
      <CardHeader period={period} pageTitle="Mercados & Dias" pageNum={4} pageCount={DETAILED_PAGE_COUNT} />

      {topMarkets.length > 0 && (
        <View style={s.section}>
          <SectionLabel>📋  Por mercado</SectionLabel>
          <BreakdownRows rows={topMarkets} />
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
  onClose?: () => void;
}

export function StatsShareCard({ stats, period, mode, onClose }: StatsShareCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 40;

  const viewShotRef = useRef<{ capture: () => Promise<string> }>(null);
  const [sharing, setSharing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);

  const goToRef = useRef((delta: number) => {
    const next = Math.max(0, Math.min(DETAILED_PAGE_COUNT - 1, currentPageRef.current + delta));
    if (next === currentPageRef.current) return;
    currentPageRef.current = next;
    setCurrentPage(next);
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12,
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -50) goToRef.current(1);
        else if (dx > 50) goToRef.current(-1);
      },
    }),
  ).current;

  const handleShare = useCallback(async () => {
    if (!viewShotRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partilhar estatísticas' });
      }
    } finally {
      setSharing(false);
    }
  }, []);

  // ── Simple card ────────────────────────────────────────────────────────────
  const { summary } = stats;
  const roiColor = summary.roi >= 0 ? '#00C851' : '#FF3B30';
  const plColor = summary.profitLoss >= 0 ? '#00C851' : '#FF3B30';
  const { streaks } = summary;
  const showStreak = streaks.currentCount >= 3 && streaks.currentType !== null;

  const simpleCard = (
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
        <View style={[s.streakBadge, {
          backgroundColor: streaks.currentType === 'WON' ? 'rgba(0,200,81,0.15)' : 'rgba(255,59,48,0.15)',
        }]}>
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

  const detailedPages = [
    <Page1 key="p1" cardWidth={cardWidth} period={period} stats={stats} />,
    <Page2 key="p2" cardWidth={cardWidth} period={period} stats={stats} />,
    <Page3 key="p3" cardWidth={cardWidth} period={period} stats={stats} />,
    <Page4 key="p4" cardWidth={cardWidth} period={period} stats={stats} />,
  ];

  const currentCard = mode === 'simple' ? simpleCard : detailedPages[currentPage];

  return (
    <View style={s.wrapper}>
      {ViewShot ? (
        <ViewShot ref={viewShotRef} style={s.shotContainer}>
          <View {...(mode === 'detailed' ? panResponder.panHandlers : {})}>
            {currentCard}
          </View>
        </ViewShot>
      ) : (
        <View style={s.shotContainer}>
          <View {...(mode === 'detailed' ? panResponder.panHandlers : {})}>
            {currentCard}
          </View>
        </View>
      )}

      {/* Page dots — outside ViewShot, not captured in image */}
      {mode === 'detailed' && (
        <View style={s.dots}>
          {Array.from({ length: DETAILED_PAGE_COUNT }).map((_, i) => (
            <Pressable
              key={i}
              hitSlop={8}
              onPress={() => {
                currentPageRef.current = i;
                setCurrentPage(i);
              }}
            >
              <View style={[s.dot, i === currentPage && s.dotActive]} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={s.actionRow}>
        <Button
          disabled={sharing || !ViewShot}
          title={sharing ? 'A partilhar…' : 'Partilhar imagem'}
          onPress={handleShare}
        />
        {onClose && <Button title="Fechar" variant="ghost" onPress={onClose} />}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 14 },
  shotContainer: { borderRadius: 20, overflow: 'hidden' },
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
    marginBottom: 16, marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 9,
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
  dayRoleLabel: { color: '#555', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  dayDate: { color: '#bbb', fontSize: 14, fontWeight: '800', marginTop: 1 },
  dayValue: { fontSize: 16, fontWeight: '900' },

  watermark: { color: '#1E1E1E', fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingBottom: 12, paddingTop: 8, textAlign: 'center' },

  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { backgroundColor: '#2A2A2A', borderRadius: 4, height: 6, width: 6 },
  dotActive: { backgroundColor: '#00C851', width: 18 },

  actionRow: { flexDirection: 'row', gap: 12 },
});
