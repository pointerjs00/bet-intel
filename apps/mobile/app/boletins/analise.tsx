// Análise do boletim: the advanced data moved out of the boletim detail — probabilities and the
// user's history (BoletinInsightsSection), the AI explanation, per-selection stats and the manual
// result controls.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoletinStatus, ItemResult, Sport } from '@betintel/shared';
import { BoletinInsightsSection } from '../../components/boletins/BoletinInsightsSection';
import { BoletinItem } from '../../components/boletins/BoletinItem';
import { ExplainBoletinSheet } from '../../components/boletins/ExplainBoletinSheet';
import { SelectionInsightsSheet, type SelectionInsightsItem } from '../../components/boletins/SelectionInsightsSheet';
import { IconTile } from '../../components/stats/v3/StatCard';
import { PressableScale } from '../../components/ui/PressableScale';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useCardElevation } from '../../components/ui/ListCard';
import { useBoletinDetail, useUpdateBoletinItemsMutation } from '../../services/boletinService';
import { useItemMatches } from '../../services/sportsService';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../theme/useTheme';

export default function BoletimAnaliseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const elevation = useCardElevation();
  const { showToast } = useToast();
  const query = useBoletinDetail(id);
  const matches = useItemMatches(id);
  const updateItems = useUpdateBoletinItemsMutation();
  const userId = useAuthStore((s) => s.user?.id);
  const [explain, setExplain] = useState(false);
  const [insights, setInsights] = useState<SelectionInsightsItem | null>(null);
  const b = query.data;
  const canEdit = Boolean(b && userId && b.userId === userId);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Análise do boletim' }} />
      {!b ? (
        <View style={styles.pad}><Skeleton height={160} width="100%" /><Skeleton height={120} width="100%" /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 40 }]}>
          <Animated.View entering={FadeInDown.duration(280)}>
            <BoletinInsightsSection boletin={b} />
          </Animated.View>

          {b.status !== BoletinStatus.PENDING ? (
            <Animated.View entering={FadeInDown.delay(60).duration(280)}>
              <PressableScale onPress={() => setExplain(true)} style={[styles.row, elevation, { backgroundColor: colors.surface }]}>
                <IconTile icon={{ name: 'sparkles', tone: 'purple' }} size={34} />
                <View style={styles.flex}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>Explica-me esta aposta</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>Porque {b.status === BoletinStatus.WON ? 'ganhou' : 'acabou assim'} e o que repetir</Text>
                </View>
                <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
              </PressableScale>
            </Animated.View>
          ) : null}

          <Text style={[styles.section, { color: colors.textMuted }]}>CADA SELEÇÃO</Text>
          {b.items.map((item, i) => (
            <Animated.View entering={FadeInDown.delay(100 + i * 50).duration(260)} key={item.id}>
              <BoletinItem
                item={item}
                match={matches.data?.[item.id] ?? null}
                onInsights={() => setInsights({
                  homeTeam: item.homeTeam, awayTeam: item.awayTeam, competition: item.competition,
                  sport: item.sport ?? Sport.FOOTBALL, market: item.market, selection: item.selection,
                  oddValue: item.oddValue, result: item.result,
                })}
                onResultChange={canEdit ? async (result) => {
                  try {
                    await updateItems.mutateAsync({ boletinId: b.id, items: [{ id: item.id, result }] });
                    showToast(result === ItemResult.PENDING ? 'Resultado removido.' : 'Resultado atualizado.', 'success');
                  } catch {
                    showToast('Não foi possível atualizar o resultado.', 'error');
                  }
                } : undefined}
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}
      <SelectionInsightsSheet item={insights} onClose={() => setInsights(null)} visible={insights !== null} />
      {b && explain ? <ExplainBoletinSheet boletin={b} onClose={() => setExplain(false)} visible={explain} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pad: { gap: 14, padding: 16 },
  flex: { flex: 1, gap: 1 },
  row: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 12, padding: 14 },
  rowTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  rowSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  section: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.6, marginTop: 6 },
});
