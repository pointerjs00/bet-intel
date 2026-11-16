import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../ui/AppText';
import { Pressable } from '../ui/Pressable';
import { SiteMark } from '../ui/SiteMark';
import { useToast } from '../ui/Toast';
import { useTheme } from '../../theme/useTheme';
import { useOddsSlipStore } from '../../stores/oddsSlipStore';
import { bestPrice, formatOdd } from '../../utils/odds/format';
import { legFromRow } from '../../utils/odds/slip';
import type { ComparedSelection, OddsEventView } from '../../utils/odds/types';
import { HousesSheet } from './HousesSheet';
import { houseName } from './houseName';

interface OddButtonProps {
  view: Pick<OddsEventView, 'eventKey' | 'sport' | 'event'>;
  row: ComparedSelection;
  caption?: string;
  compact?: boolean;
}

/** Best odd of a selection; tap toggles it in the multiple, long press opens the houses sheet. */
export function OddButton({ view, row, caption, compact }: OddButtonProps) {
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected = useOddsSlipStore((s) =>
    row.key !== null && s.legs.some((l) => l.eventKey === view.eventKey && l.selectionKey === row.key),
  );
  const best = bestPrice(row);
  const text = caption ?? row.label;

  if (!best) {
    return (
      <View
        accessibilityLabel={`${text}, sem odds`}
        accessibilityState={{ disabled: true }}
        style={[styles.base, compact && styles.compact, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: tokens.radius.md, opacity: 0.5 }]}
      >
        <AppText numberOfLines={1} tone="muted" variant="label">{text}</AppText>
        <AppText tone="muted" variant="number">—</AppText>
      </View>
    );
  }

  const onPress = () => {
    const leg = legFromRow(view, row);
    if (!leg) {
      setSheetOpen(true);
      return;
    }
    const res = useOddsSlipStore.getState().toggle(leg);
    if (res.removed) return;
    if (res.outcome === 'replaced') showToast('Seleção do mesmo jogo substituída', 'info');
    else if (res.outcome === 'full') showToast('Máximo de 30 seleções', 'warning');
  };

  return (
    <>
      <Pressable
        accessibilityLabel={`${text}, melhor odd ${formatOdd(best.odds)} na ${houseName(best.house)}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onLongPress={() => setSheetOpen(true)}
        onPress={onPress}
        style={[
          styles.base,
          compact && styles.compact,
          {
            backgroundColor: selected ? colors.primary : colors.surfaceRaised,
            borderColor: selected ? colors.primary : colors.border,
            borderRadius: tokens.radius.md,
          },
        ]}
      >
        <AppText numberOfLines={1} style={selected ? { color: colors.onPrimary } : undefined} tone="secondary" variant="label">
          {text}
        </AppText>
        <View style={styles.oddRow}>
          <AppText style={selected ? { color: colors.onPrimary } : undefined} variant="number">{formatOdd(best.odds)}</AppText>
          <SiteMark showName={false} size={14} slug={best.house} />
        </View>
      </Pressable>
      {sheetOpen ? <HousesSheet onClose={() => setSheetOpen(false)} row={row} view={view} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: StyleSheet.hairlineWidth, flex: 1, gap: 2, minHeight: 52, paddingHorizontal: 10, paddingVertical: 8 },
  compact: { minHeight: 44, paddingVertical: 5 },
  oddRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
});
