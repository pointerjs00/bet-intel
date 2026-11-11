// Import bets from screenshots — one screen, four phases:
// pick (skipped when an image is shared to the app) → reading → review (tap a selection to fix
// anything) → imported. The betting site is read from the image; fields the reader was unsure
// about are highlighted; already-imported slips are flagged and left out.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import { Pressable } from '../../components/ui/Pressable';
import { PressableScale } from '../../components/ui/PressableScale';
import { SiteMark } from '../../components/ui/SiteMark';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useCardElevation } from '../../components/ui/ListCard';
import { useToast } from '../../components/ui/Toast';
import { EditLegSheet } from '../../components/import/EditLegSheet';
import { useTheme } from '../../theme/useTheme';
import {
  consumeScanFeedbackContext,
  scanImageAiRequest,
  storeScanFeedbackContext,
  submitScanFeedbackRequest,
  useBulkImportMutation,
  type ParsedBetclicBoletin,
} from '../../services/importService';
import { useBoletins } from '../../services/boletinService';
import { resolveTeamAlias, inferCompetition, normalizeCompetitionName } from '../../utils/teamAliases';
import { hapticError, hapticLight, hapticSuccess } from '../../utils/haptics';
import { formatCurrency } from '../../utils/formatters';

type Phase = 'pick' | 'reading' | 'review' | 'done';
type Draft = ParsedBetclicBoletin & { key: string; selected: boolean; duplicate: boolean };

const STATUS_LABEL: Record<string, string> = { PENDING: 'Pendente', WON: 'Ganhou', LOST: 'Perdeu', VOID: 'Anulado', CASHOUT: 'Cashout' };
const SPORT_LABEL: Record<string, string> = { FOOTBALL: 'Futebol', TENNIS: 'Ténis', BASKETBALL: 'Basquetebol' };

