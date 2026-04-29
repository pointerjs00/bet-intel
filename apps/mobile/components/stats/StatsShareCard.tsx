import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { StatsPeriod, StatsSummary, StatsTopBoletin } from '@betintel/shared';
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

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  week: 'Esta Semana',
  month: 'Este Mês',
  year: 'Este Ano',
  all: 'Estatísticas globais',
};

interface StatsShareCardProps {
  summary: StatsSummary;
  bestBoletin?: StatsTopBoletin;
  period: StatsPeriod;
  onClose?: () => void;
}

export function StatsShareCard({ summary, bestBoletin, period, onClose }: StatsShareCardProps) {
  const viewShotRef = useRef<{ capture: () => Promise<string> }>(null);
  const [sharing, setSharing] = useState(false);

  const roiColor = summary.roi >= 0 ? '#00C851' : '#FF3B30';
  const plColor = summary.profitLoss >= 0 ? '#00C851' : '#FF3B30';
  const { streaks } = summary;
  const showStreak = streaks.currentCount >= 3 && streaks.currentType !== null;

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

  const cardContent = (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>BetIntel</Text>
        <View style={styles.periodBadge}>
          <Text style={styles.periodText}>{PERIOD_LABEL[period]}</Text>
        </View>
      </View>

      {/* ROI hero */}
      <View style={styles.roiSection}>
        <Text style={styles.roiLabel}>ROI</Text>
        <Text style={[styles.roiValue, { color: roiColor }]}>
          {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(1)}%
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Three metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{summary.winRate.toFixed(0)}%</Text>
          <Text style={styles.metricLabel}>Taxa vitória</Text>
        </View>
        <View style={styles.metricSep} />
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: plColor }]}>
            {summary.profitLoss >= 0 ? '+' : ''}{formatCurrency(summary.profitLoss)}
          </Text>
          <Text style={styles.metricLabel}>P&L</Text>
        </View>
        <View style={styles.metricSep} />
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{summary.settledBoletins}</Text>
          <Text style={styles.metricLabel}>Boletins</Text>
        </View>
      </View>

      {/* Streak badge */}
      {showStreak && (
        <View style={[
          styles.streakBadge,
          { backgroundColor: streaks.currentType === 'WON' ? 'rgba(0,200,81,0.15)' : 'rgba(255,59,48,0.15)' },
        ]}>
          <Text style={styles.streakEmoji}>{streaks.currentType === 'WON' ? '🔥' : '❄️'}</Text>
          <Text style={[styles.streakText, { color: streaks.currentType === 'WON' ? '#00C851' : '#FF3B30' }]}>
            Série de {streaks.currentCount} {streaks.currentType === 'WON' ? 'vitórias' : 'derrotas'}
          </Text>
        </View>
      )}

      {/* Best boletin */}
      {bestBoletin && bestBoletin.profitLoss > 0 && (
        <View style={styles.bestSection}>
          <Text style={styles.bestSectionLabel}>🏆  Melhor boletim</Text>
          <Text numberOfLines={1} style={styles.bestName}>
            {bestBoletin.name ?? 'Boletim sem nome'}
          </Text>
          <Text style={styles.bestDetail}>
            +{formatCurrency(bestBoletin.profitLoss)} · Odds {formatOdds(bestBoletin.totalOdds)}
          </Text>
        </View>
      )}

      {/* Avg odds footer */}
      <View style={styles.footer}>
        <Text style={styles.footerStat}>
          Odd média{' '}
          <Text style={styles.footerStatValue}>{formatOdds(summary.averageOdds)}</Text>
        </Text>
        <Text style={styles.footerDot}>·</Text>
        <Text style={styles.footerStat}>
          Stake média{' '}
          <Text style={styles.footerStatValue}>{formatCurrency(summary.averageStake)}</Text>
        </Text>
      </View>

      <Text style={styles.watermark}>betintel.app</Text>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      {ViewShot ? (
        <ViewShot ref={viewShotRef} style={styles.shotContainer}>
          {cardContent}
        </ViewShot>
      ) : (
        <View style={styles.shotContainer}>{cardContent}</View>
      )}

      <View style={styles.actionRow}>
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

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 16 },
  shotContainer: { borderRadius: 20, overflow: 'hidden' },

  card: {
    backgroundColor: '#0D0D0D',
    borderRadius: 20,
    overflow: 'hidden',
    width: 360,
  },

  header: {
    alignItems: 'center',
    backgroundColor: '#141414',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  brand: {
    color: '#00C851',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  periodBadge: {
    backgroundColor: '#00C85122',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  periodText: {
    color: '#00C851',
    fontSize: 12,
    fontWeight: '700',
  },

  roiSection: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 28,
  },
  roiLabel: {
    color: '#555',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  roiValue: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 62,
  },

  divider: {
    backgroundColor: '#1E1E1E',
    height: 1,
    marginHorizontal: 20,
  },

  metricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  metricValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricSep: {
    backgroundColor: '#1E1E1E',
    height: 32,
    width: 1,
  },

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
  streakText: {
    fontSize: 14,
    fontWeight: '800',
  },

  bestSection: {
    backgroundColor: '#141414',
    borderRadius: 12,
    gap: 4,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bestSectionLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bestName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  bestDetail: {
    color: '#00C851',
    fontSize: 13,
    fontWeight: '700',
  },

  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  footerStat: {
    color: '#444',
    fontSize: 11,
    fontWeight: '600',
  },
  footerStatValue: {
    color: '#666',
    fontWeight: '800',
  },
  footerDot: {
    color: '#333',
    fontSize: 11,
  },

  watermark: {
    color: '#2A2A2A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    paddingBottom: 14,
    textAlign: 'center',
  },

  actionRow: { flexDirection: 'row', gap: 12 },
});
