import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { BoletinDetail } from '@betintel/shared';
import { ItemResult } from '@betintel/shared';
import type { ItemMatch } from '../../services/sportsService';
import { PressableScale } from '../ui/PressableScale';
import { TeamBadge } from '../ui/TeamBadge';
import { useCardElevation } from '../ui/ListCard';
import { useTheme } from '../../theme/useTheme';
import { formatOdds } from '../../utils/formatters';

type Item = BoletinDetail['items'][number];

const LIVE = new Set(['LIVE', 'HALFTIME']);

/**
 * One game of a boletim: league + state, both teams with the real score, the selection with its
 * market and odd, and a coloured edge / tag for the outcome. Tapping opens the game.
 */
export function LegCard({ item, match, index, onPress }: { item: Item; match?: ItemMatch | null; index: number; onPress?: () => void }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const tone = item.result === ItemResult.WON ? colors.positive : item.result === ItemResult.LOST ? colors.negative : item.result === ItemResult.VOID ? colors.textMuted : colors.warning;
  const tag = item.result === ItemResult.WON ? 'CERTA' : item.result === ItemResult.LOST ? 'FALHADA' : item.result === ItemResult.VOID ? 'ANULADA' : match && LIVE.has(match.status) ? 'AO VIVO' : 'PENDENTE';
  const live = Boolean(match && LIVE.has(match.status));
  const s = match?.score ?? null;
  // NBA lists the away team first ("Knicks @ Bulls").
  const nba = item.sport === 'BASKETBALL';
  const rows = nba
    ? [{ name: item.awayTeam, score: s?.away, other: s?.home, at: false }, { name: item.homeTeam, score: s?.home, other: s?.away, at: true }]
    : [{ name: item.homeTeam, score: s?.home, other: s?.away, at: false }, { name: item.awayTeam, score: s?.away, other: s?.home, at: false }];
  const state = match
    ? live ? match.statusDetail || 'Ao vivo' : match.status === 'FINISHED' ? 'Terminado' : new Date(match.kickoffAt).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')
    : item.kickoffAt ? new Date(item.kickoffAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }).replace('.', '') : '';

  return (
    <Animated.View entering={FadeInDown.delay(140 + index * 70).duration(320).springify().damping(18)}>
      <PressableScale disabled={!onPress} onPress={onPress} scaleDown={0.98} style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
        <View style={[styles.edge, { backgroundColor: tone }]} />
        <View style={styles.body}>
          <View style={styles.head}>
            <Text numberOfLines={1} style={[styles.league, { color: colors.textMuted }]}>{item.competition}{state ? ` · ${state}` : ''}</Text>
            <View style={[styles.tag, { backgroundColor: `${tone}22` }]}>
              {live ? <View style={[styles.liveDot, { backgroundColor: colors.live }]} /> : null}
              <Text style={[styles.tagText, { color: tone }]}>{tag}</Text>
            </View>
          </View>
          {rows.map((r) => {
            const winner = r.score != null && r.other != null && r.score > r.other;
            return (
              <View key={r.name} style={styles.teamRow}>
                <TeamBadge name={r.name} size={22} variant={item.sport === 'TENNIS' ? 'player' : 'auto'} />
                <Text numberOfLines={1} style={[styles.team, { color: winner || r.score == null ? colors.textPrimary : colors.textSecondary, fontFamily: winner ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
                  {r.at ? '@ ' : ''}{r.name}
                </Text>
                {r.score != null ? <Text style={[styles.score, { color: live ? colors.live : colors.textPrimary }]}>{r.score}</Text> : null}
              </View>
            );
          })}
          <View style={[styles.pick, { backgroundColor: colors.background }]}>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.market, { color: colors.textMuted }]}>{item.market.toUpperCase()}</Text>
              <Text numberOfLines={2} style={[styles.selection, { color: colors.textPrimary }]}>{item.selection}</Text>
            </View>
            <Text style={[styles.odd, { color: colors.gold }]}>{formatOdds(item.oddValue)}</Text>
          </View>
          {onPress ? (
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.primary }]}>{match?.status === 'FINISHED' ? 'Ver porque ' + (item.result === ItemResult.LOST ? 'falhou' : 'ganhou') : 'Ver jogo'}</Text>
              <Ionicons color={colors.primary} name="chevron-forward" size={14} />
            </View>
          ) : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, flexDirection: 'row', overflow: 'hidden' },
  edge: { width: 4 },
  body: { flex: 1, gap: 10, padding: 14 },
  head: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  league: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11 },
  tag: { alignItems: 'center', borderRadius: 6, flexDirection: 'row', gap: 4, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.4 },
  liveDot: { borderRadius: 3, height: 6, width: 6 },
  teamRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  team: { flex: 1, fontSize: 14 },
  score: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
  pick: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 11, paddingVertical: 9 },
  flex: { flex: 1, gap: 1 },
  market: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.5 },
  selection: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  odd: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  footerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