export default function ImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { sharedImageUri } = useLocalSearchParams<{ sharedImageUri?: string }>();
  const boletins = useBoletins();
  const bulkImport = useBulkImportMutation();

  const [phase, setPhase] = useState<Phase>('pick');
  const [images, setImages] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; step: number }>({ current: 0, total: 0, step: 0 });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<{ b: number; i: number } | null>(null);
  const [created, setCreated] = useState<{ ids: string[]; count: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedShared = useRef(false);

  // Recent photos from the gallery (screenshots are usually the latest).
  useEffect(() => {
    (async () => {
      try {
        let perm = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        if (!perm.granted && perm.accessPrivileges !== 'limited') return;
        const page = await MediaLibrary.getAssetsAsync({ first: 8, mediaType: MediaLibrary.MediaType.photo, sortBy: [MediaLibrary.SortBy.creationTime] });
        setRecent(page.assets.map((a) => a.uri));
      } catch (err) {
        console.warn('[import] recent photos unavailable', err);
      }
    })();
  }, []);

  // ── Reading ────────────────────────────────────────────────────────────────
  const read = useCallback(async (uris: string[]) => {
    if (!uris.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('reading');
    setProgress({ current: 1, total: uris.length, step: 0 });
    const stepTimer = setInterval(() => setProgress((p) => ({ ...p, step: Math.min(p.step + 1, 3) })), 1400);
    const out: ParsedBetclicBoletin[] = [];
    try {
      for (let i = 0; i < uris.length; i++) {
        setProgress({ current: i + 1, total: uris.length, step: 0 });
        const small = await ImageManipulator.manipulateAsync(uris[i]!, [{ resize: { width: 1000 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
        const base64 = await FileSystem.readAsStringAsync(small.uri, { encoding: FileSystem.EncodingType.Base64 });
        const result = await scanImageAiRequest(base64, 'image/jpeg', controller.signal);
        storeScanFeedbackContext({ imageBase64: base64, mimeType: 'image/jpeg', aiOutput: result });
        out.push(...result.boletins.map((b) => ({
          ...b,
          items: b.items.map((it) => {
            const home = resolveTeamAlias(it.homeTeam);
            const away = resolveTeamAlias(it.awayTeam);
            return { ...it, homeTeam: home, awayTeam: away, competition: inferCompetition(home, away) || normalizeCompetitionName(it.competition) };
          }),
        })));
      }
      clearInterval(stepTimer);
      if (!out.length) {
        hapticError();
        showToast('Não encontrei nenhuma aposta. Confirma que é o screenshot de um boletim.', 'error');
        setPhase('pick');
        return;
      }
      hapticSuccess();
      setDrafts(out.map((b, i) => {
        const dup = isDuplicate(b, boletins.data ?? []);
        return { ...b, key: `${b.reference}-${i}`, selected: !dup, duplicate: dup };
      }));
      setPhase('review');
    } catch (err) {
      clearInterval(stepTimer);
      if (axios.isCancel(err)) { setPhase('pick'); return; }
      hapticError();
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg.includes('timeout') ? 'A leitura demorou demasiado. Tenta outra vez.' : `Não foi possível ler: ${msg}`, 'error');
      setPhase('pick');
    } finally {
      abortRef.current = null;
    }
  }, [boletins.data, showToast]);

  // Shared from another app: go straight to reading.
  useEffect(() => {
    if (sharedImageUri && !startedShared.current) {
      startedShared.current = true;
      setImages([sharedImageUri]);
      void read([sharedImageUri]);
    }
  }, [sharedImageUri, read]);

  const pickGallery = useCallback(async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsMultipleSelection: true });
      if (!r.canceled && r.assets.length) { hapticLight(); setImages((p) => [...p, ...r.assets.map((a) => a.uri)]); }
    } catch { showToast('Não foi possível abrir a galeria. Verifica as permissões.', 'error'); }
  }, [showToast]);
  const takePhoto = useCallback(async () => {
    try {
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (!r.canceled && r.assets[0]) { hapticLight(); setImages((p) => [...p, r.assets[0]!.uri]); }
    } catch { showToast('Não foi possível abrir a câmara. Verifica as permissões.', 'error'); }
  }, [showToast]);
  const toggleRecent = (uri: string) => {
    hapticLight();
    setImages((p) => (p.includes(uri) ? p.filter((u) => u !== uri) : [...p, uri]));
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const selected = drafts.filter((d) => d.selected);
  const doImport = useCallback(async () => {
    if (!selected.length) return;
    // One request per betting site (the API takes the site per request).
    const bySite = new Map<string, Draft[]>();
    for (const d of selected) {
      const k = d.site ?? 'outros';
      bySite.set(k, [...(bySite.get(k) ?? []), d]);
    }
    let imported = 0;
    const ids: string[] = [];
    const errors: string[] = [];
    try {
      for (const [site, list] of bySite) {
        const res = await bulkImport.mutateAsync({ boletins: list.map(({ key: _k, selected: _s, duplicate: _d, ...b }) => b), source: site });
        imported += res.imported;
        ids.push(...(res.createdBoletins ?? []).map((c) => c.id));
        errors.push(...(res.errorDetails ?? []));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível importar.', 'error');
      return;
    }
    if (!imported) {
      showToast(errors[0] ?? 'Nenhum boletim importado.', errors.length ? 'error' : 'info');
      return;
    }
    if (errors.length) showToast(`${errors.length} com erro: ${errors[0]}`, 'warning');
    const fb = consumeScanFeedbackContext();
    if (fb) submitScanFeedbackRequest(fb.imageBase64, fb.mimeType, fb.aiOutput, { boletins: selected, totalFound: selected.length, errorCount: 0 }).catch(() => undefined);
    hapticSuccess();
    setCreated({ ids, count: imported });
    setPhase('done');
  }, [selected, bulkImport, showToast]);

  const reset = () => { setImages([]); setDrafts([]); setCreated(null); setPhase('pick'); };
  const unsureCount = selected.reduce((n, d) => n + d.items.reduce((m, it) => m + (it.uncertain?.length ? 1 : 0), 0), 0);
  const editingDraft = editing ? drafts[editing.b] : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Pressable
          accessibilityLabel={phase === 'review' ? 'Voltar' : 'Fechar'}
          hitSlop={8}
          onPress={() => (phase === 'reading' ? abortRef.current?.abort() : phase === 'review' ? reset() : router.back())}
          style={[styles.topBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons color={colors.textPrimary} name={phase === 'review' ? 'chevron-back' : 'close'} size={20} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>
          {phase === 'pick' ? 'Importar aposta' : phase === 'reading' ? 'A ler a aposta…' : phase === 'review' ? 'Rever antes de importar' : ''}
        </Text>
      </View>

      {phase === 'pick' ? (
        <PickPhase images={images} onCamera={takePhoto} onGallery={pickGallery} onRead={() => void read(images)} onRemove={(u) => setImages((p) => p.filter((x) => x !== u))} onToggleRecent={toggleRecent} recent={recent} />
      ) : phase === 'reading' ? (
        <ReadingPhase image={images[progress.current - 1] ?? images[0]} progress={progress} />
      ) : phase === 'review' ? (
        <>
          <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 110 }]}>
            <Animated.View entering={FadeIn.duration(260)} style={[styles.banner, { backgroundColor: unsureCount ? `${colors.warning}1A` : `${colors.primary}1A` }]}>
              <Ionicons color={unsureCount ? colors.warning : colors.primary} name={unsureCount ? 'alert-circle' : 'checkmark-circle'} size={22} />
              <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_700Bold' }}>{drafts.length} boletim{drafts.length > 1 ? 's' : ''} lido{drafts.length > 1 ? 's' : ''}.</Text>
                {unsureCount ? ` ${unsureCount} seleç${unsureCount > 1 ? 'ões' : 'ão'} para confirmar.` : ' Tudo lido com confiança.'}
              </Text>
            </Animated.View>
            {drafts.map((d, bi) => (
              <DraftCard
                draft={d}
                index={bi}
                key={d.key}
                onEdit={(i) => setEditing({ b: bi, i })}
                onToggle={() => setDrafts((p) => p.map((x, j) => (j === bi ? { ...x, selected: !x.selected } : x)))}
              />
            ))}
            <Pressable onPress={() => { setPhase('pick'); }} style={styles.addMore}>
              <Ionicons color={colors.primary} name="add-circle-outline" size={18} />
              <Text style={[styles.addMoreText, { color: colors.primary }]}>Adicionar outro screenshot</Text>
            </Pressable>
          </ScrollView>
          <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
            <PressableScale disabled={!selected.length || bulkImport.isPending} onPress={() => void doImport()} style={[styles.cta, { backgroundColor: selected.length ? colors.primary : colors.surfaceRaised }]}>
              <Text style={[styles.ctaText, { color: selected.length ? '#06110B' : colors.textMuted }]}>
                {bulkImport.isPending ? 'A importar…' : selected.length ? `Importar ${selected.length} boletim${selected.length > 1 ? 's' : ''}` : 'Escolhe um boletim'}
              </Text>
            </PressableScale>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Toca numa seleção para corrigir</Text>
          </View>
        </>
      ) : (
        <DonePhase count={created?.count ?? 0} drafts={selected} onAnother={reset} onOpen={() => (created?.ids[0] ? router.replace(`/boletins/${created.ids[0]}`) : router.replace('/(tabs)/boletins'))} />
      )}

      {editing && editingDraft ? (
        <EditLegSheet
          boletin={editingDraft}
          index={editing.i}
          onClose={() => setEditing(null)}
          onNavigate={(i) => setEditing({ b: editing.b, i })}
          onRemove={() => {
            setDrafts((p) => p.map((x, j) => (j === editing.b ? { ...x, items: x.items.filter((_, k) => k !== editing.i) } : x)).filter((x) => x.items.length > 0));
            setEditing(null);
          }}
          onSave={(b) => setDrafts((p) => p.map((x, j) => (j === editing.b ? { ...x, ...b, duplicate: x.duplicate } : x)))}
          visible
        />
      ) : null}
    </View>
  );
}

