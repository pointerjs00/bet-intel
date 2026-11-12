import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useBoletins, useLiveItems } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatSignedCurrency } from '../../utils/formatters';
import { provisional, type LiveVerdict } from '../../utils/provisional';

/**
 * "Se acabasse agora": what the boletim would pay if the games in play ended at this moment.
 * Shown only while one of its selections is live. `compact` = one line for cards.
 */
export function ProvisionalLine({ boletinId, compact = false }: { boletinId: string; compact?: boolean }) {
  const { colors } = useTheme();
  const live = useLiveItems();
  const boletins = useBoletins();
  const p = useMemo(() => {
    const b = boletins.data?.find((x) => x.id === boletinId);
    if (!b || b.status !== 'PENDING') return null;
    const map = new Map<string, LiveVerdict>();
    for (const it of live.data ?? []) if (it.boletinId === boletinId && (it.status === 'LIVE' || it.status === 'HALFTIME')) map.set(it.itemId, it.verdict);
    return provisional(b.items.map((i) => ({ id: i.id, result: i.result, odd: Number(i.oddValue) })), Number(b.stake), b.isFreebet, map);
  }, [boletins.data, live.data, boletinId]);
  if (!p) return null;
  const tone = p.state === 'lose' ? colors.negative : colors.positive;
  const text = p.state === 'win'
    ? `Se acabasse agora: ganhavas ${formatSignedCurrency(p.profit)}`
    : p.state === 'lose'
      ? `Se acabasse agora: perdias${p.legs > 1 ? ` (${p.failing} ${p.failing === 1 ? 'seleção falha' : 'seleções falham'})` : ''}`
      : `Por agora tudo certo · ${p.toStart === 1 ? 'falta 1 jogo' : `faltam ${p.toStart} jogos`}`;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.row, !compact && styles.box, !compact && { backgroundColor: `${tone}14` }]}>
      <Ionicons color={tone} name={p.state === 'lose' ? 'trending-down' : 'trending-up'} size={compact ? 13 : 16} />
      <Text numberOfLines={1} style={[compact ? styles.small : styles.text, { color: tone }]}>{text}</Text>
      {!compact && p.legs > 1 ? <View style={styles.flex} /> : null}
      {!compact && p.legs > 1 ? <Text style={[styles.small, { color: colors.textSecondary }]}>{p.holding}/{p.legs}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  box: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  flex: { flex: 1 },
  text: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 13 },
  small: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
