import React, { useMemo } from 'react';
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

  const displayValue = useMemo(() => {
    if (value <= 0) {
      return '';
    }

    return String(value).replace('.', ',');
  }, [value]);

  return (
    <View style={styles.container}>
      <Input
        keyboardType="decimal-pad"
        label="Valor da aposta"
        onChangeText={(text) => onChange(parseStake(text))}
        placeholder="0,00"
        value={displayValue}
      />

      <Text style={[styles.preview, { color: colors.textSecondary }]}>Atual: {formatCurrency(value)}</Text>

      <View style={styles.quickList}>
        {QUICK_STAKES.map((stake) => (
          <Pressable
            key={stake}
            onPress={() => onChange(stake)}
            style={[styles.quickChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <Text style={[styles.quickChipText, { color: colors.textPrimary }]}>{formatCurrency(stake)}</Text>
          </Pressable>
        ))}
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