// Boletim detail: result hero, actions (Editar · Partilhar imagem · …), notes when written by the
// user, one LegCard per selection with the real game, and the link to "Análise do boletim".
// Editing uses the same sheet as the screenshot import (EditLegSheet) — the old in-place edit mode,
// the "Editar seleção" modal and the manual result buttons were removed (screen review, 11/11/2026).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BoletinStatus, ItemResult, Sport, type BoletinDetail } from '@betintel/shared';
import { BoletimResultHero } from '../../components/boletins/BoletimResultHero';
import { LegCard } from '../../components/boletins/LegCard';
import { IconTile } from '../../components/stats/v3/StatCard';
import { WinCelebration } from '../../components/boletins/WinCelebration';
import { ShareCard } from '../../components/boletins/ShareCard';
import { EditLegSheet, type SavedExtras } from '../../components/import/EditLegSheet';
import { useShareBoletinSheet } from '../../components/social/ShareBoletinProvider';
import { AppText } from '../../components/ui/AppText';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListCard, ListRow } from '../../components/ui/ListCard';
import { Pressable } from '../../components/ui/Pressable';
import { PressableScale } from '../../components/ui/PressableScale';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import {
  useAddBoletinItemMutation,
  useBoletinDetail,
  useDeleteBoletinItemMutation,
  useDeleteBoletinMutation,
  useUpdateBoletinItemMutation,
  useUpdateBoletinMutation,
} from '../../services/boletinService';
import type { ParsedBetclicBoletin } from '../../services/importService';
import { useItemMatches, type ItemMatch } from '../../services/sportsService';
import { useAuthStore } from '../../stores/authStore';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useTheme } from '../../theme/useTheme';

type Draft = ParsedBetclicBoletin & { site?: string | null; items: Array<ParsedBetclicBoletin['items'][number] & { id?: string }> };

const AUTO_NOTE = /^importad[oa] d[oa] /i;
const toNum = (s: string) => Number(s.replace(',', '.'));

/** Saved boletim → the shape the edit sheet works on. */
function toDraft(b: BoletinDetail): Draft {
  return {
    reference: b.id,
    betDate: b.betDate ?? b.createdAt,
    stake: Number(b.stake),
    totalOdds: Number(b.totalOdds),
    potentialReturn: Number(b.potentialReturn),
    status: b.status,
    site: b.siteSlug ?? null,
    parseError: false,
    items: b.items.map((it) => ({
      id: it.id,
      homeTeam: it.homeTeam,
      awayTeam: it.awayTeam,
      competition: it.competition ?? '',
      sport: it.sport ?? Sport.FOOTBALL,
      market: it.market,
      selection: it.selection,
      oddValue: Number(it.oddValue),
      eventDate: it.kickoffAt ?? undefined,
      result: it.result as 'WON' | 'LOST' | 'VOID' | 'PENDING',
    })),
  };
}

/** "Celtics 123–101 76ers · terminado" for the sheet. */
function matchLine(m: ItemMatch | null | undefined): string | null {
  if (!m) return null;
  const score = m.score ? `${m.home} ${m.score.home}–${m.score.away} ${m.away}` : `${m.home} vs ${m.away}`;
  const state = m.status === 'FINISHED' ? 'terminado' : m.status === 'LIVE' || m.status === 'HALFTIME' ? 'a decorrer' : 'por começar';
  return `${score} · ${state}`;
}

function errorText(error: unknown): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string') return data.error;
  return error instanceof Error ? error.message : 'Não foi possível guardar.';
}

