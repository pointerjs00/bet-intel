import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

interface DeltaBadgeProps {
  /** Current period value */
  current: number;
  /** Previous period value */
  previous: number;
  /** How to format the delta value. Defaults to 'number'. */
  format?: 'number' | 'currency' | 'percentage';
  /** If true, a decrease is "good" (e.g. losses reduced) */
  invertColors?: boolean;
}

function formatDeltaValue(delta: number, format: DeltaBadgeProps['format']): string {
  const abs = Math.abs(delta);
  switch (format) {
    case 'currency':
      return `€${abs.toFixed(2).replace('.', ',')}`;
    case 'percentage':
      return `${abs.toFixed(1).replace('.', ',')}%`;
    default:
      return abs >= 100 ? abs.toFixed(0) : abs.toFixed(2).replace('.', ',');
  }
}

export const DeltaBadge = React.memo(function DeltaBadge({
  current,
  previous,
  format = 'number',
  invertColors = false,
}: DeltaBadgeProps) {
  const { colors } = useTheme();
  const delta = current - previous;

  if (delta === 0 || (isNaN(delta))) return null;

  const isUp = delta > 0;
  const isPositive = invertColors ? !isUp : isUp;

  return (
    <View style={[styles.badge, { backgroundColor: `${isPositive ? colors.primary : colors.danger}18` }]}>
      <Ionicons
        color={isPositive ? colors.primary : colors.danger}
        name={isUp ? 'arrow-up' : 'arrow-down'}
        size={10}
      />
      <Text style={[styles.text, { color: isPositive ? colors.primary : colors.danger }]}>
        {formatDeltaValue(delta, format)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
  },
});
