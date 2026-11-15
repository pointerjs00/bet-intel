import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { getPasswordChecks, getPasswordStrengthLevel } from '../../utils/passwordRules';

/** Strength bar plus per-rule checklist, shared by register and reset-password. */
export function PasswordStrength({ password }: { password: string }) {
  const { colors } = useTheme();

  const strength = useMemo(() => {
    const level = getPasswordStrengthLevel(password);
    if (level === 'weak') return { label: 'Fraca', color: colors.danger, width: '33%' as const };
    if (level === 'medium') return { label: 'Média', color: colors.warning, width: '66%' as const };
    return { label: 'Forte', color: colors.primary, width: '100%' as const };
  }, [colors.danger, colors.primary, colors.warning, password]);

  const checks = useMemo(() => getPasswordChecks(password), [password]);

  return (
    <>
      <View style={styles.meterWrap}>
        <View style={[styles.meterTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.meterFill, { backgroundColor: strength.color, width: strength.width }]} />
        </View>
        <Text style={[styles.meterLabel, { color: colors.textMuted }]}>{strength.label}</Text>
      </View>

      {password.length > 0 ? (
        <View style={styles.checks}>
          {checks.map((check) => (
            <View key={check.label} style={styles.checkRow}>
              <Ionicons
                color={check.met ? colors.primary : colors.textMuted}
                name={check.met ? 'checkmark-circle' : 'ellipse-outline'}
                size={15}
              />
              <Text style={[styles.checkText, { color: check.met ? colors.textSecondary : colors.textMuted }]}>
                {check.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  meterWrap: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: -8 },
  meterTrack: { borderRadius: 999, flex: 1, height: 6, overflow: 'hidden' },
  meterFill: { borderRadius: 999, height: 6 },
  meterLabel: { fontSize: 12, fontWeight: '600' },
  checks: { gap: 6, marginTop: -4 },
  checkRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  checkText: { fontSize: 12, fontWeight: '500' },
});
