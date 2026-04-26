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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftSlot?: React.ReactNode;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const Button = React.memo(function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftSlot,
  textColor,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const { colors, tokens } = useTheme();
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 15, stiffness: 800 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 800 });
      }}
      style={[
        styles.base,
        {
          backgroundColor: getBackgroundColor(variant, colors),
          borderColor: getBorderColor(variant, colors),
          opacity: isDisabled ? 0.55 : 1,
          height: getHeight(size),
        },
        animatedStyle,
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
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[
            styles.label,
            {
              color: textColor ?? getTextColor(variant, colors),
              fontSize: size === 'lg' ? tokens.font.sizes.lg : tokens.font.sizes.md,
            },
          ]}
        >
          {title}
        </Text>
      </View>
    </AnimatedPressable>
  );
});

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

function getHeight(size: ButtonProps['size']) {
  switch (size) {
    case 'sm':
      return 36;
    case 'lg':
      return 52;
    case 'md':
    default:
      return 44;
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    borderWidth: 1,
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
