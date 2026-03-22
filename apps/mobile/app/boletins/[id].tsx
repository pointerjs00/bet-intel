import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BoletinStatus } from '@betintel/shared';
import { BoletinItem } from '../../components/boletins/BoletinItem';
import { OddsCalculator } from '../../components/boletins/OddsCalculator';
import { StatusBadge } from '../../components/boletins/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
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
        <Card style={{ marginTop: 18, gap: 12 }}>
          <Skeleton height={18} width={120} />
          <Skeleton height={40} width="100%" />
        </Card>
        <Card style={{ marginTop: 14, gap: 14 }}>
          <Skeleton height={18} width={140} />
          <Skeleton height={80} width="100%" />
        </Card>
      </View>
    );
  }

  if (!boletin) {
    return (
      <View style={[styles.loadingScreen, styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="file-document-outline"
          title="Boletin não encontrado"
          message="O boletin pode ter sido removido ou não existe."
        />
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
            <Animated.View entering={FadeInUp.duration(400).springify()}>
              <View style={[styles.statusBanner, { backgroundColor: bannerColor }]}>
                <StatusBadge status={boletin.status} />
                <Text style={styles.bannerTitle}>{boletin.name ?? 'Boletin sem nome'}</Text>
                <Text style={styles.bannerSubtitle}>{formatLongDate(boletin.createdAt)}</Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <OddsCalculator
                potentialReturn={Number(boletin.actualReturn ?? boletin.potentialReturn)}
                stake={Number(boletin.stake)}
                totalOdds={Number(boletin.totalOdds)}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
              <Card style={styles.summaryCard}>
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
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300).duration(400).springify()}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Estado</Text>
              <FlatList
                contentContainerStyle={styles.statusActions}
                data={STATUS_ACTIONS}
                horizontal
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => (
                  <Chip
                    label={item.label}
                    selected={item.key === boletin.status}
                    onPress={async () => {
                      try {
                        await updateMutation.mutateAsync({ id: boletin.id, payload: { status: item.key } });
                        showToast('Estado atualizado.', 'success');
                      } catch (error) {
                        showToast(getErrorMessage(error), 'error');
                      }
                    }}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(350).duration(400).springify()} style={styles.actionButtons}>
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
            </Animated.View>

            {boletin.notes ? (
              <Animated.View entering={FadeInDown.delay(400).duration(400).springify()}>
                <Card onPress={() => setNotesExpanded((value) => !value)} style={styles.notesCard}>
                  <View style={styles.notesHeader}>
                    <Text style={[styles.notesTitle, { color: colors.textPrimary }]}>Notas</Text>
                    <Ionicons color={colors.textSecondary} name={notesExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
                  </View>
                  {notesExpanded ? <Text style={[styles.notesBody, { color: colors.textSecondary }]}>{boletin.notes}</Text> : null}
                </Card>
              </Animated.View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Seleções</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(450 + index * 60).duration(400).springify()}>
            <BoletinItem item={item} />
          </Animated.View>
        )}
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
  center: { alignItems: 'center', justifyContent: 'center' },
  headerWrap: { gap: 18, marginBottom: 18 },
  statusBanner: { borderRadius: 24, gap: 10, padding: 18 },
  bannerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 34 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '700' },
  summaryCard: { flexDirection: 'row', gap: 12 },
  summaryMetric: { flex: 1, gap: 6 },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  summaryValue: { fontSize: 16, fontWeight: '900' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  statusActions: { gap: 8 },
  actionButtons: { flexDirection: 'row', gap: 10 },
  notesCard: { gap: 10 },
  notesHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notesTitle: { fontSize: 16, fontWeight: '800' },
  notesBody: { fontSize: 14, lineHeight: 22 },
});