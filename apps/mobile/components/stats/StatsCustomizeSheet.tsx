import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { getSectionDef } from '../../constants/statsSections';
import { useStatsDashboardStore } from '../../stores/statsDashboardStore';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';

const ITEM_HEIGHT = 52;

// ── Types ────────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
}

interface RowProps {
  id: string;
  index: number;
  total: number;
  isHidden: boolean;
  label: string;
  icon: string;
  colors: ReturnType<typeof import('../../theme/useTheme').useTheme>['colors'];
  onToggle: (id: string) => void;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  isActive: boolean;
  shiftY: number;
}

// ── Row ──────────────────────────────────────────────────────────────────────
function Row({
  id,
  isHidden,
  label,
  icon,
  colors,
  onToggle,
  panHandlers,
  isActive,
  shiftY,
}: RowProps) {
  return (
    <View
      style={[
        styles.row,
        {
          borderTopColor: colors.border,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
          zIndex: isActive ? 100 : 0,
          transform: [{ translateY: shiftY }],
        },
        isActive && styles.rowLifted,
      ]}
    >
      <Pressable
        accessibilityLabel={isHidden ? `Mostrar ${label}` : `Esconder ${label}`}
        onPress={() => onToggle(id)}
        style={styles.toggleBtn}
      >
        <Ionicons
          color={isHidden ? colors.textMuted : colors.primary}
          name={isHidden ? 'eye-off-outline' : 'eye-outline'}
          size={20}
        />
      </Pressable>

      <Ionicons
        color={isHidden ? colors.textMuted : colors.textSecondary}
        name={icon as keyof typeof Ionicons.glyphMap}
        size={18}
      />

      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { color: isHidden ? colors.textMuted : colors.textPrimary },
          isHidden && styles.labelHidden,
        ]}
      >
        {label}
      </Text>

      {/* Drag handle — PanResponder is attached here ONLY */}
      <View {...panHandlers} style={[styles.dragHandle, isActive && { opacity: 0.6 }]}>
        <Ionicons
          color={isActive ? colors.primary : colors.textMuted}
          name="reorder-three-outline"
          size={22}
        />
      </View>
    </View>
  );
}

// ── Sheet ────────────────────────────────────────────────────────────────────
export default function StatsCustomizeSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['75%'], []);

  const effectiveOrder = useStatsDashboardStore((s) => s.getEffectiveOrder());
  const hiddenSections = useStatsDashboardStore((s) => s.hiddenSections);
  const moveSection = useStatsDashboardStore((s) => s.moveSection);
  const toggleSection = useStatsDashboardStore((s) => s.toggleSection);
  const resetToDefaults = useStatsDashboardStore((s) => s.resetToDefaults);

  // Drag state — index of the row being dragged, and current translation
  const [dragFrom, setDragFrom] = useState(-1);
  const [dragTranslation, setDragTranslation] = useState(0);

  // Refs for use inside PanResponder closures (avoid stale state)
  const dragFromRef = useRef(-1);
  const orderLengthRef = useRef(effectiveOrder.length);
  useEffect(() => { orderLengthRef.current = effectiveOrder.length; }, [effectiveOrder.length]);

  const handleToggle = useCallback(
    (sectionId: string) => { hapticLight(); toggleSection(sectionId); },
    [toggleSection],
  );

  const handleReset = useCallback(() => { hapticLight(); resetToDefaults(); }, [resetToDefaults]);

  useEffect(() => {
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

  // Compute per-row visual shift during drag
  const getShiftY = useCallback((rowIndex: number): number => {
    const from = dragFrom;
    if (from === -1 || dragTranslation === 0) return 0;

    if (rowIndex === from) return dragTranslation;

    const total = effectiveOrder.length;
    const rawTarget = from + dragTranslation / ITEM_HEIGHT;
    const target = Math.max(0, Math.min(Math.round(rawTarget), total - 1));

    if (from < target && rowIndex > from && rowIndex <= target) return -ITEM_HEIGHT;
    if (from > target && rowIndex < from && rowIndex >= target) return ITEM_HEIGHT;
    return 0;
  }, [dragFrom, dragTranslation, effectiveOrder.length]);

  // Build one PanResponder per row index — recreated only when the list length changes
  const panResponders = useMemo(() => {
    return effectiveOrder.map((_, idx) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          hapticLight();
          dragFromRef.current = idx;
          setDragFrom(idx);
          setDragTranslation(0);
        },
        onPanResponderMove: (_, gs) => {
          setDragTranslation(gs.dy);
        },
        onPanResponderRelease: (_, gs) => {
          const from = dragFromRef.current;
          if (from !== -1) {
            const raw = Math.round(from + gs.dy / ITEM_HEIGHT);
            const to = Math.max(0, Math.min(raw, orderLengthRef.current - 1));
            if (from !== to) { hapticLight(); moveSection(from, to); }
          }
          dragFromRef.current = -1;
          setDragFrom(-1);
          setDragTranslation(0);
        },
        onPanResponderTerminate: (_, gs) => {
          const from = dragFromRef.current;
          if (from !== -1) {
            const raw = Math.round(from + gs.dy / ITEM_HEIGHT);
            const to = Math.max(0, Math.min(raw, orderLengthRef.current - 1));
            if (from !== to) moveSection(from, to);
          }
          dragFromRef.current = -1;
          setDragFrom(-1);
          setDragTranslation(0);
        },
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOrder.length, moveSection]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      backgroundStyle={{ backgroundColor: colors.surface }}
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      index={0}
      snapPoints={snapPoints}
      onDismiss={onClose}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Personalizar Dashboard</Text>
        <Pressable onPress={handleReset}>
          <Text style={[styles.resetText, { color: colors.info }]}>Repor</Text>
        </Pressable>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={styles.list}
        scrollEnabled={dragFrom === -1}
        showsVerticalScrollIndicator={false}
      >
        {effectiveOrder.map((id, index) => {
          const def = getSectionDef(id);
          if (!def) return null;
          return (
            <Row
              key={id}
              colors={colors}
              icon={def.icon}
              id={id}
              index={index}
              isActive={dragFrom === index}
              isHidden={!!hiddenSections[id]}
              label={def.label}
              panHandlers={panResponders[index]?.panHandlers ?? {}}
              shiftY={getShiftY(index)}
              total={effectiveOrder.length}
              onToggle={handleToggle}
            />
          );
        })}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '600' },
  resetText: { fontSize: 14, fontWeight: '500' },
  list: { paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_HEIGHT,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: -1,
    gap: 10,
  },
  rowLifted: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toggleBtn: { padding: 4 },
  label: { flex: 1, fontSize: 14, fontWeight: '500' },
  labelHidden: { textDecorationLine: 'line-through', opacity: 0.6 },
  dragHandle: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});