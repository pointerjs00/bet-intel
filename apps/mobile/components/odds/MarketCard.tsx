import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../ui/AppText';
import { useTheme } from '../../theme/useTheme';
import { mainCaption } from '../../utils/odds/list';
import type { MarketCard } from '../../utils/odds/marketTabs';
import type { OddsEventView } from '../../utils/odds/types';
import { OddButton } from './OddButton';

const MAIN = /^(FT\.1X2\.|B\.ML\.|T\.WIN\.)/;

/** One market of an event: 2-3 selections as equal buttons, more as "label ... odd" rows. */
export function MarketCardView({ view, card }: { view: OddsEventView; card: MarketCard }) {
  const { colors, tokens } = useTheme();
  const wide = card.rows.length <= 3;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: tokens.radius.lg }]}>
      <AppText variant="bodyStrong">{card.title}</AppText>
      {wide ? (
        <View style={styles.buttons}>
          {card.rows.map((row, i) => (
            <OddButton
              key={row.key ?? `${row.label}-${i}`}
              caption={row.key && MAIN.test(row.key) ? mainCaption(view, row) : row.label}
              row={row}
              view={view}
            />
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {card.rows.map((row, i) => (
            <View key={row.key ?? `${row.label}-${i}`} style={styles.line}>
              <AppText numberOfLines={1} style={styles.lineLabel} tone="secondary">{row.label}</AppText>
              <View style={styles.lineBtn}>
                <OddButton caption={row.label} compact row={row} view={view} />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 12 },
  buttons: { flexDirection: 'row', gap: 8 },
  list: { gap: 6 },
  line: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  lineLabel: { flex: 1 },
  lineBtn: { width: 120 },
});
