import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  scaleDown?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * A Pressable that scales down on press for tactile feedback.
 * Drop-in replacement for <Pressable> anywhere you want a subtle "dip" animation.
 */
export const PressableScale = React.memo(function PressableScale({
  scaleDown = 0.97,
  style,
  children,
  ...props
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={(e) => {
        scale.value = withSpring(scaleDown, { damping: 15, stiffness: 800 });
        (props.onPressIn as PressableProps['onPressIn'])?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 800 });
        (props.onPressOut as PressableProps['onPressOut'])?.(e);
      }}
      style={[animatedStyle, style]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
});