/** Same rule as the API: same site, same day, same stake and same first odd. */
function isDuplicate(b: ParsedBetclicBoletin, existing: Array<{ siteSlug?: string | null; betDate?: string | null; createdAt: string; stake: string; items: Array<{ oddValue: string }> }>): boolean {
  const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  return existing.some((e) => (e.siteSlug ?? null) === (b.site ?? e.siteSlug ?? null)
    && Boolean(e.betDate) && day(e.betDate!) === day(b.betDate)
    && Math.abs(Number(e.stake) - b.stake) <= 0.01
    && e.items.length > 0 && b.items.length > 0 && Math.abs(Number(e.items[0]!.oddValue) - b.items[0]!.oddValue) <= 0.01);
}

// ── Pick ──────────────────────────────────────────────────────────────────────
function PickPhase({ images, recent, onGallery, onCamera, onToggleRecent, onRemove, onRead }: {
  images: string[]; recent: string[]; onGallery: () => void; onCamera: () => void; onToggleRecent: (u: string) => void; onRemove: (u: string) => void; onRead: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const extra = images.filter((u) => !recent.includes(u));
  return (
    <>
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 100 }]}>
        <Animated.View entering={FadeInDown.duration(300)}>
          <PressableScale onPress={onGallery} scaleDown={0.98} style={[styles.drop, { borderColor: `${colors.primary}80` }]}>
            <LinearGradient colors={[`${colors.primary}1F`, `${colors.info}12`]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.dropInner}>
              <LinearGradient colors={['#3DFFA2', '#0FB980']} style={styles.dropIcon}>
                <Ionicons color="#06110B" name="images" size={30} />
              </LinearGradient>
              <Text style={[styles.dropTitle, { color: colors.textPrimary }]}>Escolher screenshots</Text>
              <Text style={[styles.dropSub, { color: colors.textSecondary }]}>Um ou vários boletins. A casa de apostas, as seleções e o resultado são lidos sozinhos.</Text>
            </LinearGradient>
          </PressableScale>
        </Animated.View>

        {recent.length ? (
          <Animated.View entering={FadeInDown.delay(80).duration(300)} style={styles.recentBlock}>
            <Text style={[styles.section, { color: colors.textMuted }]}>RECENTES NA GALERIA</Text>
            <View style={styles.recentGrid}>
              {recent.map((u) => {
                const on = images.includes(u);
                return (
                  <Pressable key={u} onPress={() => onToggleRecent(u)} style={[styles.recentItem, { borderColor: on ? colors.primary : 'transparent' }]}>
                    <Image source={{ uri: u }} style={styles.recentImg} />
                    {on ? <Animated.View entering={ZoomIn.duration(160)} style={[styles.check, { backgroundColor: colors.primary }]}><Ionicons color="#06110B" name="checkmark" size={14} /></Animated.View> : null}
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {extra.length ? (
          <View style={styles.recentGrid}>
            {extra.map((u) => (
              <View key={u} style={[styles.recentItem, { borderColor: colors.primary }]}>
                <Image source={{ uri: u }} style={styles.recentImg} />
                <Pressable accessibilityLabel="Remover" hitSlop={6} onPress={() => onRemove(u)} style={[styles.check, { backgroundColor: colors.negative }]}><Ionicons color="#fff" name="close" size={14} /></Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.row2}>
          <PressableScale onPress={onCamera} style={[styles.secondary, { backgroundColor: colors.surface }]}>
            <Ionicons color={colors.textPrimary} name="camera-outline" size={18} />
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Tirar foto</Text>
          </PressableScale>
        </View>

        <View style={[styles.tip, { backgroundColor: colors.surface }]}>
          <View style={[styles.tipIcon, { backgroundColor: `${colors.info}22` }]}><Ionicons color={colors.info} name="share-social-outline" size={16} /></View>
          <Text style={[styles.tipText, { color: colors.textSecondary }]}>Mais rápido: na app da casa de apostas, <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_700Bold' }}>Partilhar → BetIntel</Text>. Abre logo a leitura.</Text>
        </View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <PressableScale disabled={!images.length} onPress={onRead} style={[styles.cta, { backgroundColor: images.length ? colors.primary : colors.surfaceRaised }]}>
          <Text style={[styles.ctaText, { color: images.length ? '#06110B' : colors.textMuted }]}>
            {images.length ? `Ler ${images.length} screenshot${images.length > 1 ? 's' : ''}` : 'Escolhe um screenshot'}
          </Text>
        </PressableScale>
      </View>
    </>
  );
}

// ── Reading ───────────────────────────────────────────────────────────────────
function ReadingPhase({ image, progress }: { image?: string; progress: { current: number; total: number; step: number } }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const y = useSharedValue(0);
  useEffect(() => { y.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true); }, [y]);
  const [h, setH] = useState(0);
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * Math.max(h - 4, 0) }] }));
  const steps = ['Casa de apostas', 'Boletim e valores', 'Seleções e odds', 'Jogos e horas'];
  return (
    <View style={styles.pad}>
      <View onLayout={(e) => setH(e.nativeEvent.layout.height)} style={[styles.shot, elevation, { backgroundColor: colors.surface }]}>
        {image ? <Image resizeMode="contain" source={{ uri: image }} style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,6,10,0.25)' }]} />
        <Animated.View style={[styles.scanLine, line, { backgroundColor: colors.primary, shadowColor: colors.primary }]} />
      </View>
      {progress.total > 1 ? <Text style={[styles.counter, { color: colors.textSecondary }]}>Screenshot {progress.current} de {progress.total}</Text> : null}
      <View style={styles.steps}>
        {steps.map((s, i) => {
          const done = i < progress.step; const doing = i === progress.step;
          return (
            <Animated.View entering={FadeInDown.delay(i * 80).duration(240)} key={s} style={styles.stepRow}>
              <View style={[styles.stepDot, { backgroundColor: done ? colors.primary : doing ? `${colors.primary}33` : colors.surface }]}>
                {done ? <Ionicons color="#06110B" name="checkmark" size={13} /> : doing ? <View style={[styles.pulse, { backgroundColor: colors.primary }]} /> : null}
              </View>
              <Text style={[styles.stepText, { color: done || doing ? colors.textPrimary : colors.textMuted }]}>{s}</Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────
function DraftCard({ draft: d, index, onToggle, onEdit }: { draft: Draft; index: number; onToggle: () => void; onEdit: (i: number) => void }) {
  const { colors, isDark } = useTheme();
  const elevation = useCardElevation();
  const pending = d.status === 'PENDING';
  const ret = pending ? d.potentialReturn || d.stake * d.totalOdds : d.status === 'WON' ? d.potentialReturn || d.stake * d.totalOdds : 0;
  const tone = d.status === 'WON' ? colors.positive : d.status === 'LOST' ? colors.negative : colors.warning;
  const date = new Date(d.betDate);
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 70).duration(320).springify().damping(18)} style={[styles.card, elevation, { backgroundColor: colors.surface, borderColor: d.selected ? `${colors.primary}66` : colors.border, opacity: d.selected ? 1 : 0.6 }]}>
      <LinearGradient colors={isDark ? [`${tone}26`, colors.surface] : [`${tone}1A`, colors.surface]} end={{ x: 0.8, y: 1 }} start={{ x: 0, y: 0 }} style={styles.cardHead}>
        <View style={styles.cardTop}>
          {d.site ? <SiteMark size={18} slug={d.site} textStyle={{ color: colors.textSecondary, fontSize: 13 }} /> : (
            <Pressable onPress={() => onEdit(0)} style={[styles.unknownSite, { borderColor: `${colors.warning}88` }]}><Text style={[styles.unknownText, { color: colors.warning }]}>Escolher casa</Text></Pressable>
          )}
          <Text style={[styles.meta, { color: colors.textSecondary }]}>· {isNaN(date.getTime()) ? '' : date.toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')}</Text>
          <Pressable accessibilityLabel={d.selected ? 'Não importar' : 'Importar'} accessibilityRole="checkbox" accessibilityState={{ checked: d.selected }} hitSlop={8} onPress={onToggle} style={[styles.toggle, { backgroundColor: d.selected ? colors.primary : 'transparent', borderColor: d.selected ? colors.primary : colors.border }]}>
            {d.selected ? <Ionicons color="#06110B" name="checkmark" size={16} /> : null}
          </Pressable>
        </View>
        {d.duplicate ? <Text style={[styles.dup, { color: colors.warning }]}>Parece já importado · fica de fora (toca no visto para importar na mesma)</Text> : null}
        {d.parseErrorReason ? <Text style={[styles.dup, { color: colors.warning }]}>{d.parseErrorReason}</Text> : null}
        <View style={styles.bigRow}>
          <View>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{d.items.length > 1 ? `Múltipla · ${d.items.length} seleções` : 'Simples'} · {STATUS_LABEL[d.status] ?? d.status}</Text>
            <Text style={[styles.big, { color: tone }]}>{pending || d.status === 'WON' ? formatCurrency(ret) : d.status === 'LOST' ? `−${formatCurrency(d.stake)}` : formatCurrency(d.stake)}</Text>
          </View>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{pending ? 'retorno possível' : d.status === 'WON' ? 'recebido' : ''}</Text>
        </View>
        <View style={styles.tiles}>
          {[['Aposta', formatCurrency(d.stake)], ['Odd', d.totalOdds.toFixed(2).replace('.', ',')], ['Estado', STATUS_LABEL[d.status] ?? d.status]].map(([l, v]) => (
            <Pressable key={l} onPress={() => onEdit(0)} style={[styles.tile, { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(15,23,42,0.05)' }]}>
              <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>{l}</Text>
              <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{v}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>
      {d.items.map((it, i) => {
        const unsure = (it.uncertain?.length ?? 0) > 0;
        const k = it.eventDate ? new Date(it.eventDate) : null;
        const res = it.result ?? 'PENDING';
        return (
          <Pressable key={i} onPress={() => onEdit(i)} style={[styles.leg, { borderTopColor: colors.border }]}>
            <View style={[styles.legDot, { backgroundColor: res === 'WON' ? colors.positive : res === 'LOST' ? colors.negative : res === 'VOID' ? colors.textMuted : `${colors.warning}88` }]} />
            <TeamBadge name={it.selection} size={26} variant={it.sport === 'TENNIS' ? 'player' : 'auto'} />
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.legMatch, { color: colors.textMuted }]}>{it.homeTeam} – {it.awayTeam}{k && !isNaN(k.getTime()) ? ` · ${k.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
              <Text numberOfLines={2} style={[styles.legSel, { color: colors.textPrimary }]}>{it.selection}</Text>
              <Text numberOfLines={1} style={[styles.legMarket, { color: colors.textMuted }]}>{it.market.toUpperCase()} · {it.competition || SPORT_LABEL[it.sport] || it.sport}</Text>
              {unsure ? <Text style={[styles.unsure, { backgroundColor: `${colors.warning}22`, color: colors.warning }]}>Confirma: {(it.uncertain ?? []).map(fieldPt).join(', ')}</Text> : null}
            </View>
            <Text style={[styles.legOdd, { color: colors.gold }]}>{it.oddValue > 0 ? it.oddValue.toFixed(2).replace('.', ',') : '—'}</Text>
            <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const FIELD_PT: Record<string, string> = { homeTeam: 'equipa/jogador', awayTeam: 'equipa/jogador', competition: 'competição', market: 'mercado', selection: 'seleção', oddValue: 'odd', eventDate: 'hora do jogo', result: 'resultado' };
const fieldPt = (f: string) => FIELD_PT[f] ?? f;

// ── Done ──────────────────────────────────────────────────────────────────────
function DonePhase({ count, drafts, onOpen, onAnother }: { count: number; drafts: Draft[]; onOpen: () => void; onAnother: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const elevation = useCardElevation();
  const legs = drafts.reduce((n, d) => n + d.items.length, 0);
  return (
    <View style={[styles.done, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.doneCenter}>
        <Animated.View entering={ZoomIn.springify().damping(12)}>
          <LinearGradient colors={['#3DFFA2', '#0FB980']} style={styles.doneIcon}><Ionicons color="#06110B" name="checkmark" size={44} /></LinearGradient>
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(120)} style={[styles.doneTitle, { color: colors.textPrimary }]}>{count} boletim{count > 1 ? 's' : ''} importado{count > 1 ? 's' : ''}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(180)} style={[styles.doneSub, { color: colors.textSecondary }]}>Vamos acompanhar {legs === 1 ? 'o jogo' : `os ${legs} jogos`} e avisar-te quando cada seleção ficar decidida.</Animated.Text>
      </View>
      {drafts.slice(0, 2).map((d) => (
        <Animated.View entering={FadeInDown.delay(240).duration(300)} key={d.key} style={[styles.doneCard, elevation, { backgroundColor: colors.surface }]}>
          <View style={styles.cardTop}>
            {d.site ? <SiteMark size={16} slug={d.site} /> : null}
            <Text style={[styles.meta, { color: colors.textSecondary, flex: 1 }]}>{d.items.length > 1 ? `Múltipla ${d.items.length}` : 'Simples'}</Text>
            <Text style={[styles.tileValue, { color: colors.gold }]}>{formatCurrency(d.potentialReturn || d.stake * d.totalOdds)}</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={styles.doneLeg}>
              <Text numberOfLines={1} style={[styles.legSel, { color: colors.textPrimary, flex: 1 }]}>{it.selection}</Text>
              <Text style={[styles.legOdd, { color: colors.gold }]}>{it.oddValue.toFixed(2).replace('.', ',')}</Text>
            </View>
          ))}
        </Animated.View>
      ))}
      <View style={styles.doneBtns}>
        <PressableScale onPress={onOpen} style={[styles.cta, { backgroundColor: colors.primary }]}><Text style={[styles.ctaText, { color: '#06110B' }]}>Ver boletim</Text></PressableScale>
        <PressableScale onPress={onAnother} style={[styles.cta, { backgroundColor: colors.surface }]}><Text style={[styles.ctaText, { color: colors.textPrimary }]}>Importar outro</Text></PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  top: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  topBtn: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  topTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  pad: { gap: 14, paddingHorizontal: 16, paddingTop: 4 },
  section: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.6 },
  drop: { borderRadius: 26, borderStyle: 'dashed', borderWidth: 1.5, overflow: 'hidden' },
  dropInner: { alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 32 },
  dropIcon: { alignItems: 'center', borderRadius: 20, height: 64, justifyContent: 'center', width: 64 },
  dropTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  dropSub: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  recentBlock: { gap: 10 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentItem: { borderRadius: 14, borderWidth: 2, height: 112, overflow: 'hidden', width: '23%' },
  recentImg: { height: '100%', width: '100%' },
  check: { alignItems: 'center', borderRadius: 11, bottom: 5, height: 22, justifyContent: 'center', position: 'absolute', right: 5, width: 22 },
  row2: { flexDirection: 'row', gap: 10 },
  secondary: { alignItems: 'center', borderRadius: 16, flex: 1, flexDirection: 'row', gap: 8, height: 52, justifyContent: 'center' },
  secondaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  tip: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 10, padding: 12 },
  tipIcon: { alignItems: 'center', borderRadius: 9, height: 30, justifyContent: 'center', width: 30 },
  tipText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, gap: 6, left: 0, paddingHorizontal: 16, paddingTop: 12, position: 'absolute', right: 0 },
  cta: { alignItems: 'center', borderRadius: 16, height: 54, justifyContent: 'center' },
  ctaText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  hint: { fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'center' },
  shot: { borderRadius: 22, height: 430, overflow: 'hidden' },
  scanLine: { elevation: 8, height: 3, left: 0, position: 'absolute', right: 0, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 12, top: 0 },
  counter: { fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center' },
  steps: { gap: 10 },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  stepDot: { alignItems: 'center', borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  pulse: { borderRadius: 4, height: 8, width: 8 },
  stepText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  banner: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 10, padding: 12 },
  bannerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  card: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  cardHead: { gap: 12, padding: 16 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  meta: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  unknownSite: { borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  unknownText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  toggle: { alignItems: 'center', borderRadius: 8, borderWidth: 2, height: 26, justifyContent: 'center', marginLeft: 'auto', width: 26 },
  dup: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  bigRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  big: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, lineHeight: 38 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { borderRadius: 12, flex: 1, gap: 1, paddingHorizontal: 10, paddingVertical: 8 },
  tileLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  tileValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
  leg: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  legDot: { borderRadius: 3, height: 34, width: 4 },
  legMatch: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  legSel: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  legMarket: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.4 },
  unsure: { alignSelf: 'flex-start', borderRadius: 6, fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 4, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  legOdd: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
  addMore: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 6, padding: 8 },
  addMoreText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  done: { flex: 1, gap: 14, paddingHorizontal: 16 },
  doneCenter: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
  doneIcon: { alignItems: 'center', borderRadius: 44, height: 88, justifyContent: 'center', width: 88 },
  doneTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 26 },
  doneSub: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  doneCard: { borderRadius: 22, gap: 10, padding: 16 },
  doneLeg: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  doneBtns: { gap: 8 },
});
