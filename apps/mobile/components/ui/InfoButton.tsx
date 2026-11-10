import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

type InfoButtonSize = 'sm' | 'md';

interface InfoButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
  size?: InfoButtonSize;
  /** Kept for API compatibility; the redesign shows the icon only. */
  showLabel?: boolean;
}

/** Quiet "i" affordance next to a metric title (no chip, border or shadow — redesign §6.1). */
export function InfoButton({ onPress, accessibilityLabel = 'Mais informação', size = 'md' }: InfoButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons color={colors.textMuted} name="information-circle-outline" size={size === 'sm' ? 16 : 18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', flexShrink: 0, justifyContent: 'center' },
});
