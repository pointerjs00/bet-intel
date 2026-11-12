// NBA game detail, Sofascore-style: big header (crests, score, clock), the user's bets with the
// provisional result, and four tabs — Detalhes (quarters + lead chart), Jogadores (box score with
// photos; tap a player for every stat), Estatísticas (shooting and team comparison) and Jogadas
// (every scoring play). Live games refresh every 30 s.
import React, { useMemo, useState } from 'react';
import { Modal, Pressable as RNPressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../../../components/ui/Pressable';
import { TeamBadge } from '../../../components/ui/TeamBadge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { LiveDot } from '../../../components/ui/Appear';
import { useCardElevation } from '../../../components/ui/ListCard';
import { MatchBetsStrip } from '../../../components/fixtures/MatchBetsStrip';
import { useBasketballGame, type BasketballGame, type BasketballPlayerLine } from '../../../services/sportsService';
import { useTheme } from '../../../theme/useTheme';

type Tab = 'details' | 'players' | 'stats' | 'plays';
type Side = 'away' | 'home';
const PERIOD_SECS = 720;

/** "Cleveland Cavaliers" → "Cavaliers" (Sofascore shows the nickname). */
const nick = (name: string) => (name === 'Portland Trail Blazers' ? 'Trail Blazers' : name.split(' ').slice(-1)[0] ?? name);
const pct = (v?: string) => (v ? Number(v) : 0);
const madeAtt = (v?: string) => { const [m, a] = (v ?? '0-0').split('-').map(Number); return { m: m || 0, a: a || 0 }; };
const clockText = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
const periodName = (n: number) => (n <= 4 ? `${n}.º período` : `Prolongamento ${n - 4}`);

export default function NbaGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const q = useBasketballGame(id ?? '');
  const g = q.data;
  const [tab, setTab] = useState<Tab>('details');
  const [player, setPlayer] = useState<BasketballPlayerLine | null>(null);
  const live = g?.status === 'LIVE' || g?.status === 'HALFTIME';
  const done = g?.status === 'FINISHED';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl onRefresh={() => void q.refetch()} refreshing={q.isRefetching} tintColor={colors.primary} />}
        stickyHeaderIndices={[1]}
        style={{ backgroundColor: colors.background }}
      >
        {/* Header */}
        <LinearGradient colors={['#3A2418', '#15151C']} style={{ paddingTop: insets.top + 8 }}>
          <View style={styles.topBar}>
            <Pressable accessibilityLabel="Voltar" hitSlop={8} onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons color="#FFFFFF" name="arrow-back" size={24} />
            </Pressable>
            <Text style={styles.leagueTop}>NBA</Text>
            <View style={styles.iconBtn} />
          </View>
          {!g ? <View style={styles.pad}><Skeleton height={120} width="100%" /></View> : (
            <View style={styles.scoreRow}>
              <TeamHead logo={g.away.logo} name={g.away.name} />
              <View style={styles.scoreMid}>
                {g.score && (live || done) ? (
                  <Text style={[styles.bigScore, { color: live ? colors.live : '#FFFFFF' }]}>{g.score.away} - {g.score.home}</Text>
                ) : (
                  <Text style={styles.kickoff}>{new Date(g.startAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</Text>
                )}
                {live ? (
                  <View style={styles.liveRow}><LiveDot color={colors.live} size={6} /><Text style={[styles.status, { color: colors.live }]}>{g.status === 'HALFTIME' ? 'Intervalo' : g.statusDetail}</Text></View>
                ) : (
                  <Text style={styles.statusMuted}>{done ? 'Terminado' : new Date(g.startAt).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })}</Text>
                )}
              </View>
              <TeamHead at logo={g.home.logo} name={g.home.name} />
            </View>
          )}
        </LinearGradient>

        {/* Sticky tabs */}
        <View style={{ backgroundColor: colors.background }}>
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {([['details', 'Detalhes'], ['players', 'Jogadores'], ['stats', 'Estatísticas'], ['plays', 'Jogadas']] as Array<[Tab, string]>).map(([k, label]) => (
            <RNPressable key={k} onPress={() => setTab(k)} style={styles.tab}>
              <Text numberOfLines={1} style={[styles.tabText, { color: tab === k ? colors.textPrimary : colors.textMuted }]}>{label}</Text>
              {tab === k ? <Animated.View entering={FadeIn.duration(150)} style={[styles.tabLine, { backgroundColor: colors.primary }]} /> : null}
            </RNPressable>
          ))}
        </View>
        </View>

        {g ? (
          <View style={styles.pad}>
            {tab === 'details' ? <Details g={g} live={live} /> : null}
            {tab === 'players' ? <Players g={g} onOpen={setPlayer} /> : null}
            {tab === 'stats' ? <Stats g={g} /> : null}
            {tab === 'plays' ? <Plays g={g} /> : null}
          </View>
        ) : q.isError ? <Text style={[styles.empty, { color: colors.textSecondary }]}>Não foi possível carregar o jogo.</Text> : null}
      </ScrollView>
      {g && player ? <PlayerSheet g={g} onClose={() => setPlayer(null)} p={player} /> : null}
    </>
  );
}

