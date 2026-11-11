import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming, ZoomIn } from 'react-native-reanimated';
import { ItemResult } from '@betintel/shared';
import type { FootballMatch } from '../../services/sportsService';
import { useCardElevation } from '../ui/ListCard';
import { PressableScale } from '../ui/PressableScale';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';
import { explainBet, parseMinute, type GoalEvent } from '../../utils/betTimeline';
import type { MatchBet } from '../../utils/dayBets';

const GOALS = new Set(['GOAL', 'PENALTY_GOAL', 'OWN_GOAL']);

/** Goal events from the match incidents (own goals count for the other side). */
export function goalsOf(m: FootballMatch): GoalEvent[] {
  return (m.incidents ?? [])
    .filter((i) => GOALS.has(i.type) && i.side)
    .map((i) => ({
      minute: parseMinute(i.minute),
      side: (i.type === 'OWN_GOAL' ? (i.side === 'home' ? 'away' : 'home') : i.side) as 'home' | 'away',
      label: i.player ?? 'Golo',
    }));
}

function SegmentBar({ segments, total }: { segments: Array<{ from: number; to: number; winning: boolean }>; total: number }) {
  const { colors } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })); }, [p]);
  const reveal = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={styles.barWrap}>
      <Animated.View style={[styles.barReveal, reveal]}>
        <View style={styles.bar}>
          {segments.map((s, i) => (
            <View key={i} style={{ backgroundColor: s.winning ? colors.positive : `${colors.negative}AA`, flex: Math.max(s.to - s.from, 0.5) }} />
          ))}
        </View>
      </Animated.View>
      <View style={styles.ticks}>
        <Text style={[styles.tick, { color: colors.textMuted }]}>0'</Text>
        {segments.slice(1).map((s) => (
          <Text key={s.from} style={[styles.tick, styles.tickAbs, { color: colors.textMuted, left: `${(s.from / total) * 100}%` }]}>{s.from}'</Text>
        ))}
        <Text style={[styles.tick, styles.tickEnd, { color: colors.textMuted }]}>{total}'</Text>
      </View>
    </View>
  );
}

/**
 * "A tua aposta" on the match: verdict, what the selection needed vs what happened, how it stood
 * through the game and the goals that changed it. One block per selection on this match.
 */
