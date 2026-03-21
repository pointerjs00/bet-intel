import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  StyleProp,
  Text,
  View,
  ViewStyle,
  type PressableProps,
} from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftSlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftSlot,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const { colors, tokens } = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: getBackgroundColor(variant, colors),
          borderColor: getBorderColor(variant, colors),
          opacity: isDisabled ? 0.55 : pressed ? 0.9 : 1,
          paddingVertical: getVerticalPadding(size),
        },
        style,
      ]}
      {...props}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={getTextColor(variant, colors)} size="small" />
        ) : (
          leftSlot
        )}
        <Text
          style={[
            styles.label,
            {
              color: getTextColor(variant, colors),
              fontSize: size === 'lg' ? tokens.font.sizes.lg : tokens.font.sizes.md,
            },
          ]}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

function getBackgroundColor(variant: ButtonProps['variant'], colors: ReturnType<typeof useTheme>['colors']) {
  switch (variant) {
    case 'secondary':
      return colors.surfaceRaised;
    case 'ghost':
      return 'transparent';
    case 'danger':
      return colors.danger;
    case 'primary':
    default:
      return colors.primary;
  }
}

function getBorderColor(variant: ButtonProps['variant'], colors: ReturnType<typeof useTheme>['colors']) {
  switch (variant) {
    case 'ghost':
      return colors.border;
    case 'secondary':
      return colors.border;
    case 'danger':
      return colors.danger;
    case 'primary':
    default:
      return colors.primary;
  }
}

function getTextColor(variant: ButtonProps['variant'], colors: ReturnType<typeof useTheme>['colors']) {
  switch (variant) {
    case 'secondary':
    case 'ghost':
      return colors.textPrimary;
    case 'danger':
    case 'primary':
    default:
      return '#FFFFFF';
  }
}

function getVerticalPadding(size: ButtonProps['size']) {
  switch (size) {
    case 'sm':
      return 10;
    case 'lg':
      return 16;
    case 'md':
    default:
      return 14;
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
  },
});
