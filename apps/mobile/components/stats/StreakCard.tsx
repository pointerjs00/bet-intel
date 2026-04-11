import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsStreaks } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';

interface StreakCardProps {
  streaks: StatsStreaks;
  onInfoPress?: () => void;
}

export const StreakCard = React.memo(function StreakCard({ streaks, onInfoPress }: StreakCardProps) {
  const { colors } = useTheme();

  const currentColor =
    streaks.currentType === 'WON'
      ? colors.primary
      : streaks.currentType === 'LOST'
      ? colors.danger
      : colors.textMuted;

  const currentLabel =
    streaks.currentType === 'WON'
      ? `${streaks.currentCount} vitória${streaks.currentCount !== 1 ? 's' : ''}`
      : streaks.currentType === 'LOST'
      ? `${streaks.currentCount} derrota${streaks.currentCount !== 1 ? 's' : ''}`
      : 'Sem dados';

  const currentIcon =
    streaks.currentType === 'WON'
      ? 'flame'
      : streaks.currentType === 'LOST'
      ? 'trending-down'
      : 'remove-outline';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Sequências</Text>
        {onInfoPress ? (
          <Pressable hitSlop={8} onPress={onInfoPress}>
            <Ionicons color={colors.textMuted} name="information-circle-outline" size={18} />
          </Pressable>
        ) : null}
      </View>

      {/* Current streak — hero */}
      <View style={styles.currentRow}>
        <Ionicons color={currentColor} name={currentIcon as any} size={28} />
        <View style={styles.currentText}>
          <Text style={[styles.currentLabel, { color: colors.textSecondary }]}>Sequência atual</Text>
          <Text style={[styles.currentValue, { color: currentColor }]}>{currentLabel}</Text>
        </View>
      </View>

      {/* Longest streaks */}
      <View style={styles.longestRow}>
        <View style={styles.longestCell}>
          <Text style={[styles.longestLabel, { color: colors.textSecondary }]}>Maior série vitórias</Text>
          <Text style={[styles.longestValue, { color: colors.primary }]}>{streaks.longestWin}</Text>
        </View>
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
        <View style={styles.longestCell}>
          <Text style={[styles.longestLabel, { color: colors.textSecondary }]}>Maior série derrotas</Text>
          <Text style={[styles.longestValue, { color: colors.danger }]}>{streaks.longestLoss}</Text>
        </View>
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
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currentText: {
    gap: 2,
  },
  currentLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  currentValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  longestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  longestCell: {
    flex: 1,
    gap: 4,
  },
  separator: {
    width: 1,
    height: 36,
  },
  longestLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  longestValue: {
    fontSize: 22,
    fontWeight: '900',
  },
});
