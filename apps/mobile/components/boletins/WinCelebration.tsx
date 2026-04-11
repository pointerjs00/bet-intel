import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';
import { hapticSuccess } from '../../utils/haptics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PARTICLE_COUNT = 40;
const AUTO_DISMISS_MS = 2800;

const CONFETTI_COLORS = [
  '#00C851', // green
  '#FFD700', // gold
  '#FFFFFF', // white
  '#007AFF', // blue
  '#FF9500', // orange
  '#FF3B30', // red
];

interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  delay: number;
  shape: 'circle' | 'square';
}

function generateParticles(): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      id: i,
      x: Math.random() * SCREEN_W,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 600,
      shape: Math.random() > 0.5 ? 'circle' : 'square',
    });
  }
  return particles;
}

interface ConfettiParticleProps {
  particle: Particle;
}

function ConfettiParticle({ particle }: ConfettiParticleProps) {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      particle.delay,
      withTiming(SCREEN_H + 40, { duration: 1600 + Math.random() * 600, easing: Easing.in(Easing.quad) }),
    );
    opacity.value = withDelay(
      particle.delay + 1200,
      withTiming(0, { duration: 400 }),
    );
    rotate.value = withDelay(
      particle.delay,
      withTiming(360 * (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random()), {
        duration: 1800,
        easing: Easing.linear,
      }),
    );
  }, [translateY, opacity, rotate, particle.delay]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: particle.x,
          top: -20,
          width: particle.size,
          height: particle.size,
          backgroundColor: particle.color,
          borderRadius: particle.shape === 'circle' ? particle.size / 2 : 2,
        },
        style,
      ]}
    />
  );
}

interface WinCelebrationProps {
  profit: number;
  onDismiss: () => void;
}

/**
 * Full-screen win celebration overlay with confetti and profit display.
 * Auto-dismisses after ~3s or on tap.
 */
export function WinCelebration({ profit, onDismiss }: WinCelebrationProps) {
  const { colors } = useTheme();
  const particles = useMemo(() => generateParticles(), []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    hapticSuccess();
    scale.value = withSequence(
      withSpring(1.1, { damping: 6, stiffness: 200 }),
      withSpring(1, { damping: 10, stiffness: 150 }),
    );
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss, scale]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onDismiss();
  }, [onDismiss]);

  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(200)} style={styles.overlay}>
      {/* Confetti layer */}
      <View style={styles.confettiLayer} pointerEvents="none">
        {particles.map((p) => (
          <ConfettiParticle key={p.id} particle={p} />
        ))}
      </View>

      {/* Dismiss on tap */}
      <Pressable style={styles.dismissArea} onPress={handleDismiss}>
        {/* Outer view for layout entering animation, inner view for scale */}
        <Animated.View entering={FadeInDown.delay(50).duration(220).springify()}>
          <Animated.View style={[styles.messageCard, cardStyle]}>
            <Text style={styles.trophy}>🏆</Text>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Boletim Ganho!</Text>
            {profit > 0 && (
              <Text style={[styles.profit, { color: colors.primary }]}>
                +{formatCurrency(profit)}
              </Text>
            )}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  dismissArea: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    zIndex: 1001,
  },
  messageCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(26,26,26,0.92)',
    borderRadius: 24,
    gap: 8,
    paddingHorizontal: 40,
    paddingVertical: 32,
  },
  trophy: {
    fontSize: 56,
    marginBottom: 4,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  profit: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
});
