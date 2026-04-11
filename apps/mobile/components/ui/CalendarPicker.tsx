import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { PressableScale } from './PressableScale';

const TouchableOpacity = PressableScale;

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MONTHS_PT_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

/** Groups months into rows of 3 for the month picker. */
const MONTH_ROWS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

type CalendarMode = 'day' | 'month' | 'year';

const YEAR_BEFORE = 12;
const YEAR_AFTER = 6;

interface CalendarPickerProps {
  visible: boolean;
  selected: Date | null;
  minDate?: Date;
  maxDate?: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

export function CalendarPicker({
  visible,
  selected,
  minDate,
  maxDate,
  onSelect,
  onClose,
}: CalendarPickerProps) {
  const { colors } = useTheme();

  const [viewYear, setViewYear] = useState<number>(() => (selected ?? new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => (selected ?? new Date()).getMonth());
  const [mode, setMode] = useState<CalendarMode>('day');

  const today = new Date();
  const currentYear = today.getFullYear();
  const years = Array.from(
    { length: YEAR_BEFORE + YEAR_AFTER + 1 },
    (_, i) => currentYear - YEAR_BEFORE + i,
  );

  // â”€â”€ Day grid helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Split into rows of 7 (avoids %-based widths that cause pixel-rounding misalignment)
  const gridRows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    gridRows.push(cells.slice(i, i + 7));
  }

  function isDisabled(day: number): boolean {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate) {
      const floor = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
      if (d < floor) return true;
    }
    if (maxDate) {
      const ceil = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
      if (d > ceil) return true;
    }
    return false;
  }

  function isSelected(day: number): boolean {
    if (!selected) return false;
    return (
      selected.getFullYear() === viewYear &&
      selected.getMonth() === viewMonth &&
      selected.getDate() === day
    );
  }

  function isToday(day: number): boolean {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    );
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  // â”€â”€ Day view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const dayContent = (
    <>
      <View style={styles.header}>
        <TouchableOpacity hitSlop={8} onPress={prevMonth} style={[styles.navBtn, { borderColor: colors.border }]}>
          <Ionicons color={colors.textPrimary} name="chevron-back" size={18} />
        </TouchableOpacity>

        {/* Tap month/year to open month picker */}
        <TouchableOpacity hitSlop={8} onPress={() => setMode('month')}>
          <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
            {MONTHS_PT[viewMonth]} {viewYear}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity hitSlop={8} onPress={nextMonth} style={[styles.navBtn, { borderColor: colors.border }]}>
          <Ionicons color={colors.textPrimary} name="chevron-forward" size={18} />
        </TouchableOpacity>
      </View>

      {/* Weekday header â€” uses flex:1 so widths match the grid cells exactly */}
      <View style={styles.weekRow}>
        {DAYS_OF_WEEK.map((d) => (
          <Text key={d} style={[styles.weekLabel, { color: colors.textSecondary }]}>
            {d}
          </Text>
        ))}
      </View>

      {/* Day grid â€” each row is a flex row, each cell uses flex:1 (no % widths) */}
      <View style={styles.grid}>
        {gridRows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {row.map((day, colIdx) => {
              if (day === null) {
                return <View key={`blank-${rowIdx}-${colIdx}`} style={styles.cell} />;
              }
              const disabled = isDisabled(day);
              const sel = isSelected(day);
              const tod = isToday(day);
              return (
                <TouchableOpacity
                  key={day}
                  disabled={disabled}
                  onPress={() => { onSelect(new Date(viewYear, viewMonth, day)); onClose(); }}
                  style={[
                    styles.cell,
                    sel && { backgroundColor: colors.primary, borderRadius: 999 },
                    tod && !sel && { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 999 },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: disabled ? colors.textMuted : colors.textPrimary },
                      sel && { color: '#fff', fontWeight: '700' },
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </>
  );

  // â”€â”€ Month picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const monthContent = (
    <>
      <View style={styles.header}>
        <TouchableOpacity hitSlop={8} onPress={() => setViewYear((y) => y - 1)} style={[styles.navBtn, { borderColor: colors.border }]}>
          <Ionicons color={colors.textPrimary} name="chevron-back" size={18} />
        </TouchableOpacity>

        {/* Tap year to open year picker */}
        <TouchableOpacity hitSlop={8} onPress={() => setMode('year')}>
          <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>{viewYear}</Text>
        </TouchableOpacity>

        <TouchableOpacity hitSlop={8} onPress={() => setViewYear((y) => y + 1)} style={[styles.navBtn, { borderColor: colors.border }]}>
          <Ionicons color={colors.textPrimary} name="chevron-forward" size={18} />
        </TouchableOpacity>
      </View>

      <View style={styles.monthGrid}>
        {MONTH_ROWS.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.monthGridRow}>
            {row.map((monthIdx) => {
              const active = viewMonth === monthIdx;
              return (
                <TouchableOpacity
                  key={monthIdx}
                  onPress={() => { setViewMonth(monthIdx); setMode('day'); }}
                  style={[
                    styles.monthCell,
                    { borderColor: active ? colors.primary : colors.border },
                    active && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.monthCellText, { color: active ? '#fff' : colors.textPrimary }]}>
                    {MONTHS_PT_SHORT[monthIdx]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </>
  );

  // â”€â”€ Year picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const yearContent = (
    <>
      <Text style={[styles.monthLabel, { color: colors.textPrimary, textAlign: 'center', marginBottom: 12 }]}>
        Escolher ano
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
        {years.map((year) => {
          const active = viewYear === year;
          return (
            <TouchableOpacity
              key={year}
              onPress={() => { setViewYear(year); setMode('month'); }}
              style={[
                styles.yearRow,
                { borderBottomColor: colors.border },
                active && { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Text style={[
                styles.yearText,
                { color: active ? colors.primary : colors.textPrimary, fontWeight: active ? '800' : '500' },
              ]}>
                {year}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );

  // â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const footer = (
    <View style={[styles.footer, { borderTopColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => {
          if (mode === 'day') onClose();
          else if (mode === 'year') setMode('month');
          else setMode('day');
        }}
        style={styles.cancelBtn}
      >
        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
          {mode === 'day' ? 'Cancelar' : 'Voltar'}
        </Text>
      </TouchableOpacity>

      {mode === 'day' && (
        <TouchableOpacity
          onPress={() => { onSelect(today); onClose(); }}
          style={[styles.todayBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.todayText, { color: colors.textPrimary }]}>Hoje</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {mode === 'day' ? dayContent : mode === 'month' ? monthContent : yearContent}
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  // â”€â”€ Day view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  weekRow: {
    flexDirection: 'row',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    gap: 2,
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  // â”€â”€ Month picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  monthGrid: {
    gap: 8,
  },
  monthGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  monthCell: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  monthCellText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // â”€â”€ Year picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  yearRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  yearText: {
    fontSize: 16,
  },
  // â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  todayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  todayText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
