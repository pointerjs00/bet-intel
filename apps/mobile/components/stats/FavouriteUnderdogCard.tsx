import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsSummary } from '@betintel/shared';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

interface FavouriteUnderdogCardProps {
  summary: StatsSummary;
  onInfoPress?: () => void;
}

export const FavouriteUnderdogCard = React.memo(function FavouriteUnderdogCard({ summary, onInfoPress }: FavouriteUnderdogCardProps) {
  const { colors } = useTheme();

  const noData = summary.favouriteBets === 0 && summary.underdogBets === 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre favoritos/underdogs" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Favorito vs Underdog</Text>
      </View>

      {noData ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>Sem apostas resolvidas no período</Text>
      ) : null}

      {!noData ? <View style={styles.columnsRow}>
        {/* Favourite column */}
        <View style={styles.column}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.warning}18` }]}>
            <Ionicons color={colors.warning} name="shield" size={20} />
          </View>
          <Text style={[styles.columnLabel, { color: colors.textSecondary }]}>Favorito</Text>
          <Text style={[styles.oddsRange, { color: colors.textMuted }]}>Odds {'<'} 2.00</Text>
          <Text style={[styles.roiValue, { color: summary.favouriteROI >= 0 ? colors.primary : colors.danger }]}>
            {formatPercentage(summary.favouriteROI)}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Win: {formatPercentage(summary.favouriteWinRate)}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {summary.favouriteBets} aposta{summary.favouriteBets !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={[styles.separator, { backgroundColor: colors.border }]} />

        {/* Underdog column */}
        <View style={styles.column}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.gold}18` }]}>
            <Ionicons color={colors.gold} name="flash" size={20} />
          </View>
          <Text style={[styles.columnLabel, { color: colors.textSecondary }]}>Underdog</Text>
          <Text style={[styles.oddsRange, { color: colors.textMuted }]}>Odds ≥ 2.00</Text>
          <Text style={[styles.roiValue, { color: summary.underdogROI >= 0 ? colors.primary : colors.danger }]}>
            {formatPercentage(summary.underdogROI)}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Win: {formatPercentage(summary.underdogWinRate)}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {summary.underdogBets} aposta{summary.underdogBets !== 1 ? 's' : ''}
          </Text>
        </View>
      </View> : null}
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
  columnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  column: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
    marginBottom: 4,
  },
  columnLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  oddsRange: {
    fontSize: 10,
    fontWeight: '600',
  },
  roiValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 90,
    width: 1,
  },
  empty: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
