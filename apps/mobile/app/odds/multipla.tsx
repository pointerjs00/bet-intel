// Odds multiple table: total odds per house, return for a stake, register at a house.
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { NumericInput } from '../../components/ui/NumericInput';
import { Pressable } from '../../components/ui/Pressable';
import { SiteMark } from '../../components/ui/SiteMark';
import { houseName } from '../../components/odds/houseName';
import { fetchOddsEvent, useOddsMultiple } from '../../services/oddsService';
import { useOddsSlipStore } from '../../stores/oddsSlipStore';
import { useRegisterInHouse } from '../../hooks/useRegisterInHouse';
import { useTheme } from '../../theme/useTheme';
import { formatEuro, formatOdd } from '../../utils/odds/format';
import { chosenHouse, isSelectable, legOdd, orderColumns, parseStake, shownOddsFor } from '../../utils/odds/multiple';
import type { HouseId, OddsEventView } from '../../utils/odds/types';

const LEG_W = 150;
const COL_W = 84;

export default function OddsMultipleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { legs, stake, setStake, remove, clear, prune } = useOddsSlipStore();
  const [stakeText, setStakeText] = useState(() => String(stake).replace('.', ','));
  const register = useRegisterInHouse();
  const [picked, setPicked] = useState<HouseId | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => { prune(); }, [prune]);

  const multiple = useOddsMultiple(legs);
  const { data } = multiple;
  // Totals not known yet (first load, or a new leg set still fetching after keepPreviousData).
  const calculating = !data || multiple.isPlaceholderData;
  const failed = multiple.isError && !multiple.isFetching;
  const eventKeys = useMemo(() => [...new Set(legs.map((l) => l.eventKey))], [legs]);
  const eventQueries = useQueries({
    queries: eventKeys.map((key) => ({
      queryKey: ['odds', 'event', key],
      queryFn: () => fetchOddsEvent(key),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const views = useMemo(() => {
    const m = new Map<string, OddsEventView | null | undefined>();
    eventKeys.forEach((k, i) => m.set(k, eventQueries[i]?.data));
    return m;
  }, [eventKeys, eventQueries]);

  const perHouse = data?.perHouse ?? {};
  const best = data?.best ?? null;
  const columns = orderColumns(perHouse, best);
  const target = chosenHouse(perHouse, best, picked);

  return (
    // Android shows the modal full screen, under the status bar; iOS presents it as a sheet below it.
    <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 12 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <AppText style={styles.flex} variant="heading">Múltipla</AppText>
        <Pressable accessibilityLabel="Fechar" accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
          <Ionicons color={colors.textPrimary} name="close" size={24} />
        </Pressable>
      </View>

      {legs.length === 0 ? (
        <EmptyState icon="ticket-outline" title="A múltipla está vazia" />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 16, paddingHorizontal: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.row}>
                  <View style={{ width: LEG_W }} />
                  {columns.map((h) => {
                    const ok = isSelectable(perHouse, h);
                    const active = h === target;
                    return (
                      <Pressable
                        key={h}
                        accessibilityLabel={houseName(h)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active, disabled: !ok }}
                        disabled={!ok}
                        onPress={() => setPicked(h)}
                        style={[styles.cell, { width: COL_W, borderBottomColor: active ? colors.primary : 'transparent', borderBottomWidth: 2, opacity: ok ? 1 : 0.5 }]}
                      >
                        <SiteMark showName={false} size={22} slug={h} />
                        <AppText numberOfLines={1} tone={active ? 'accent' : 'secondary'} variant="label">{houseName(h)}</AppText>
                      </Pressable>
                    );
                  })}
                </View>

                {legs.map((l) => (
                  <View key={l.eventKey} style={[styles.row, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <View style={[styles.legCell, { width: LEG_W }]}>
                      <View style={styles.flex}>
                        <AppText numberOfLines={2} variant="bodyStrong">{l.label}</AppText>
                        <AppText numberOfLines={1} tone="secondary" variant="label">{l.market}</AppText>
                        <AppText numberOfLines={1} tone="muted" variant="label">{`${l.home} – ${l.away}`}</AppText>
                      </View>
                      <Pressable accessibilityLabel={`Remover ${l.label}`} accessibilityRole="button" hitSlop={8} onPress={() => remove(l.eventKey)}>
                        <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                      </Pressable>
                    </View>
                    {columns.map((h) => {
                      const o = legOdd(views.get(l.eventKey), l.selectionKey, h);
                      return (
                        <View key={h} style={[styles.cell, { width: COL_W }]}>
                          <AppText tone={o === null ? 'muted' : 'primary'} variant="number">{o === null ? '—' : formatOdd(o)}</AppText>
                        </View>
                      );
                    })}
                  </View>
                ))}

                <View style={[styles.row, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                  <View style={[styles.legCell, { width: LEG_W }]}><AppText variant="bodyStrong">Odd total</AppText></View>
                  {columns.map((h) => {
                    const total = perHouse[h]?.total ?? null;
                    const isBest = h === best && total !== null;
                    return (
                      <View key={h} style={[styles.cell, { width: COL_W, backgroundColor: isBest ? colors.surfaceRaised : 'transparent' }]}>
                        <AppText tone={isBest ? 'accent' : total === null ? 'muted' : 'primary'} variant="number">{calculating ? '…' : total === null ? '—' : formatOdd(total)}</AppText>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.row}>
                  <View style={[styles.legCell, { width: LEG_W }]}><AppText tone="secondary" variant="caption">{`Retorno com ${formatEuro(stake)}`}</AppText></View>
                  {columns.map((h) => {
                    const total = perHouse[h]?.total ?? null;
                    return (
                      <View key={h} style={[styles.cell, { width: COL_W }]}>
                        <AppText tone={total === null ? 'muted' : 'secondary'} variant="caption">{calculating ? '…' : total === null ? '—' : formatEuro(total * stake)}</AppText>
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {failed ? (
              <View style={[styles.notice, { backgroundColor: colors.surfaceRaised }]}>
                <AppText style={styles.flex} tone="secondary" variant="caption">Não foi possível calcular a múltipla.</AppText>
                <Button onPress={() => multiple.refetch()} size="sm" title="Tentar de novo" variant="secondary" />
              </View>
            ) : calculating ? (
              <AppText style={styles.calc} tone="muted" variant="caption">A calcular as odds totais…</AppText>
            ) : null}

            <NumericInput
              allowDecimal
              label="Valor"
              onChangeText={(t) => { setStakeText(t); setStake(parseStake(t)); }}
              style={{ marginTop: 16 }}
              suffix="€"
              value={stakeText}
            />
            <Pressable accessibilityRole="button" onPress={() => setConfirmClear(true)} style={styles.clear}>
              <AppText tone="negative" variant="bodyStrong">Limpar múltipla</AppText>
            </Pressable>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Button
              disabled={!target || registering || calculating}
              loading={registering}
              onPress={async () => {
                if (!target || calculating) return;
                setRegistering(true);
                try {
                  await register(legs, target, { shownOdds: shownOddsFor(legs, target, views), stake, fromModal: true });
                } finally {
                  setRegistering(false);
                }
              }}
              title={calculating ? (failed ? 'Múltipla indisponível' : 'A calcular…') : target ? `Registar na ${houseName(target)}` : 'Sem casa completa'}
            />
          </View>
        </>
      )}

      <ConfirmModal
        confirmLabel="Limpar"
        message="Vais remover todas as seleções da múltipla."
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); clear(); }}
        title="Limpar a múltipla?"
        visible={confirmClear}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
  row: { alignItems: 'stretch', flexDirection: 'row' },
  cell: { alignItems: 'center', gap: 2, justifyContent: 'center', paddingVertical: 10 },
  legCell: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingRight: 8, paddingVertical: 10 },
  clear: { alignItems: 'center', paddingVertical: 16 },
  notice: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 10, marginTop: 12, padding: 12 },
  calc: { marginTop: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12 },
});
