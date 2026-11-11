import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { BoletinDetail } from '@betintel/shared';
import { BoletinStatus, ItemResult } from '@betintel/shared';
import { SiteMark } from '../ui/SiteMark';
import { useCardElevation } from '../ui/ListCard';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';

const STATUS_LABEL: Record<string, string> = {
  WON: 'GANHOU', LOST: 'PERDEU', PENDING: 'EM JOGO', VOID: 'ANULADO', PARTIAL: 'PARCIAL', CASHOUT: 'CASHOUT',
};

/** Profit of a settled boletim (freebet stakes are not the user's money). */
export function boletimProfit(b: BoletinDetail): number {
  const stake = Number(b.stake);
  const ret = Number(b.actualReturn ?? (b.status === BoletinStatus.CASHOUT ? b.cashoutAmount ?? 0 : 0));
  return ret - (b.isFreebet ? 0 : stake);
}

/** One plain sentence on how the boletim went. */
function summarySentence(b: BoletinDetail): string | null {
  const n = b.items.length;
  const won = b.items.filter((i) => i.result === ItemResult.WON).length;
  const lost = b.items.filter((i) => i.result === ItemResult.LOST);
  const pending = b.items.filter((i) => i.result === ItemResult.PENDING).length;
  if (b.status === BoletinStatus.PENDING) {
    if (lost.length) return `Já falhou: ${lost.map((i) => i.selection).join(', ')}.`;
    return n === 1 ? 'À espera do resultado.' : `${won} de ${n} certas · faltam ${pending}.`;
  }
  if (b.status === BoletinStatus.LOST && n > 1) {
    return `Falhou por ${lost.length} seleç${lost.length === 1 ? 'ão' : 'ões'}: ${lost.map((i) => i.selection).join(', ')}.`;
  }
  if (b.status === BoletinStatus.WON && n > 1) return `Todas as ${n} seleções certas.`;
  return null;
}

/**
 * Top of the boletim detail: status, the money in one big number, stake / odd / return, a
 * per-selection progress bar for multiples and one sentence on what happened.
 */
export function BoletimResultHero({ boletin }: { boletin: BoletinDetail }) {
  const { colors, isDark } = useTheme();
  const elevation = useCardElevation();
  const pending = boletin.status === BoletinStatus.PENDING;
  const profit = boletimProfit(boletin);
  const tone = pending ? colors.warning : profit > 0 ? colors.positive : profit < 0 ? colors.negative : colors.textSecondary;
  const gradient: [string, string] = isDark
    ? pending ? ['#33280F', '#14182A'] : profit > 0 ? ['#0F3328', '#12263A'] : profit < 0 ? ['#3A1822', '#1A1B2E'] : ['#1E2433', '#141927']
    : pending ? ['#FFF6E5', '#FFFFFF'] : profit > 0 ? ['#E7F8EF', '#FFFFFF'] : profit < 0 ? ['#FDECEE', '#FFFFFF'] : ['#F1F3F7', '#FFFFFF'];
  const big = pending
    ? formatCurrency(boletin.potentialReturn)
    : `${profit > 0 ? '+' : profit < 0 ? '−' : ''}${formatCurrency(Math.abs(profit))}`;
  const ret = pending ? Number(boletin.potentialReturn) : Number(boletin.actualReturn ?? 0);
  const sentence = summarySentence(boletin);
  const multi = boletin.items.length > 1;
  const date = new Date(boletin.betDate ?? boletin.createdAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '');
  const tile = { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(15,23,42,0.05)' };

  return (
    <Animated.View entering={FadeInDown.duration(320).springify().damping(18)} style={[styles.wrap, elevation]}>
      <LinearGradient colors={gradient} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.card}>
        <View style={styles.top}>
          <Text style={[styles.status, { color: tone }]}>{STATUS_LABEL[boletin.status] ?? boletin.status}{boletin.isFreebet ? ' · FREEBET' : ''}</Text>
          <View style={styles.siteRow}>
            <SiteMark size={16} slug={boletin.siteSlug} textStyle={{ color: colors.textSecondary }} />
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{boletin.siteSlug ? '· ' : ''}{date}</Text>
          </View>
        </View>
        <View style={styles.bigRow}>
          <Animated.Text entering={ZoomIn.delay(80).springify().damping(14)} style={[styles.big, { color: tone }]}>{big}</Animated.Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {pending ? 'retorno possível' : multi ? `Múltipla · ${boletin.items.length} jogos` : 'Simples'}
          </Text>
        </View>
        {multi ? (
          <View accessibilityLabel="Estado de cada seleção" style={styles.legsBar}>
            {boletin.items.map((i, idx) => (
              <Animated.View
                entering={FadeInDown.delay(120 + idx * 50).duration(260)}
                key={i.id}
                style={[styles.legSeg, { backgroundColor: i.result === ItemResult.WON ? colors.positive : i.result === ItemResult.LOST ? colors.negative : i.result === ItemResult.VOID ? colors.textMuted : `${colors.warning}88` }]}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.tiles}>
          <View style={[styles.tile, tile]}><Text style={[styles.tileLabel, { color: colors.textSecondary }]}>Aposta</Text><Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text></View>
          <View style={[styles.tile, tile]}><Text style={[styles.tileLabel, { color: colors.textSecondary }]}>Odd</Text><Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatOdds(boletin.totalOdds)}</Text></View>
          <View style={[styles.tile, tile]}><Text style={[styles.tileLabel, { color: colors.textSecondary }]}>{pending ? 'Podes receber' : boletin.status === BoletinStatus.LOST ? 'Podia dar' : 'Recebeste'}</Text><Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.status === BoletinStatus.LOST ? Number(boletin.potentialReturn) : ret)}</Text></View>
        </View>
        {sentence ? <Text style={[styles.sentence, { color: colors.textPrimary }]}>{sentence}</Text> : null}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 24 },
  card: { borderRadius: 24, gap: 14, padding: 18 },
  top: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  status: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.8 },
  siteRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  meta: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  bigRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  big: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 38, lineHeight: 44 },
  legsBar: { flexDirection: 'row', gap: 4 },
  legSeg: { borderRadius: 4, flex: 1, height: 8 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { borderRadius: 12, flex: 1, gap: 1, paddingHorizontal: 10, paddingVertical: 9 },
  tileLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  tileValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  sentence: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
});
