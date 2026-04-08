import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Input } from '../ui/Input';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

interface StakeInputProps {
  value: number;
  onChange: (value: number) => void;
}

const QUICK_STAKES = [5, 10, 20, 50];

/** Currency input used on the create boletin screen. */
export function StakeInput({ value, onChange }: StakeInputProps) {
  const { colors } = useTheme();

  // Raw text state so typing "10," or "10." doesn't immediately strip the
  // trailing separator when the controlled value roundtrips through Number.
  const [rawText, setRawText] = useState(() => (value > 0 ? String(value).replace('.', ',') : ''));
  const lastExternalValue = useRef(value);

  // Sync rawText when the value prop changes EXTERNALLY (e.g. quick-stake buttons)
  // but NOT when it changes because the user is typing (detected by comparing parsed value).
  useEffect(() => {
    if (value !== lastExternalValue.current && Math.abs(parseStake(rawText) - value) > 0.001) {
      lastExternalValue.current = value;
      setRawText(value > 0 ? String(value).replace('.', ',') : '');
    } else {
      lastExternalValue.current = value;
    }
  }, [value, rawText]);

  const handleChangeText = (text: string) => {
    setRawText(text);
    onChange(parseStake(text));
  };

  return (
    <View style={styles.container}>
      <Input
        keyboardType="decimal-pad"
        label="Valor da aposta"
        onChangeText={handleChangeText}
        placeholder="0,00"
        value={rawText}
      />

      <Text style={[styles.preview, { color: colors.textSecondary }]}>Atual: {formatCurrency(value)}</Text>

      <View style={styles.quickList}>
        {QUICK_STAKES.map((stake) => {
          const isActive = Math.abs(value - stake) < 0.001;
          return (
            <Pressable
              key={stake}
              onPress={() => onChange(stake)}
              style={[styles.quickChip, { backgroundColor: isActive ? colors.primary : colors.surfaceRaised, borderColor: isActive ? colors.primary : colors.border }]}
            >
              <Text style={[styles.quickChipText, { color: isActive ? '#FFFFFF' : colors.textPrimary }]}>{formatCurrency(stake)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function parseStake(value: string): number {
  const normalized = value.replace(/[^0-9,.-]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  preview: {
    fontSize: 13,
    fontWeight: '600',
  },
  quickList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
});