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
              style={[styles.tab, isActive && { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.tabText, { color: isActive ? '#fff' : colors.textSecondary }]}>
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
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ROI</Text>
              <Text style={[styles.metricValue, { color: roiColor }]}>
                {data.roi >= 0 ? '+' : ''}{data.roi.toFixed(1)}%
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Taxa vitória</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {data.winRate.toFixed(0)}%
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>P&L</Text>
              <Text style={[styles.metricValue, { color: plColor }]}>
                {data.profitLoss >= 0 ? '+' : ''}{formatCurrency(data.profitLoss)}
              </Text>
            </View>
          </View>

          {/* W/L/V tally */}
          <View style={styles.tallyRow}>
            <Text style={[styles.tallyWon, { color: colors.primary }]}>{data.wonCount}G</Text>
            <Text style={[styles.tallySep, { color: colors.textMuted }]}> · </Text>
            <Text style={[styles.tallyLost, { color: colors.danger }]}>{data.lostCount}P</Text>
            {data.voidCount > 0 && (
              <>
                <Text style={[styles.tallySep, { color: colors.textMuted }]}> · </Text>
                <Text style={[styles.tallyVoid, { color: colors.textMuted }]}>{data.voidCount}V</Text>
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
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
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
    gap: 3,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  divider: {
    height: 30,
    width: 1,
    marginHorizontal: 4,
  },
  tallyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  tallyWon: { fontSize: 13, fontWeight: '800' },
  tallyLost: { fontSize: 13, fontWeight: '800' },
  tallyVoid: { fontSize: 13, fontWeight: '800' },
  tallySep: { fontSize: 13 },
  beadStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
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
