import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type SortKey = 'roi' | 'winRate' | 'totalBets' | 'profitLoss';

const SORT_OPTIONS: Array<{ key: SortKey; label: string; icon: string }> = [
  { key: 'roi', label: 'ROI', icon: 'trending-up-outline' },
  { key: 'winRate', label: 'Win %', icon: 'trophy-outline' },
  { key: 'totalBets', label: 'Apostas', icon: 'layers-outline' },
  { key: 'profitLoss', label: 'Lucro', icon: 'cash-outline' },
];

interface TableSortButtonProps {
  /** Currently committed sort key */
  sortBy: SortKey;
  /** Min-bets threshold (0 = disabled) */
  minBets: number;
  /** Called when user applies new settings */
  onApply: (sortBy: SortKey, minBets: number) => void;
  /** Modal title */
  title: string;
}

/**
 * Compact sort/filter button that opens a modal to choose sort and min-bets.
 * Follows the same pattern as the ByHourSection filter.
 */
export const TableSortButton = React.memo(function TableSortButton({
  sortBy,
  minBets,
  onApply,
  title,
}: TableSortButtonProps) {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [draftSort, setDraftSort] = useState<SortKey>(sortBy);
  const [draftMinBets, setDraftMinBets] = useState(minBets);

  const hasActiveFilters = sortBy !== 'roi' || minBets > 0;

  const btnScale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const openModal = useCallback(() => {
    setDraftSort(sortBy);
    setDraftMinBets(minBets);
    setModalVisible(true);
  }, [sortBy, minBets]);

  const handleApply = useCallback(() => {
    onApply(draftSort, draftMinBets);
    setModalVisible(false);
  }, [draftSort, draftMinBets, onApply]);

  const handleReset = useCallback(() => {
    setDraftSort('roi');
    setDraftMinBets(0);
  }, []);

  const handleClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const activeLabel = hasActiveFilters
    ? SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? 'Filtrar'
    : 'Filtrar';

  return (
    <>
      <AnimatedPressable
        accessibilityLabel="Ordenar e filtrar"
        accessibilityRole="button"
        hitSlop={8}
        onPress={openModal}
        onPressIn={() => { btnScale.value = withTiming(0.88, { duration: 70 }); }}
        onPressOut={() => { btnScale.value = withSpring(1, { damping: 14, stiffness: 320 }); }}
        style={[
          styles.filterBtn,
          btnAnimStyle,
          {
            borderColor: hasActiveFilters ? colors.primary : colors.border,
            backgroundColor: hasActiveFilters ? `${colors.primary}18` : colors.surfaceRaised,
          },
        ]}
      >
        <Ionicons
          color={hasActiveFilters ? colors.primary : colors.textSecondary}
          name="options-outline"
          size={14}
        />
        <Text style={[styles.filterBtnText, { color: hasActiveFilters ? colors.primary : colors.textSecondary }]}>
          {activeLabel}
        </Text>
      </AnimatedPressable>

      <Modal
        animationType="slide"
        onRequestClose={handleClose}
        transparent
        visible={modalVisible}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Filtrar — {title}</Text>
              <Pressable hitSlop={12} onPress={handleClose}>
                <Ionicons color={colors.textSecondary} name="close" size={22} />
              </Pressable>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Sort options */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ORDENAR POR</Text>
              <View style={styles.sortGrid}>
                {SORT_OPTIONS.map((opt) => {
                  const active = draftSort === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setDraftSort(opt.key)}
                      style={[
                        styles.sortOption,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? `${colors.primary}18` : colors.surfaceRaised,
                        },
                      ]}
                    >
                      <Ionicons
                        color={active ? colors.primary : colors.textSecondary}
                        name={opt.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                      />
                      <Text style={[styles.sortOptionText, { color: active ? colors.primary : colors.textPrimary }]}>
                        {opt.label}
                      </Text>
                      {active && (
                        <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Min bets threshold */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MÍNIMO DE APOSTAS</Text>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                Esconde grupos com menos apostas do que o selecionado
              </Text>
              <View style={styles.minBetsRow}>
                {[0, 2, 3, 5, 10].map((n) => {
                  const active = draftMinBets === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setDraftMinBets(n)}
                      style={[
                        styles.minBetsChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? `${colors.primary}18` : colors.surfaceRaised,
                        },
                      ]}
                    >
                      <Text style={[styles.minBetsChipText, { color: active ? colors.primary : colors.textPrimary }]}>
                        {n === 0 ? 'Todos' : `≥ ${n}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable
                onPress={handleReset}
                style={[styles.actionBtn, styles.resetBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>Repor</Text>
              </Pressable>
              <Pressable
                onPress={handleApply}
                style={[styles.actionBtn, styles.applyBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.applyBtnText}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  filterBtn: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 4,
    marginBottom: 16,
    width: 40,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  section: {
    gap: 10,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: -4,
  },
  sortGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sortOption: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
    minWidth: '45%',
    flex: 1,
    paddingVertical: 12,
  },
  sortOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeDot: {
    borderRadius: 4,
    height: 4,
    marginTop: 2,
    width: 4,
  },
  minBetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  minBetsChip: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    flex: 1,
    paddingVertical: 10,
  },
  minBetsChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 14,
  },
  resetBtn: {
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  applyBtn: {},
  applyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
