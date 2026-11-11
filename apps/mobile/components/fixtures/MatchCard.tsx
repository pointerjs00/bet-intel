import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ItemResult } from '@betintel/shared';
import type { FootballMatch, SimpleMatch, SportKey } from '../../services/sportsService';
import { PressableScale } from '../ui/PressableScale';
import { TeamBadge } from '../ui/TeamBadge';
import { LiveDot } from '../ui/Appear';
import { useCardElevation } from '../ui/ListCard';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';
import type { MatchBet } from '../../utils/dayBets';
import { parseSetLine, setWinner, setsWon } from '../../utils/tennisSets';

export type AnyMatch = FootballMatch | SimpleMatch;

export const isLive = (m: { status: string }) => m.status === 'LIVE' || m.status === 'HALFTIME';
export const isDone = (m: { status: string }) => m.status === 'FINISHED' || m.status === 'RETIRED' || m.status === 'WALKOVER';

/** Status text and colour for a match (time, minute, FT, Adiado…). */
export function matchStatus(m: AnyMatch, sport: SportKey, colors: ReturnType<typeof useTheme>['colors']): { time: string; label: string; color: string; live: boolean } {
  const live = isLive(m);
  const time = new Date(m.kickoffAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  if (live) return { time, label: m.status === 'HALFTIME' ? 'INT' : sport === 'tennis' ? 'AO VIVO' : m.statusDetail || 'AO VIVO', color: colors.live, live };
  if (isDone(m)) return { time, label: m.status === 'RETIRED' ? 'DESIST.' : m.status === 'WALKOVER' ? 'W.O.' : 'FT', color: colors.textMuted, live };
  if (m.status === 'POSTPONED') return { time, label: 'ADIADO', color: colors.warning, live };
  if (m.status === 'CANCELLED') return { time, label: 'CANCEL.', color: colors.negative, live };
  return { time, label: '', color: colors.textMuted, live };
}

/** Colour of the user's bet on a match (won / lost / live / pending). */
export function betTone(bet: MatchBet | 'unknown' | null, live: boolean, colors: ReturnType<typeof useTheme>['colors']): string {
  if (!bet) return 'transparent';
  if (bet !== 'unknown' && bet.result === ItemResult.WON) return colors.positive;
  if (bet !== 'unknown' && bet.result === ItemResult.LOST) return colors.negative;
  return live ? colors.info : colors.warning;
}

interface MatchCardProps {
  match: AnyMatch;
  sport: SportKey;
  bet: MatchBet | 'unknown' | null;
  index?: number;
  onPress?: () => void;
}

/**
 * One match as its own elevated card (Sofascore/Flashscore density): time + status tile, two team
 * lines with crest and score, the winner in bold. A bet tints the card edge, adds the selection
 * chip under the teams and a result seal on the right.
 */
export const MatchCard = React.memo(function MatchCard({ match: m, sport, bet, index = 0, onPress }: MatchCardProps) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const st = matchStatus(m, sport, colors);
  const done = isDone(m);
  const known = bet && bet !== 'unknown' ? bet : null;
  const tone = betTone(bet, st.live, colors);
  const red = 'redCards' in m ? m.redCards : null;
  const nba = sport === 'basketball';
  const rows = nba
    ? [{ name: m.away.name, score: m.score?.away, other: m.score?.home, reds: 0, at: false }, { name: m.home.name, score: m.score?.home, other: m.score?.away, reds: 0, at: true }]
    : [{ name: m.home.name, score: m.score?.home, other: m.score?.away, reds: red?.home ?? 0, at: false }, { name: m.away.name, score: m.score?.away, other: m.score?.home, reds: red?.away ?? 0, at: false }];
  const showScore = Boolean(m.score) && (st.live || done);
  const postponed = m.status === 'POSTPONED' || m.status === 'CANCELLED';

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 28).duration(240)}>
      <PressableScale
        accessibilityLabel={`${m.home.name} contra ${m.away.name}${showScore ? `, ${m.score!.home}-${m.score!.away}` : ''}${bet ? ', tens aposta' : ''}`}
        disabled={!onPress}
        onPress={onPress}
        scaleDown={0.985}
        style={[styles.card, elevation, { backgroundColor: colors.surface, borderColor: bet ? `${tone}66` : colors.border }]}
      >
        <View style={[styles.tile, { backgroundColor: colors.background }]}>
          {postponed ? <Ionicons color={st.color} name="calendar-outline" size={16} /> : <Text style={[styles.time, { color: colors.textPrimary }]}>{st.time}</Text>}
          {st.label ? (
            <View style={styles.statusRow}>
              {st.live ? <LiveDot color={colors.live} size={5} /> : null}
              <Text numberOfLines={1} style={[styles.status, { color: st.color }]}>{st.label}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.teams}>
          {sport === 'tennis' ? <TennisRows match={m} live={st.live} done={done} /> : rows.map((r) => {
            const won = done && r.score != null && r.other != null && r.score > r.other;
            const lost = done && r.score != null && r.other != null && r.score < r.other;
            return (
              <View key={`${r.name}-${r.at}`} style={styles.teamRow}>
                <TeamBadge name={r.name} size={20} variant="team" />
                <Text numberOfLines={1} style={[styles.team, { color: lost ? colors.textSecondary : colors.textPrimary, fontFamily: won ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
                  {r.at ? '@ ' : ''}{r.name}
                </Text>
                {r.reds > 0 ? <View style={[styles.redCard, { backgroundColor: colors.live }]} /> : null}
                {showScore ? (
                  <Text style={[styles.score, { color: st.live ? colors.live : lost ? colors.textSecondary : colors.textPrimary }]}>{r.score}</Text>
                ) : null}
              </View>
            );
          })}
          {known ? (
            <View style={[styles.chip, { backgroundColor: `${tone}1A` }]}>
              <View style={[styles.dot, { backgroundColor: tone }]} />
              <Text numberOfLines={1} style={[styles.chipText, { color: colors.textPrimary }]}>{known.selection}</Text>
              <Text style={[styles.chipOdd, { color: colors.textSecondary }]}>{known.odd.toFixed(2)}</Text>
              {known.legs > 1 ? <Text style={[styles.chipOdd, { color: colors.textSecondary }]}>· {known.wonLegs}/{known.legs}</Text> : null}
            </View>
          ) : null}
        </View>

        {bet ? (
          <View style={styles.seal}>
            <View style={[styles.sealDot, { backgroundColor: known && known.result !== ItemResult.PENDING ? tone : `${tone}2E` }]}>
              {known?.result === ItemResult.WON ? <Ionicons color="#06110B" name="checkmark" size={14} />
                : known?.result === ItemResult.LOST ? <Ionicons color="#2A0E14" name="close" size={14} />
                : <Ionicons color={tone} name="receipt" size={12} />}
            </View>
            {known && known.profit !== null && known.legs === 1 ? (
              <Text style={[styles.sealText, { color: tone }]}>{known.profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(known.profit)).replace(/,00(?=\s?€)/, '')}</Text>
            ) : null}
          </View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
});

/**
 * Tennis score in Sofascore style: per player, the server ball, sets won, the games of every set
 * (set winner bright, current set highlighted) and the point score while live.
 */
export function TennisRows({ match: m, live, done, big = false }: { match: AnyMatch; live: boolean; done: boolean; big?: boolean }) {
  const { colors } = useTheme();
  const sm = m as SimpleMatch;
  const sets = sm.sets?.length ? sm.sets : parseSetLine('line' in m ? m.line : null);
  const won = setsWon(sets);
  const started = sets.length > 0 && (live || done);
  const winner = done ? (won.home > won.away ? 'home' : won.away > won.home ? 'away' : null) : null;
  const points = live ? sm.points ?? null : null;
  const sides = [
    { key: 'home' as const, name: m.home.name, sw: won.home, games: (s: { a: number; b: number }) => s.a, mine: 'A' as const },
    { key: 'away' as const, name: m.away.name, sw: won.away, games: (s: { a: number; b: number }) => s.b, mine: 'B' as const },
  ];
  return (
    <>
      {sides.map((p) => {
        const lost = winner !== null && winner !== p.key;
        return (
          <View key={p.key} style={styles.teamRow}>
            <TeamBadge name={p.name} size={big ? 28 : 20} variant="player" />
            <Text numberOfLines={1} style={[styles.team, big && styles.teamBig, { color: lost ? colors.textSecondary : colors.textPrimary, fontFamily: winner === p.key ? 'Inter_700Bold' : 'Inter_500Medium' }]}>{p.name}</Text>
            {live && sm.server === p.key ? <View style={[styles.serve, { backgroundColor: colors.gold }]} /> : null}
            {started ? (
              <View style={styles.tScores}>
                <Text style={[styles.tSets, big && styles.tSetsBig, { color: live ? colors.positive : lost ? colors.textSecondary : colors.textPrimary }]}>{p.sw}</Text>
                {sets.map((s, i) => {
                  const current = live && i === sets.length - 1 && setWinner(s) === null;
                  const tookIt = setWinner(s) === p.mine;
                  return (
                    <Text key={i} style={[styles.tGames, big && styles.tGamesBig, current && { backgroundColor: `${colors.live}1F`, color: colors.live }, !current && { color: tookIt ? colors.textPrimary : colors.textMuted }]}>{p.games(s)}</Text>
                  );
                })}
                {points ? <Text style={[styles.tPoints, { color: colors.positive }]}>{p.key === 'home' ? points.home : points.away}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  serve: { borderRadius: 3.5, height: 7, width: 7 },
  teamBig: { fontSize: 16 },
  tSetsBig: { fontSize: 20 },
  tGamesBig: { fontSize: 15, minWidth: 22 },
  tScores: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  tSets: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, marginRight: 4, minWidth: 14, textAlign: 'center' },
  tGames: { borderRadius: 5, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, minWidth: 18, paddingVertical: 1, textAlign: 'center' },
  tPoints: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, marginLeft: 4, minWidth: 22, textAlign: 'center' },
  card: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 10, paddingVertical: 10 },
  tile: { alignItems: 'center', borderRadius: 12, gap: 3, justifyContent: 'center', minHeight: 56, width: 54 },
  time: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  status: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.3 },
  teams: { flex: 1, gap: 7 },
  teamRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  team: { flex: 1, fontSize: 14 },
  redCard: { borderRadius: 1.5, height: 11, width: 8 },
  score: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, minWidth: 18, textAlign: 'right' },
  line: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  chip: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, flexDirection: 'row', gap: 6, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4 },
  dot: { borderRadius: 3, height: 6, width: 6 },
  chipText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  chipOdd: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  seal: { alignItems: 'center', gap: 3, width: 42 },
  sealDot: { alignItems: 'center', borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  sealText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
});
