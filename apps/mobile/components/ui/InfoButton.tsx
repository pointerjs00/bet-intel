import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

type InfoButtonSize = 'sm' | 'md';

interface InfoButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
  size?: InfoButtonSize;
  showLabel?: boolean;
}

const SIZE_MAP: Record<InfoButtonSize, { icon: number; padding: number; fontSize: number; paddingHorizontal: number; gap: number }> = {
  sm: { icon: 16, padding: 4, fontSize: 10, paddingHorizontal: 7, gap: 4 },
  md: { icon: 18, padding: 5, fontSize: 11, paddingHorizontal: 9, gap: 5 },
};

export function InfoButton({
  onPress,
  accessibilityLabel = 'Mais informação',
  size = 'md',
  showLabel = true,
}: InfoButtonProps) {
  const { colors } = useTheme();
  const metrics = SIZE_MAP[size];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          gap: metrics.gap,
          opacity: pressed ? 0.92 : 1,
          padding: metrics.padding,
          paddingHorizontal: showLabel ? metrics.paddingHorizontal : metrics.padding,
          shadowColor: colors.textPrimary,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Ionicons color={colors.textPrimary} name="information-circle-outline" size={metrics.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 2,
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
});