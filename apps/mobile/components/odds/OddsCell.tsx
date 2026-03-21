import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';
import { addSocketListener, subscribeToEvent, unsubscribeFromEvent } from '../../services/socketService';
import type { OddsUpdatedPayload } from '@betintel/shared';

interface OddsCellProps {
  eventId: string;
  siteId: string;
  market: string;
  selection: string;
  oddSelection?: string;
  value: string;
  highlight?: boolean;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function OddsCell({
  eventId,
  siteId,
  market,
  selection,
  oddSelection,
  value,
  highlight = false,
  onPress,
}: OddsCellProps) {
  const { colors } = useTheme();
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const flash = useSharedValue(0);
  const direction = useSharedValue(0);
  const resolvedSelection = oddSelection ?? selection;

  useEffect(() => {
    setDisplayValue(value);
    previousValue.current = value;
  }, [value]);

  useEffect(() => {
    subscribeToEvent(eventId);

    const removeListener = addSocketListener('odds:updated', (payload: OddsUpdatedPayload) => {
      if (
        payload.eventId !== eventId ||
        payload.siteId !== siteId ||
        payload.market !== market ||
        payload.selection !== resolvedSelection
      ) {
        return;
      }

      triggerFlash(payload.oldValue, payload.newValue);
      setDisplayValue(payload.newValue);
      previousValue.current = payload.newValue;
    });

    return () => {
      removeListener();
      unsubscribeFromEvent(eventId);
    };
  }, [eventId, market, resolvedSelection, siteId]);

  useEffect(() => {
    const current = Number(displayValue);
    const previous = Number(previousValue.current);

    if (previousValue.current !== displayValue && Number.isFinite(current) && Number.isFinite(previous)) {
      triggerFlash(previousValue.current, displayValue);
      previousValue.current = displayValue;
    }
  }, [direction, displayValue, flash]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor:
      direction.value === 0
        ? colors.surface
        : interpolateColor(
            flash.value,
            [0, 1],
            [
              highlight ? colors.gold : colors.surface,
              direction.value > 0 ? 'rgba(0, 200, 81, 0.24)' : 'rgba(255, 59, 48, 0.24)',
            ],
          ),
  }));

  return (
    <AnimatedPressable
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.cell,
        animatedStyle,
        {
          borderColor: highlight ? colors.gold : colors.border,
        },
      ]}
    >
      <Text style={[styles.selection, { color: colors.textSecondary }]}>{selection}</Text>
      <Text style={[styles.value, { color: highlight ? colors.gold : colors.textPrimary }]}>{formatOdds(displayValue)}</Text>
    </AnimatedPressable>
  );

  function triggerFlash(previous: string, next: string) {
    const current = Number(next);
    const prior = Number(previous);

    if (!Number.isFinite(current) || !Number.isFinite(prior) || previous === next) {
      return;
    }

    direction.value = current > prior ? 1 : -1;
    flash.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 520 }));
  }
}

function formatOdds(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value;
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  selection: {
    fontSize: 11,
    fontWeight: '700',
  },
  value: {
    fontSize: 16,
    fontWeight: '900',
  },
});
