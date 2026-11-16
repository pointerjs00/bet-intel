import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, GorhomBottomSheet } from '../ui/BottomSheet';
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
  visible: boolean;
  onClose: () => void;
  view: Pick<OddsEventView, 'eventKey' | 'sport' | 'event'>;
  row: ComparedSelection;
}

/** Bottom sheet listing every house's odd for a selection, with register / add-to-multiple actions. */
export function HousesSheet({ visible, onClose, view, row }: HousesSheetProps) {
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const ref = useRef<React.ElementRef<typeof GorhomBottomSheet>>(null);
  const register = useRegisterInHouse();
  const [busy, setBusy] = useState(false);
  const inSlip = useOddsSlipStore((s) =>
    row.key !== null && s.legs.some((l) => l.eventKey === view.eventKey && l.selectionKey === row.key),
  );
  const houses = housesByOdds(row);
  const bestOdds = houses.find((h) => !h.suspended)?.odds ?? null;

  useEffect(() => {
    if (visible) ref.current?.snapToIndex(0);
    else ref.current?.close();
  }, [visible]);

  const leg = legFromRow(view, row);

  const onRegister = async (house: HouseId) => {
    if (!leg || busy) return;
    setBusy(true);
    try {
      await register([leg], house);
      onClose();
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
    onClose();
  };

  return (
    <BottomSheet onClose={onClose} ref={ref} snapPoints={['55%', '80%']}>
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sub: { marginBottom: 12, marginTop: 2 },
  row: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8 },
  right: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  toggle: { marginTop: 8 },
});
