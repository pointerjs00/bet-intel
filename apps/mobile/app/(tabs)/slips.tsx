import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BoletinStatus } from '@betintel/shared';
import { BoletinCard } from '../../components/boletins/BoletinCard';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { filterBoletinsByStatus, useBoletins, useDeleteBoletinMutation } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

type StatusFilter = 'ALL' | BoletinStatus;
type SlipListItem = { id: string; type: 'skeleton' } | (ReturnType<typeof useBoletins>['data'] extends Array<infer T> | undefined ? T : never);

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: 'Todos' },
  { key: BoletinStatus.PENDING, label: 'Pendente' },
  { key: BoletinStatus.WON, label: 'Ganhou' },
  { key: BoletinStatus.LOST, label: 'Perdeu' },
  { key: BoletinStatus.VOID, label: 'Void' },
];

export default function SlipsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [selectedFilter, setSelectedFilter] = useState<StatusFilter>('ALL');

  const boletinsQuery = useBoletins();
  const deleteMutation = useDeleteBoletinMutation();

  const boletins = boletinsQuery.data ?? [];
  const filtered = useMemo(() => filterBoletinsByStatus(boletins, selectedFilter), [boletins, selectedFilter]);
  const listData: SlipListItem[] = boletinsQuery.isLoading
    ? [{ id: 's1', type: 'skeleton' }, { id: 's2', type: 'skeleton' }]
    : filtered;

  const summary = useMemo(() => {
    return boletins.reduce(
      (acc, boletin) => {
        const stake = Number(boletin.stake);
        const retorno = Number(boletin.actualReturn ?? 0);
        acc.totalStaked += stake;
        acc.totalReturned += retorno;
        return acc;
      },
      { totalStaked: 0, totalReturned: 0 },
    );
  }, [boletins]);

  const roi = summary.totalStaked > 0
    ? ((summary.totalReturned - summary.totalStaked) / summary.totalStaked) * 100
    : 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Boletins' }} />
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={listData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.titleRow}>
              <View style={styles.titleBlock}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Meus boletins</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Acompanha cada entrada e o teu retorno.</Text>
              </View>

              <Pressable
                onPress={() => router.push('/boletins/create')}
                style={[styles.iconButton, { backgroundColor: colors.primary }]}
              >
                <Ionicons color="#FFFFFF" name="add" size={20} />
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <Card style={styles.summaryCard}>
                <View style={styles.summaryMetric}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total apostado</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatCurrency(summary.totalStaked)}</Text>
                </View>
                <View style={styles.summaryMetric}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Retorno</Text>
                  <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(summary.totalReturned)}</Text>
                </View>
                <View style={styles.summaryMetric}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>ROI</Text>
                  <Text style={[styles.summaryValue, { color: roi >= 0 ? colors.primary : colors.danger }]}>{roi.toFixed(1)}%</Text>
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
              <FlatList
                contentContainerStyle={styles.filterList}
                data={FILTERS}
                horizontal
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => (
                  <Chip
                    label={item.label}
                    selected={item.key === selectedFilter}
                    onPress={() => setSelectedFilter(item.key)}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
              />
            </Animated.View>
          </View>
        }
        ListEmptyComponent={
          !boletinsQuery.isLoading ? (
            <EmptyState
              icon="receipt"
              title="Ainda não tens boletins"
              message="Adiciona seleções no detalhe de um evento e fecha o teu primeiro boletin."
              action={<Button onPress={() => router.push('/(tabs)')} title="Explorar odds" />}
            />
          ) : null
        }
        renderItem={({ item, index }) => {
          if ('type' in item) {
            return (
              <Card style={styles.skeletonCard}>
                <Skeleton height={20} width={110} />
                <Skeleton height={26} width="88%" />
                <Skeleton height={80} width="100%" />
              </Card>
            );
          }

          return (
            <Animated.View entering={FadeInDown.delay(300 + index * 60).duration(400).springify()}>
              <BoletinCard
              boletin={item}
              onDelete={async () => {
                try {
                  await deleteMutation.mutateAsync(item.id);
                  showToast('Boletin eliminado.', 'success');
                } catch (error) {
                  showToast(getErrorMessage(error), 'error');
                }
              }}
              onPress={() => router.push(`/boletins/${item.id}`)}
              onShare={() => showToast('A partilha para amigos fica visível quando o módulo social estiver pronto.', 'info')}
            />
            </Animated.View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.lg }} />}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.footerBar, { paddingBottom: insets.bottom + tokens.spacing.md, paddingHorizontal: tokens.spacing.lg }]}>
        <Button onPress={() => router.push('/boletins/create')} title="Novo boletin" />
      </View>
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data
  ) {
    return String(error.response.data.error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Não foi possível concluir a operação.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 18, marginBottom: 18 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 6, paddingRight: 16 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  iconButton: { alignItems: 'center', borderRadius: 16, height: 44, justifyContent: 'center', width: 44 },
  summaryCard: { flexDirection: 'row', gap: 12 },
  summaryMetric: { flex: 1, gap: 6 },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  summaryValue: { fontSize: 18, fontWeight: '900' },
  filterList: { gap: 8 },
  skeletonCard: { gap: 14 },
  footerBar: { bottom: 0, left: 0, position: 'absolute', right: 0 },
});