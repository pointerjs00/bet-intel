import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ItemResult } from '@betintel/shared';
import { PressableScale } from '../ui/PressableScale';
import { useCardElevation } from '../ui/ListCard';
import { useBoletins } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';
import { findMatchBets, indexBetsByDay } from '../../utils/dayBets';

/** The user's selections on a basketball / tennis match: selection, odd, state, profit. */
export function MatchBetsStrip({ kickoff, home, away, live }: { kickoff: string; home: string; away: string; live: boolean }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const router = useRouter();
  const boletins = useBoletins();
  const bets = useMemo(() => findMatchBets(indexBetsByDay(boletins.data ?? []), kickoff, home, away), [boletins.data, kickoff, home, away]);
  if (bets.length === 0) return null;
  return (
    <View style={styles.list}>
      {bets.map(({ bet }, i) => {
        const tone = bet.result === ItemResult.WON ? colors.positive : bet.result === ItemResult.LOST ? colors.negative : live ? colors.info : colors.warning;
        const label = bet.result === ItemResult.WON ? 'GANHOU' : bet.result === ItemResult.LOST ? 'PERDEU' : live ? 'EM JOGO' : 'PENDENTE';
        return (
          <Animated.View entering={FadeInDown.delay(i * 60).duration(300)} key={`${bet.boletinId}-${i}`}>
            <PressableScale onPress={() => router.push(`/boletins/${bet.boletinId}`)} style={[styles.card, elevation, { backgroundColor: colors.surface, borderColor: `${tone}66` }]}>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: tone }]}>A TUA APOSTA · {label}</Text>
                <Text numberOfLines={1} style={[styles.market, { color: colors.textMuted }]}>{bet.market.toUpperCase()}</Text>
                <Text numberOfLines={2} style={[styles.selection, { color: colors.textPrimary }]}>{bet.selection} <Text style={{ color: colors.gold }}>@{bet.odd.toFixed(2)}</Text></Text>
              </View>
              {bet.legs === 1 && bet.profit !== null ? (
                <Text style={[styles.profit, { color: tone }]}>{bet.profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(bet.profit))}</Text>
              ) : bet.legs > 1 ? <Text style={[styles.multi, { color: colors.textSecondary }]}>{bet.wonLegs}/{bet.legs}</Text> : null}
            </PressableScale>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  flex: { flex: 1, gap: 2 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.6 },
  market: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.4, marginTop: 4 },
  selection: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  profit: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  multi: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
});
