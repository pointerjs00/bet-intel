import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RollingWindowStats } from '@betintel/shared';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

const WINDOWS = [10, 20, 30] as const;

interface RecentFormCardProps {
  windows: RollingWindowStats[];
  onInfoPress?: () => void;
}

export const RecentFormCard = React.memo(function RecentFormCard({ windows, onInfoPress }: RecentFormCardProps) {
  const { colors } = useTheme();
  const [activeWindow, setActiveWindow] = useState<10 | 20 | 30>(10);

  const data = windows.find((w) => w.window === activeWindow);
  if (!data) return null;

  const roiColor = data.roi >= 0 ? colors.primary : colors.danger;
  const plColor = data.profitLoss >= 0 ? colors.primary : colors.danger;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre forma recente" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Forma Recente</Text>
      </View>

      {/* Window tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.surfaceRaised }]}>
        {WINDOWS.map((w) => {
          const isActive = activeWindow === w;
          return (
            <Pressable
              key={w}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => setActiveWindow(w)}
              style={[
                styles.tab,
                isActive
                  ? { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.primary }
                  : { borderWidth: 0.5, borderColor: 'transparent' },
              ]}
            >
              <Text style={[styles.tabText, { color: isActive ? colors.primary : colors.textSecondary }]}>
                Últ. {w}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {data.count === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Sem apostas resolvidas suficientes
        </Text>
      ) : (
        <>
          {/* Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>ROI</Text>
              <Text style={[styles.metricValue, { color: roiColor }]}>
                {data.roi >= 0 ? '+' : ''}{data.roi.toFixed(1)}%
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Taxa vitória</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {data.winRate.toFixed(0)}%
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>P&L</Text>
              <Text style={[styles.metricValue, { color: plColor }]}>
                {data.profitLoss >= 0 ? '+' : ''}{formatCurrency(data.profitLoss)}
              </Text>
            </View>
          </View>

          {/* W/L tally pill */}
          <View style={[styles.tallyPill, { backgroundColor: colors.surfaceRaised }]}>
            <View style={styles.tallyItem}>
              <View style={[styles.tallyDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.tallyCount, { color: colors.primary }]}>{data.wonCount}</Text>
              <Text style={[styles.tallyLabel, { color: colors.textSecondary }]}>ganhos</Text>
            </View>
            <Text style={[styles.tallySep, { color: colors.border }]}>·</Text>
            <View style={styles.tallyItem}>
              <View style={[styles.tallyDot, { backgroundColor: colors.danger }]} />
              <Text style={[styles.tallyCount, { color: colors.danger }]}>{data.lostCount}</Text>
              <Text style={[styles.tallyLabel, { color: colors.textSecondary }]}>perdidos</Text>
            </View>
            {data.voidCount > 0 && (
              <>
                <Text style={[styles.tallySep, { color: colors.border }]}>·</Text>
                <View style={styles.tallyItem}>
                  <View style={[styles.tallyDot, { backgroundColor: colors.textMuted }]} />
                  <Text style={[styles.tallyCount, { color: colors.textMuted }]}>{data.voidCount}</Text>
                  <Text style={[styles.tallyLabel, { color: colors.textSecondary }]}>void</Text>
                </View>
              </>
            )}
          </View>

          {/* Bead strip */}
          <View style={styles.beadStrip}>
            {data.results.map((result, i) => (
              <View
                key={i}
                style={[
                  styles.bead,
                  {
                    backgroundColor:
                      result === 'WON' ? colors.primary :
                      result === 'LOST' ? colors.danger :
                      colors.border,
                  },
                ]}
              />
            ))}
          </View>

          {data.count < activeWindow && (
            <Text style={[styles.sampleNote, { color: colors.textMuted }]}>
              Apenas {data.count} apostas resolvidas disponíveis
            </Text>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  tabRow: {
    borderRadius: 12,
    flexDirection: 'row',
    padding: 3,
    gap: 3,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    paddingVertical: 7,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  empty: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  metricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  divider: {
    height: 32,
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 4,
  },
  tallyPill: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  tallyItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  tallyDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  tallyCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  tallyLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
  tallySep: {
    fontSize: 14,
  },
  beadStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bead: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  sampleNote: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
