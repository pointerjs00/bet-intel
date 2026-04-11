import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CalendarPicker } from './CalendarPicker';
import { PressableScale } from './PressableScale';
import { useTheme } from '../../theme/useTheme';

interface DatePickerFieldProps {
  /** Field label shown above the input. */
  label: string;
  /** Currently selected date, or null if empty. */
  value: Date | null;
  /** Placeholder text when no date is selected. */
  placeholder?: string;
  /** Optional minimum selectable date. */
  minDate?: Date;
  /** Optional maximum selectable date. */
  maxDate?: Date;
  onClear?: () => void;
  onChange: (date: Date) => void;
}

function formatDatePT(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function DatePickerField({
  label,
  value,
  placeholder = 'DD/MM/AAAA',
  minDate,
  maxDate,
  onClear,
  onChange,
}: DatePickerFieldProps) {
  const { colors, tokens } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>

      <PressableScale
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons
          color={value ? colors.textPrimary : colors.textMuted}
          name="calendar-outline"
          size={16}
          style={styles.icon}
        />
        <Text
          style={[
            styles.valueText,
            { color: value ? colors.textPrimary : colors.textMuted },
          ]}
        >
          {value ? formatDatePT(value) : placeholder}
        </Text>

        {value && onClear && (
          <Pressable hitSlop={8} onPress={onClear} style={styles.clearBtn}>
            <Ionicons color={colors.textMuted} name="close-circle" size={16} />
          </Pressable>
        )}
      </PressableScale>

      <CalendarPicker
        maxDate={maxDate}
        minDate={minDate}
        selected={value}
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={(d) => {
          onChange(d);
          setOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 48,
    paddingHorizontal: 12,
    gap: 8,
  },
  icon: {},
  valueText: {
    flex: 1,
    fontSize: 15,
  },
  clearBtn: {
    marginLeft: 4,
  },
});
