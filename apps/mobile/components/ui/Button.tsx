import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  Text,
  View,
  ViewStyle,
  type PressableProps,
} from 'react-native';
import { Pressable } from './Pressable';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/useTheme';
import { useGlow } from './ListCard';

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
  const glow = useGlow();
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';
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
        isPrimary && !isDisabled ? glow : null,
        animatedStyle,
        style,
      ]}
      {...props}
    >
      {isPrimary ? (
        <LinearGradient
          colors={[colors.primary, colors.primaryGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.gradient]}
        />
      ) : null}
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
      return colors.primary;
    case 'secondary':
      return colors.surfaceRaised;
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
      return colors.textPrimary;
    case 'ghost':
      return colors.primary;
    case 'danger':
      return '#FFFFFF';
    case 'primary':
    default:
      return colors.onPrimary;
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
      return 48;
  }
}

const styles = StyleSheet.create({
  gradient: { borderRadius: 16 },
  base: {
    borderRadius: 16,
    borderWidth: 1.5,
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
