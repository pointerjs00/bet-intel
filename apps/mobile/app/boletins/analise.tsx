// Análise do boletim: starts with the answer ("why it won / lost", from the real games), then the
// odds' probability next to the user's own hit rate for this kind of bet, then one row per
// selection that opens "As tuas estatísticas". Results are corrected in the edit sheet, not here.
// The old 8-tab metric explainer (ROI, odds, retorno…) was removed: it explained the obvious.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoletinStatus, ItemResult, Sport, type BoletinDetail } from '@betintel/shared';
import { SelectionInsightsSheet, type SelectionInsightsItem } from '../../components/boletins/SelectionInsightsSheet';
import { useCardElevation } from '../../components/ui/ListCard';
import { Pressable } from '../../components/ui/Pressable';
import { Skeleton } from '../../components/ui/Skeleton';
import { useBoletinDetail } from '../../services/boletinService';
import { useItemMatches, type ItemMatch } from '../../services/sportsService';
import { usePersonalStats } from '../../services/statsService';
import { useTheme } from '../../theme/useTheme';
import { formatOdds, formatPercentage, plural } from '../../utils/formatters';

const scoreText = (m: ItemMatch | null | undefined) => (m?.line ? m.line : m?.score ? `${m.score.home}–${m.score.away}` : null);

/** One or two sentences on why the boletim ended as it did (or how it stands). */
function whySentence(b: BoletinDetail, matches: Record<string, ItemMatch | null> | undefined): string {
  const won = b.items.filter((i) => i.result === ItemResult.WON);
  const lost = b.items.filter((i) => i.result === ItemResult.LOST);
  const pending = b.items.filter((i) => i.result === ItemResult.PENDING);
  const legName = (i: BoletinDetail['items'][number]) => i.selection;
  const withScore = (i: BoletinDetail['items'][number]) => {
    const s = scoreText(matches?.[i.id]);
    return s ? `${legName(i)} (${i.homeTeam} vs ${i.awayTeam}, ${s})` : `${legName(i)} (${i.homeTeam} vs ${i.awayTeam})`;
  };
  if (b.status === BoletinStatus.LOST) {
    const first = lost.map(withScore).join(' e ');
    return b.items.length === 1
      ? `Falhou: ${first}.`
      : `A múltipla caiu por ${plural(lost.length, 'seleção', 'seleções')}: ${first}.${won.length ? ` ${won.length === 1 ? 'A outra acertou' : `As outras ${won.length} acertaram`}.` : ''}`;
  }
  if (b.status === BoletinStatus.WON) {
    return b.items.length === 1 ? `Acertou: ${withScore(b.items[0]!)}.` : `Todas as ${b.items.length} seleções acertaram.`;
  }
  if (b.status === BoletinStatus.CASHOUT) return 'Fizeste cashout antes do fim.';
  if (b.status === BoletinStatus.VOID) return 'O boletim foi anulado e a aposta devolvida.';
  return pending.length === b.items.length
    ? 'Ainda nenhum jogo terminou.'
    : `${plural(won.length, 'seleção certa', 'seleções certas')}, faltam ${pending.length}.`;
}

