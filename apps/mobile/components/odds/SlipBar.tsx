import React from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../ui/AppText';
import { Pressable } from '../ui/Pressable';
import { useTheme } from '../../theme/useTheme';
import { useOddsSlipStore } from '../../stores/oddsSlipStore';
import { useOddsMultiple } from '../../services/oddsService';
import { formatOdd } from '../../utils/odds/format';
import { houseName } from './houseName';

const TAB_BAR_HEIGHT = 64;

interface SlipBarProps {
  /** True when rendered inside the tabs, so the bar clears the tab bar. */
  aboveTabBar?: boolean;
}

/** Floating bar summarising the odds multiple (above the tab bar when inside the tabs); hidden when empty. */
export function SlipBar({ aboveTabBar = false }: SlipBarProps) {
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const legs = useOddsSlipStore((s) => s.legs);
  const { data } = useOddsMultiple(legs);
  if (legs.length === 0) return null;

  const n = legs.length;
  const base = `Múltipla · ${n} ${n === 1 ? 'seleção' : 'seleções'}`;
  const bestHouse = data?.best ?? null;
  const total = bestHouse ? data?.perHouse[bestHouse]?.total ?? null : null;
  const text = bestHouse && total !== null ? `${base} · melhor ${formatOdd(total)} na ${houseName(bestHouse)}` : base;

  return (
    <Pressable
      accessibilityLabel={text}
      accessibilityRole="button"
      onPress={() => router.push('/odds/multipla')}
      style={[styles.bar, { backgroundColor: colors.primary, borderRadius: tokens.radius.lg, bottom: Math.max(insets.bottom, 12) + (aboveTabBar ? TAB_BAR_HEIGHT + 8 : 0) }]}
    >
      <AppText numberOfLines={1} style={[styles.text, { color: colors.onPrimary }]} variant="bodyStrong">{text}</AppText>
      <Ionicons color={colors.onPrimary} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', elevation: 6, flexDirection: 'row', gap: 8, left: 16, paddingHorizontal: 16, paddingVertical: 12, position: 'absolute', right: 16 },
  text: { flex: 1 },
});
