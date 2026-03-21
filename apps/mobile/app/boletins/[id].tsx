import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BoletinStatus } from '@betintel/shared';
import { BoletinItem } from '../../components/boletins/BoletinItem';
import { OddsCalculator } from '../../components/boletins/OddsCalculator';
import { StatusBadge } from '../../components/boletins/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useBoletinDetail, useUpdateBoletinMutation } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatLongDate } from '../../utils/formatters';

const STATUS_ACTIONS = [
  { key: BoletinStatus.PENDING, label: 'Pendente' },
  { key: BoletinStatus.WON, label: 'Ganhou' },
  { key: BoletinStatus.LOST, label: 'Perdeu' },
  { key: BoletinStatus.VOID, label: 'Void' },
] as const;

export default function BoletinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const boletinQuery = useBoletinDetail(id);
  const updateMutation = useUpdateBoletinMutation();

  const boletin = boletinQuery.data;

  const bannerColor = useMemo(() => {
    switch (boletin?.status) {
      case BoletinStatus.WON:
        return colors.primary;
      case BoletinStatus.LOST:
        return colors.danger;
      case BoletinStatus.VOID:
        return colors.info;
      case BoletinStatus.PARTIAL:
      case BoletinStatus.PENDING:
      default:
        return colors.warning;
    }
  }, [boletin?.status, colors.danger, colors.info, colors.primary, colors.warning]);

  if (boletinQuery.isLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top + tokens.spacing.lg, paddingHorizontal: tokens.spacing.lg }]}>
        <Skeleton height={36} width="75%" />
        <Skeleton height={140} width="100%" style={{ marginTop: 18 }} />
        <Skeleton height={280} width="100%" style={{ marginTop: 18 }} />
      </View>
    );
  }

  if (!boletin) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Boletin não encontrado</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: boletin.name ?? 'Boletin' }} />
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: insets.bottom + tokens.spacing.xxl,
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={boletin.items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={[styles.statusBanner, { backgroundColor: bannerColor }]}>
              <StatusBadge status={boletin.status} />
              <Text style={styles.bannerTitle}>{boletin.name ?? 'Boletin sem nome'}</Text>
              <Text style={styles.bannerSubtitle}>{formatLongDate(boletin.createdAt)}</Text>
            </View>

            <OddsCalculator
              potentialReturn={Number(boletin.actualReturn ?? boletin.potentialReturn)}
              stake={Number(boletin.stake)}
              totalOdds={Number(boletin.totalOdds)}
            />

            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryMetric}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Stake</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
              </View>
              <View style={styles.summaryMetric}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Retorno atual</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(boletin.actualReturn ?? boletin.potentialReturn)}</Text>
              </View>
              <View style={styles.summaryMetric}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Visibilidade</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{boletin.isPublic ? 'Público' : 'Privado'}</Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Estado</Text>
            <FlatList
              contentContainerStyle={styles.statusActions}
              data={STATUS_ACTIONS}
              horizontal
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => {
                const active = item.key === boletin.status;
                return (
                  <Pressable
                    onPress={async () => {
                      try {
                        await updateMutation.mutateAsync({ id: boletin.id, payload: { status: item.key } });
                        showToast('Estado atualizado.', 'success');
                      } catch (error) {
                        showToast(getErrorMessage(error), 'error');
                      }
                    }}
                    style={[
                      styles.statusChip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceRaised,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.statusChipText, { color: active ? '#FFFFFF' : colors.textPrimary }]}>{item.label}</Text>
                  </Pressable>
                );
              }}
              showsHorizontalScrollIndicator={false}
            />

            <View style={styles.actionButtons}>
              <Button
                leftSlot={<Ionicons color={colors.textPrimary} name="globe-outline" size={16} />}
                onPress={async () => {
                  try {
                    await updateMutation.mutateAsync({ id: boletin.id, payload: { isPublic: !boletin.isPublic } });
                    showToast(boletin.isPublic ? 'Boletin privado.' : 'Boletin público.', 'success');
                  } catch (error) {
                    showToast(getErrorMessage(error), 'error');
                  }
                }}
                size="sm"
                title={boletin.isPublic ? 'Tornar privado' : 'Tornar público'}
                variant="secondary"
              />
              <Button
                leftSlot={<Ionicons color={colors.textPrimary} name="share-social-outline" size={16} />}
                onPress={() => showToast('A partilha com amigos será ligada no passo social.', 'info')}
                size="sm"
                title="Partilhar"
                variant="secondary"
              />
            </View>

            {boletin.notes ? (
              <Pressable
                onPress={() => setNotesExpanded((value) => !value)}
                style={[styles.notesCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <View style={styles.notesHeader}>
                  <Text style={[styles.notesTitle, { color: colors.textPrimary }]}>Notas</Text>
                  <Ionicons color={colors.textSecondary} name={notesExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
                </View>
                {notesExpanded ? <Text style={[styles.notesBody, { color: colors.textSecondary }]}>{boletin.notes}</Text> : null}
              </Pressable>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Seleções</Text>
          </View>
        }
        renderItem={({ item }) => <BoletinItem item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        showsVerticalScrollIndicator={false}
      />
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

  return 'Não foi possível atualizar o boletin.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingScreen: { alignItems: 'stretch', flex: 1, justifyContent: 'flex-start' },
  emptyTitle: { fontSize: 22, fontWeight: '900' },
  headerWrap: { gap: 18, marginBottom: 18 },
  statusBanner: { borderRadius: 24, gap: 10, padding: 18 },
  bannerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 34 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '700' },
  summaryCard: { borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 16 },
  summaryMetric: { flex: 1, gap: 6 },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  summaryValue: { fontSize: 16, fontWeight: '900' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  statusActions: { gap: 8 },
  statusChip: { borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 },
  statusChipText: { fontSize: 13, fontWeight: '800' },
  actionButtons: { flexDirection: 'row', gap: 10 },
  notesCard: { borderRadius: 18, borderWidth: 1, gap: 10, padding: 16 },
  notesHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notesTitle: { fontSize: 16, fontWeight: '800' },
  notesBody: { fontSize: 14, lineHeight: 22 },
});