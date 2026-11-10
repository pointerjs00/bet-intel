import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '../ui/AppText';
import { useTheme } from '../../theme/useTheme';

interface MarketSelectionProps {
  market: string;
  selection: string;
  /** One line (market · selection), for dense lists. Default: market on top, selection below. */
  inline?: boolean;
  /** Extra text after the selection, e.g. "@1,85". */
  trailing?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Market and selection shown apart: the market as a quiet label, the selection as a tinted
 * pill, so "what was bet on" stands out from "which market".
 */
export function MarketSelection({ market, selection, inline = false, trailing, style }: MarketSelectionProps) {
  const { colors } = useTheme();
  const pill = (
    <View style={[styles.pill, { backgroundColor: `${colors.accent}1F` }]}>
      <AppText numberOfLines={inline ? 1 : 2} style={[styles.selection, { color: colors.accentText }]}>{selection}</AppText>
    </View>
  );
  if (inline) {
    return (
      <View style={[styles.inline, style]}>
        <AppText numberOfLines={1} style={styles.marketInline} variant="caption">{market}</AppText>
        {pill}
        {trailing ? <AppText style={styles.trailing} variant="caption">{trailing}</AppText> : null}
      </View>
    );
  }
  return (
    <View style={[styles.block, style]}>
      <AppText numberOfLines={1} style={styles.market} variant="label">{market}</AppText>
      <View style={styles.row}>
        {pill}
        {trailing ? <AppText style={styles.trailing} variant="caption">{trailing}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 4 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  inline: { alignItems: 'center', flexDirection: 'row', flexWrap: 'nowrap', gap: 6 },
  market: { fontSize: 11, letterSpacing: 0.2 },
  // The selection gets priority on one line; the market shrinks first.
  marketInline: { flexShrink: 3, fontSize: 12, maxWidth: '40%' },
  pill: { alignSelf: 'flex-start', borderRadius: 8, flexShrink: 1, paddingHorizontal: 8, paddingVertical: 3 },
  selection: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 17 },
  trailing: { fontSize: 12 },
});
