import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BoletinStatus } from '@betintel/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../components/ui/Toast';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import {
  useBulkImportMutation,
  type BetclicPdfResult,
  type ParsedBetclicBoletin,
} from '../../services/importService';
import { StatusBadge } from '../../components/boletins/StatusBadge';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatParsedDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ImportReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ data: string }>();
  const bulkImportMutation = useBulkImportMutation();

  // Parse the data passed from the profile screen
  const pdfResult: BetclicPdfResult | null = useMemo(() => {
    try {
      return params.data ? JSON.parse(params.data) : null;
    } catch {
      return null;
    }
  }, [params.data]);

  const boletins = pdfResult?.boletins ?? [];

  // Selection state — by default, all non-error bets are selected
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    boletins.forEach((b, i) => {
      if (!b.parseError) initial.add(i);
    });
    return initial;
  });
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const selectedCount = selected.size;
  const errorCount = boletins.filter((b) => b.parseError).length;
  const duplicateCount = 0; // Duplicates are detected server-side during bulk import

  // Shake animation for disabled button
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const toggleItem = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedCount === boletins.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(boletins.map((_, i) => i)));
    }
  }, [selectedCount, boletins]);

  const toggleExpanded = useCallback((index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (selectedCount === 0) {
      // Shake animation
      shakeX.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
      return;
    }

    const selectedBoletins = boletins.filter((_, i) => selected.has(i));

    try {
      const result = await bulkImportMutation.mutateAsync(selectedBoletins);

      if (result.imported === 0 && result.duplicates > 0) {
        showToast('Todas as apostas já tinham sido importadas anteriormente', 'info');
      } else {
        showToast(`${result.imported} boletins importados com sucesso 🎉`, 'success');
      }

      router.back();
      // Navigate back to profile (the router.back() from review goes to profile)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro de ligação. Tenta novamente';
      showToast(msg, 'error');
    }
  }, [selectedCount, boletins, selected, bulkImportMutation, router, showToast, shakeX]);

  const renderItem = useCallback(
    ({ item, index }: { item: ParsedBetclicBoletin; index: number }) => {
      const isSelected = selected.has(index);
      const isExpanded = expanded.has(index);
      const firstItem = item.items[0];

      return (
        <Pressable onPress={() => toggleItem(index)}>
          <Card
            style={[
              styles.betCard,
              !isSelected && styles.betCardDeselected,
              { borderLeftColor: isSelected ? (item.parseError ? colors.warning : colors.primary) : colors.border },
            ]}
          >
            <View style={styles.betCardHeader}>
              <View style={styles.betCardCheckRow}>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.betCardDate, { color: colors.textSecondary }]} numberOfLines={1}>
                  {formatParsedDate(item.betDate)}
                </Text>
              </View>
              <View style={styles.betCardBadges}>
                {item.parseError && (
                  <Badge label="Erro" variant="warning" />
                )}
                <StatusBadge status={item.status as BoletinStatus} />
              </View>
            </View>

            {/* Event info */}
            {firstItem && (
              <View style={styles.betCardEvent}>
                <Text style={[styles.betCardTeams, { color: colors.textPrimary }]} numberOfLines={1}>
                  {firstItem.homeTeam} vs {firstItem.awayTeam}
                </Text>
                {item.items.length > 1 && (
                  <Text style={[styles.betCardMore, { color: colors.textMuted }]}>
                    + {item.items.length - 1} {item.items.length === 2 ? 'seleção' : 'seleções'}
                  </Text>
                )}
              </View>
            )}

            {firstItem && (
              <View style={styles.betCardMeta}>
                <Text style={[styles.betCardMetaText, { color: colors.textSecondary }]}>
                  {firstItem.market} • {firstItem.selection}
                </Text>
              </View>
            )}

            {/* Stake / Odds / Return row */}
            <View style={styles.betCardMetrics}>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Stake</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatCurrency(item.stake)}
                </Text>
              </View>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Odds</Text>
                <Text style={[styles.metricValue, { color: colors.gold }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatOdds(item.totalOdds)}
                </Text>
              </View>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Retorno</Text>
                <Text style={[styles.metricValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatCurrency(item.potentialReturn)}
                </Text>
              </View>
            </View>

            {/* Error reason */}
            {item.parseError && item.parseErrorReason && (
              <Text style={[styles.betCardError, { color: colors.warning }]} numberOfLines={2}>
                ⚠ {item.parseErrorReason}
              </Text>
            )}

            {item.items.length > 0 && (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  toggleExpanded(index);
                }}
                style={[styles.detailsButton, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
              >
                <Text style={[styles.detailsButtonText, { color: colors.textPrimary }]}>
                  {isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}

            {isExpanded && item.items.length > 0 && (
              <View style={[styles.detailsPanel, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                {item.items.map((selectionItem, selectionIndex) => (
                  <View
                    key={`${item.reference}-${selectionIndex}`}
                    style={[
                      styles.selectionRow,
                      selectionIndex < item.items.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <View style={styles.selectionInfo}>
                      <Text style={[styles.selectionTeams, { color: colors.textPrimary }]} numberOfLines={1}>
                        {selectionItem.homeTeam} vs {selectionItem.awayTeam}
                      </Text>
                      <Text style={[styles.selectionMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                        {selectionItem.market} • {selectionItem.selection}
                      </Text>
                    </View>
                    <Text style={[styles.selectionOdd, { color: colors.gold }]}>@ {formatOdds(selectionItem.oddValue)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </Pressable>
      );
    },
    [selected, expanded, toggleItem, toggleExpanded, colors],
  );

  if (!pdfResult || boletins.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Rever importação' }} />
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="file-alert-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Não encontrámos apostas neste ficheiro.
          </Text>
          <Button title="Voltar" onPress={() => router.back()} variant="ghost" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Rever importação' }} />

      {/* Summary banner */}
      <Animated.View entering={FadeInDown.duration(160)} style={[styles.summaryBanner, { backgroundColor: colors.surface }]}>
        <Text style={[styles.summaryText, { color: colors.textPrimary }]}>
          <Text style={{ fontWeight: '900' }}>{boletins.length}</Text> apostas encontradas
          {errorCount > 0 && (
            <Text style={{ color: colors.warning }}> · {errorCount} com erros</Text>
          )}
          {duplicateCount > 0 && (
            <Text style={{ color: colors.textMuted }}> · {duplicateCount} duplicadas</Text>
          )}
        </Text>
      </Animated.View>

      {/* Select all toggle */}
      <View style={[styles.selectAllRow, { borderColor: colors.border }]}>
        <Pressable onPress={toggleAll} style={styles.selectAllButton}>
          <Ionicons
            name={selectedCount === boletins.length ? 'checkbox' : 'square-outline'}
            size={20}
            color={selectedCount === boletins.length ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.selectAllLabel, { color: colors.textPrimary }]}>
            {selectedCount === boletins.length ? 'Desselecionar tudo' : 'Selecionar tudo'}
          </Text>
        </Pressable>
        <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
          {selectedCount} selecionadas
        </Text>
      </View>

      {/* Bet list */}
      <FlatList
        data={boletins}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.lg,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Sticky footer */}
      <Animated.View style={[shakeStyle]}>
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + tokens.spacing.md,
            },
          ]}
        >
          <Button
            title={selectedCount > 0 ? `Importar ${selectedCount} apostas` : 'Importar'}
            onPress={handleImport}
            loading={bulkImportMutation.isPending}
            disabled={selectedCount === 0 && !bulkImportMutation.isPending}
          />
          <Button
            title="Cancelar"
            variant="ghost"
            onPress={() => router.back()}
            disabled={bulkImportMutation.isPending}
          />
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  summaryBanner: { paddingHorizontal: 16, paddingVertical: 12 },
  summaryText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectAllButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllLabel: { fontSize: 14, fontWeight: '600' },
  selectedCount: { fontSize: 13 },
  betCard: {
    marginTop: 10,
    gap: 8,
    borderLeftWidth: 4,
  },
  betCardDeselected: { opacity: 0.5 },
  betCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  betCardCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  betCardBadges: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '55%' },
  betCardDate: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  betCardEvent: { gap: 2 },
  betCardTeams: { fontSize: 15, fontWeight: '700' },
  betCardMore: { fontSize: 12 },
  betCardMeta: {},
  betCardMetaText: { fontSize: 13 },
  betCardMetrics: { flexDirection: 'row', gap: 12, marginTop: 4 },
  betCardMetricItem: { gap: 2, flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  metricValue: { fontSize: 14, fontWeight: '800' },
  betCardError: { fontSize: 12, fontStyle: 'italic' },
  detailsButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  detailsButtonText: { fontSize: 12, fontWeight: '700' },
  detailsPanel: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: 'hidden',
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectionInfo: { flex: 1, gap: 2, minWidth: 0 },
  selectionTeams: { fontSize: 13, fontWeight: '700' },
  selectionMeta: { fontSize: 12, lineHeight: 18 },
  selectionOdd: { fontSize: 12, fontWeight: '800', paddingTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
