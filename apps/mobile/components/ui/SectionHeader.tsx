import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

/** Section title with an optional action link on the right ("Ver todos"). */
export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <AppText accessibilityRole="header" variant="heading">{title}</AppText>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction}>
          <AppText tone="accent" variant="bodyStrong" style={styles.action}>{actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small metric block: label on top, tabular number below. */
export function MetricTile({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' | 'pending' }) {
  return (
    <View style={styles.tile}>
      <AppText variant="label">{label}</AppText>
      <AppText tone={tone} variant="number">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  action: { fontSize: 13 },
  tile: { flex: 1, gap: 2 },
});
