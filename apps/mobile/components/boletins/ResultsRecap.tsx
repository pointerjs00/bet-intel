// "Desde a última vez": when the app opens (or comes back to the foreground) and a selection or a
// whole boletim was decided meanwhile, a short animated recap shows what happened — won or lost,
// the money and which games — with a shortcut to the boletim. What was seen is remembered on the
// device (selection results by id), so each result is shown once.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { BoletinStatus, ItemResult, type BoletinDetail } from '@betintel/shared';
import { Pressable } from '../ui/Pressable';
import { TeamBadge } from '../ui/TeamBadge';
import { useBoletins } from '../../services/boletinService';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../theme/useTheme';
import { formatOdds, formatSignedCurrency } from '../../utils/formatters';
import { hapticSuccess } from '../../utils/haptics';

const KEY = 'betintel:seen-results:v1';
type Seen = Record<string, string>; // itemId → result, boletimId → status

interface Event {
  boletin: BoletinDetail;
  /** The whole boletim was settled (not just a selection). */
  settled: boolean;
  legs: BoletinDetail['items'];
}

const profitOf = (b: BoletinDetail) => {
  const ret = b.actualReturn != null ? Number(b.actualReturn) : 0;
  return b.isFreebet ? ret : ret - Number(b.stake);
};

export function ResultsRecap() {
  const { colors } = useTheme();
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const boletins = useBoletins();
  const [seen, setSeen] = useState<Seen | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const shownFor = useRef<string>('');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setSeen(v ? (JSON.parse(v) as Seen) : {})).catch(() => setSeen({}));
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Compare the latest results with what was already seen.
  const fresh = useMemo<Event[]>(() => {
    if (!seen || !boletins.data) return [];
    const first = Object.keys(seen).length === 0;
    if (first) return [];
    const out: Event[] = [];
    for (const b of boletins.data) {
      const legs = b.items.filter((i) => (i.result === ItemResult.WON || i.result === ItemResult.LOST) && seen[i.id] !== i.result && seen[i.id] !== undefined);
      const settled = b.status !== BoletinStatus.PENDING && seen[b.id] === BoletinStatus.PENDING;
      if (legs.length || settled) out.push({ boletin: b, settled, legs });
    }
    return out.sort((a, b) => Number(b.settled) - Number(a.settled));
  }, [seen, boletins.data]);

  // First run (nothing stored yet): remember the current state without showing anything.
  useEffect(() => {
    if (!seen || !boletins.data || Object.keys(seen).length) return;
    void remember();
  }, [seen, boletins.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!signedIn || !active || !fresh.length) return;
    const sig = fresh.map((e) => `${e.boletin.id}:${e.boletin.status}:${e.legs.map((l) => l.id).join(',')}`).join('|');
    if (sig === shownFor.current) return;
    shownFor.current = sig;
    setEvents(fresh);
    if (fresh.some((e) => e.settled && e.boletin.status === BoletinStatus.WON)) hapticSuccess();
  }, [fresh, active, signedIn]);

  async function remember() {
    const next: Seen = {};
    for (const b of boletins.data ?? []) {
      next[b.id] = b.status;
      for (const i of b.items) next[i.id] = i.result;
    }
    setSeen(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
  }

  const close = () => { setEvents([]); void remember(); };
  if (!events.length) return null;

  const settled = events.filter((e) => e.settled);
  const total = settled.reduce((t, e) => t + profitOf(e.boletin), 0);
  const allWon = settled.length > 0 && settled.every((e) => e.boletin.status === BoletinStatus.WON);
  const tone = !settled.length ? colors.info : total >= 0 ? colors.positive : colors.negative;
  const title = !settled.length
    ? 'Novidades nas tuas apostas'
    : settled.length === 1
      ? settled[0]!.boletin.status === BoletinStatus.WON ? 'Ganhaste!' : settled[0]!.boletin.status === BoletinStatus.LOST ? 'Boletim perdido' : 'Boletim resolvido'
      : `${settled.length} boletins resolvidos`;

  return (
    <Modal animationType="fade" onRequestClose={close} statusBarTranslucent transparent visible>
      <View style={styles.backdrop}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.card, { backgroundColor: colors.surface }]}>
          <Animated.View entering={ZoomIn.delay(120).springify().damping(10)} style={[styles.icon, { backgroundColor: `${tone}22` }]}>
            <Ionicons color={tone} name={!settled.length ? 'notifications' : allWon ? 'trophy' : total >= 0 ? 'checkmark-circle' : 'close-circle'} size={40} />
          </Animated.View>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Desde a última vez</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          {settled.length ? <Animated.Text entering={FadeInDown.delay(200).duration(300)} style={[styles.total, { color: tone }]}>{formatSignedCurrency(total)}</Animated.Text> : null}

          <ScrollView style={styles.list}>
            {events.slice(0, 6).map((e, i) => {
              const b = e.boletin;
              const won = b.status === BoletinStatus.WON;
              const lost = b.status === BoletinStatus.LOST;
              const legs = e.legs.length ? e.legs : b.items;
              return (
                <Animated.View entering={FadeInDown.delay(260 + i * 80).duration(280)} key={b.id}>
                  <Pressable onPress={() => { close(); router.push(`/boletins/${b.id}`); }} style={[styles.row, { backgroundColor: colors.background }]}>
                    <View style={styles.flex}>
                      <View style={styles.rowHead}>
                        <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{b.items.length > 1 ? `Múltipla · ${b.items.filter((x) => x.result === ItemResult.WON).length}/${b.items.length} certas` : 'Simples'}</Text>
                        {e.settled ? <Text style={[styles.rowMoney, { color: won ? colors.positive : lost ? colors.negative : colors.textSecondary }]}>{formatSignedCurrency(profitOf(b))}</Text> : <Text style={[styles.rowMoney, { color: colors.warning }]}>em jogo</Text>}
                      </View>
                      {legs.slice(0, 3).map((l) => (
                        <View key={l.id} style={styles.leg}>
                          <Ionicons color={l.result === ItemResult.WON ? colors.positive : l.result === ItemResult.LOST ? colors.negative : colors.textMuted} name={l.result === ItemResult.WON ? 'checkmark-circle' : l.result === ItemResult.LOST ? 'close-circle' : 'time-outline'} size={15} />
                          <TeamBadge name={l.homeTeam} size={16} />
                          <Text numberOfLines={1} style={[styles.legText, { color: colors.textSecondary }]}>{l.selection} · {formatOdds(l.oddValue)}</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </ScrollView>
          <Pressable onPress={close} style={[styles.btn, { backgroundColor: colors.primary }]}>
            <Text style={styles.btnText}>Fechar</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', flex: 1, justifyContent: 'center', padding: 20 },
  card: { alignItems: 'center', borderRadius: 26, gap: 6, maxHeight: '80%', padding: 20, width: '100%' },
  icon: { alignItems: 'center', borderRadius: 40, height: 80, justifyContent: 'center', marginBottom: 6, width: 80 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center' },
  total: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 34 },
  list: { alignSelf: 'stretch', flexGrow: 0, marginTop: 8 },
  row: { borderRadius: 14, marginBottom: 8, padding: 12 },
  flex: { flex: 1, gap: 6 },
  rowHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rowTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  rowMoney: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  leg: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  legText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  btn: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 14, height: 50, justifyContent: 'center', marginTop: 4 },
  btnText: { color: '#06110B', fontFamily: 'Inter_700Bold', fontSize: 15 },
});
