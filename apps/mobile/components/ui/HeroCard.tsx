import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/useTheme';
import { OnHeroContext } from './AppText';
import { useGlow } from './ListCard';

interface HeroCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one highlighted card of a screen (profit, boletim summary): gradient ground
 * (violet → teal → green in dark, ink in light), coloured glow, and AppText inside
 * switches to the hero palette automatically.
 */
export function HeroCard({ children, onPress, accessibilityHint, style }: HeroCardProps) {
  const { colors } = useTheme();
  const glow = useGlow();
  const body = (
    <>
      <LinearGradient
        colors={[colors.heroFrom, colors.heroVia, colors.heroTo]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[StyleSheet.absoluteFill, styles.radius]}
      />
      <OnHeroContext.Provider value>{children}</OnHeroContext.Provider>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, glow, { backgroundColor: colors.heroFrom, transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.card, glow, { backgroundColor: colors.heroFrom }, style]}>{body}</View>;
}

/** Translucent tile for metrics inside a HeroCard. */
export function HeroTile({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.tile, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  radius: { borderRadius: 24 },
  card: { borderRadius: 24, gap: 8, padding: 18 },
  tile: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, flex: 1, gap: 2, paddingHorizontal: 10, paddingVertical: 9 },
});
