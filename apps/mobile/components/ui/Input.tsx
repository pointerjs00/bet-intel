import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({
  label,
  error,
  icon,
  secureTextEntry,
  style,
  ...props
}: InputProps) {
  const { colors, tokens } = useTheme();
  const [isSecure, setIsSecure] = useState(Boolean(secureTextEntry));

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: colors.textPrimary, fontSize: tokens.font.sizes.sm }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
      >
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isSecure}
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              fontSize: tokens.font.sizes.md,
            },
            style,
          ]}
          {...props}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => setIsSecure((prev) => !prev)}
            style={styles.toggle}
          >
            <Ionicons
              color={colors.textSecondary}
              name={isSecure ? 'eye-off-outline' : 'eye-outline'}
              size={20}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontSize: tokens.font.sizes.sm }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    fontWeight: '600',
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  iconWrap: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
  },
  toggle: {
    marginLeft: 12,
  },
  error: {
    fontWeight: '500',
  },
});
