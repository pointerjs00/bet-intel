import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { BoletinStatus, ItemResult, Sport } from '@betintel/shared';
import type { BoletinDetail } from '@betintel/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { PressableScale } from '../../components/ui/PressableScale';
import { useToast } from '../../components/ui/Toast';
import { useBoletins, useUpdateBoletinItemsMutation } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';

type Resolution = 'WON' | 'LOST' | 'VOID' | 'SKIP';

export default function BatchResolveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();

  const boletinsQuery = useBoletins();
  const updateItemsMutation = useUpdateBoletinItemsMutation();

  const pendingBoletins = useMemo(
    () => (boletinsQuery.data ?? []).filter((b) => b.status === BoletinStatus.PENDING),
    [boletinsQuery.data],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());

  // Per-item resolution for LOST bets
  const [awaitingItemResolution, setAwaitingItemResolution] = useState(false);
  const [itemResolutions, setItemResolutions] = useState<Map<string, ItemResult>>(new Map());

  const current = pendingBoletins[currentIndex] as BoletinDetail | undefined;
  const total = pendingBoletins.length;
  const resolvedCount = resolutions.size;

  const handleResolve = useCallback(
    async (resolution: Resolution) => {
      if (!current) return;

      setResolutions((prev) => new Map(prev).set(current.id, resolution));

      if (resolution !== 'SKIP' && current.items.length > 0) {
        const itemResult =
          resolution === 'WON' ? ItemResult.WON : resolution === 'LOST' ? ItemResult.LOST : ItemResult.VOID;

        try {
          await updateItemsMutation.mutateAsync({
            boletinId: current.id,
            items: current.items.map((item) => ({ id: item.id, result: itemResult })),
          });
        } catch {
          showToast('Erro ao resolver boletim.', 'error');
          setResolutions((prev) => {
            const next = new Map(prev);
            next.delete(current.id);
            return next;
          });
          return;
        }
      }

      if (currentIndex < total - 1) {
        setCurrentIndex((i) => i + 1);
      }
    },
    [current, currentIndex, total, updateItemsMutation, showToast],
  );

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoAvailable, setUndoAvailable] = useState<string | null>(null);

  const startUndoTimer = useCallback((boletinId: string) => {
    setUndoAvailable(boletinId);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoAvailable(null), 5000);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoAvailable) return;
    const targetBoletin = pendingBoletins.find(b => b.id === undoAvailable);
    if (!targetBoletin) return;

    try {
      await updateItemsMutation.mutateAsync({
        boletinId: undoAvailable,
        items: targetBoletin.items.map(item => ({ id: item.id, result: ItemResult.PENDING })),
      });
      setResolutions(prev => {
        const next = new Map(prev);
        next.delete(undoAvailable);
        return next;
      });
      setUndoAvailable(null);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      showToast('Resolução desfeita.', 'info');
    } catch {
      showToast('Erro ao desfazer.', 'error');
    }
  }, [undoAvailable, pendingBoletins, updateItemsMutation, showToast]);

  const handleResolveWithUndo = useCallback(
    async (resolution: Resolution) => {
      if (!current) return;

      // For LOST with multiple items: ask user to specify per-item result
      if (resolution === 'LOST' && current.items.length > 1) {
        const initial = new Map(current.items.map((item) => [item.id, ItemResult.LOST]));
        setItemResolutions(initial);
        setAwaitingItemResolution(true);
        return;
      }

      await handleResolve(resolution);
      if (resolution !== 'SKIP') {
        startUndoTimer(current.id);
      }
    },
    [current, handleResolve, startUndoTimer],
  );

  const confirmItemResolution = useCallback(async () => {
    if (!current) return;
    try {
      await updateItemsMutation.mutateAsync({
        boletinId: current.id,
        items: current.items.map((item) => ({
          id: item.id,
          result: itemResolutions.get(item.id) ?? ItemResult.LOST,
        })),
      });
      setResolutions((prev) => new Map(prev).set(current.id, 'LOST'));
      setAwaitingItemResolution(false);
      startUndoTimer(current.id);
      if (currentIndex < total - 1) {
        setCurrentIndex((i) => i + 1);
      }
    } catch {
      showToast('Erro ao resolver boletim.', 'error');
    }
  }, [current, itemResolutions, updateItemsMutation, startUndoTimer, currentIndex, total, showToast]);

  const handleFinish = useCallback(() => {
    const resolved = Array.from(resolutions.values()).filter((r) => r !== 'SKIP').length;
    showToast(`${resolved} boletim${resolved !== 1 ? 'ns' : ''} resolvido${resolved !== 1 ? 's' : ''}.`, 'success');
    router.back();
  }, [resolutions, router, showToast]);

  const isLast = currentIndex >= total - 1;
  const currentResolution = current ? resolutions.get(current.id) : undefined;

  if (total === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Resolver boletins' }} />
        <View style={[styles.emptyCenter, { paddingTop: insets.top + 60 }]}>
          <Ionicons color={colors.textMuted} name="checkmark-circle-outline" size={64} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Tudo resolvido!</Text>
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
            Não tens boletins pendentes para resolver.
          </Text>
          <Button onPress={() => router.back()} title="Voltar" variant="primary" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Resolver boletins' }} />

      <View style={[styles.container, { paddingTop: tokens.spacing.md, paddingBottom: insets.bottom + 24 }]}>
        {/* Progress bar */}
        <Animated.View entering={FadeInDown.duration(160)} style={styles.progressSection}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {currentIndex + 1} de {total}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${((currentIndex + 1) / total) * 100}%`,
                },
              ]}
            />
          </View>
        </Animated.View>

        {/* Current boletin card */}
        {current && (
          <Animated.View key={current.id} entering={FadeInRight.duration(200).springify()} style={styles.cardSection}>
            <Card style={styles.mainCard}>
              <Text style={[styles.boletinName, { color: colors.textPrimary }]}>
                {current.name || 'Boletim sem nome'}
              </Text>

              <View style={styles.metaRow}>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  Stake: {formatCurrency(Number(current.stake))}
                </Text>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  Odds: {formatOdds(Number(current.totalOdds))}
                </Text>
                <Text style={[styles.metaText, { color: colors.primary }]}>
                  → {formatCurrency(Number(current.potentialReturn))}
                </Text>
              </View>

              {/* Items preview with team badges */}
              <View style={[styles.itemsList, { borderColor: colors.border }]}>
                {current.items.slice(0, 5).map((item) => (
                  <View key={item.id} style={[styles.itemRow, { borderColor: colors.border }]}>
                    <View style={styles.itemTeamsRow}>
                      <TeamBadge
                        name={item.homeTeam}
                        size={22}
                        variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                      />
                      <Text numberOfLines={1} style={[styles.itemTeams, { color: colors.textPrimary }]}>
                        {item.homeTeam}
                      </Text>
                      <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
                      <TeamBadge
                        name={item.awayTeam}
                        size={22}
                        variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                      />
                      <Text numberOfLines={1} style={[styles.itemTeams, { color: colors.textPrimary }]}>
                        {item.awayTeam}
                      </Text>
                    </View>
                    <Text style={[styles.itemMarket, { color: colors.textSecondary }]}>
                      {item.market} · {item.selection}
                    </Text>
                  </View>
                ))}
                {current.items.length > 5 && (
                  <Text style={[styles.moreItems, { color: colors.textMuted }]}>
                    + {current.items.length - 5} mais
                  </Text>
                )}
              </View>

              {currentResolution && !awaitingItemResolution && (
                <Text style={[styles.resolvedLabel, {
                  color: currentResolution === 'WON' ? colors.primary :
                    currentResolution === 'LOST' ? colors.danger :
                    currentResolution === 'VOID' ? colors.warning : colors.textMuted
                }]}>
                  {currentResolution === 'SKIP' ? 'Ignorado' : currentResolution === 'WON' ? 'Ganhou' : currentResolution === 'LOST' ? 'Perdeu' : 'Cancelado'}
                </Text>
              )}
            </Card>
          </Animated.View>
        )}

        {/* Action buttons / item resolution / nav */}
        <View style={styles.actionsSection}>
          {awaitingItemResolution ? (
            <Animated.View entering={FadeInDown.duration(160)} style={styles.itemResolutionContainer}>
              <Text style={[styles.itemResolutionTitle, { color: colors.textPrimary }]}>
                Que seleções foram ganhas?
              </Text>
              <ScrollView style={styles.itemResolutionList} showsVerticalScrollIndicator={false}>
                {current?.items.map((item) => {
                  const result = itemResolutions.get(item.id) ?? ItemResult.LOST;
                  const isWon = result === ItemResult.WON;
                  return (
                    <PressableScale
                      key={item.id}
                      scaleDown={0.97}
                      onPress={() => {
                        setItemResolutions((prev) => {
                          const next = new Map(prev);
                          next.set(item.id, isWon ? ItemResult.LOST : ItemResult.WON);
                          return next;
                        });
                      }}
                      style={[
                        styles.itemResolutionRow,
                        {
                          backgroundColor: isWon ? `${colors.primary}18` : `${colors.danger}12`,
                          borderColor: isWon ? colors.primary : colors.danger,
                        },
                      ]}
                    >
                      <View style={styles.itemResolutionLeft}>
                        <View style={styles.itemResolutionTeams}>
                          <TeamBadge
                            name={item.homeTeam}
                            size={20}
                            variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                          />
                          <Text numberOfLines={1} style={[styles.itemResolutionTeamName, { color: colors.textPrimary }]}>
                            {item.homeTeam}
                          </Text>
                          <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
                          <TeamBadge
                            name={item.awayTeam}
                            size={20}
                            variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                          />
                          <Text numberOfLines={1} style={[styles.itemResolutionTeamName, { color: colors.textPrimary }]}>
                            {item.awayTeam}
                          </Text>
                        </View>
                        <Text numberOfLines={1} style={[styles.itemMarket, { color: colors.textSecondary }]}>
                          {item.selection}
                        </Text>
                      </View>
                      <View style={[
                        styles.itemResultBadge,
                        { backgroundColor: isWon ? colors.primary : colors.danger },
                      ]}>
                        <Ionicons
                          name={isWon ? 'checkmark' : 'close'}
                          size={14}
                          color="#fff"
                        />
                        <Text style={styles.itemResultBadgeText}>
                          {isWon ? 'Ganhou' : 'Perdeu'}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </ScrollView>
              <View style={styles.navRow}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setAwaitingItemResolution(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Confirmar"
                  onPress={confirmItemResolution}
                  loading={updateItemsMutation.isPending}
                  style={{ flex: 1 }}
                />
              </View>
            </Animated.View>
          ) : !currentResolution ? (
            <Animated.View entering={FadeInDown.delay(100).duration(160)} style={styles.actionsGrid}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ganhou"
                disabled={updateItemsMutation.isPending}
                onPress={() => handleResolveWithUndo('WON')}
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons color="#FFFFFF" name="checkmark-circle" size={28} />
                <Text style={styles.actionBtnText}>Ganhou</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Perdeu"
                disabled={updateItemsMutation.isPending}
                onPress={() => handleResolveWithUndo('LOST')}
                style={[styles.actionBtn, { backgroundColor: colors.danger }]}
              >
                <Ionicons color="#FFFFFF" name="close-circle" size={28} />
                <Text style={styles.actionBtnText}>Perdeu</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancelado"
                disabled={updateItemsMutation.isPending}
                onPress={() => handleResolveWithUndo('VOID')}
                style={[styles.actionBtn, { backgroundColor: colors.warning }]}
              >
                <Ionicons color="#FFFFFF" name="remove-circle" size={28} />
                <Text style={styles.actionBtnText}>Cancelado</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Saltar"
                disabled={updateItemsMutation.isPending}
                onPress={() => handleResolveWithUndo('SKIP')}
                style={[styles.actionBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 }]}
              >
                <Ionicons color={colors.textSecondary} name="play-skip-forward" size={28} />
                <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Saltar</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInLeft.duration(160)} style={styles.navColumn}>
              {undoAvailable === current?.id && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Desfazer"
                  onPress={handleUndo}
                  style={[styles.undoBar, { backgroundColor: `${colors.info}18`, borderColor: colors.info }]}
                >
                  <Ionicons name="arrow-undo" size={16} color={colors.info} />
                  <Text style={[styles.undoText, { color: colors.info }]}>Desfazer</Text>
                </Pressable>
              )}
              <View style={styles.navRow}>
              {currentIndex > 0 && (
                <Button
                  onPress={() => { setCurrentIndex((i) => i - 1); setAwaitingItemResolution(false); }}
                  size="md"
                  title="← Anterior"
                  variant="secondary"
                />
              )}
              {isLast ? (
                <Button
                  onPress={handleFinish}
                  size="md"
                  style={{ flex: 1 }}
                  title="Concluir"
                  variant="primary"
                />
              ) : (
                <Button
                  onPress={() => { setCurrentIndex((i) => i + 1); setAwaitingItemResolution(false); }}
                  size="md"
                  style={{ flex: 1 }}
                  title="Próximo →"
                  variant="primary"
                />
              )}
              </View>
            </Animated.View>
          )}
        </View>

        {/* Finish button if we've gone through all */}
        {isLast && currentResolution && (
          <Animated.View entering={FadeInDown.duration(160)} style={styles.finishRow}>
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
              {resolvedCount} de {total} resolvidos
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 16, gap: 18 },
  emptyCenter: { alignItems: 'center', gap: 16, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '900' },
  emptyMessage: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  progressSection: { gap: 6 },
  progressText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  progressTrack: { borderRadius: 4, height: 6, overflow: 'hidden' },
  progressFill: { borderRadius: 4, height: '100%' },
  cardSection: { flex: 1 },
  mainCard: { gap: 14, padding: 20 },
  boletinName: { fontSize: 20, fontWeight: '900' },
  metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaText: { fontSize: 13, fontWeight: '700' },
  itemsList: { borderTopWidth: 1, gap: 8, paddingTop: 12 },
  itemRow: { gap: 4 },
  itemTeamsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  itemTeams: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  vsText: { fontSize: 11, fontWeight: '500' },
  itemMarket: { fontSize: 12, fontWeight: '500' },
  moreItems: { fontSize: 12, fontWeight: '600' },
  resolvedLabel: { fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  actionsSection: { gap: 12 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { alignItems: 'center', borderRadius: 14, flex: 1, gap: 6, minWidth: 70, paddingVertical: 16 },
  actionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  navColumn: { gap: 10 },
  navRow: { flexDirection: 'row', gap: 10 },
  undoBar: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  undoText: { fontSize: 14, fontWeight: '700' },
  finishRow: { alignItems: 'center' },
  summaryText: { fontSize: 13, fontWeight: '700' },
  // Item resolution styles
  itemResolutionContainer: { gap: 10, flex: 1 },
  itemResolutionTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  itemResolutionList: { flex: 1, maxHeight: 200 },
  itemResolutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  itemResolutionLeft: { flex: 1, gap: 3 },
  itemResolutionTeams: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  itemResolutionTeamName: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  itemResultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  itemResultBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});
