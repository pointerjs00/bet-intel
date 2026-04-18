import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsSummary } from '@betintel/shared';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';
import { formatPercentage } from '../../utils/formatters';

interface HomeAwayCardProps {
  summary: StatsSummary;
  onInfoPress?: () => void;
}

export const HomeAwayCard = React.memo(function HomeAwayCard({ summary, onInfoPress }: HomeAwayCardProps) {
  const { colors } = useTheme();

  const noData = summary.homeBets === 0 && summary.awayBets === 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre casa/fora" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Casa vs Fora</Text>
      </View>

      {noData ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>Sem apostas 1X2 resolvidas no período</Text>
      ) : null}

      {!noData ? <View style={styles.columnsRow}>
        {/* Home column */}
        <View style={styles.column}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons color={colors.primary} name="home" size={20} />
          </View>
          <Text style={[styles.columnLabel, { color: colors.textSecondary }]}>Casa</Text>
          <Text style={[styles.roiValue, { color: summary.homeROI >= 0 ? colors.primary : colors.danger }]}>
            {formatPercentage(summary.homeROI)}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Win: {formatPercentage(summary.homeWinRate)}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {summary.homeBets} aposta{summary.homeBets !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={[styles.separator, { backgroundColor: colors.border }]} />

        {/* Away column */}
        <View style={styles.column}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.info}18` }]}>
            <Ionicons color={colors.info} name="airplane" size={20} />
          </View>
          <Text style={[styles.columnLabel, { color: colors.textSecondary }]}>Fora</Text>
          <Text style={[styles.roiValue, { color: summary.awayROI >= 0 ? colors.primary : colors.danger }]}>
            {formatPercentage(summary.awayROI)}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Win: {formatPercentage(summary.awayWinRate)}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {summary.awayBets} aposta{summary.awayBets !== 1 ? 's' : ''}
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
  roiValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 80,
    width: 1,
  },
  empty: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
