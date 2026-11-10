import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { PersonalStats, StatsBreakdownRow, StatsInsight } from '@betintel/shared';
import { HeroCard } from '../../ui/HeroCard';
import { useCardElevation } from '../../ui/ListCard';
import { useTheme } from '../../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../../utils/formatters';
import { ionicon } from '../../../types/icons';
import { IconTile, StatCard, type IconSpec } from './StatCard';

export const pct = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits).replace('.', ',')}%`;
const euro = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`;

/** Hero: the period's profit in one sentence a non-bettor understands, plus three key figures. */
export function AnalysisHero({ stats, periodLabel, selectionHitRate }: { stats: PersonalStats; periodLabel: string; selectionHitRate: number | null }) {
  const { colors } = useTheme();
  const s = stats.summary;
  const positive = s.profitLoss >= 0;
  const per10 = 10 * (1 + s.roi / 100);
  const tiles: Array<{ label: string; value: string; hint: string }> = [
    { label: 'Apostado', value: formatCurrency(s.totalStaked).replace(/,\d\d(?=\s?€)/, ''), hint: `${s.totalBoletins} boletins` },
    { label: 'Boletins ganhos', value: `${Math.round(s.winRate)}%`, hint: selectionHitRate !== null ? `seleções ${Math.round(selectionHitRate)}%` : `${s.wonBoletins} de ${s.wonBoletins + s.lostBoletins}` },
    { label: 'Odd média', value: formatOdds(s.averageOdds), hint: 'por boletim' },
  ];
  return (
    <Animated.View entering={FadeInDown.duration(340)}>
      <HeroCard>
        <Text style={[styles.heroLabel, { color: colors.heroText ?? colors.textSecondary }]}>
          {periodLabel} estás a {positive ? 'ganhar' : 'perder'}
        </Text>
        <Text style={[styles.heroValue, { color: positive ? colors.heroPositive : colors.heroNegative }]}>{euro(s.profitLoss)}</Text>
        <Text style={[styles.heroSentence, { color: colors.heroText ?? colors.textPrimary }]}>
          Por cada <Text style={styles.bold}>10 €</Text> apostados recebeste <Text style={styles.bold}>{formatCurrency(per10)}</Text>
          <Text style={{ opacity: 0.7 }}> (retorno {pct(s.roi)})</Text>
        </Text>
        <View style={styles.heroTiles}>
          {tiles.map((t, i) => (
            <Animated.View entering={FadeInDown.delay(120 + i * 60).duration(280)} key={t.label} style={styles.heroTile}>
              <Text numberOfLines={1} style={[styles.tileLabel, { color: colors.heroText ?? colors.textSecondary }]}>{t.label}</Text>
              <Text numberOfLines={1} style={[styles.tileValue, { color: colors.heroText ?? colors.textPrimary }]}>{t.value}</Text>
              <Text numberOfLines={1} style={[styles.tileHint, { color: colors.heroText ?? colors.textMuted }]}>{t.hint}</Text>
            </Animated.View>
          ))}
        </View>
      </HeroCard>
    </Animated.View>
  );
}

/** "Em resumo": the top automatic conclusions as a readable list (no more cut-off carousel). */
export function InsightsCard({ insights, index }: { insights: StatsInsight[]; index?: number }) {
  const { colors } = useTheme();
  if (insights.length === 0) return null;
  return (
    <StatCard icon={{ name: 'bulb', tone: 'amber' }} index={index} title="Em resumo">
      {insights.slice(0, 3).map((ins, i) => {
        const tint = ins.sentiment === 'positive' ? colors.positive : ins.sentiment === 'negative' ? colors.negative : colors.warning;
        return (
          <Animated.View entering={FadeInRight.delay(150 + i * 80).duration(300)} key={ins.id} style={[styles.insight, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.insightIcon, { backgroundColor: `${tint}22` }]}>
              <Ionicons color={tint} name={ionicon(ins.icon)} size={17} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>{ins.title}</Text>
              <Text style={[styles.insightBody, { color: colors.textMuted }]}>{ins.body}</Text>
            </View>
          </Animated.View>
        );
      })}
    </StatCard>
  );
}

