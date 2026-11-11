import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Pressable } from '../../ui/Pressable';
import { useCardElevation } from '../../ui/ListCard';
import { useTheme } from '../../../theme/useTheme';

export type IconTone = 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'teal' | 'pink';

const TONES: Record<IconTone, [string, string]> = {
  green: ['#3DFFA2', '#0FB980'],
  red: ['#FF8A96', '#E5485C'],
  amber: ['#FFD27A', '#F59E0B'],
  blue: ['#7CC0FF', '#3B82F6'],
  purple: ['#C4A6FF', '#7C5CFF'],
  teal: ['#6EF2E0', '#14B8A6'],
  pink: ['#FF9ED8', '#E0479E'],
};

export interface IconSpec {
  /** "mci:" prefix = MaterialCommunityIcons, otherwise Ionicons. */
  name: string;
  tone: IconTone;
}

/** Custom icon tile: a small rounded gradient square with a white glyph, one colour per panel. */
export function IconTile({ icon, size = 30 }: { icon: IconSpec; size?: number }) {
  const [from, to] = TONES[icon.tone];
  const glyph = Math.round(size * 0.56);
  return (
    <LinearGradient colors={[from, to]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={[styles.tile, { borderRadius: size * 0.32, height: size, width: size }]}>
      {icon.name.startsWith('mci:') ? (
        <MaterialCommunityIcons color="#0B0D12" name={icon.name.slice(4) as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={glyph} />
      ) : (
        <Ionicons color="#0B0D12" name={icon.name as React.ComponentProps<typeof Ionicons>['name']} size={glyph} />
      )}
    </LinearGradient>
  );
}

export function toneColor(tone: IconTone): string {
  return TONES[tone][0];
}

interface StatCardProps {
  title?: string;
  subtitle?: string;
  icon?: IconSpec;
  right?: React.ReactNode;
  /** Entrance order within the tab (staggers the animation). */
  index?: number;
  onInfoPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tint?: string;
  children: React.ReactNode;
}

/**
 * Análise v3 card: elevated surface with a soft shadow so it lifts off the background,
 * optional gradient icon tile, title row with a right-hand control, staggered entrance.
 */
export function StatCard({ title, subtitle, icon, right, index = 0, onInfoPress, style, tint, children }: StatCardProps) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 55).duration(320).withInitialValues({ transform: [{ translateY: 14 }] })}
      style={[styles.card, elevation, { backgroundColor: tint ?? colors.surface }, style]}
    >
      {title ? (
        <View style={styles.head}>
          {icon ? <IconTile icon={icon} /> : null}
          <View style={styles.headText}>
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
              {onInfoPress ? (
                <Pressable accessibilityLabel={`Sobre ${title}`} hitSlop={10} onPress={onInfoPress}>
                  <Ionicons color={colors.textMuted} name="information-circle-outline" size={17} />
                </Pressable>
              ) : null}
            </View>
            {subtitle ? <Text numberOfLines={2} style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </Animated.View>
  );
}

/** Small two-option pill toggle used in card headers (Lucro / Retorno, Acumulado / Por mês). */
export function MiniToggle<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toggle, { backgroundColor: colors.background }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.toggleItem, active && { backgroundColor: colors.surfaceRaised }]}
          >
            <Text style={[styles.toggleText, { color: active ? colors.textPrimary : colors.textMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Headline sentence at the top of a tab ("Ganhas com simples…"), parts coloured by sentiment. */
export function TabHeadline({ parts }: { parts: Array<{ text: string; tone?: 'positive' | 'negative' }> }) {
  const { colors } = useTheme();
  return (
    <Animated.Text entering={FadeInDown.duration(300)} style={[styles.headline, { color: colors.textPrimary }]}>
      {parts.map((p, i) => (
        <Text key={i} style={p.tone ? { color: p.tone === 'positive' ? colors.positive : colors.negative } : undefined}>{p.text}</Text>
      ))}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, gap: 14, padding: 16 },
  head: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  headText: { flex: 1, gap: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  title: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 16 },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  toggle: { borderRadius: 10, flexDirection: 'row', padding: 3 },
  toggleItem: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  toggleText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  headline: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, lineHeight: 28, paddingHorizontal: 4 },
});
