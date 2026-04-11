import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsFreebetSummary } from '@betintel/shared';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

interface FreebetCardProps {
  summary: StatsFreebetSummary;
  onInfoPress?: () => void;
}

export const FreebetCard = React.memo(function FreebetCard({ summary, onInfoPress }: FreebetCardProps) {
  const { colors } = useTheme();

  if (summary.totalFreebets === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre freebets" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Freebets</Text>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Total</Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>{summary.totalFreebets}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Ganhas</Text>
          <Text style={[styles.value, { color: colors.primary }]}>{summary.wonFreebets}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Perdidas</Text>
          <Text style={[styles.value, { color: colors.danger }]}>{summary.lostFreebets}</Text>
        </View>
      </View>

      <View style={styles.returnRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Lucro de freebets</Text>
        <Text style={[styles.returnValue, { color: summary.profitLoss >= 0 ? colors.primary : colors.danger }]}>
          {formatCurrency(summary.profitLoss)}
        </Text>
      </View>
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
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metric: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    fontSize: 18,
    fontWeight: '900',
  },
  returnRow: {
    gap: 4,
  },
  returnValue: {
    fontSize: 22,
    fontWeight: '900',
  },
});
