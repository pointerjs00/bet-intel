import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';
import { useCardElevation } from './ListCard';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'surface' | 'raised';
  noPadding?: boolean;
}

/**
 * Base card (redesign §6.1): elevation and a slightly lighter surface instead of a 1px outline,
 * in both themes. `raised` is for tiles nested inside another card (flat, no shadow).
 */
export const Card = React.memo(function Card({ children, onPress, style, variant = 'surface', noPadding = false }: CardProps) {
  const { colors, tokens } = useTheme();
  const elevation = useCardElevation();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const raised = variant === 'raised';
  const cardStyle = [
    styles.base,
    raised ? null : elevation,
    { backgroundColor: raised ? colors.surfaceRaised : colors.surface, padding: noPadding ? 0 : tokens.spacing.lg },
    animatedStyle,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.98, { damping: 18, stiffness: 600 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 600 }); }}
        style={cardStyle}
      >
        {children}
      </AnimatedPressable>
    );
  }
  return <Animated.View style={cardStyle}>{children}</Animated.View>;
});

const styles = StyleSheet.create({
  base: { borderRadius: 18, overflow: 'hidden' },
});
