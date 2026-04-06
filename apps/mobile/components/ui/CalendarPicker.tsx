import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface CalendarPickerProps {
  visible: boolean;
  /** Currently selected date (or null if none). */
  selected: Date | null;
  /** Optional minimum selectable date. */
  minDate?: Date;
  /** Optional maximum selectable date. */
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
  const { colors, tokens } = useTheme();

  // Current view month/year (initialise to selected or today)
  const [viewYear, setViewYear] = useState<number>(() => {
    const d = selected ?? new Date();
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const d = selected ?? new Date();
    return d.getMonth();
  });

  const today = new Date();

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Build grid of days
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Cells = leading blanks + days
  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  function isDisabled(day: number): boolean {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
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

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop propagation on calendar body */}
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              hitSlop={8}
              onPress={prevMonth}
              style={[styles.navBtn, { borderColor: colors.border }]}
            >
              <Ionicons color={colors.textPrimary} name="chevron-back" size={18} />
            </TouchableOpacity>

            <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
              {MONTHS_PT[viewMonth]} {viewYear}
            </Text>

            <TouchableOpacity
              hitSlop={8}
              onPress={nextMonth}
              style={[styles.navBtn, { borderColor: colors.border }]}
            >
              <Ionicons color={colors.textPrimary} name="chevron-forward" size={18} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week labels */}
          <View style={styles.weekRow}>
            {DAYS_OF_WEEK.map((d) => (
              <Text key={d} style={[styles.weekLabel, { color: colors.textSecondary }]}>
                {d}
              </Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`blank-${idx}`} style={styles.cell} />;
              }
              const disabled = isDisabled(day);
              const selected_ = isSelected(day);
              const today_ = isToday(day);

              return (
                <TouchableOpacity
                  key={day}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(new Date(viewYear, viewMonth, day));
                    onClose();
                  }}
                  style={[
                    styles.cell,
                    selected_ && { backgroundColor: colors.primary, borderRadius: 20 },
                    today_ && !selected_ && {
                      borderWidth: 1,
                      borderColor: colors.primary,
                      borderRadius: 20,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: disabled ? colors.textMuted : colors.textPrimary },
                      selected_ && { color: '#fff', fontWeight: '700' },
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Actions */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onSelect(today);
                onClose();
              }}
              style={[styles.todayBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.todayText, { color: colors.textPrimary }]}>Hoje</Text>
            </TouchableOpacity>
          </View>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
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
