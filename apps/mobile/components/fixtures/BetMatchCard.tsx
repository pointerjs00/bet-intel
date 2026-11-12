import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ItemResult } from '@betintel/shared';
import { useBasketballGame, useFootballMatch, useTennisMatch, type SportKey } from '../../services/sportsService';
import { PressableScale } from '../ui/PressableScale';
import { TeamBadge } from '../ui/TeamBadge';
import { LiveDot } from '../ui/Appear';
import { useCardElevation } from '../ui/ListCard';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import type { MatchBet } from '../../utils/dayBets';
import { betTone, isDone, matchStatus, TennisRows, type AnyMatch } from './MatchCard';
import { setsWon } from '../../utils/tennisSets';
import { ProvisionalLine } from './ProvisionalLine';

function stateLabel(bet: MatchBet | 'unknown', live: boolean, done: boolean): string {
  if (bet === 'unknown') return live ? 'EM JOGO' : done ? 'A RESOLVER' : 'COM APOSTA';
  if (done && bet.result === ItemResult.PENDING) return 'A RESOLVER';
  if (bet.result === ItemResult.WON) return 'CERTA';
  if (bet.result === ItemResult.LOST) return 'FALHADA';
  if (bet.result === ItemResult.VOID) return 'ANULADA';
  return live ? 'EM JOGO' : 'POR COMEÇAR';
}

/**
 * Featured card for a match the user bet on: sport + league + status, both teams with big scores,
 * and the bet block (selection, market, odd, state, profit or multiple progress).
 */
export function BetMatchCard({ match: m, sport, league, bet, index = 0, onPress }: { match: AnyMatch; sport: SportKey; league: string; bet: MatchBet | 'unknown'; index?: number; onPress?: () => void }) {
  const { colors, isDark } = useTheme();
  const elevation = useCardElevation();
  const st = matchStatus(m, sport, colors);
  const done = isDone(m);
  const tone = betTone(bet, st.live, colors);
  const known = bet !== 'unknown' ? bet : null;
  const nba = sport === 'basketball';
  const rows = nba
    ? [{ name: m.away.name, score: m.score?.away, other: m.score?.home, at: false }, { name: m.home.name, score: m.score?.home, other: m.score?.away, at: true }]
    : [{ name: m.home.name, score: m.score?.home, other: m.score?.away, at: false }, { name: m.away.name, score: m.score?.away, other: m.score?.home, at: false }];
  const showScore = Boolean(m.score) && (st.live || done);
  const sportIcon = sport === 'football' ? <Ionicons color={colors.textSecondary} name="football" size={13} />
    : sport === 'basketball' ? <Ionicons color={colors.textSecondary} name="basketball" size={13} />
    : <MaterialCommunityIcons color={colors.textSecondary} name="tennis" size={13} />;
  const grad: [string, string] = isDark ? [`${tone}26`, colors.surface] : [`${tone}1F`, colors.surface];

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(320).springify().damping(18)} style={[styles.wrap, elevation]}>
      <PressableScale disabled={!onPress} onPress={onPress} scaleDown={0.985} style={styles.press}>
        <LinearGradient colors={grad} end={{ x: 0.9, y: 1 }} start={{ x: 0, y: 0 }} style={[styles.card, { borderColor: `${tone}55` }]}>
          <View style={styles.head}>
            {sportIcon}
            <Text numberOfLines={1} style={[styles.league, { color: colors.textSecondary }]}>{league}</Text>
            <View style={[styles.statusPill, { backgroundColor: st.live ? `${colors.live}22` : colors.background }]}>
              {st.live ? <LiveDot color={colors.live} size={5} /> : null}
              <Text style={[styles.statusText, { color: st.live ? colors.live : colors.textSecondary }]}>{st.label === 'FT' ? 'Terminado' : st.label || st.time}</Text>
            </View>
          </View>

          <View style={styles.teams}>
            {sport === 'tennis' ? <TennisRows big done={done} live={st.live} match={m} /> : rows.map((r) => {
              const won = done && r.score != null && r.other != null && r.score > r.other;
              const lost = done && r.score != null && r.other != null && r.score < r.other;
              return (
                <View key={`${r.name}-${r.at}`} style={styles.teamRow}>
                  <TeamBadge name={r.name} size={28} variant="team" />
                  <Text numberOfLines={1} style={[styles.team, { color: lost ? colors.textSecondary : colors.textPrimary, fontFamily: won ? 'Inter_700Bold' : 'Inter_600SemiBold' }]}>{r.name}</Text>
                  {showScore ? <Text style={[styles.score, { color: st.live ? colors.live : lost ? colors.textSecondary : colors.textPrimary }]}>{r.score}</Text> : null}
                </View>
              );
            })}
          </View>

          <View style={[styles.bet, { backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(15,23,42,0.05)' }]}>
            <View style={styles.betMain}>
              <Text numberOfLines={1} style={[styles.market, { color: colors.textMuted }]}>{known ? known.market.toUpperCase() : 'APOSTA'}</Text>
              <Text numberOfLines={2} style={[styles.selection, { color: colors.textPrimary }]}>{known ? known.selection : 'Tens aposta neste jogo'}</Text>
            </View>
            {known ? <Text style={[styles.odd, { color: colors.gold }]}>{formatOdds(known.odd)}</Text> : null}
          </View>

          {st.live && known && known.result === ItemResult.PENDING ? <ProvisionalLine boletinId={known.boletinId} compact /> : null}
          <View style={styles.foot}>
            <View style={[styles.state, { backgroundColor: `${tone}22` }]}>
              <Text style={[styles.stateText, { color: tone }]}>{stateLabel(bet, st.live, done)}</Text>
            </View>
            {known && known.legs > 1 ? (
              <View style={styles.legs}>
                {Array.from({ length: known.legs }, (_, i) => (
                  <View key={i} style={[styles.leg, { backgroundColor: i < known.wonLegs ? colors.positive : colors.border }]} />
                ))}
                <Text style={[styles.legsText, { color: colors.textSecondary }]}>Múltipla {known.wonLegs}/{known.legs}{known.profit !== null ? (known.profit >= 0 ? ' · ganha' : ' · perdida') : ''}</Text>
              </View>
            ) : <View style={styles.flex} />}
            {known && known.profit !== null ? (
              <Text style={[styles.profit, { color: known.profit >= 0 ? colors.positive : colors.negative }]}>{known.profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(known.profit))}</Text>
            ) : null}
          </View>
        </LinearGradient>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 22 },
  press: { borderRadius: 22 },
  card: { borderRadius: 22, borderWidth: 1, gap: 14, padding: 16 },
  head: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  league: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  statusPill: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  teams: { gap: 10 },
  teamRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  team: { flex: 1, fontSize: 16 },
  score: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, minWidth: 24, textAlign: 'right' },
  bet: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  betMain: { flex: 1, gap: 2 },
  market: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.5 },
  selection: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  odd: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17 },
  foot: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  state: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  stateText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.5 },
  flex: { flex: 1 },
  legs: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 3 },
  leg: { borderRadius: 2, height: 6, width: 14 },
  legsText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginLeft: 4 },
  profit: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17 },
});

