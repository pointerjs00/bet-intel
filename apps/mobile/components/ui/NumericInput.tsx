import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';
import { NumericKeyboard } from './NumericKeyboard';

interface NumericInputProps {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  /** Optional unit label shown after the value (e.g. "€" or "h") */
  suffix?: string;
  allowDecimal?: boolean;
  /** Max total character length including the decimal separator */
  maxLength?: number;
  error?: string;
  style?: ViewStyle;
}

/**
 * A pressable input field that opens a custom numeric keyboard overlay at the
 * bottom of the screen instead of the OS keyboard.
 *
 * Supports both integer mode (default) and decimal mode (`allowDecimal`).
 * In decimal mode the bottom-left key becomes "," (Portuguese separator);
 * long-pressing the delete key clears the entire value.
 */
export function NumericInput({
  value,
  onChangeText,
  label,
  placeholder,
  suffix,
  allowDecimal = false,
  maxLength = 10,
  error,
  style,
}: NumericInputProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const kbAnim = useSharedValue(0);

  const kbStyle = useAnimatedStyle(() => ({
    opacity: kbAnim.value,
    transform: [{ translateY: (1 - kbAnim.value) * 24 }],
  }));

  const showKeyboard = () => {
    setOpen(true);
    kbAnim.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
  };

  const hideKeyboard = () => {
    kbAnim.value = withTiming(0, { duration: 100, easing: Easing.in(Easing.cubic) });
    setTimeout(() => setOpen(false), 100);
  };

  const hasValue = value !== '';
  const borderColor = open ? colors.primary : error ? colors.danger : colors.border;

  const displayText = hasValue ? (suffix ? `${value} ${suffix}` : value) : undefined;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={showKeyboard}
        style={[styles.shell, { borderColor, backgroundColor: colors.surface }, style]}
      >
        {label ? (
          <Text style={[styles.label, { color: open ? colors.primary : error ? colors.danger : colors.textSecondary }]}>
            {label}
          </Text>
        ) : null}
        <Text style={[styles.display, { color: hasValue ? colors.textPrimary : colors.textMuted }]}>
          {displayText ?? placeholder ?? ''}
        </Text>
        {error ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        ) : null}
      </Pressable>

      <Modal animationType="none" onRequestClose={hideKeyboard} transparent visible={open}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={hideKeyboard} />
          {open && (
            <Animated.View style={[styles.sheet, { backgroundColor: colors.surface, borderTopColor: colors.border }, kbStyle]}>
              <View style={styles.sheetBar}>
                <Text style={[styles.sheetValue, { color: hasValue ? colors.textPrimary : colors.textMuted }]}>
                  {displayText ?? (placeholder ?? '—')}
                </Text>
                <Pressable hitSlop={12} onPress={hideKeyboard}>
                  <Text style={[styles.done, { color: colors.primary }]}>Concluído</Text>
                </Pressable>
              </View>
              <NumericKeyboard
                allowDecimal={allowDecimal}
                maxLength={maxLength}
                onChangeText={onChangeText}
                value={value}
              />
            </Animated.View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  display: {
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    marginTop: 2,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 30,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sheetBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  sheetValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  done: {
    fontSize: 16,
    fontWeight: '700',
  },
});