function TeamHead({ name, logo, at = false }: { name: string; logo: string | null; at?: boolean }) {
  return (
    <View style={styles.teamHead}>
      <TeamBadge imageUrl={logo} name={name} size={64} />
      <Text numberOfLines={1} style={styles.teamName}>{at ? '@ ' : ''}{nick(name)}</Text>
    </View>
  );
}

function useCard() {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  return [styles.card, elevation, { backgroundColor: colors.surface }];
}

// ── Detalhes ────────────────────────────────────────────────────────────────
function Details({ g, live }: { g: BasketballGame; live: boolean }) {
  const { colors } = useTheme();
  const card = useCard();
  return (
    <>
      <MatchBetsStrip away={g.away.name} home={g.home.name} kickoff={g.startAt} live={live} />
      {g.periods.length ? (
        <Animated.View entering={FadeInDown.duration(260)} style={card}>
          <View style={styles.qRow}>
            <Text style={[styles.qTeam, { color: colors.textMuted }]} />
            {g.periods.map((_, i) => <Text key={i} style={[styles.qHead, { color: colors.textMuted }]}>{i < 4 ? `Q${i + 1}` : `P${i - 3}`}</Text>)}
            <Text style={[styles.qHead, { color: colors.textMuted }]}>T</Text>
          </View>
          {(['away', 'home'] as const).map((sd) => (
            <View key={sd} style={[styles.qRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.qTeam}><TeamBadge imageUrl={g[sd].logo} name={g[sd].name} size={20} /></View>
              {g.periods.map((p, i) => {
                const mine = p[sd]; const other = p[sd === 'home' ? 'away' : 'home'];
                const current = live && i === g.periods.length - 1;
                return <Text key={i} style={[styles.qCell, { color: current ? colors.live : mine > other ? colors.textPrimary : colors.textSecondary }]}>{mine}</Text>;
              })}
              <Text style={[styles.qCell, styles.bold, { color: colors.textPrimary }]}>{g.score?.[sd] ?? '–'}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}
      {g.scoring && g.scoring.length > 2 ? <LeadChart g={g} /> : null}
      {!g.periods.length ? <Text style={[styles.empty, { color: colors.textMuted }]}>Os dados aparecem quando o jogo começar.</Text> : null}
    </>
  );
}

/** Points lead over time (away above the line, home below), like Sofascore's game flow. */
function LeadChart({ g }: { g: BasketballGame }) {
  const { colors } = useTheme();
  const card = useCard();
  const plays = g.scoring ?? [];
  const periods = Math.max(4, ...plays.map((p) => p.period));
  const total = 4 * PERIOD_SECS + Math.max(0, periods - 4) * 300;
  const at = (p: { period: number; clock: number }) => (p.period <= 4 ? (p.period - 1) * PERIOD_SECS + (PERIOD_SECS - p.clock) : 4 * PERIOD_SECS + (p.period - 5) * 300 + (300 - p.clock));
  const BUCKETS = 72;
  const series = useMemo(() => {
    const out: number[] = [];
    let i = 0; let diff = 0;
    const last = plays.length ? at(plays[plays.length - 1]!) : 0;
    for (let b = 0; b < BUCKETS; b++) {
      const t = ((b + 1) / BUCKETS) * total;
      if (t > last + total / BUCKETS) { out.push(NaN); continue; }
      while (i < plays.length && at(plays[i]!) <= t) { diff = plays[i]!.away - plays[i]!.home; i++; }
      out.push(diff);
    }
    return out;
  }, [plays, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(5, ...series.filter((v) => !Number.isNaN(v)).map(Math.abs));
  const biggest = (sd: Side) => Math.max(0, ...plays.map((p) => (sd === 'away' ? p.away - p.home : p.home - p.away)));
  const H = 56;
  return (
    <Animated.View entering={FadeInDown.delay(60).duration(260)} style={card}>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Vantagem ao longo do jogo</Text>
        <Text style={[styles.small, { color: colors.textMuted }]}>máx. {max}</Text>
      </View>
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} /><Text style={[styles.small, { color: colors.textSecondary }]}>{nick(g.away.name)} · maior vantagem {biggest('away')}</Text>
      </View>
      <View style={[styles.chart, { height: H * 2 + 2 }]}>
        {series.map((v, i) => (
          <View key={i} style={styles.chartCol}>
            <View style={{ height: H, justifyContent: 'flex-end' }}>
              {!Number.isNaN(v) && v > 0 ? <View style={{ backgroundColor: colors.primary, height: (v / max) * H, borderTopLeftRadius: 1, borderTopRightRadius: 1 }} /> : null}
            </View>
            <View style={{ backgroundColor: colors.border, height: 2 }} />
            <View style={{ height: H }}>
              {!Number.isNaN(v) && v < 0 ? <View style={{ backgroundColor: colors.info, height: (-v / max) * H, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 }} /> : null}
            </View>
          </View>
        ))}
        {[1, 2, 3].map((k) => <View key={k} style={[styles.qMark, { left: `${(k * PERIOD_SECS / total) * 100}%`, backgroundColor: colors.border }]} />)}
      </View>
      <View style={styles.rowBetween}>
        {['Q1', 'Q2', 'Q3', 'Q4'].map((l) => <Text key={l} style={[styles.small, { color: colors.textMuted }]}>{l}</Text>)}
      </View>
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: colors.info }]} /><Text style={[styles.small, { color: colors.textSecondary }]}>{nick(g.home.name)} · maior vantagem {biggest('home')}</Text>
      </View>
    </Animated.View>
  );
}

// ── Jogadores ───────────────────────────────────────────────────────────────
function Players({ g, onOpen }: { g: BasketballGame; onOpen: (p: BasketballPlayerLine) => void }) {
  const { colors } = useTheme();
  const card = useCard();
  const [side, setSide] = useState<Side | 'both'>('both');
  const list = (g.players ?? []).filter((p) => p.played && (side === 'both' || p.side === side)).sort((a, b) => b.points - a.points);
  if (!g.players?.length) return <Text style={[styles.empty, { color: colors.textMuted }]}>As estatísticas aparecem quando o jogo começar.</Text>;
  return (
    <>
      <View style={[styles.sidePick, { backgroundColor: colors.surface }]}>
        {([['away', g.away], ['both', null], ['home', g.home]] as const).map(([k, t]) => (
          <Pressable key={k} onPress={() => setSide(k)} style={[styles.sideBtn, side === k && { backgroundColor: colors.background }]}>
            {t ? <TeamBadge imageUrl={t.logo} name={t.name} size={22} /> : <View style={styles.both}><TeamBadge imageUrl={g.away.logo} name={g.away.name} size={18} /><Text style={{ color: colors.textMuted }}>+</Text><TeamBadge imageUrl={g.home.logo} name={g.home.name} size={18} /></View>}
          </Pressable>
        ))}
      </View>
      <View style={card}>
        <View style={styles.pRow}>
          <Text style={[styles.pName, styles.small, { color: colors.textMuted }]}>Jogador</Text>
          {['MIN', 'PTS', 'RES', 'AST'].map((h) => <Text key={h} style={[styles.pStat, styles.small, { color: h === 'PTS' ? colors.primary : colors.textMuted }]}>{h}</Text>)}
        </View>
        {list.map((p) => (
          <Pressable key={`${p.side}-${p.name}`} onPress={() => onOpen(p)} style={[styles.pRow, styles.pLine, { borderTopColor: colors.border }]}>
            <View style={[styles.pName, styles.pWho]}>
              <Face p={p} g={g} size={36} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.pTitle, { color: colors.textPrimary }]}>{p.shortName ?? p.name}</Text>
                <Text style={[styles.small, { color: colors.textMuted }]}>{[p.jersey, p.position].filter(Boolean).join(' ')}{p.starter ? ' · titular' : ''}</Text>
              </View>
            </View>
            <Text style={[styles.pStat, { color: colors.textSecondary }]}>{p.minutes ?? '–'}</Text>
            <Text style={[styles.pStat, styles.bold, { color: colors.textPrimary }]}>{p.points}</Text>
            <Text style={[styles.pStat, { color: colors.textSecondary }]}>{p.rebounds}</Text>
            <Text style={[styles.pStat, { color: colors.textSecondary }]}>{p.assists}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.small, styles.center, { color: colors.textMuted }]}>Toca num jogador para ver todas as estatísticas.</Text>
    </>
  );
}

/** Player face with the team crest in the corner. */
function Face({ p, g, size }: { p: BasketballPlayerLine; g: BasketballGame; size: number }) {
  const { colors } = useTheme();
  const team = g[p.side];
  return (
    <View style={{ height: size, width: size }}>
      {p.headshot ? (
        <Image cachePolicy="memory-disk" contentFit="cover" source={{ uri: p.headshot }} style={{ backgroundColor: colors.background, borderRadius: size / 2, height: size, width: size }} />
      ) : (
        <View style={{ alignItems: 'center', backgroundColor: colors.background, borderRadius: size / 2, height: size, justifyContent: 'center', width: size }}>
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter_700Bold', fontSize: size / 3 }}>{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</Text>
        </View>
      )}
      <View style={[styles.faceCrest, { backgroundColor: colors.surface }]}><TeamBadge imageUrl={team.logo} name={team.name} size={size / 2.6} /></View>
    </View>
  );
}

function PlayerSheet({ p, g, onClose }: { p: BasketballPlayerLine; g: BasketballGame; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const fg = madeAtt(p.fg); const three = madeAtt(p.threePt); const ft = madeAtt(p.ft);
  const two = { m: fg.m - three.m, a: fg.a - three.a };
  const shot = (x: { m: number; a: number }) => `${x.m}/${x.a}${x.a ? ` (${Math.round((x.m / x.a) * 100)}%)` : ''}`;
  const groups: Array<Array<[string, string | number]>> = [
    [['Minutos', p.minutes ?? '–'], ['Pontos', p.points]],
    [['Lances livres', shot(ft)], ['2 pontos', shot(two)], ['3 pontos', shot(three)], ['Lançamentos de campo', shot(fg)]],
    [['Ressaltos', p.rebounds], ['Defensivos', p.defReb ?? '–'], ['Ofensivos', p.offReb ?? '–']],
    [['Assistências', p.assists], ['Perdas de bola', p.turnovers], ['Roubos de bola', p.steals], ['Desarmes', p.blocks], ['Faltas pessoais', p.fouls ?? '–'], ['+/-', p.plusMinus ?? '–']],
  ];
  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <Pressable feedback="none" onPress={onClose} style={styles.backdrop} />
      <Animated.View entering={SlideInDown.springify().damping(20)} style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />
        <View style={styles.sheetHead}>
          <Face g={g} p={p} size={72} />
          <View style={styles.flex}>
            <Text style={[styles.sheetName, { color: colors.textPrimary }]}>{p.name}</Text>
            <Text style={[styles.small, { color: colors.textMuted }]}>{nick(g[p.side].name)}{p.position ? ` · ${p.position}` : ''}{p.jersey ? ` · #${p.jersey}` : ''}</Text>
          </View>
          <Text style={[styles.sheetPts, { color: colors.primary }]}>{p.points}<Text style={[styles.small, { color: colors.textMuted }]}> pts</Text></Text>
        </View>
        <ScrollView style={styles.sheetScroll}>
          {groups
            .map((rows) => rows.filter(([, v]) => v !== '–'))
            .filter((rows, gi) => rows.length && !(gi === 1 && p.fg === undefined))
            .map((rows, gi) => (
            <View key={gi} style={[styles.sheetGroup, gi > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              {rows.map(([k, v]) => (
                <View key={k} style={styles.rowBetween}>
                  <Text style={[styles.sheetLabel, { color: colors.textSecondary }]}>{k}</Text>
                  <Text style={[styles.sheetVal, { color: colors.textPrimary }]}>{v}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ── Estatísticas ────────────────────────────────────────────────────────────
function Stats({ g }: { g: BasketballGame }) {
  const { colors } = useTheme();
  const card = useCard();
  const t = g.teamStats;
  if (!t) return <Text style={[styles.empty, { color: colors.textMuted }]}>As estatísticas aparecem quando o jogo começar.</Text>;
  const shooting: Array<[string, string, string]> = [
    ['Lances livres', 'freeThrowsMade-freeThrowsAttempted', 'freeThrowPct'],
    ['3 pontos', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointFieldGoalPct'],
    ['Lançamentos de campo', 'fieldGoalsMade-fieldGoalsAttempted', 'fieldGoalPct'],
  ];
  const bars: Array<[string, string, boolean?]> = [
    ['Ressaltos', 'totalRebounds'], ['Ressaltos defensivos', 'defensiveRebounds'], ['Ressaltos ofensivos', 'offensiveRebounds'],
    ['Assistências', 'assists'], ['Perdas de bola', 'turnovers', true], ['Roubos de bola', 'steals'], ['Desarmes', 'blocks'],
    ['Faltas', 'fouls', true], ['Pontos na área', 'pointsInPaint'], ['Contra-ataque', 'fastBreakPoints'], ['Pontos de perdas de bola', 'turnoverPoints'], ['Maior vantagem', 'largestLead'],
  ];
  return (
    <>
      <View style={card}>
        <View style={styles.rowBetween}>
          <TeamBadge imageUrl={g.away.logo} name={g.away.name} size={22} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Lançamentos</Text>
          <TeamBadge imageUrl={g.home.logo} name={g.home.name} size={22} />
        </View>
        {shooting.map(([label, ma, p]) => {
          const a = pct(t.away[p]); const h = pct(t.home[p]);
          return (
            <View key={label} style={styles.shootRow}>
              <Text style={[styles.shootMa, { color: colors.textSecondary }]}>{(t.away[ma] ?? '').replace('-', '/')}</Text>
              <Ring color={a >= h ? colors.primary : colors.border} value={a} />
              <Text style={[styles.shootLabel, { color: colors.textMuted }]}>{label}</Text>
              <Ring color={h >= a ? colors.info : colors.border} value={h} />
              <Text style={[styles.shootMa, styles.right, { color: colors.textSecondary }]}>{(t.home[ma] ?? '').replace('-', '/')}</Text>
            </View>
          );
        })}
      </View>
      <View style={card}>
        {bars.map(([label, key, lower]) => {
          const a = Number(t.away[key] ?? 0); const h = Number(t.home[key] ?? 0);
          if (!a && !h) return null;
          const tot = a + h || 1;
          const aBetter = lower ? a < h : a > h; const hBetter = lower ? h < a : h > a;
          return (
            <View key={key} style={styles.cmp}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cmpVal, { color: aBetter ? colors.textPrimary : colors.textSecondary }]}>{a}</Text>
                <Text style={[styles.small, { color: colors.textMuted }]}>{label}</Text>
                <Text style={[styles.cmpVal, { color: hBetter ? colors.textPrimary : colors.textSecondary }]}>{h}</Text>
              </View>
              <View style={styles.cmpBar}>
                <View style={[styles.cmpHalf, styles.cmpLeft, { backgroundColor: colors.background }]}><View style={{ backgroundColor: aBetter ? colors.primary : colors.border, borderRadius: 3, width: `${(a / tot) * 100}%` }} /></View>
                <View style={[styles.cmpHalf, { backgroundColor: colors.background }]}><View style={{ backgroundColor: hBetter ? colors.info : colors.border, borderRadius: 3, width: `${(h / tot) * 100}%` }} /></View>
              </View>
            </View>
          );
        })}
        {t.away.leadChanges ? <Text style={[styles.small, styles.center, { color: colors.textMuted }]}>{t.away.leadChanges} trocas de liderança</Text> : null}
      </View>
    </>
  );
}

/** Percentage ring made of a track and a filled arc approximation (4 quarter borders). */
function Ring({ value, color }: { value: number; color: string }) {
  const { colors } = useTheme();
  const q = (n: number) => (value >= n * 25 ? color : 'transparent');
  return (
    <View style={styles.ring}>
      <View style={[styles.ringTrack, { borderColor: colors.background }]} />
      <View style={[styles.ringTrack, { borderTopColor: q(1), borderRightColor: q(2), borderBottomColor: q(3), borderLeftColor: q(4) === 'transparent' && value > 87 ? color : q(4), borderColor: 'transparent', transform: [{ rotate: '45deg' }] }]} />
      <Text style={[styles.ringText, { color: colors.textPrimary }]}>{Math.round(value)}%</Text>
    </View>
  );
}

// ── Jogadas ─────────────────────────────────────────────────────────────────
function Plays({ g }: { g: BasketballGame }) {
  const { colors } = useTheme();
  const card = useCard();
  const plays = [...(g.scoring ?? [])].reverse();
  if (!plays.length) return <Text style={[styles.empty, { color: colors.textMuted }]}>As jogadas aparecem quando o jogo começar.</Text>;
  const byPeriod = new Map<number, typeof plays>();
  for (const p of plays) byPeriod.set(p.period, [...(byPeriod.get(p.period) ?? []), p]);
  return (
    <>
      {[...byPeriod.entries()].map(([period, list]) => (
        <View key={period} style={card}>
          <Text style={[styles.periodHead, { color: colors.live }]}>{periodName(period)} · {list[0]!.away}-{list[0]!.home}</Text>
          {list.map((p, i) => {
            const away = p.side === 'away';
            const who = p.text.replace(/ makes .*$/i, '').replace(/^(\w)\w+ /, '$1. ');
            const badge = <View style={[styles.ptsBadge, { backgroundColor: colors.background }]}><Text style={[styles.ptsText, { color: away ? colors.primary : colors.info }]}>{p.points}</Text></View>;
            return (
              <View key={i} style={[styles.playRow, { flexDirection: away ? 'row' : 'row-reverse' }]}>
                <Text style={[styles.playClock, { color: colors.textSecondary, textAlign: away ? 'left' : 'right' }]}>{clockText(p.clock)}</Text>
                {badge}
                <Text style={[styles.playScore, { color: colors.textPrimary }]}>{p.away} - {p.home}</Text>
                <Text numberOfLines={1} style={[styles.playWho, { color: colors.textSecondary, textAlign: away ? 'left' : 'right' }]}>{who}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  flex: { flex: 1 },
  bold: { fontFamily: 'Inter_700Bold' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  iconBtn: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  leagueTop: { color: '#E8E8EE', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  scoreRow: { alignItems: 'center', flexDirection: 'row', paddingBottom: 18, paddingHorizontal: 12 },
  teamHead: { alignItems: 'center', flex: 1, gap: 8 },
  teamName: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 },
  scoreMid: { alignItems: 'center', minWidth: 130 },
  bigScore: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 40 },
  kickoff: { color: '#FFFFFF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30 },
  liveRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  status: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  statusMuted: { color: '#C9C9D2', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  tabs: { alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', width: '100%' },
  tab: { alignItems: 'center', flexBasis: 0, flexGrow: 1, paddingVertical: 12 },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  tabLine: { borderRadius: 2, bottom: 0, height: 3, left: '15%', position: 'absolute', right: '15%' },
  card: { borderRadius: 20, gap: 10, padding: 14 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  empty: { fontFamily: 'Inter_500Medium', fontSize: 14, padding: 24, textAlign: 'center' },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  qRow: { alignItems: 'center', flexDirection: 'row', paddingVertical: 8 },
  qTeam: { width: 40 },
  qHead: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center' },
  qCell: { flex: 1, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, textAlign: 'center' },
  legend: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  chart: { flexDirection: 'row', position: 'relative' },
  chartCol: { flex: 1, marginHorizontal: 0.4 },
  qMark: { bottom: 0, position: 'absolute', top: 0, width: 1 },
  sidePick: { borderRadius: 999, flexDirection: 'row', padding: 4 },
  sideBtn: { alignItems: 'center', borderRadius: 999, flex: 1, paddingVertical: 8 },
  both: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  pRow: { alignItems: 'center', flexDirection: 'row', paddingVertical: 6 },
  pLine: { borderTopWidth: StyleSheet.hairlineWidth },
  pName: { flex: 1 },
  pWho: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  pTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  pStat: { fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center', width: 38 },
  faceCrest: { alignItems: 'center', borderRadius: 8, bottom: -2, justifyContent: 'center', padding: 1, position: 'absolute', right: -4 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1 },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, bottom: 0, left: 0, maxHeight: '85%', paddingHorizontal: 18, paddingTop: 8, position: 'absolute', right: 0 },
  grab: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: 12, width: 40 },
  sheetHead: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingBottom: 12 },
  sheetName: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  sheetPts: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28 },
  sheetScroll: { flexGrow: 0 },
  sheetGroup: { gap: 12, paddingVertical: 14 },
  sheetLabel: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  sheetVal: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  shootRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  shootMa: { fontFamily: 'Inter_600SemiBold', fontSize: 13, width: 44 },
  shootLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'center' },
  ring: { alignItems: 'center', height: 54, justifyContent: 'center', width: 54 },
  ringTrack: { borderRadius: 27, borderWidth: 4, height: 54, position: 'absolute', width: 54 },
  ringText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  cmp: { gap: 6 },
  cmpVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  cmpBar: { flexDirection: 'row', gap: 4, height: 6 },
  cmpHalf: { borderRadius: 3, flex: 1, overflow: 'hidden' },
  cmpLeft: { alignItems: 'flex-end' },
  periodHead: { fontFamily: 'Inter_700Bold', fontSize: 13, textAlign: 'center' },
  playRow: { alignItems: 'center', gap: 10, paddingVertical: 4 },
  playClock: { fontFamily: 'Inter_600SemiBold', fontSize: 12, width: 40 },
  ptsBadge: { alignItems: 'center', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  ptsText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  playScore: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14 },
  playWho: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
});
