import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BoletinStatus } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { AppText } from './AppText';

type PillKind = BoletinStatus | 'LIVE' | 'REVIEW';

/** Status always shown with icon + text, never colour alone (PLANO_MELHORIAS.md §6.1). */
export function StatusPill({ status, compact = false }: { status: PillKind; compact?: boolean }) {
  const { colors, isDark } = useTheme();
  const positive = isDark ? '#5BE39A' : colors.primary;
  const negative = isDark ? '#FF8A7F' : colors.danger;
  const meta: Record<PillKind, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
    [BoletinStatus.WON]: { label: 'Ganhou', icon: 'checkmark', color: positive },
    [BoletinStatus.LOST]: { label: 'Perdeu', icon: 'close', color: negative },
    [BoletinStatus.PENDING]: { label: 'Pendente', icon: 'time-outline', color: colors.warning },
    [BoletinStatus.VOID]: { label: 'Anulado', icon: 'remove-circle-outline', color: colors.textSecondary },
    [BoletinStatus.PARTIAL]: { label: 'Parcial', icon: 'checkmark-done', color: positive },
    [BoletinStatus.CASHOUT]: { label: 'Cashout', icon: 'cash-outline', color: colors.gold },
    LIVE: { label: 'Ao vivo', icon: 'radio-button-on', color: colors.live },
    REVIEW: { label: 'A rever', icon: 'alert-circle-outline', color: colors.warning },
  };
  const m = meta[status];
  return (
    <View
      accessibilityLabel={m.label}
      style={[styles.pill, compact && styles.compact, { backgroundColor: `${m.color}22` }]}
    >
      <Ionicons color={m.color} name={m.icon} size={compact ? 12 : 14} />
      <AppText style={{ color: m.color, fontSize: compact ? 11 : 12 }} variant="label">{m.label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, flexDirection: 'row', gap: 4, height: 26, paddingHorizontal: 10 },
  compact: { height: 22, paddingHorizontal: 8 },
});
