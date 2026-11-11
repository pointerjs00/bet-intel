// NBA game detail: score, quarters, team comparison and box score per player (live or final).
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../../../components/ui/Pressable';
import { TeamBadge } from '../../../components/ui/TeamBadge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { LiveDot } from '../../../components/ui/Appear';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { useCardElevation } from '../../../components/ui/ListCard';
import { MatchBetsStrip } from '../../../components/fixtures/MatchBetsStrip';
import { useBasketballGame, type BasketballTotals } from '../../../services/sportsService';
import { useTheme } from '../../../theme/useTheme';

const COMPARE: Array<{ key: keyof BasketballTotals; label: string; lowerIsBetter?: boolean }> = [
  { key: 'rebounds', label: 'Ressaltos' },
  { key: 'assists', label: 'Assistências' },
  { key: 'threes', label: 'Triplos' },
  { key: 'steals', label: 'Roubos de bola' },
  { key: 'blocks', label: 'Desarmes de lançamento' },
  { key: 'turnovers', label: 'Perdas de bola', lowerIsBetter: true },
];

export default function NbaGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const elevation = useCardElevation();
  const q = useBasketballGame(id ?? '');
  const g = q.data;
  const [side, setSide] = useState<'away' | 'home'>('away');
  const live = g?.status === 'LIVE' || g?.status === 'HALFTIME';
  const done = g?.status === 'FINISHED';

  const card = [styles.card, elevation, { backgroundColor: colors.surface }];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32, paddingTop: insets.top + 12 }]}
        refreshControl={<RefreshControl onRefresh={() => void q.refetch()} refreshing={q.isRefetching} tintColor={colors.primary} />}
        style={{ backgroundColor: colors.background }}
      >
        <Pressable accessibilityLabel="Voltar" hitSlop={8} onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]}>
          <Ionicons color={colors.textPrimary} name="chevron-back" size={22} />
        </Pressable>

        {!g ? (q.isError ? <Text style={{ color: colors.textSecondary }}>Não foi possível carregar o jogo.</Text> : <Skeleton height={200} width="100%" />) : (
          <>
            <Animated.View entering={FadeInDown.duration(320)} style={[styles.heroWrap, elevation]}>
              <LinearGradient colors={[colors.heroFrom, colors.heroTo]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
                <View style={styles.heroTop}>
                  <Text style={[styles.league, { color: colors.heroText }]}>NBA</Text>
                  {live ? <View style={[styles.livePill, { backgroundColor: `${colors.live}33` }]}><LiveDot color={colors.live} size={6} /><Text style={[styles.liveText, { color: colors.live }]}>{g.statusDetail}</Text></View>
                    : <Text style={[styles.league, { color: colors.heroText }]}>{done ? 'Terminado' : new Date(g.startAt).toLocaleString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>}
                </View>
                <View style={styles.teams}>
                  {[{ t: g.away, s: g.score?.away, o: g.score?.home }, { t: g.home, s: g.score?.home, o: g.score?.away }].map((x, i) => (
                    <React.Fragment key={x.t.name}>
                      {i === 1 ? <Text style={[styles.at, { color: colors.heroText }]}>@</Text> : null}
                      <View style={styles.teamCol}>
                        <TeamBadge imageUrl={x.t.logo} name={x.t.name} size={58} />
                        <Text numberOfLines={2} style={[styles.teamName, { color: colors.heroText }]}>{x.t.name}</Text>
                        {x.s != null ? <Text style={[styles.bigScore, { color: live ? colors.live : (x.s ?? 0) >= (x.o ?? 0) ? colors.heroText : `${colors.heroText}99` }]}>{x.s}</Text> : null}
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </LinearGradient>
            </Animated.View>

            <MatchBetsStrip away={g.away.name} home={g.home.name} kickoff={g.startAt} live={live} />

            {g.periods.length ? (
              <Animated.View entering={FadeInDown.delay(80).duration(300)} style={card}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Pontos por período</Text>
                <View style={styles.qRow}>
                  <Text style={[styles.qTeam, { color: colors.textMuted }]} />
                  {g.periods.map((_, i) => <Text key={i} style={[styles.qHead, { color: colors.textMuted }]}>{i < 4 ? `${i + 1}.º` : `P${i - 3}`}</Text>)}
                  <Text style={[styles.qHead, styles.qTotal, { color: colors.textMuted }]}>T</Text>
                </View>
                {(['away', 'home'] as const).map((sd) => (
                  <View key={sd} style={[styles.qRow, styles.qLine, { borderTopColor: colors.border }]}>
                    <Text numberOfLines={1} style={[styles.qTeam, { color: colors.textPrimary }]}>{g[sd].abbreviation || g[sd].name}</Text>
                    {g.periods.map((p, i) => {
                      const mine = p[sd]; const other = p[sd === 'home' ? 'away' : 'home'];
                      return <Text key={i} style={[styles.qCell, { color: mine > other ? colors.textPrimary : colors.textSecondary, fontFamily: mine > other ? 'Inter_700Bold' : 'Inter_500Medium' }]}>{mine}</Text>;
                    })}
                    <Text style={[styles.qCell, styles.qTotal, { color: colors.textPrimary }]}>{g.score?.[sd] ?? '–'}</Text>
                  </View>
                ))}
              </Animated.View>
            ) : null}

            {g.totals ? (
              <Animated.View entering={FadeInDown.delay(140).duration(300)} style={card}>
                <View style={styles.cmpHead}>
                  <Text style={[styles.cmpTeam, { color: colors.textSecondary }]}>{g.away.abbreviation}</Text>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Equipas</Text>
                  <Text style={[styles.cmpTeam, { color: colors.textSecondary }]}>{g.home.abbreviation}</Text>
                </View>
                {COMPARE.map((c) => {
                  const a = g.totals!.away[c.key]; const h = g.totals!.home[c.key];
                  const tot = a + h || 1;
                  const aBetter = c.lowerIsBetter ? a < h : a > h;
                  const hBetter = c.lowerIsBetter ? h < a : h > a;
                  return (
                    <View key={c.key} style={styles.cmpRow}>
                      <View style={styles.cmpLabels}>
                        <Text style={[styles.cmpVal, { color: aBetter ? colors.textPrimary : colors.textSecondary }]}>{a}</Text>
                        <Text style={[styles.cmpLabel, { color: colors.textMuted }]}>{c.label}</Text>
                        <Text style={[styles.cmpVal, { color: hBetter ? colors.textPrimary : colors.textSecondary }]}>{h}</Text>
                      </View>
                      <View style={styles.cmpBar}>
                        <View style={[styles.cmpHalf, styles.cmpLeft, { backgroundColor: colors.background }]}><View style={{ backgroundColor: aBetter ? colors.info : colors.border, borderRadius: 3, width: `${(a / tot) * 100}%` }} /></View>
                        <View style={[styles.cmpHalf, { backgroundColor: colors.background }]}><View style={{ backgroundColor: hBetter ? colors.primary : colors.border, borderRadius: 3, width: `${(h / tot) * 100}%` }} /></View>
                      </View>
                    </View>
                  );
                })}
              </Animated.View>
            ) : null}

            {g.players && g.players.length ? (
              <Animated.View entering={FadeInDown.delay(200).duration(300)} style={card}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Jogadores</Text>
                <SegmentedControl onChange={setSide} options={[{ value: 'away', label: g.away.abbreviation || 'Fora' }, { value: 'home', label: g.home.abbreviation || 'Casa' }]} value={side} />
                <View style={[styles.pRow, styles.pHeadRow]}>
                  <Text style={[styles.pName, { color: colors.textMuted }]}>Jogador</Text>
                  {['PTS', 'RES', 'AST', '3PT'].map((h) => <Text key={h} style={[styles.pStat, styles.pHead, { color: colors.textMuted }]}>{h}</Text>)}
                </View>
                {g.players.filter((p) => p.side === side && p.played).sort((a, b) => b.points - a.points).map((p, i) => (
                  <View key={p.name} style={[styles.pRow, { backgroundColor: i % 2 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)') }]}>
                    <Text numberOfLines={1} style={[styles.pName, { color: colors.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.pStat, styles.pPts, { color: colors.textPrimary }]}>{p.points}</Text>
                    <Text style={[styles.pStat, { color: colors.textSecondary }]}>{p.rebounds}</Text>
                    <Text style={[styles.pStat, { color: colors.textSecondary }]}>{p.assists}</Text>
                    <Text style={[styles.pStat, { color: colors.textSecondary }]}>{p.threes}</Text>
                  </View>
                ))}
              </Animated.View>
            ) : !live && !done ? <Text style={[styles.note, { color: colors.textMuted }]}>As estatísticas aparecem quando o jogo começar.</Text> : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 16 },
  back: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  heroWrap: { borderRadius: 24 },
  hero: { borderRadius: 24, gap: 14, padding: 18 },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  league: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  livePill: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 3 },
  liveText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  teams: { alignItems: 'flex-start', flexDirection: 'row' },
  teamCol: { alignItems: 'center', flex: 1, gap: 6 },
  teamName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center' },
  bigScore: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 40, lineHeight: 46 },
  at: { alignSelf: 'center', fontFamily: 'Inter_700Bold', fontSize: 16, opacity: 0.6 },
  card: { borderRadius: 22, gap: 12, padding: 16 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  qRow: { alignItems: 'center', flexDirection: 'row' },
  qLine: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  qTeam: { fontFamily: 'Inter_700Bold', fontSize: 13, width: 56 },
  qHead: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11, textAlign: 'center' },
  qCell: { flex: 1, fontSize: 14, textAlign: 'center' },
  qTotal: { fontFamily: 'SpaceGrotesk_700Bold' },
  cmpHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cmpTeam: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  cmpRow: { gap: 6 },
  cmpLabels: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cmpVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, minWidth: 28 },
  cmpLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  cmpBar: { flexDirection: 'row', gap: 4, height: 6 },
  cmpHalf: { borderRadius: 3, flex: 1, flexDirection: 'row' },
  cmpLeft: { justifyContent: 'flex-end' },
  pRow: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 8 },
  pHeadRow: { paddingVertical: 2 },
  pName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  pStat: { fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center', width: 40 },
  pHead: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  pPts: { fontFamily: 'Inter_700Bold' },
  note: { fontSize: 13, textAlign: 'center' },
});
