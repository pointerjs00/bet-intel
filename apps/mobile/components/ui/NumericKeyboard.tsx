import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(
  require('react-native').Pressable,
);

type KeyValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'clear' | 'delete' | ',';

const INT_KEYS: KeyValue[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'delete'],
];

const DEC_KEYS: KeyValue[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'delete'],
];

interface NumericKeyboardProps {
  value: string;
  maxLength?: number;
  allowDecimal?: boolean;
  onChangeText: (text: string) => void;
}

function KeyCell({
  keyValue,
  onPress,
  onLongPress,
}: {
  keyValue: KeyValue;
  onPress: (key: KeyValue) => void;
  onLongPress?: (key: KeyValue) => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.88, { duration: 60 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 350 });
  }, [scale]);

  const handlePress = useCallback(() => {
    hapticLight();
    onPress(keyValue);
  }, [keyValue, onPress]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      hapticLight();
      onLongPress(keyValue);
    }
  }, [keyValue, onLongPress]);

  const isAction = keyValue === 'clear' || keyValue === 'delete';

  return (
    <AnimatedPressable
      delayLongPress={300}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.key,
        animatedStyle,
        {
          backgroundColor: isAction ? 'transparent' : colors.surfaceRaised,
          borderColor: isAction ? 'transparent' : colors.border,
          borderWidth: isAction ? 0 : 1,
        },
      ]}
    >
      {keyValue === 'delete' ? (
        <Ionicons color={colors.textPrimary} name="backspace-outline" size={22} />
      ) : keyValue === 'clear' ? (
        <Text style={[styles.actionText, { color: colors.textMuted }]}>C</Text>
      ) : keyValue === ',' ? (
        <Text style={[styles.keyText, { color: colors.textPrimary }]}>,</Text>
      ) : (
        <Text style={[styles.keyText, { color: colors.textPrimary }]}>{keyValue}</Text>
      )}
    </AnimatedPressable>
  );
}

export function NumericKeyboard({ value, maxLength = 2, allowDecimal = false, onChangeText }: NumericKeyboardProps) {
  const KEYS = allowDecimal ? DEC_KEYS : INT_KEYS;

  const handleLongPressDelete = useCallback(() => {
    onChangeText('');
  }, [onChangeText]);

  const handleKey = useCallback(
    (key: KeyValue) => {
      if (key === 'clear') {
        onChangeText('');
      } else if (key === 'delete') {
        onChangeText(value.slice(0, -1));
      } else if (key === ',') {
        // Only append comma if: value has digits, no comma yet, within maxLength
        if (value.length > 0 && !value.includes(',') && value.length < maxLength) {
          onChangeText(value + ',');
        }
      } else {
        if (value.length < maxLength) {
          onChangeText(value + key);
        }
      }
    },
    [value, maxLength, onChangeText],
  );

  return (
    <View style={styles.container}>
      {KEYS.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((key) => (
            <KeyCell
              key={key}
              keyValue={key}
              onPress={handleKey}
              onLongPress={key === 'delete' ? handleLongPressDelete : undefined}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  key: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '700',
  },
  actionText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
