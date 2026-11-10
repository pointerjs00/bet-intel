import React from 'react';
import { StyleSheet, View } from 'react-native';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { HeroCard, HeroTile } from '../ui/HeroCard';
import { MetricTile } from '../ui/SectionHeader';

interface OddsCalculatorProps {
  stake: number;
  totalOdds: number;
  potentialReturn: number;
}

/** Summary of the boletim being built (v3 hero): total odds, potential return and profit. */
export function OddsCalculator({ stake, totalOdds, potentialReturn }: OddsCalculatorProps) {
  const profit = potentialReturn - stake;
  return (
    <HeroCard style={styles.card}>
      <View style={styles.row}>
        <HeroTile><MetricTile label="Odd total" value={formatOdds(totalOdds)} /></HeroTile>
        <HeroTile><MetricTile label="Retorno" tone="positive" value={formatCurrency(potentialReturn)} /></HeroTile>
        <HeroTile>
          <MetricTile label="Lucro" tone={profit >= 0 ? 'positive' : 'negative'} value={`${profit >= 0 ? '+' : '−'}${formatCurrency(Math.abs(profit))}`} />
        </HeroTile>
      </View>
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12 },
  row: { flexDirection: 'row', gap: 8 },
});
