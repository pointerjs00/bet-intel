import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  maxLength?: number;
  showCharCount?: boolean;
}

export function Input({
  label,
  error,
  icon,
  rightSlot,
  secureTextEntry,
  maxLength,
  showCharCount = false,
  value,
  onFocus,
  onBlur,
  style,
  ...props
}: InputProps) {
  const { colors, tokens } = useTheme();
  const [isSecure, setIsSecure] = useState(Boolean(secureTextEntry));
  const [isFocused, setIsFocused] = useState(false);

  // Floating label animation: 0 = resting (inside), 1 = floating (above)
  const labelProgress = useSharedValue(value ? 1 : 0);

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(labelProgress.value, [0, 1], [0, -26]) },
      { scale: interpolate(labelProgress.value, [0, 1], [1, 0.8]) },
    ],
  }));

  const handleFocus = (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
    setIsFocused(true);
    labelProgress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    onFocus?.(e);
  };

  const handleBlur = (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
    setIsFocused(false);
    if (!value) {
      labelProgress.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.ease) });
    }
    onBlur?.(e);
  };

  const borderColor = error
    ? colors.danger
    : isFocused
      ? colors.primary
      : colors.border;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: colors.surface,
            borderColor,
          },
        ]}
      >
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}

        <View style={styles.inputArea}>
          {label ? (
            <View pointerEvents="none" style={styles.labelContainer}>
              <Animated.Text
                style={[
                  styles.floatingLabel,
                  {
                    color: isFocused ? colors.primary : colors.textMuted,
                    fontSize: tokens.font.sizes.md,
                  },
                  labelAnimatedStyle,
                ]}
              >
                {label}
              </Animated.Text>
            </View>
          ) : null}
          <TextInput
            placeholderTextColor={colors.textMuted}
            secureTextEntry={isSecure}
            value={value}
            maxLength={maxLength}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                fontSize: tokens.font.sizes.md,
                paddingTop: label ? 22 : 16,
              },
              style,
            ]}
            {...props}
          />
        </View>

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

        {rightSlot && !secureTextEntry ? (
          <View style={styles.toggle}>{rightSlot}</View>
        ) : null}
      </View>

      <View style={styles.footer}>
        {error ? (
          <Text style={[styles.error, { color: colors.danger, fontSize: tokens.font.sizes.sm }]}>
            {error}
          </Text>
        ) : (
          <View />
        )}
        {showCharCount && maxLength ? (
          <Text
            style={[
              styles.charCount,
              { color: colors.textMuted, fontSize: tokens.font.sizes.xs },
            ]}
          >
            {(value?.length ?? 0)}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  iconWrap: {
    marginRight: 10,
  },
  inputArea: {
    flex: 1,
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  floatingLabel: {
    fontWeight: '500',
    transformOrigin: 'left center',
  },
  input: {
    flex: 1,
    paddingBottom: 10,
  },
  toggle: {
    marginLeft: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  error: {
    fontWeight: '500',
  },
  charCount: {
    fontWeight: '400',
  },
});
