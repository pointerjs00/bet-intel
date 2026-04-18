import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { BoletinDetail, ItemResult } from '@betintel/shared';
import { BoletinStatus } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { BoletinCard } from './BoletinCard';

const SWIPE_THRESHOLD = 80;
const MAX_TRANSLATE = 120;

interface SwipeableBoletinCardProps {
  boletin: BoletinDetail;
  onPress?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onQuickResolve?: (result: ItemResult) => void;
}

export const SwipeableBoletinCard = React.memo(function SwipeableBoletinCard({
  boletin,
  onPress,
  onDelete,
  onShare,
  onQuickResolve,
}: SwipeableBoletinCardProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);
  const isPending = boletin.status === BoletinStatus.PENDING;

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
  }, [translateX]);

  const onSwipeRight = useCallback(() => {
    if (onShare) {
      hapticMedium();
      onShare();
    }
    resetPosition();
  }, [onShare, resetPosition]);

  const onSwipeLeft = useCallback(() => {
    if (onDelete) {
      hapticMedium();
      onDelete();
    }
    resetPosition();
  }, [onDelete, resetPosition]);

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const clamped = Math.max(-MAX_TRANSLATE, Math.min(MAX_TRANSLATE, e.translationX));
      translateX.value = clamped;

      // Haptic at threshold
      if (Math.abs(clamped) >= SWIPE_THRESHOLD && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(hapticLight)();
      } else if (Math.abs(clamped) < SWIPE_THRESHOLD) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        runOnJS(onSwipeRight)();
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        runOnJS(onSwipeLeft)();
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1]),
    transform: [{ scale: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0.6, 1]) }],
  }));

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1]),
    transform: [{ scale: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0.6, 1]) }],
  }));

  return (
    <View style={styles.container}>
      {/* Background actions */}
      <View style={styles.actionsLayer}>
        {/* Left (swipe right) — Share */}
        <Animated.View style={[styles.leftAction, leftActionStyle]}>
          <View style={[styles.actionCircle, { backgroundColor: colors.info }]}>
            <Ionicons name="share-social" size={22} color="#FFFFFF" />
          </View>
          <Text style={[styles.actionLabel, { color: colors.info }]}>Partilhar</Text>
        </Animated.View>

        {/* Right (swipe left) — Delete */}
        <Animated.View style={[styles.rightAction, rightActionStyle]}>
          <Text style={[styles.actionLabel, { color: colors.danger }]}>Apagar</Text>
          <View style={[styles.actionCircle, { backgroundColor: colors.danger }]}>
            <Ionicons name="trash" size={22} color="#FFFFFF" />
          </View>
        </Animated.View>
      </View>

      {/* Swipeable card */}
      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <BoletinCard
            boletin={boletin}
            onPress={onPress}
            onDelete={onDelete}
            onShare={onShare}
          />

          {/* Quick resolve buttons — shown inline for PENDING boletins */}
          {isPending && onQuickResolve && (
            <View style={[styles.quickResolveRow, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={() => { hapticLight(); onQuickResolve('WON' as ItemResult); }}
                style={[styles.quickBtn, { backgroundColor: `${colors.primary}18` }]}
              >
                <Ionicons name="checkmark" size={16} color={colors.primary} />
                <Text style={[styles.quickBtnText, { color: colors.primary }]}>Ganhou</Text>
              </Pressable>
              <Pressable
                onPress={() => { hapticLight(); onQuickResolve('LOST' as ItemResult); }}
                style={[styles.quickBtn, { backgroundColor: `${colors.danger}18` }]}
              >
                <Ionicons name="close" size={16} color={colors.danger} />
                <Text style={[styles.quickBtnText, { color: colors.danger }]}>Perdeu</Text>
              </Pressable>
              <Pressable
                onPress={() => { hapticLight(); onQuickResolve('VOID' as ItemResult); }}
                style={[styles.quickBtn, { backgroundColor: `${colors.textMuted}18` }]}
              >
                <Ionicons name="remove" size={16} color={colors.textMuted} />
                <Text style={[styles.quickBtnText, { color: colors.textMuted }]}>Void</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { position: 'relative' },
  actionsLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  leftAction: { alignItems: 'center', gap: 4 },
  rightAction: { alignItems: 'center', gap: 4 },
  actionCircle: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  actionLabel: { fontSize: 11, fontWeight: '700' },
  quickResolveRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickBtn: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingVertical: 7,
  },
  quickBtnText: { fontSize: 12, fontWeight: '700' },
});