export default function BoletimAnaliseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const elevation = useCardElevation();
  const query = useBoletinDetail(id);
  const matches = useItemMatches(id);
  const stats = usePersonalStats('all', [], undefined, undefined, true).data;
  const [insights, setInsights] = useState<SelectionInsightsItem | null>(null);
  const b = query.data;

  const numbers = useMemo(() => {
    if (!b) return null;
    const implied = 100 / Math.max(Number(b.totalOdds), 1.0001);
    const row = stats?.byLegCount.find((r) => r.legCount === b.items.length) ?? null;
    return { implied, row };
  }, [b, stats]);

  const title = b?.status === BoletinStatus.WON ? 'Porque ganhou' : b?.status === BoletinStatus.LOST ? 'Porque perdeu' : 'Como está';
  const card = [styles.card, elevation, { backgroundColor: colors.surface }];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Análise do boletim' }} />
      {!b || !numbers ? (
        <View style={styles.pad}><Skeleton height={140} width="100%" /><Skeleton height={160} width="100%" /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 40 }]}>
          <Animated.View entering={FadeInDown.duration(260)} style={card}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>{title}</Text>
            <Text style={[styles.why, { color: colors.textPrimary }]}>{whySentence(b, matches.data)}</Text>
            <View style={styles.pair}>
              <View style={[styles.tile, { backgroundColor: colors.background }]}>
                <Text style={[styles.tileLabel, { color: colors.textMuted }]}>Probabilidade das odds</Text>
                <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatPercentage(numbers.implied, 0)}</Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.background }]}>
                <Text style={[styles.tileLabel, { color: colors.textMuted }]}>{b.items.length === 1 ? 'Tu em simples' : `Tu em múltiplas de ${b.items.length}`}</Text>
                <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{numbers.row ? formatPercentage(numbers.row.winRate, 0) : '—'}</Text>
              </View>
            </View>
            {numbers.row ? (
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                Em {plural(numbers.row.totalBets, 'boletim', 'boletins')} deste tipo, o teu retorno é{' '}
                <Text style={{ color: numbers.row.roi >= 0 ? colors.positive : colors.negative }}>{formatPercentage(numbers.row.roi, 1, true)}</Text>.
                {numbers.row.winRate < numbers.implied ? ' Acertas menos do que as odds prometem.' : ' Acertas mais do que as odds prometem.'}
              </Text>
            ) : null}
          </Animated.View>

          <Text style={[styles.section, { color: colors.textMuted }]}>Cada seleção</Text>
          <Animated.View entering={FadeInDown.delay(60).duration(260)} style={[card, styles.list]}>
            {b.items.map((item, i) => {
              const tone = item.result === ItemResult.WON ? colors.positive : item.result === ItemResult.LOST ? colors.negative : colors.border;
              const icon = item.result === ItemResult.WON ? 'checkmark' : item.result === ItemResult.LOST ? 'close' : item.result === ItemResult.VOID ? 'remove' : 'time-outline';
              const p = 100 / Math.max(Number(item.oddValue), 1.0001);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setInsights({
                    homeTeam: item.homeTeam, awayTeam: item.awayTeam, competition: item.competition,
                    sport: item.sport ?? Sport.FOOTBALL, market: item.market, selection: item.selection,
                    oddValue: item.oddValue, result: item.result,
                  })}
                  style={[styles.leg, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                >
                  <View style={[styles.mark, { backgroundColor: tone }]}>
                    <Ionicons color={item.result === ItemResult.PENDING ? colors.textMuted : '#06110B'} name={icon} size={12} />
                  </View>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.legTitle, { color: colors.textPrimary }]}>{item.selection} · {formatOdds(item.oddValue)}</Text>
                    <Text numberOfLines={1} style={[styles.legSub, { color: colors.textMuted }]}>{item.market} · {formatPercentage(p, 0)} pelas odds</Text>
                  </View>
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                </Pressable>
              );
            })}
          </Animated.View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>Toca numa seleção para veres o teu histórico nesse mercado, equipa e gama de odds. Para corrigir um resultado, usa “Editar” no boletim.</Text>
        </ScrollView>
      )}
      <SelectionInsightsSheet item={insights} onClose={() => setInsights(null)} visible={insights !== null} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pad: { gap: 12, padding: 16 },
  card: { borderRadius: 18, gap: 12, padding: 16 },
  list: { gap: 0, paddingVertical: 4 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.4 },
  why: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 23 },
  pair: { flexDirection: 'row', gap: 8 },
  tile: { borderRadius: 12, flex: 1, gap: 4, padding: 12 },
  tileLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  tileValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22 },
  note: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  section: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.4, marginTop: 4 },
  leg: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 12 },
  mark: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
  flex: { flex: 1 },
  legTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  legSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  hint: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
});