/**
 * BetMatchCard that, while its match is live (or about to start), follows the same per-match feed
 * as the match screen, so the score and status refresh at the same pace (20–30 s).
 */
export function LiveBetMatchCard(props: { match: AnyMatch; sport: SportKey; league: string; slug: string; date: string; bet: MatchBet | 'unknown'; index?: number; onPress?: () => void }) {
  const m = props.match;
  const soon = new Date(m.kickoffAt).getTime() - Date.now() < 15 * 60 * 1000;
  const active = (isLiveStatus(m.status) || (m.status === 'SCHEDULED' && soon)) && !isDone(m);
  if (!active) return <BetMatchCard {...props} />;
  if (props.sport === 'football') return <FootballLive {...props} />;
  if (props.sport === 'basketball') return <BasketballLive {...props} />;
  return <TennisLive {...props} />;
}

const isLiveStatus = (s: string) => s === 'LIVE' || s === 'HALFTIME';

type LiveProps = Parameters<typeof LiveBetMatchCard>[0];

function FootballLive(p: LiveProps) {
  const q = useFootballMatch(p.slug, p.match.providerMatchId);
  const d = q.data;
  const match = d ? { ...p.match, status: d.status, statusDetail: d.statusDetail, score: d.score } as AnyMatch : p.match;
  return <BetMatchCard {...p} match={match} />;
}
function BasketballLive(p: LiveProps) {
  const q = useBasketballGame(p.match.providerMatchId);
  const d = q.data;
  const match = d ? { ...p.match, status: d.status, statusDetail: d.statusDetail, score: d.score } as AnyMatch : p.match;
  return <BetMatchCard {...p} match={match} />;
}
function TennisLive(p: LiveProps) {
  const q = useTennisMatch(p.match.providerMatchId, p.date);
  const d = q.data;
  const sets = d ? (d.live?.sets.length ? d.live.sets : d.sets) : null;
  const match = d && sets
    ? { ...p.match, status: d.status, statusDetail: d.statusDetail, score: sets.length ? setsWon(sets) : null, sets, points: d.live?.pointsA != null && d.live?.pointsB != null ? { home: d.live.pointsA, away: d.live.pointsB } : null, server: d.live?.server === 'A' ? 'home' : d.live?.server === 'B' ? 'away' : null } as AnyMatch
    : p.match;
  return <BetMatchCard {...p} match={match} />;
}
