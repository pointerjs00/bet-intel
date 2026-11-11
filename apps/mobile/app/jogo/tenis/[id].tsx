// Tennis match detail: sets, games per set, the point score and server while live.
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../../../components/ui/Pressable';
import { TeamBadge } from '../../../components/ui/TeamBadge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { LiveDot } from '../../../components/ui/Appear';
import { useCardElevation } from '../../../components/ui/ListCard';
import { MatchBetsStrip } from '../../../components/fixtures/MatchBetsStrip';
import { useTennisMatch } from '../../../services/sportsService';
import { useTheme } from '../../../theme/useTheme';

export default function TennisMatchScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const q = useTennisMatch(id ?? '', date ?? new Date().toISOString().slice(0, 10));
  const m = q.data;
  const live = m?.status === 'LIVE';
  const done = m ? ['FINISHED', 'RETIRED', 'WALKOVER'].includes(m.status) : false;
  const sets = m ? (live && m.live?.sets.length ? m.live.sets : m.sets) : [];
  const setsA = sets.filter((s) => s.a > s.b).length;
  const setsB = sets.filter((s) => s.b > s.a).length;
  const gamesA = sets.reduce((t, s) => t + s.a, 0);
  const gamesB = sets.reduce((t, s) => t + s.b, 0);
  const tight = sets.filter((s) => Math.abs(s.a - s.b) <= 2 && Math.max(s.a, s.b) >= 6).length;
  const card = [styles.card, elevation, { backgroundColor: colors.surface }];

  const player = (name: string, won: boolean, serving: boolean) => (
    <View style={styles.playerCol}>
      <View>
        <TeamBadge name={name} size={64} variant="player" />
        {serving ? <View style={[styles.serve, { backgroundColor: colors.gold }]}><Ionicons color="#0B0D12" name="tennisball" size={11} /></View> : null}
      </View>
      <Text numberOfLines={2} style={[styles.playerName, { color: colors.heroText, fontFamily: won ? 'Inter_700Bold' : 'Inter_600SemiBold' }]}>{name}</Text>
    </View>
  );

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

        {!m ? (q.isError ? <Text style={{ color: colors.textSecondary }}>Não foi possível carregar o jogo.</Text> : <Skeleton height={220} width="100%" />) : (
          <>
            <Animated.View entering={FadeInDown.duration(320)} style={[styles.heroWrap, elevation]}>
              <LinearGradient colors={[colors.heroFrom, colors.heroTo]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
                <View style={styles.heroTop}>
                  <Text numberOfLines={1} style={[styles.meta, { color: colors.heroText }]}>{m.tour.toUpperCase()} · {m.tournament.name}{m.round ? ` · ${m.round}` : ''}</Text>
                  {live ? <View style={[styles.livePill, { backgroundColor: `${colors.live}33` }]}><LiveDot color={colors.live} size={6} /><Text style={[styles.liveText, { color: colors.live }]}>AO VIVO</Text></View> : null}
                </View>
                <View style={styles.players}>
                  {player(m.playerA, m.winner === 'A', live && m.live?.server === 'A')}
                  <View style={styles.center}>
                    {sets.length ? <Text style={[styles.bigScore, { color: live ? colors.live : colors.heroText }]}>{setsA}–{setsB}</Text> : (
                      <Text style={[styles.time, { color: colors.heroText }]}>{new Date(m.startAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</Text>
                    )}
                    <Text style={[styles.meta, { color: colors.heroText }]}>{done ? (m.status === 'RETIRED' ? 'Desistência' : m.status === 'WALKOVER' ? 'W.O.' : 'Terminado') : live ? 'sets' : new Date(m.startAt).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                  </View>
                  {player(m.playerB, m.winner === 'B', live && m.live?.server === 'B')}
                </View>
                {live && m.live && (m.live.pointsA || m.live.pointsB) ? (
                  <Animated.View entering={ZoomIn.springify()} style={styles.points}>
                    <Text style={[styles.pointsLabel, { color: colors.heroText }]}>Jogo atual</Text>
                    <Text style={[styles.pointsValue, { color: colors.heroText }]}>{m.live.pointsA ?? '0'} – {m.live.pointsB ?? '0'}</Text>
                  </Animated.View>
                ) : null}
              </LinearGradient>
            </Animated.View>

            <MatchBetsStrip away={m.playerB} home={m.playerA} kickoff={m.startAt} live={live} />

            {sets.length ? (
              <Animated.View entering={FadeInDown.delay(80).duration(300)} style={card}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Sets</Text>
                <View style={styles.row}>
                  <Text style={styles.nameCell} />
                  {sets.map((_, i) => <Text key={i} style={[styles.head, { color: colors.textMuted }]}>{i + 1}.º</Text>)}
                </View>
                {([['A', m.playerA], ['B', m.playerB]] as const).map(([k, name]) => (
                  <View key={k} style={[styles.row, styles.line, { borderTopColor: colors.border }]}>
                    <Text numberOfLines={1} style={[styles.nameCell, { color: colors.textPrimary }]}>{name}</Text>
                    {sets.map((s, i) => {
                      const mine = k === 'A' ? s.a : s.b; const other = k === 'A' ? s.b : s.a;
                      const current = live && i === sets.length - 1;
                      return (
                        <View key={i} style={[styles.setCell, { backgroundColor: mine > other && !current ? `${colors.positive}22` : 'transparent' }]}>
                          <Text style={[styles.setText, { color: current ? colors.live : mine > other ? colors.textPrimary : colors.textSecondary }]}>{mine}</Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </Animated.View>
            ) : null}

            {sets.length ? (
              <Animated.View entering={FadeInDown.delay(140).duration(300)} style={card}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Resumo</Text>
                <View style={styles.tiles}>
                  <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={[styles.tileVal, { color: colors.textPrimary }]}>{setsA}–{setsB}</Text><Text style={[styles.tileLabel, { color: colors.textMuted }]}>sets</Text></View>
                  <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={[styles.tileVal, { color: colors.textPrimary }]}>{gamesA}–{gamesB}</Text><Text style={[styles.tileLabel, { color: colors.textMuted }]}>jogos ganhos</Text></View>
                  <View style={[styles.tile, { backgroundColor: colors.background }]}><Text style={[styles.tileVal, { color: colors.textPrimary }]}>{tight}</Text><Text style={[styles.tileLabel, { color: colors.textMuted }]}>sets renhidos</Text></View>
                </View>
                <Text style={[styles.note, { color: colors.textMuted }]}>Ases, duplas faltas e quebras não estão disponíveis numa fonte gratuita.</Text>
              </Animated.View>
            ) : <Text style={[styles.note, styles.centerText, { color: colors.textMuted }]}>Os sets aparecem quando o jogo começar.</Text>}
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
  hero: { borderRadius: 24, gap: 16, padding: 18 },
  heroTop: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  meta: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, opacity: 0.85 },
  livePill: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 3 },
  liveText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  players: { alignItems: 'center', flexDirection: 'row' },
  playerCol: { alignItems: 'center', flex: 1, gap: 8 },
  playerName: { fontSize: 14, textAlign: 'center' },
  serve: { alignItems: 'center', borderRadius: 9, bottom: -2, height: 18, justifyContent: 'center', position: 'absolute', right: -2, width: 18 },
  center: { alignItems: 'center', gap: 2, minWidth: 90 },
  bigScore: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 38 },
  time: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28 },
  points: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, gap: 2, paddingHorizontal: 18, paddingVertical: 8 },
  pointsLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, opacity: 0.8 },
  pointsValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22 },
  card: { borderRadius: 22, gap: 10, padding: 16 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  nameCell: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  head: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textAlign: 'center', width: 36 },
  setCell: { alignItems: 'center', borderRadius: 8, paddingVertical: 4, width: 36 },
  setText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { alignItems: 'center', borderRadius: 14, flex: 1, gap: 2, paddingVertical: 12 },
  tileVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  tileLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  note: { fontSize: 12 },
  centerText: { textAlign: 'center' },
});
