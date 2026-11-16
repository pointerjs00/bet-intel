import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { SiteMark } from '../ui/SiteMark';
import { useToast } from '../ui/Toast';
import { useTheme } from '../../theme/useTheme';
import { useRegisterInHouse } from '../../hooks/useRegisterInHouse';
import { useOddsSlipStore } from '../../stores/oddsSlipStore';
import { formatOdd, housesByOdds } from '../../utils/odds/format';
import { legFromRow } from '../../utils/odds/slip';
import type { ComparedSelection, HouseId, OddsEventView } from '../../utils/odds/types';

interface HousesSheetProps {
  /** Called once the sheet has finished closing (the parent then unmounts it). */
  onClose: () => void;
  view: Pick<OddsEventView, 'eventKey' | 'sport' | 'event'>;
  row: ComparedSelection;
}

/**
 * Modal bottom sheet listing every house's odd for a selection, with register / add-to-multiple
 * actions. Presented through the root BottomSheetModalProvider (a portal), so it is never clipped
 * by the odds button/card that mounts it and its touches never reach that card.
 */
export function HousesSheet({ onClose, view, row }: HousesSheetProps) {
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const ref = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%', '80%'], []);
  const register = useRegisterInHouse();
  const [busy, setBusy] = useState(false);
  const inSlip = useOddsSlipStore((s) =>
    row.key !== null && s.legs.some((l) => l.eventKey === view.eventKey && l.selectionKey === row.key),
  );
  const houses = housesByOdds(row);
  const bestOdds = houses.find((h) => !h.suspended)?.odds ?? null;

  useEffect(() => {
    ref.current?.present();
  }, []);

  /** Animates the sheet out; onClose runs from onDismiss when it is gone. */
  const close = useCallback(() => ref.current?.dismiss(), []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />,
    [],
  );

  const leg = legFromRow(view, row);

  const onRegister = async (house: HouseId) => {
    if (!leg || busy) return;
    const price = row.prices[house];
    setBusy(true);
    try {
      const shownOdds = price ? { [`${view.eventKey}|${leg.selectionKey}|${house}`]: price.odds } : undefined;
      // Stays open when the user cancels the replace prompt or the registration fails.
      if (await register([leg], house, { shownOdds })) close();
    } finally {
      setBusy(false);
    }
  };

  const onToggle = () => {
    if (!leg) return;
    const res = useOddsSlipStore.getState().toggle(leg);
    if (!res.removed) {
      if (res.outcome === 'replaced') showToast('Seleção do mesmo jogo substituída', 'info');
      else if (res.outcome === 'full') showToast('Máximo de 30 seleções', 'warning');
    }
    close();
  };

  return (
    <BottomSheetModal
      backdropComponent={renderBackdrop}
      backgroundStyle={[styles.background, { backgroundColor: colors.surface }]}
      enablePanDownToClose
      handleIndicatorStyle={[styles.handle, { backgroundColor: colors.border }]}
      index={0}
      onDismiss={onClose}
      ref={ref}
      snapPoints={snapPoints}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: tokens.spacing.lg }}>
        <AppText variant="heading">{row.label} · {row.market}</AppText>
        <AppText style={styles.sub} tone="secondary" variant="caption">{view.event.home} – {view.event.away}</AppText>
        {houses.map((h) => {
          const isBest = !h.suspended && h.odds === bestOdds;
          return (
            <View
              key={h.house}
              style={[styles.row, { backgroundColor: isBest ? colors.surfaceRaised : 'transparent', borderColor: isBest ? colors.primary : colors.border, borderRadius: tokens.radius.md }]}
            >
              <SiteMark showName size={20} slug={h.house} textStyle={{ color: colors.textPrimary }} />
              <View style={styles.right}>
                {h.suspended ? <AppText tone="muted" variant="caption">suspensa</AppText> : null}
                <AppText style={h.suspended ? { opacity: 0.5 } : undefined} tone={isBest ? 'positive' : 'primary'} variant="number">
                  {formatOdd(h.odds)}
                </AppText>
                {row.key !== null && !h.suspended ? (
                  <Button disabled={busy} onPress={() => onRegister(h.house)} size="sm" title="Registar nesta casa" variant="secondary" />
                ) : null}
              </View>
            </View>
          );
        })}
        {row.key !== null ? (
          <Button onPress={onToggle} style={styles.toggle} title={inSlip ? 'Remover da múltipla' : 'Adicionar à múltipla'} variant={inSlip ? 'ghost' : 'primary'} />
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { borderRadius: 2, height: 4, width: 40 },
  sub: { marginBottom: 12, marginTop: 2 },
  row: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8 },
  right: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  toggle: { marginTop: 8 },
});
