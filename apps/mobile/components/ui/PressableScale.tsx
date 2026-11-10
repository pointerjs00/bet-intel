import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  scaleDown?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const SPRING_IN = { damping: 20, stiffness: 900, mass: 0.6 };
const SPRING_OUT = { damping: 14, stiffness: 420, mass: 0.6 };

/**
 * A Pressable that dips (scale + slight dim) on press and springs back with a small overshoot,
 * for tactile feedback. Runs on the UI thread.
 */
export const PressableScale = React.memo(function PressableScale({
  scaleDown = 0.96,
  style,
  children,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      // Handlers after the spread so callers' onPressIn/onPressOut never cancel the animation.
      onPressIn={(e) => {
        scale.value = withSpring(scaleDown, SPRING_IN);
        opacity.value = withTiming(0.85, { duration: 80 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING_OUT);
        opacity.value = withTiming(1, { duration: 140 });
        onPressOut?.(e);
      }}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
});
