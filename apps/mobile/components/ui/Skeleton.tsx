import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface SkeletonProps {
  width?: number | `${number}%` | 'auto';
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 10, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surfaceRaised,
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