export function MatchBetVerdict({ match, bet, onOpenBoletim }: { match: FootballMatch; bet: MatchBet; onOpenBoletim?: () => void }) {
  const { colors, isDark } = useTheme();
  const elevation = useCardElevation();
  const goals = goalsOf(match);
  const live = match.status === 'LIVE' || match.status === 'HALFTIME';
  const end = Math.max(90, ...goals.map((g) => g.minute), ...(match.incidents ?? []).map((i) => parseMinute(i.minute)));
  const e = explainBet(bet.market, bet.selection, match.home.name, match.away.name, goals, match.score, live ? Math.max(...goals.map((g) => g.minute), parseMinute(match.statusDetail) || 1) : end);
  const won = bet.result === ItemResult.WON;
  const lost = bet.result === ItemResult.LOST;
  const tone = won ? colors.positive : lost ? colors.negative : colors.warning;
  const gradient: [string, string] = isDark
    ? won ? ['#0F3328', '#12263A'] : lost ? ['#3A1822', '#1A1B2E'] : ['#33280F', '#14182A']
    : won ? ['#E7F8EF', '#FFFFFF'] : lost ? ['#FDECEE', '#FFFFFF'] : ['#FFF6E5', '#FFFFFF'];
  const verdict = won ? 'GANHOU' : lost ? 'PERDEU' : live ? 'EM JOGO' : 'PENDENTE';
  const money = bet.legs === 1 && bet.profit !== null
    ? `${bet.profit >= 0 ? '+' : '−'}${formatCurrency(Math.abs(bet.profit))}`
    : bet.legs > 1 ? `Múltipla · ${bet.wonLegs}/${bet.legs} certas` : null;
  const tile = { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(15,23,42,0.05)' };

  return (
    <Animated.View entering={FadeInDown.duration(360).springify().damping(16)} style={[styles.wrap, elevation]}>
      <LinearGradient colors={gradient} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.card}>
        <PressableScale disabled={!onOpenBoletim} onPress={onOpenBoletim} scaleDown={0.99} style={styles.inner}>
          <View style={styles.top}>
            <Text style={[styles.verdict, { color: tone }]}>A TUA APOSTA · {verdict}</Text>
            {money ? <Animated.Text entering={ZoomIn.delay(150).springify()} style={[styles.money, { color: tone }]}>{money}</Animated.Text> : null}
          </View>
          <View style={styles.pair}>
            <View style={[styles.box, tile]}>
              <Text style={[styles.boxLabel, { color: colors.textSecondary }]}>Precisavas</Text>
              <Text style={[styles.boxValue, { color: colors.textPrimary }]}>{e.needed}</Text>
            </View>
            <View style={[styles.box, tile]}>
              <Text style={[styles.boxLabel, { color: colors.textSecondary }]}>{live ? 'Neste momento' : 'Aconteceu'}</Text>
              <Text style={[styles.boxValue, { color: colors.textPrimary }]}>{match.score ? `${match.score.home}–${match.score.away}` : '—'}{won ? ' ✓' : lost ? ' ✕' : ''}</Text>
            </View>
          </View>
          <Text style={[styles.pick, { color: colors.textSecondary }]}>{bet.market} · {bet.selection} @{bet.odd.toFixed(2)}</Text>
        </PressableScale>
        {e.segments ? (
          <View style={[styles.timeline, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(15,23,42,0.04)' }]}>
            <Text style={[styles.timelineTitle, { color: colors.textSecondary }]}>Como esteve a aposta</Text>
            <SegmentBar segments={e.segments} total={e.segments[e.segments.length - 1]!.to} />
            {e.moments.length ? (
              <View style={styles.moments}>
                {e.moments.map((mo, i) => (
                  <Animated.View entering={FadeInDown.delay(300 + i * 90).duration(280)} key={`${mo.minute}-${i}`} style={styles.moment}>
                    <View style={[styles.minute, { backgroundColor: mo.winningAfter ? colors.positive : colors.negative }]}>
                      <Text style={styles.minuteText}>{mo.minute}'</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.momentTitle, { color: colors.textPrimary }]}>{mo.label} marca</Text>
                      <Text style={[styles.momentSub, { color: colors.textMuted }]}>{mo.winningAfter ? 'Passas a ganhar' : 'Passas a perder'}</Text>
                    </View>
                    <Text style={[styles.momentScore, { color: colors.textPrimary }]}>{mo.score}</Text>
                  </Animated.View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

/** How other common markets ended on this match, to remember the game. */
export function OtherMarkets({ match }: { match: FootballMatch }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  if (!match.score || match.status !== 'FINISHED') return null;
  const { home: h, away: a } = match.score;
  const ht = match.halfTime;
  const st = match.stats;
  const sum = (k: 'corners' | 'yellowCards' | 'redCards') => (st && st.home[k] !== null && st.away[k] !== null ? (st.home[k] ?? 0) + (st.away[k] ?? 0) : null);
  const corners = sum('corners');
  const cards = (() => { const y = sum('yellowCards'); const r = sum('redCards'); return y === null ? null : y + (r ?? 0); })();
  const winner = (x: number, y: number) => (x > y ? match.home.name : y > x ? match.away.name : 'Empate');
  const rows: Array<{ label: string; value: string; yes?: boolean }> = [
    { label: 'Ambas marcam', value: h > 0 && a > 0 ? 'Sim' : 'Não', yes: h > 0 && a > 0 },
    { label: 'Total de golos', value: `${h + a} · ${h + a > 2.5 ? 'mais' : 'menos'} de 2,5`, yes: h + a > 2.5 },
    ...(ht ? [{ label: 'Intervalo / Final', value: `${winner(ht.home, ht.away)} / ${winner(h, a)}` }] : []),
    ...(corners !== null ? [{ label: 'Cantos', value: String(corners) }] : []),
    ...(cards !== null ? [{ label: 'Cartões', value: String(cards) }] : []),
    { label: `${match.home.name} sem sofrer`, value: a === 0 ? 'Sim' : 'Não', yes: a === 0 },
    { label: `${match.away.name} sem sofrer`, value: h === 0 ? 'Sim' : 'Não', yes: h === 0 },
  ];
  return (
    <Animated.View entering={FadeInDown.delay(120).duration(320)} style={[styles.others, elevation, { backgroundColor: colors.surface }]}>
      <Text style={[styles.othersTitle, { color: colors.textPrimary }]}>Outros mercados deste jogo</Text>
      <Text style={[styles.othersSub, { color: colors.textMuted }]}>Como teriam acabado</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.otherRow}>
          <Text numberOfLines={1} style={[styles.otherLabel, { color: colors.textSecondary }]}>{r.label}</Text>
          <Text
            numberOfLines={1}
            style={[styles.otherValue, {
              backgroundColor: r.yes === undefined ? colors.surfaceRaised : r.yes ? `${colors.positive}1F` : `${colors.negative}1F`,
              color: r.yes === undefined ? colors.textPrimary : r.yes ? colors.positive : colors.negative,
            }]}
          >{r.value}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 24 },
  card: { borderRadius: 24, overflow: 'hidden' },
  inner: { gap: 12, padding: 16 },
  top: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  verdict: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.7 },
  money: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  pair: { flexDirection: 'row', gap: 8 },
  box: { borderRadius: 14, flex: 1, gap: 2, paddingHorizontal: 12, paddingVertical: 10 },
  boxLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  boxValue: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  pick: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  timeline: { gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  timelineTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  barWrap: { gap: 4 },
  barReveal: { overflow: 'hidden' },
  bar: { borderRadius: 6, flexDirection: 'row', gap: 2, height: 12, overflow: 'hidden', width: '100%' },
  ticks: { height: 14 },
  tick: { fontFamily: 'Inter_500Medium', fontSize: 10, position: 'absolute' },
  tickAbs: { transform: [{ translateX: -8 }] },
  tickEnd: { right: 0 },
  moments: { gap: 8, marginTop: 2 },
  moment: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  minute: { alignItems: 'center', borderRadius: 8, paddingVertical: 3, width: 46 },
  minuteText: { color: '#06110B', fontFamily: 'Inter_700Bold', fontSize: 12 },
  flex: { flex: 1 },
  momentTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  momentSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  momentScore: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  others: { borderRadius: 22, gap: 6, padding: 16 },
  othersTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  othersSub: { fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 4 },
  otherRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 5 },
  otherLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  otherValue: { borderRadius: 8, fontFamily: 'Inter_700Bold', fontSize: 13, maxWidth: '55%', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 3 },
});
