import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppText } from '../ui/AppText';
import { flagUrlForCode } from '../../utils/odds/flags';

/** Competition name preceded by its country's flag (when the house gives the country). */
export function CompetitionLabel({ name, countryCode }: { name: string; countryCode?: string }) {
  const flag = flagUrlForCode(countryCode);
  return (
    <View style={styles.row}>
      {flag ? <Image accessibilityIgnoresInvertColors source={{ uri: flag }} style={styles.flag} /> : null}
      <AppText numberOfLines={1} style={styles.name} tone="secondary" variant="label">{name}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6 },
  flag: { borderRadius: 2, height: 12, width: 16 },
  name: { flexShrink: 1 },
});