export default function BoletinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const { openShareBoletinSheet } = useShareBoletinSheet();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const boletinQuery = useBoletinDetail(id);
  const itemMatches = useItemMatches(id);
  const updateMutation = useUpdateBoletinMutation();
  const updateItemMutation = useUpdateBoletinItemMutation();
  const addItemMutation = useAddBoletinItemMutation();
  const deleteItemMutation = useDeleteBoletinItemMutation();
  const deleteMutation = useDeleteBoletinMutation();

  const [notesOpen, setNotesOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const extrasRef = useRef<SavedExtras | null>(null);
  const prevStatus = useRef<BoletinStatus | undefined>(undefined);

  const boletin = boletinQuery.data;
  const canEdit = Boolean(boletin && currentUserId && boletin.userId === currentUserId);
  const userNotes = boletin?.notes && !AUTO_NOTE.test(boletin.notes.trim()) ? boletin.notes : null;

  // Celebrate when the boletim turns WON while the screen is open (not on first load).
  useEffect(() => {
    if (!boletin) return;
    if (prevStatus.current && prevStatus.current !== BoletinStatus.WON && boletin.status === BoletinStatus.WON) setShowCelebration(true);
    prevStatus.current = boletin.status;
  }, [boletin]);

  const openEditor = (index = 0) => {
    if (!boletin) return;
    setDraft(toDraft(boletin));
    setEditIndex(index);
  };

  /** Persists what the sheet changed: selections (update / add), then the boletim fields. */
  const persist = useCallback(async (next: Draft, extras: SavedExtras | null) => {
    if (!boletin) return;
    try {
      const original = new Map(boletin.items.map((it) => [it.id, it]));
      for (const it of next.items) {
        const kickoffAt = it.eventDate ? new Date(it.eventDate).toISOString() : null;
        if (it.id && original.has(it.id)) {
          const o = original.get(it.id)!;
          const changes = {
            ...(it.homeTeam !== o.homeTeam ? { homeTeam: it.homeTeam } : {}),
            ...(it.awayTeam !== o.awayTeam ? { awayTeam: it.awayTeam } : {}),
            ...(it.competition && it.competition !== o.competition ? { competition: it.competition } : {}),
            ...(it.sport !== o.sport ? { sport: it.sport as Sport } : {}),
            ...(it.market !== o.market ? { market: it.market } : {}),
            ...(it.selection !== o.selection ? { selection: it.selection } : {}),
            ...(it.oddValue > 0 && it.oddValue !== Number(o.oddValue) ? { oddValue: it.oddValue } : {}),
            ...(it.result && it.result !== o.result ? { result: it.result as ItemResult } : {}),
            ...(kickoffAt !== (o.kickoffAt ? new Date(o.kickoffAt).toISOString() : null) ? { kickoffAt } : {}),
          };
          if (Object.keys(changes).length) await updateItemMutation.mutateAsync({ boletinId: boletin.id, itemId: it.id, item: changes });
        } else if (!it.id && it.homeTeam && it.awayTeam && it.market && it.selection && it.oddValue > 1) {
          await addItemMutation.mutateAsync({
            boletinId: boletin.id,
            item: { homeTeam: it.homeTeam, awayTeam: it.awayTeam, competition: it.competition || 'Outra', sport: it.sport as Sport, market: it.market, selection: it.selection, oddValue: it.oddValue, kickoffAt },
          });
        }
      }
      const payload: Record<string, unknown> = {};
      if (next.stake > 0 && next.stake !== Number(boletin.stake)) payload.stake = next.stake;
      if ((next.site ?? null) !== (boletin.siteSlug ?? null)) payload.siteSlug = next.site ?? null;
      const betIso = next.betDate ? new Date(next.betDate).toISOString() : null;
      if (betIso && betIso !== (boletin.betDate ? new Date(boletin.betDate).toISOString() : null)) payload.betDate = betIso;
      if (extras) {
        if (extras.isFreebet !== boletin.isFreebet) payload.isFreebet = extras.isFreebet;
        if (extras.isPublic !== boletin.isPublic) payload.isPublic = extras.isPublic;
        if (extras.notes !== (boletin.notes ?? '')) payload.notes = extras.notes;
        const cash = extras.cashout.trim() ? toNum(extras.cashout) : null;
        const prevCash = boletin.cashoutAmount != null ? Number(boletin.cashoutAmount) : null;
        if (cash !== prevCash && (cash === null || Number.isFinite(cash))) payload.cashoutAmount = cash;
      }
      if (Object.keys(payload).length) await updateMutation.mutateAsync({ id: boletin.id, payload });
      showToast('Boletim atualizado.', 'success');
    } catch (error) {
      showToast(errorText(error), 'error');
    }
  }, [boletin, updateItemMutation, addItemMutation, updateMutation, showToast]);

  const handleClone = useCallback(() => {
    if (!boletin) return;
    const builder = useBoletinBuilderStore.getState();
    builder.reset();
    for (const item of boletin.items) {
      builder.addItem({
        id: `clone-${item.id}-${Date.now()}`,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        competition: item.competition ?? '',
        sport: (item.sport ?? Sport.FOOTBALL) as Sport,
        market: item.market,
        selection: item.selection,
        oddValue: Number(item.oddValue),
      });
    }
    builder.setStake(Number(boletin.stake));
    if (boletin.siteSlug) builder.setSiteSlug(boletin.siteSlug);
    builder.setFreebet(false);
    router.push('/boletins/confirmar');
    showToast('Boletim duplicado. Revê e guarda.', 'success');
  }, [boletin, router, showToast]);

  const openMatch = (m: ItemMatch | null | undefined, itemId: string) => {
    if (!m) return undefined;
    if (m.sport === 'FOOTBALL' && m.league) return () => router.push({ pathname: '/jogo/[id]', params: { id: m.providerMatchId, league: m.league!, item: itemId } });
    if (m.sport === 'BASKETBALL') return () => router.push({ pathname: '/jogo/nba/[id]', params: { id: m.providerMatchId } });
    if (m.sport === 'TENNIS') return () => router.push({ pathname: '/jogo/tenis/[id]', params: { id: m.providerMatchId, date: m.kickoffAt.slice(0, 10) } });
    return undefined;
  };

  const certas = useMemo(() => boletin?.items.filter((i) => i.result === ItemResult.WON).length ?? 0, [boletin]);

  if (boletinQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingHorizontal: tokens.spacing.lg, paddingTop: 16, gap: 14 }]}>
        <Stack.Screen options={{ title: 'Boletim' }} />
        <Skeleton height={190} width="100%" />
        <Skeleton height={44} width="100%" />
        <Skeleton height={150} width="100%" />
      </View>
    );
  }
  if (!boletin) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <EmptyState icon="file-document-outline" message="O boletim pode ter sido removido ou não existe." title="Boletim não encontrado" />
      </View>
    );
  }

  const header = (
    <View style={styles.headerWrap}>
      <BoletimResultHero boletin={boletin} />
      {canEdit ? (
        <View style={styles.actions}>
          <Button leftSlot={<Ionicons color={colors.textPrimary} name="create-outline" size={16} />} onPress={() => openEditor(0)} size="sm" style={styles.flex} title="Editar" variant="secondary" />
          <Button leftSlot={<Ionicons color={colors.textPrimary} name="image-outline" size={16} />} onPress={() => setShowShareCard(true)} size="sm" style={styles.flex} title="Partilhar imagem" variant="secondary" />
          <Pressable accessibilityLabel="Mais ações" accessibilityRole="button" onPress={() => setShowMore(true)} style={[styles.more, { backgroundColor: colors.surface }]}>
            <Ionicons color={colors.textPrimary} name="ellipsis-horizontal" size={20} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.readOnly, { backgroundColor: colors.surface }]}>
          <Ionicons color={colors.info} name="lock-closed-outline" size={16} />
          <Text style={[styles.readOnlyText, { color: colors.textSecondary }]}>Partilhado por {boletin.user.displayName ?? `@${boletin.user.username}`}.</Text>
        </View>
      )}
      {userNotes ? (
        <Pressable onPress={() => setNotesOpen((v) => !v)} style={[styles.notes, { backgroundColor: colors.surface }]}>
          <View style={styles.notesHead}>
            <AppText variant="bodyStrong">Notas</AppText>
            <Ionicons color={colors.textSecondary} name={notesOpen ? 'chevron-up' : 'chevron-down'} size={18} />
          </View>
          <Text numberOfLines={notesOpen ? undefined : 1} style={[styles.notesBody, { color: colors.textSecondary }]}>{userNotes}</Text>
        </Pressable>
      ) : null}
      <AppText style={styles.section} variant="title">
        {boletin.items.length > 1 ? `Jogos · ${certas} de ${boletin.items.length} certas` : 'Jogo'}
      </AppText>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Boletim' }} />
      <FlatList
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: tokens.spacing.lg, paddingTop: 8 }}
        data={boletin.items}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        keyExtractor={(it) => it.id}
        ListFooterComponent={(
          <Animated.View entering={FadeInDown.delay(200).duration(280)} style={styles.footer}>
            <PressableScale accessibilityRole="button" onPress={() => router.push({ pathname: '/boletins/analise', params: { id: boletin.id } })} style={[styles.analysis, { backgroundColor: colors.surface }]}>
              <IconTile icon={{ name: 'stats-chart', tone: 'blue' }} size={34} />
              <View style={styles.flex}>
                <Text style={[styles.analysisTitle, { color: colors.textPrimary }]}>Análise do boletim</Text>
                <Text style={[styles.analysisSub, { color: colors.textMuted }]}>Porque {boletin.status === BoletinStatus.WON ? 'ganhou' : boletin.status === BoletinStatus.LOST ? 'perdeu' : 'pode ganhar'} e o teu histórico</Text>
              </View>
              <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
            </PressableScale>
          </Animated.View>
        )}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <LegCard index={index} item={item} match={itemMatches.data?.[item.id] ?? null} onPress={openMatch(itemMatches.data?.[item.id], item.id)} />
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* "…" sheet */}
      <Modal animationType="slide" onRequestClose={() => setShowMore(false)} transparent visible={showMore}>
        <Pressable accessibilityLabel="Fechar" feedback="none" onPress={() => setShowMore(false)} style={styles.backdrop} />
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grab, { backgroundColor: colors.border }]} />
          <ListCard>
            {[
              { icon: 'people-outline' as const, label: 'Partilhar com amigos', onPress: () => openShareBoletinSheet({ boletinId: boletin.id, boletinName: boletin.name }) },
              { icon: 'copy-outline' as const, label: 'Duplicar', onPress: handleClone },
              { icon: 'document-text-outline' as const, label: userNotes ? 'Editar notas' : 'Adicionar nota', onPress: () => openEditor(0) },
              { icon: 'trash-outline' as const, label: 'Apagar', danger: true, onPress: () => setPendingDelete(true) },
            ].map((a) => (
              <ListRow accessibilityLabel={a.label} key={a.label} onPress={() => { setShowMore(false); a.onPress(); }}>
                <Ionicons color={a.danger ? colors.danger : colors.textPrimary} name={a.icon} size={20} />
                <AppText style={[styles.flex, a.danger ? { color: colors.danger } : null]} variant="bodyStrong">{a.label}</AppText>
              </ListRow>
            ))}
          </ListCard>
        </View>
      </Modal>

      {draft && editIndex !== null ? (
        <EditLegSheet
          boletin={draft}
          index={Math.min(editIndex, draft.items.length - 1)}
          matchLine={matchLine(itemMatches.data?.[draft.items[editIndex]?.id ?? ''])}
          onAdd={() => setDraft((d) => {
            if (!d) return d;
            const last = d.items[d.items.length - 1];
            const items = [...d.items, { homeTeam: '', awayTeam: '', competition: last?.competition ?? '', sport: last?.sport ?? 'FOOTBALL', market: '', selection: '', oddValue: 0, result: 'PENDING' as const }];
            setEditIndex(items.length - 1);
            return { ...d, items };
          })}
          onClose={() => { setEditIndex(null); setDraft(null); }}
          onNavigate={setEditIndex}
          onRemove={() => setRemoveIndex(editIndex)}
          onSave={(next) => {
            setDraft(next as Draft);
            // onSaveExtras runs right after onSave; persist once both are in.
            void Promise.resolve().then(() => persist(next as Draft, extrasRef.current));
          }}
          onSaveExtras={(e) => { extrasRef.current = e; }}
          saved={{ isFreebet: boletin.isFreebet, cashout: boletin.cashoutAmount != null ? String(boletin.cashoutAmount).replace('.', ',') : '', notes: boletin.notes ?? '', isPublic: boletin.isPublic }}
          visible
        />
      ) : null}

      <ConfirmModal
        confirmLabel="Remover"
        message="Queres remover esta seleção do boletim?"
        onCancel={() => setRemoveIndex(null)}
        onConfirm={async () => {
          const idx = removeIndex;
          setRemoveIndex(null);
          if (idx === null || !draft) return;
          const target = draft.items[idx];
          const rest = draft.items.filter((_, i) => i !== idx);
          setDraft(rest.length ? { ...draft, items: rest } : null);
          setEditIndex(rest.length ? Math.max(0, idx - 1) : null);
          if (target?.id) {
            try {
              await deleteItemMutation.mutateAsync({ boletinId: boletin.id, itemId: target.id });
              showToast('Seleção removida.', 'success');
            } catch (error) {
              showToast(errorText(error), 'error');
            }
          }
        }}
        title="Remover seleção"
        visible={removeIndex !== null}
      />
      <ConfirmModal
        confirmLabel="Apagar"
        message="O boletim e as suas seleções serão apagados. Não dá para desfazer."
        onCancel={() => setPendingDelete(false)}
        onConfirm={async () => {
          setPendingDelete(false);
          try {
            await deleteMutation.mutateAsync(boletin.id);
            showToast('Boletim apagado.', 'success');
            router.back();
          } catch (error) {
            showToast(errorText(error), 'error');
          }
        }}
        title="Apagar boletim"
        visible={pendingDelete}
      />
      {showCelebration ? (
        <WinCelebration onDismiss={() => setShowCelebration(false)} profit={Number(boletin.actualReturn ?? boletin.potentialReturn) - Number(boletin.stake)} totalOdds={Number(boletin.totalOdds)} />
      ) : null}
      <Modal animationType="slide" onRequestClose={() => setShowShareCard(false)} transparent visible={showShareCard}>
        <Pressable feedback="none" onPress={() => setShowShareCard(false)} style={styles.shareOverlay}>
          <Pressable feedback="none">
            <ShareCard boletin={boletin} onClose={() => setShowShareCard(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  headerWrap: { gap: 14, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  more: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 48 },
  readOnly: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 8, padding: 12 },
  readOnlyText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  notes: { borderRadius: 16, gap: 6, padding: 14 },
  notesHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notesBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  section: { marginTop: 4 },
  footer: { marginTop: 16 },
  analysis: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 12, padding: 14 },
  analysisTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  analysisSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10, padding: 16 },
  grab: { alignSelf: 'center', borderRadius: 2, height: 4, width: 40 },
  shareOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', flex: 1, justifyContent: 'center', padding: 16 },
});
