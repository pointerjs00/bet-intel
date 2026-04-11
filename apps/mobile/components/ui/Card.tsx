import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'surface' | 'raised';
  noPadding?: boolean;
}

export const Card = React.memo(function Card({
  children,
  onPress,
  style,
  variant = 'surface',
  noPadding = false,
}: CardProps) {
  const { colors, tokens, isDark } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bg = variant === 'raised' ? colors.surfaceRaised : colors.surface;

  const content = (
    <Animated.View
      style={[
        styles.base,
        isDark ? styles.shadowDark : styles.shadowLight,
        {
          backgroundColor: bg,
          borderColor: isDark ? 'transparent' : colors.border,
          borderWidth: isDark ? 0 : 1,
          padding: noPadding ? 0 : tokens.spacing.lg,
        },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 18, stiffness: 600 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 600 });
        }}
        style={[
          styles.base,
          isDark ? styles.shadowDark : styles.shadowLight,
          {
            backgroundColor: bg,
            borderColor: isDark ? 'transparent' : colors.border,
            borderWidth: isDark ? 0 : 1,
            padding: noPadding ? 0 : tokens.spacing.lg,
          },
          animatedStyle,
          style,
        ]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  shadowLight: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }) as ViewStyle,
  shadowDark: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    android: {
      elevation: 4,
    },
    default: {},
  }) as ViewStyle,
});
