import React from 'react';
import {
  Pressable as RNPressable,
  StyleSheet,
  type PressableProps as RNPressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

export interface PressableProps extends RNPressableProps {
  /**
   * Touch feedback: 'press' (default) dims and dips slightly while held; 'none' for backdrops
   * and wrappers that shouldn't react. A function `style` means the caller handles it.
   */
  feedback?: 'press' | 'none';
}

const PRESSED: ViewStyle = { opacity: 0.72, transform: [{ scale: 0.97 }] };
const PRESSED_DISABLED: ViewStyle = {};

/**
 * Drop-in replacement for React Native's Pressable with instant pressed feedback, so every tap
 * in the app visibly responds. The pressed style is applied synchronously (no JS animation),
 * which keeps it free even in long lists.
 */
export const Pressable = React.forwardRef<View, PressableProps>(function Pressable(
  { feedback = 'press', style, disabled, ...props },
  ref,
) {
  const composed =
    typeof style === 'function' || feedback === 'none'
      ? style
      : ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> =>
          pressed ? [style as StyleProp<ViewStyle>, disabled ? PRESSED_DISABLED : PRESSED] : (style as StyleProp<ViewStyle>);
  return <RNPressable ref={ref} disabled={disabled} style={composed} {...props} />;
});

/** Kept for callers that flatten styles themselves. */
export const pressedStyle = StyleSheet.create({ pressed: PRESSED }).pressed;
