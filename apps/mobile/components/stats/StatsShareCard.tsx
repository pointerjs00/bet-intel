import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { PersonalStats, StatsBySportRow, StatsByWeekdayRow, StatsPeriod } from '@betintel/shared';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { Button } from '../ui/Button';

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

const WEEKDAY_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface StatsShareCardProps {
  stats: PersonalStats;
  period: StatsPeriod;
  mode: ShareMode;
  onClose?: () => void;
}

export function StatsShareCard({ stats, period, mode, onClose }: StatsShareCardProps) {
  const viewShotRef = useRef<{ capture: () => Promise<string> }>(null);
  const [sharing, setSharing] = useState(false);

  const { summary, bestBoletins, worstBoletins, bySport, byMarket, byCompetition, byTeam, byWeekday } = stats;
  const roiColor = summary.roi >= 0 ? '#00C851' : '#FF3B30';
  const plColor = summary.profitLoss >= 0 ? '#00C851' : '#FF3B30';
  const { streaks } = summary;
  const showStreak = streaks.currentCount >= 3 && streaks.currentType !== null;

  const topSports = [...bySport].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topCompetitions = [...byCompetition].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topTeams = [...byTeam].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topMarkets = [...byMarket].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);

  const bestDay = byWeekday.length > 0
    ? byWeekday.reduce<StatsByWeekdayRow | null>((best, row) =>
        best === null || row.profitLoss > best.profitLoss ? row : best, null)
    : null;
  const worstDay = byWeekday.length > 1
    ? byWeekday.reduce<StatsByWeekdayRow | null>((worst, row) =>
        worst === null || row.profitLoss < worst.profitLoss ? row : worst, null)
    : null;

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
          <Text style={s.simpleBestDetail}>
            +{formatCurrency(bestBoletins[0].profitLoss)} · Odds {formatOdds(bestBoletins[0].totalOdds)}
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

      {bestBoletins.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>🏆  Melhores boletins</Text>
            {bestBoletins.slice(0, 5).map((b, i) => (
              <View key={b.id} style={s.listRow}>
                <Text style={s.listRank}>{i + 1}</Text>
                <Text numberOfLines={1} style={s.listName}>{b.name ?? 'Boletim sem nome'}</Text>
                <Text style={[s.listValue, { color: '#00C851' }]}>+{formatCurrency(b.profitLoss)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {worstBoletins.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>💸  Piores boletins</Text>
            {worstBoletins.slice(0, 5).map((b, i) => (
              <View key={b.id} style={s.listRow}>
                <Text style={s.listRank}>{i + 1}</Text>
                <Text numberOfLines={1} style={s.listName}>{b.name ?? 'Boletim sem nome'}</Text>
                <Text style={[s.listValue, { color: '#FF3B30' }]}>{formatCurrency(b.profitLoss)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {topSports.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>⚽  Por desporto</Text>
            {topSports.map((row) => (
              <View key={row.key} style={s.breakdownRow}>
                <Text numberOfLines={1} style={s.breakdownLabel}>
                  {SPORT_EMOJIS[(row as StatsBySportRow).sport] ?? '🎯'} {row.label}
                </Text>
                <Text style={s.breakdownCount}>{row.totalBets} ap.</Text>
                <Text style={[s.breakdownROI, { color: row.roi >= 0 ? '#00C851' : '#FF3B30' }]}>
                  {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {topCompetitions.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>🏅  Por competição</Text>
            {topCompetitions.map((row) => (
              <View key={row.key} style={s.breakdownRow}>
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
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>👥  Por equipa</Text>
            {topTeams.map((row) => (
              <View key={row.key} style={s.breakdownRow}>
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

      {topMarkets.length > 0 && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>📋  Por mercado</Text>
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
        </>
      )}

      {(bestDay || worstDay) && (
        <>
          <View style={s.divider} />
          <View style={s.section}>
            <Text style={s.sectionLabel}>📅  Por dia da semana</Text>
            {bestDay && (
              <View style={s.dayRow}>
                <Text style={s.dayLabel}>
                  Mais lucrativo: <Text style={s.dayName}>{WEEKDAY_PT[bestDay.weekday]}</Text>
                </Text>
                <Text style={[s.dayValue, { color: '#00C851' }]}>
                  {bestDay.profitLoss >= 0 ? '+' : ''}{formatCurrency(bestDay.profitLoss)}
                </Text>
              </View>
            )}
            {worstDay && (
              <View style={s.dayRow}>
                <Text style={s.dayLabel}>
                  Mais perdas: <Text style={s.dayName}>{WEEKDAY_PT[worstDay.weekday]}</Text>
                </Text>
                <Text style={[s.dayValue, { color: '#FF3B30' }]}>{formatCurrency(worstDay.profitLoss)}</Text>
              </View>
            )}
          </View>
        </>
      )}

      <Text style={s.watermark}>betintel.app</Text>
    </>
  );

  const cardContent = (
    <View style={s.card}>
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
  card: { backgroundColor: '#0D0D0D', borderRadius: 20, overflow: 'hidden', width: 360 },

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
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  streakEmoji: { fontSize: 18 },
  streakText: { fontSize: 14, fontWeight: '800' },

  simpleBest: {
    backgroundColor: '#141414',
    borderRadius: 12,
    gap: 4,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  simpleBestName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  simpleBestDetail: { color: '#00C851', fontSize: 13, fontWeight: '700' },

  footer: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 10, paddingHorizontal: 20 },
  footerStat: { color: '#444', fontSize: 11, fontWeight: '600' },
  footerStatVal: { color: '#666', fontWeight: '800' },
  footerDot: { color: '#333', fontSize: 11 },

  // Detailed sections
  section: { gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  sectionLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  listRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  listRank: { color: '#444', fontSize: 12, fontWeight: '800', width: 16, textAlign: 'center' },
  listName: { color: '#ccc', flex: 1, fontSize: 13, fontWeight: '700' },
  listValue: { fontSize: 13, fontWeight: '900' },

  breakdownRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  breakdownLabel: { color: '#ccc', flex: 1, fontSize: 12, fontWeight: '700' },
  breakdownCount: { color: '#555', fontSize: 11, fontWeight: '600', minWidth: 44, textAlign: 'right' },
  breakdownROI: { fontSize: 12, fontWeight: '900', minWidth: 52, textAlign: 'right' },

  dayRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  dayLabel: { color: '#555', fontSize: 12, fontWeight: '600' },
  dayName: { color: '#aaa', fontWeight: '800' },
  dayValue: { fontSize: 13, fontWeight: '900' },

  watermark: { color: '#2A2A2A', fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingBottom: 14, paddingTop: 10, textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: 12 },
});
