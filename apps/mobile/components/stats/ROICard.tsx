import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsSummary } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface ROICardProps {
  summary: StatsSummary;
  title?: string;
}

/** Hero card for ROI, stake, and profit/loss. */
export function ROICard({ summary, title = 'ROI' }: ROICardProps) {
  const { colors } = useTheme();
  const roiPositive = summary.roi >= 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      <Text style={[styles.roiValue, { color: roiPositive ? colors.primary : colors.danger }]}>
        {formatPercentage(summary.roi)}
      </Text>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Total apostado</Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>{formatCurrency(summary.totalStaked)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Lucro / Prejuízo</Text>
          <Text style={[styles.value, { color: summary.profitLoss >= 0 ? colors.primary : colors.danger }]}>
            {formatCurrency(summary.profitLoss)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  roiValue: {
    fontSize: 34,
    fontWeight: '900',
  },
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
    fontSize: 16,
    fontWeight: '800',
  },
});