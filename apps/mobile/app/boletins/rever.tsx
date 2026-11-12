// "A rever" queue (plan #36): selections the auto-settlement could not decide with certainty
// (unknown market, uncertain team match, abandoned/postponed game). One tap resolves each.
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ItemResult } from '@betintel/shared';
import { AppText } from '../../components/ui/AppText';
import { ListCard, ListRow } from '../../components/ui/ListCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { MarketSelection } from '../../components/boletins/MarketSelection';
import { useToast } from '../../components/ui/Toast';
import { useReviewItems, useUpdateBoletinItemsMutation, type ReviewItem } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatOdds, formatShortDateTime } from '../../utils/formatters';
import { hapticLight } from '../../utils/haptics';

export default function ReviewQueueScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const query = useReviewItems();
  const update = useUpdateBoletinItemsMutation();
  const items = query.data ?? [];

  const resolve = (item: ReviewItem, result: ItemResult) => {
    hapticLight();
    update.mutate(
      { boletinId: item.boletinId, items: [{ id: item.id, result }] },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['boletins', 'review'] });
          showToast('Resultado guardado.', 'success');
        },
        onError: () => showToast('Não foi possível guardar. Tenta outra vez.', 'error'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'A rever' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />}
        style={{ backgroundColor: colors.background }}
      >
        <AppText variant="caption">
          A liquidação automática não teve certeza nestas seleções (mercado que não reconhece, jogo adiado ou abandonado, equipa por confirmar). Marca o resultado à mão.
        </AppText>

        {query.isLoading ? (
          <ListCard>{[0, 1].map((i) => <ListRow key={i}><Skeleton height={60} width="100%" /></ListRow>)}</ListCard>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons color={colors.primary} name="checkmark-done-circle-outline" size={44} />
            <AppText variant="heading">Nada para rever</AppText>
          </View>
        ) : (
          <ListCard>
            {items.map((item) => (
              <View key={item.id} style={styles.item}>
                <Pressable accessibilityHint="Abre o boletim" accessibilityRole="button" onPress={() => router.push(`/boletins/${item.boletinId}`)} style={styles.head}>
                  <View style={styles.crests}>
                    <TeamBadge name={item.homeTeam} size={30} />
                    <TeamBadge name={item.awayTeam} size={22} style={styles.crestBack} />
                  </View>
                  <View style={styles.flex}>
                  <AppText numberOfLines={1} variant="bodyStrong">{item.homeTeam} vs {item.awayTeam}</AppText>
                  <MarketSelection market={item.market} selection={item.selection} style={styles.ms} trailing={`${formatOdds(item.oddValue)}`} />
                  <AppText variant="label">
                    {item.competition}{item.kickoffAt ? ` · ${formatShortDateTime(item.kickoffAt)}` : ''}{item.boletinName ? ` · ${item.boletinName}` : ''}
                  </AppText>
                  </View>
                </Pressable>
                <View style={styles.actions}>
                  {([
                    { result: ItemResult.WON, label: 'Certa', icon: 'checkmark' as const, color: colors.primary },
                    { result: ItemResult.LOST, label: 'Falhada', icon: 'close' as const, color: colors.danger },
                    { result: ItemResult.VOID, label: 'Anulada', icon: 'remove-circle-outline' as const, color: colors.textSecondary },
                  ]).map((a) => (
                    <Pressable
                      accessibilityLabel={`${a.label}: ${item.homeTeam} vs ${item.awayTeam}`}
                      accessibilityRole="button"
                      disabled={update.isPending}
                      key={a.label}
                      onPress={() => resolve(item, a.result)}
                      style={[styles.action, { backgroundColor: `${a.color}1F` }]}
                    >
                      <Ionicons color={a.color} name={a.icon} size={16} />
                      <AppText style={{ color: a.color }} variant="label">{a.label}</AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ListCard>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 20, paddingBottom: 48 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  item: { gap: 10, padding: 16 },
  head: { flexDirection: 'row', gap: 12 },
  ms: { marginVertical: 4 },
  flex: { flex: 1 },
  crests: { height: 40, width: 40 },
  crestBack: { bottom: 0, position: 'absolute', right: 0 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { alignItems: 'center', borderRadius: 12, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44 },
});
