import React, { useCallback, useRef, useState } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 32%)`;
}

function CompBadge({ name, size }: { name: string; size: number }) {
  const logoUrl = getLeagueLogoUrl(name);
  const initials = name.slice(0, 2).toUpperCase();

  if (logoUrl) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 3, height: size, justifyContent: 'center', width: size }}>
        <Image
          resizeMode="contain"
          source={{ uri: logoUrl }}
          style={{ height: size * 0.88, width: size * 0.88 }}
        />
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', backgroundColor: nameToColor(name), borderRadius: 3, height: size, justifyContent: 'center', width: size }}>
      <Text style={{ color: '#fff', fontSize: Math.max(size * 0.35, 7), fontWeight: '800' }}>{initials}</Text>
    </View>
  );
}

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

  const { summary, bestBoletins, worstBoletins, bySport, byMarket, byCompetition, byTeam, timeline } = stats;
  const roiColor = summary.roi >= 0 ? '#00C851' : '#FF3B30';
  const plColor = summary.profitLoss >= 0 ? '#00C851' : '#FF3B30';
  const { streaks } = summary;
  const showStreak = streaks.currentCount >= 3 && streaks.currentType !== null;

  const topSports = [...bySport].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topCompetitions = [...byCompetition].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topTeams = [...byTeam].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topMarkets = [...byMarket].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);

  const bestPoint = timeline.length > 0
    ? timeline.reduce((best, p) => p.profitLoss > best.profitLoss ? p : best)
    : null;
  const worstPoint = timeline.length > 1
    ? timeline.reduce((worst, p) => p.profitLoss < worst.profitLoss ? p : worst)
    : null;
  const showWorstPoint = worstPoint && worstPoint !== bestPoint;

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

  const header = (
    <View style={s.header}>
      <Text style={s.brand}>BetIntel</Text>
      <View style={s.periodBadge}>
        <Text style={s.periodText}>{PERIOD_LABEL[period]}</Text>
      </View>
    </View>
  );

  const roiSection = (
    <View style={[s.roiSection, mode === 'detailed' && s.roiSectionCompact]}>
      <Text style={s.roiLabel}>ROI</Text>
      <Text style={[mode === 'detailed' ? s.roiValueSm : s.roiValue, { color: roiColor }]}>
        {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(1)}%
      </Text>
    </View>
  );

  const metricsRow = (
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
  );

  const simpleContent = (
    <>
      {header}
      {roiSection}
      <View style={s.divider} />
      {metricsRow}
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
      {bestBoletins[0] && bestBoletins[0].profitLoss > 0 && (
        <View style={s.simpleBest}>
          <Text style={s.sectionLabel}>🏆  Melhor boletim</Text>
          <Text numberOfLines={1} style={s.simpleBestName}>{bestBoletins[0].name ?? 'Boletim sem nome'}</Text>
          <Text style={s.simpleBestSub}>
            {fmtDate(bestBoletins[0].createdAt)} · +{formatCurrency(bestBoletins[0].profitLoss)} · Odds {formatOdds(bestBoletins[0].totalOdds)}
          </Text>
        </View>
      )}
      <View style={s.footer}>
        <Text style={s.footerStat}>Odd média <Text style={s.footerStatVal}>{formatOdds(summary.averageOdds)}</Text></Text>
        <Text style={s.footerDot}>·</Text>
        <Text style={s.footerStat}>Stake média <Text style={s.footerStatVal}>{formatCurrency(summary.averageStake)}</Text></Text>
      </View>
      <Text style={s.watermark}>betintel.app</Text>
    </>
  );

  const detailedContent = (
    <>
      {header}
      {roiSection}
      <View style={s.divider} />
      {metricsRow}

      {/* Top boletins */}
      {bestBoletins.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>🏆  Melhores boletins</Text>
            {bestBoletins.slice(0, 5).map((b, i) => (
              <View key={b.id} style={s.listRow}>
                <Text style={s.listRank}>{i + 1}</Text>
                <View style={s.listNameCol}>
                  <Text numberOfLines={1} style={s.listName}>{b.name ?? 'Boletim sem nome'}</Text>
                  <Text style={s.listDate}>{fmtDate(b.createdAt)}</Text>
                </View>
                <Text style={[s.listValue, { color: '#00C851' }]}>+{formatCurrency(b.profitLoss)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Bottom boletins */}
      {worstBoletins.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>💸  Piores boletins</Text>
            {worstBoletins.slice(0, 5).map((b, i) => (
              <View key={b.id} style={s.listRow}>
                <Text style={s.listRank}>{i + 1}</Text>
                <View style={s.listNameCol}>
                  <Text numberOfLines={1} style={s.listName}>{b.name ?? 'Boletim sem nome'}</Text>
                  <Text style={s.listDate}>{fmtDate(b.createdAt)}</Text>
                </View>
                <Text style={[s.listValue, { color: '#FF3B30' }]}>{formatCurrency(b.profitLoss)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* By sport */}
      {topSports.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>⚽  Por desporto</Text>
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
        </>
      )}

      {/* By competition */}
      {topCompetitions.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>🏅  Por competição</Text>
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

      {/* By team */}
      {topTeams.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>👥  Por equipa</Text>
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

      {/* By market */}
      {topMarkets.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>📋  Por mercado</Text>
            {topMarkets.map((row) => (
              <View key={row.key} style={s.breakdownRow}>
                <Text numberOfLines={1} style={[s.breakdownLabel, { marginLeft: 0 }]}>{row.label}</Text>
                <Text style={s.breakdownCount}>{row.totalBets} ap.</Text>
                <Text style={[s.breakdownROI, { color: row.roi >= 0 ? '#00C851' : '#FF3B30' }]}>
                  {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Best/worst actual date from timeline */}
      {(bestPoint || showWorstPoint) && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>📅  Dias de destaque</Text>
            {bestPoint && (
              <View style={s.dayRow}>
                <Text style={s.dayLabel}>
                  Mais lucrativo: <Text style={s.dayDate}>{fmtDate(bestPoint.bucketStart)}</Text>
                </Text>
                <Text style={[s.dayValue, { color: '#00C851' }]}>
                  {bestPoint.profitLoss >= 0 ? '+' : ''}{formatCurrency(bestPoint.profitLoss)}
                </Text>
              </View>
            )}
            {showWorstPoint && (
              <View style={s.dayRow}>
                <Text style={s.dayLabel}>
                  Mais perdas: <Text style={s.dayDate}>{fmtDate(worstPoint!.bucketStart)}</Text>
                </Text>
                <Text style={[s.dayValue, { color: '#FF3B30' }]}>{formatCurrency(worstPoint!.profitLoss)}</Text>
              </View>
            )}
          </View>
        </>
      )}

      <Text style={s.watermark}>betintel.app</Text>
    </>
  );

  const cardContent = (
    <View style={[s.card, { width: cardWidth }]}>
      {mode === 'simple' ? simpleContent : detailedContent}
    </View>
  );

  return (
    <View style={s.wrapper}>
      {ViewShot ? (
        <ViewShot ref={viewShotRef} style={s.shotContainer}>
          {cardContent}
        </ViewShot>
      ) : (
        <View style={s.shotContainer}>{cardContent}</View>
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

const s = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 16 },
  shotContainer: { borderRadius: 20, overflow: 'hidden' },
  card: { backgroundColor: '#0D0D0D', borderRadius: 20, overflow: 'hidden' },

  header: {
    alignItems: 'center',
    backgroundColor: '#141414',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  brand: { color: '#00C851', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  periodBadge: { backgroundColor: '#00C85122', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  periodText: { color: '#00C851', fontSize: 12, fontWeight: '700' },

  roiSection: { alignItems: 'center', paddingBottom: 24, paddingTop: 28 },
  roiSectionCompact: { paddingBottom: 16, paddingTop: 18 },
  roiLabel: { color: '#555', fontSize: 13, fontWeight: '700', letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' },
  roiValue: { fontSize: 56, fontWeight: '900', letterSpacing: -2, lineHeight: 62 },
  roiValueSm: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, lineHeight: 46 },

  divider: { backgroundColor: '#1E1E1E', height: 1, marginHorizontal: 20 },

  metricsRow: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 20 },
  metric: { alignItems: 'center', flex: 1, gap: 4 },
  metricValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  metricLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  metricSep: { backgroundColor: '#1E1E1E', height: 32, width: 1 },

  streakBadge: {
    alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8,
    marginBottom: 16, marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 10,
  },
  streakEmoji: { fontSize: 18 },
  streakText: { fontSize: 14, fontWeight: '800' },

  simpleBest: {
    backgroundColor: '#141414', borderRadius: 12, gap: 4,
    marginBottom: 16, marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 12,
  },
  simpleBestName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  simpleBestSub: { color: '#00C851', fontSize: 12, fontWeight: '600' },

  footer: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 10, paddingHorizontal: 20 },
  footerStat: { color: '#444', fontSize: 11, fontWeight: '600' },
  footerStatVal: { color: '#666', fontWeight: '800' },
  footerDot: { color: '#333', fontSize: 11 },

  section: { gap: 9, paddingHorizontal: 20, paddingVertical: 14 },
  sectionLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  listRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  listRank: { color: '#444', fontSize: 12, fontWeight: '800', textAlign: 'center', width: 16 },
  listNameCol: { flex: 1, gap: 1 },
  listName: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  listDate: { color: '#444', fontSize: 10, fontWeight: '600' },
  listValue: { fontSize: 13, fontWeight: '900' },

  breakdownRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  sportEmoji: { fontSize: 14, width: 18, textAlign: 'center' },
  breakdownLabel: { color: '#ccc', flex: 1, fontSize: 12, fontWeight: '700' },
  breakdownCount: { color: '#555', fontSize: 11, fontWeight: '600', minWidth: 44, textAlign: 'right' },
  breakdownROI: { fontSize: 12, fontWeight: '900', minWidth: 52, textAlign: 'right' },

  dayRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  dayLabel: { color: '#555', fontSize: 12, fontWeight: '600' },
  dayDate: { color: '#aaa', fontWeight: '800' },
  dayValue: { fontSize: 13, fontWeight: '900' },

  watermark: { color: '#2A2A2A', fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingBottom: 14, paddingTop: 10, textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: 12 },
});
