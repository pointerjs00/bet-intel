import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoletinStatus } from '@betintel/shared';
import { PressableScale } from '../ui/PressableScale';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface StatusFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  selected: Set<BoletinStatus>;
  onChange: (next: Set<BoletinStatus>) => void;
  /** Boletins per status, shown on each tile. */
  counts: Partial<Record<BoletinStatus, number>>;
  /** Boletins matching the current selection (for the button). */
  resultCount: number;
}

/**
 * Status filter as a bottom sheet of colour-coded tiles (icon, name, count). Tapping a tile applies
 * right away; the button closes and shows how many boletins match.
 */
export function StatusFilterSheet({ visible, onClose, selected, onChange, counts, resultCount }: StatusFilterSheetProps) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();

  const options: Array<{ key: BoletinStatus; label: string; icon: IconName; color: string }> = [
    { key: BoletinStatus.PENDING, label: 'Pendente', icon: 'time-outline', color: colors.warning },
    { key: BoletinStatus.WON, label: 'Ganhou', icon: 'checkmark-circle-outline', color: colors.positive },
    { key: BoletinStatus.LOST, label: 'Perdeu', icon: 'close-circle-outline', color: colors.negative },
    { key: BoletinStatus.CASHOUT, label: 'Cashout', icon: 'cash-outline', color: colors.gold },
    { key: BoletinStatus.VOID, label: 'Anulado', icon: 'remove-circle-outline', color: colors.info },
  ];

  const toggle = (k: BoletinStatus) => {
    hapticLight();
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(next);
  };

  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <Animated.View entering={FadeIn.duration(160)} style={styles.backdrop}>
        <Pressable feedback="none" accessibilityLabel="Fechar" onPress={onClose} style={StyleSheet.absoluteFill} />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(220)}
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: bottom + 16 }]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Estado</Text>
              <Text style={[styles.sub, { color: colors.textMuted }]}>
                {selected.size ? `${selected.size} selecionado${selected.size > 1 ? 's' : ''}` : 'Todos os estados'}
              </Text>
            </View>
            {selected.size ? (
              <Pressable hitSlop={10} onPress={() => { hapticLight(); onChange(new Set()); }}>
                <Text style={[styles.clear, { color: colors.primary }]}>Limpar</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.grid}>
            {options.map((o) => {
              const active = selected.has(o.key);
              return (
                <PressableScale
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  key={o.key}
                  onPress={() => toggle(o.key)}
                  scaleDown={0.96}
                  style={[styles.tile, {
                    backgroundColor: active ? `${o.color}1F` : colors.surfaceRaised,
                    borderColor: active ? o.color : 'transparent',
                  }]}
                >
                  <View style={[styles.tileIcon, { backgroundColor: `${o.color}26` }]}>
                    <Ionicons color={o.color} name={o.icon} size={20} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.tileLabel, { color: colors.textPrimary }]}>{o.label}</Text>
                    <Text style={[styles.tileCount, { color: colors.textMuted }]}>{counts[o.key] ?? 0} boletins</Text>
                  </View>
                  <Ionicons color={active ? o.color : colors.border} name={active ? 'checkmark-circle' : 'ellipse-outline'} size={20} />
                </PressableScale>
              );
            })}
          </View>

          <PressableScale onPress={onClose} scaleDown={0.98} style={[styles.button, { backgroundColor: colors.primary }]}>
            <Text style={styles.buttonText}>Mostrar {resultCount} boletim{resultCount === 1 ? '' : 's'}</Text>
          </PressableScale>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 14, paddingHorizontal: 16, paddingTop: 8 },
  handle: { alignSelf: 'center', borderRadius: 2, height: 4, width: 40 },
  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  sub: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 1 },
  clear: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  grid: { gap: 8 },
  tile: { alignItems: 'center', borderRadius: 16, borderWidth: 1.5, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  tileIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  tileLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  tileCount: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  button: { alignItems: 'center', borderRadius: 14, height: 50, justifyContent: 'center' },
  buttonText: { color: '#0B0D0C', fontSize: 15, fontWeight: '800' },
});
