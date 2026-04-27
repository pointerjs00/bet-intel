import { useEffect, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * Adds swipe-down-to-dismiss behaviour to a bottom sheet.
 * Attach `panHandlers` to the drag handle view.
 * Wrap the sheet in an `Animated.View` with the returned `animatedStyle`.
 *
 * Pass `visible` so the translateY resets to 0 each time the sheet opens —
 * otherwise it stays at the dismissed position and the sheet won't appear.
 */
export function useSwipeToDismiss(
  onClose: () => void,
  { threshold = 80, velocityThreshold = 0.5, visible = true } = {},
) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
    }
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > threshold || vy > velocityThreshold) {
          Animated.timing(translateY, { toValue: 600, duration: 180, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    }),
  ).current;

  const animatedStyle = { transform: [{ translateY }] };

  return { panHandlers: panResponder.panHandlers, animatedStyle };
}