interface Finding { category: string; label: string; roi: number; bets: number }

const MIN_BETS = 10;
const plural = (day: string) => (day.endsWith('o') || day.endsWith('a') ? `${day}s` : day);

/** Candidate strengths/weaknesses across dimensions, one per dimension, from real rows only. */
export function findGoodBad(stats: PersonalStats): { good: Finding[]; bad: Finding[] } {
  const all: Finding[] = [];
  const add = (category: string, rows: StatsBreakdownRow[], label: (r: StatsBreakdownRow) => string) => {
    for (const r of rows) if (r.totalBets >= MIN_BETS) all.push({ category, label: label(r), roi: r.roi, bets: r.totalBets });
  };
  add('sport', stats.bySport, (r) => r.label);
  add('weekday', stats.byWeekday, (r) => plural(r.label));
  add('legs', stats.byLegCount, (r) => (r.label.toLowerCase() === 'simples' ? 'Simples' : `Múltiplas de ${r.label}`));
  add('odds', stats.byOddsRange, (r) => `Odds ${r.label.replace(/\./g, ',')}`);
  add('market', stats.byMarket, (r) => r.label);
  add('competition', stats.byCompetition, (r) => r.label);
  const s = stats.summary;
  if (s.favouriteBets >= MIN_BETS) all.push({ category: 'fav', label: 'Favoritos (odd < 2)', roi: s.favouriteROI, bets: s.favouriteBets });
  if (s.underdogBets >= MIN_BETS) all.push({ category: 'fav', label: 'Underdogs (odd ≥ 2)', roi: s.underdogROI, bets: s.underdogBets });

  const pick = (list: Finding[]) => {
    const seen = new Set<string>();
    return list.filter((f) => (seen.has(f.category) ? false : (seen.add(f.category), true))).slice(0, 3);
  };
  return {
    good: pick(all.filter((f) => f.roi > 0).sort((a, b) => b.roi - a.roi)),
    bad: pick(all.filter((f) => f.roi < 0).sort((a, b) => a.roi - b.roi)),
  };
}

/** "Corre bem / Corre mal": two tinted columns with the best and worst areas. */
export function GoodBadCard({ stats, index = 0 }: { stats: PersonalStats; index?: number }) {
  const { colors, isDark } = useTheme();
  const elevation = useCardElevation();
  const { good, bad } = findGoodBad(stats);
  if (good.length === 0 && bad.length === 0) return null;
  const col = (title: string, icon: IconSpec, items: Finding[], color: string, bg: string, delay: number) => (
    <Animated.View entering={FadeInDown.delay(delay).duration(320)} style={[styles.gbCol, elevation, { backgroundColor: bg }]}>
      <View style={styles.gbHead}>
        <IconTile icon={icon} size={24} />
        <Text style={[styles.gbTitle, { color }]}>{title}</Text>
      </View>
      {items.length === 0 ? <Text style={[styles.gbEmpty, { color: colors.textMuted }]}>Nada a destacar</Text> : null}
      {items.map((f) => (
        <View key={f.label} style={styles.gbItem}>
          <Text numberOfLines={2} style={[styles.gbLabel, { color: colors.textPrimary }]}>{f.label}</Text>
          <Text style={[styles.gbValue, { color }]}>{pct(f.roi)}</Text>
        </View>
      ))}
    </Animated.View>
  );
  return (
    <View style={styles.gbRow}>
      {col('Corre bem', { name: 'thumbs-up', tone: 'green' }, good, colors.positive, isDark ? '#10261D' : '#E7F8EF', index * 55)}
      {col('Corre mal', { name: 'thumbs-down', tone: 'red' }, bad, colors.negative, isDark ? '#2A1720' : '#FDECEE', index * 55 + 60)}
    </View>
  );
}

