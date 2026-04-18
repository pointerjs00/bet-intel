import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsLegKillRow } from '@betintel/shared';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

interface LegKillChartProps {
  data: StatsLegKillRow[];
  onInfoPress?: () => void;
}

export const LegKillChart = React.memo(function LegKillChart({ data, onInfoPress }: LegKillChartProps) {
  const { colors } = useTheme();

  if (data.length === 0) return null;

  const maxKillRate = Math.max(...data.map((d) => d.killRate), 1);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre leg kill" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Seleção que falhou</Text>
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Qual posição da seleção mais mata as tuas múltiplas
      </Text>

      {data.map((row) => {
        const barWidth = Math.max((row.killRate / maxKillRate) * 100, 4);
        return (
          <View key={row.legPosition} style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.textPrimary }]}>{row.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: colors.danger,
                    width: `${barWidth}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.barValue, { color: colors.textSecondary }]}>
              {formatPercentage(row.killRate)}
            </Text>
            <Text style={[styles.barCount, { color: colors.textMuted }]}>
              ({row.killCount})
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
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
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  barRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '700',
    width: 60,
  },
  barTrack: {
    backgroundColor: 'transparent',
    borderRadius: 4,
    flex: 1,
    height: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: 4,
    height: '100%',
    opacity: 0.7,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '700',
    width: 42,
    textAlign: 'right',
  },
  barCount: {
    fontSize: 11,
    fontWeight: '600',
    width: 30,
  },
});
