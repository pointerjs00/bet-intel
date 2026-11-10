import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';
import { AppText } from './AppText';

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

/** Pill-shaped segmented control (period pickers, list filters). */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.wrap, { backgroundColor: colors.surface }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => { if (!active) { hapticLight(); onChange(o.value); } }}
            style={[styles.item, active && { backgroundColor: colors.surfaceRaised }]}
          >
            <AppText tone={active ? 'primary' : 'secondary'} variant={active ? 'bodyStrong' : 'body'} style={styles.text}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, flexDirection: 'row', gap: 4, padding: 4 },
  item: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 8 },
  text: { fontSize: 13 },
});
