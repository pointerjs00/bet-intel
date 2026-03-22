import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type BadgeVariant = 'primary' | 'danger' | 'warning' | 'info' | 'muted';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, variant = 'primary', size = 'md', style }: BadgeProps) {
  const { colors, tokens } = useTheme();

  const bg = getBgColor(variant, colors);
  const textColor = getTextColor(variant, colors);

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: bg,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 6 : 10,
          borderRadius: tokens.radius.sm,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: textColor,
            fontSize: size === 'sm' ? tokens.font.sizes.xs : tokens.font.sizes.sm,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function getBgColor(variant: BadgeVariant, colors: Record<string, string>) {
  switch (variant) {
    case 'danger':
      return colors.danger + '20';
    case 'warning':
      return colors.warning + '20';
    case 'info':
      return colors.info + '20';
    case 'muted':
      return colors.surfaceRaised;
    case 'primary':
    default:
      return colors.primary + '20';
  }
}

function getTextColor(variant: BadgeVariant, colors: Record<string, string>) {
  switch (variant) {
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warning;
    case 'info':
      return colors.info;
    case 'muted':
      return colors.textSecondary;
    case 'primary':
    default:
      return colors.primary;
  }
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