/** Two-sided comparison (favourites vs underdogs, home vs away) with a share-of-bets bar. */
export function VersusCard({
  title, icon, left, right, note, index,
}: {
  title: string;
  icon: IconSpec;
  left: { label: string; roi: number; hit: number; bets: number };
  right: { label: string; roi: number; hit: number; bets: number };
  note?: string;
  index?: number;
}) {
  const { colors } = useTheme();
  const total = left.bets + right.bets || 1;
  const side = (s: typeof left, align: 'left' | 'right') => (
    <View style={[styles.vsSide, align === 'right' && styles.vsRight]}>
      <Text numberOfLines={1} style={[styles.vsLabel, { color: colors.textMuted }]}>{s.label}</Text>
      <Text style={[styles.vsValue, { color: s.roi >= 0 ? colors.positive : colors.negative }]}>{pct(s.roi)}</Text>
      <Text style={[styles.vsHint, { color: colors.textMuted }]}>acertas {Math.round(s.hit)}%</Text>
    </View>
  );
  return (
    <StatCard icon={icon} index={index} title={title}>
      <View style={styles.vsRow}>{side(left, 'left')}{side(right, 'right')}</View>
      <View style={styles.vsBar}>
        <View style={{ backgroundColor: colors.textMuted, borderRadius: 5, flex: left.bets / total, opacity: 0.6 }} />
        <View style={{ backgroundColor: colors.info, borderRadius: 5, flex: right.bets / total }} />
      </View>
      <View style={styles.vsRow}>
        <Text style={[styles.vsHint, { color: colors.textMuted }]}>{left.bets} ({Math.round((left.bets / total) * 100)}%)</Text>
        <Text style={[styles.vsHint, { color: colors.textMuted }]}>{right.bets} ({Math.round((right.bets / total) * 100)}%)</Text>
      </View>
      {note ? <Text style={[styles.note, { backgroundColor: colors.background, color: colors.textSecondary }]}>{note}</Text> : null}
    </StatCard>
  );
}

/** Row of small figure tiles inside a card (streaks, freebets…). */
export function FigureTiles({ items }: { items: Array<{ value: string; label: string; color?: string }> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.figRow}>
      {items.map((it, i) => (
        <Animated.View entering={FadeInDown.delay(80 + i * 60).duration(260)} key={it.label} style={[styles.figTile, { backgroundColor: colors.background }]}>
          <Text style={[styles.figValue, { color: it.color ?? colors.textPrimary }]}>{it.value}</Text>
          <Text style={[styles.figLabel, { color: colors.textMuted }]}>{it.label}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  bold: { fontFamily: 'Inter_700Bold' },
  heroLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, opacity: 0.85 },
  heroValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 42, lineHeight: 48 },
  heroSentence: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  heroTiles: { flexDirection: 'row', gap: 8, marginTop: 8 },
  heroTile: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, flex: 1, gap: 1, padding: 10 },
  tileLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, opacity: 0.8 },
  tileValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17 },
  tileHint: { fontFamily: 'Inter_400Regular', fontSize: 10, opacity: 0.65 },
  insight: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingTop: 10 },
  insightIcon: { alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
  insightTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  insightBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  gbRow: { flexDirection: 'row', gap: 10 },
  gbCol: { borderRadius: 20, flex: 1, gap: 10, padding: 14 },
  gbHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  gbTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.3 },
  gbEmpty: { fontSize: 12 },
  gbItem: { gap: 1 },
  gbLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  gbValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14 },
  vsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  vsSide: { flex: 1, gap: 2 },
  vsRight: { alignItems: 'flex-end' },
  vsLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  vsValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 26 },
  vsHint: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  vsBar: { flexDirection: 'row', gap: 3, height: 10 },
  note: { borderRadius: 12, fontSize: 13, lineHeight: 19, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 10 },
  figRow: { flexDirection: 'row', gap: 8 },
  figTile: { alignItems: 'center', borderRadius: 14, flex: 1, gap: 2, paddingHorizontal: 6, paddingVertical: 12 },
  figValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24 },
  figLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center' },
});
