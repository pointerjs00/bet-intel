import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '../ui/AppText';
import { useTheme } from '../../theme/useTheme';

interface MarketSelectionProps {
  market: string;
  selection: string;
  /** One line (selection · market), for dense lists. Default: market label on top, selection below. */
  inline?: boolean;
  /** Extra text after the selection, e.g. "@1,85". */
  trailing?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Market and selection shown apart without chrome: the selection in strong text (what was bet on),
 * the market as a quiet uppercase label (where it was bet).
 */
export function MarketSelection({ market, selection, inline = false, trailing, style }: MarketSelectionProps) {
  const { colors } = useTheme();
  if (inline) {
    return (
      <View style={[styles.inline, style]}>
        <AppText numberOfLines={1} style={[styles.selectionInline, { color: colors.textPrimary }]}>{selection}</AppText>
        <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
        <AppText numberOfLines={1} style={[styles.marketInline, { color: colors.textMuted }]}>{market}</AppText>
        {trailing ? <AppText style={[styles.trailing, { color: colors.textSecondary }]}>{trailing}</AppText> : null}
      </View>
    );
  }
  return (
    <View style={[styles.block, style]}>
      <AppText numberOfLines={1} style={[styles.market, { color: colors.textMuted }]}>{market.toUpperCase()}</AppText>
      <View style={styles.row}>
        <AppText numberOfLines={2} style={[styles.selection, { color: colors.textPrimary }]}>{selection}</AppText>
        {trailing ? <AppText style={[styles.trailing, { color: colors.textSecondary }]}>{trailing}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  row: { alignItems: 'baseline', flexDirection: 'row', gap: 6 },
  inline: { alignItems: 'center', flexDirection: 'row', flexWrap: 'nowrap', gap: 6 },
  market: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.6 },
  // The selection gets priority on one line; the market shrinks first.
  marketInline: { flexShrink: 3, fontSize: 12 },
  dot: { borderRadius: 2, height: 3, opacity: 0.7, width: 3 },
  selection: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 18 },
  selectionInline: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  trailing: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
