import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';

interface OddsCalculatorProps {
  stake: number;
  totalOdds: number;
  potentialReturn: number;
}

/** Summary card with total odds, projected return, and estimated ROI. */
export function OddsCalculator({ stake, totalOdds, potentialReturn }: OddsCalculatorProps) {
  const { colors } = useTheme();
  const estimatedRoi = stake > 0 ? ((potentialReturn - stake) / stake) * 100 : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <View style={styles.metric}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Odds totais</Text>
        <Text style={[styles.value, { color: colors.textPrimary }]}>{formatOdds(totalOdds)}</Text>
      </View>

      <View style={styles.metric}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Retorno potencial</Text>
        <Text style={[styles.value, { color: colors.primary }]}>{formatCurrency(potentialReturn)}</Text>
      </View>

      <View style={styles.metric}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>ROI estimado</Text>
        <Text style={[styles.value, { color: estimatedRoi >= 0 ? colors.primary : colors.danger }]}>
          {estimatedRoi.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  metric: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    fontSize: 18,
    fontWeight: '900',
  },
});