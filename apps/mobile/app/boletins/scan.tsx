import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { Button } from '../../components/ui/Button';
import { PressableScale } from '../../components/ui/PressableScale';
import { useToast } from '../../components/ui/Toast';
import { useTheme } from '../../theme/useTheme';
import type { BetclicPdfResult } from '../../services/importService';
import { scanImageAiRequest, storeScanFeedbackContext } from '../../services/importService';
import { BETTING_SITES } from '../../utils/sportAssets';
import { resolveTeamAlias, inferCompetition, normalizeCompetitionName } from '../../utils/teamAliases';
import { hapticLight, hapticSuccess, hapticError } from '../../utils/haptics';

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { sharedImageUri } = useLocalSearchParams<{ sharedImageUri?: string }>();

  const [imageUris, setImageUris] = useState<string[]>([]);
  const [selectedSite, setSelectedSite] = useState('betclic');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [parseResult, setParseResult] = useState<BetclicPdfResult | null>(null);
  const [expandedBoletins, setExpandedBoletins] = useState<Set<number>>(new Set());
  const [viewingImageIdx, setViewingImageIdx] = useState<number | null>(null);
  const [disclaimerVisible, setDisclaimerVisible] = useState(false);
  const [disclaimerDontShow, setDisclaimerDontShow] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setImageUris([]);
      setParseResult(null);
      setIsProcessing(false);
      setExpandedBoletins(new Set());
      setSelectedSite('betclic');
    }, []),
  );

  // Show disclaimer on first visit unless user opted out
  useEffect(() => {
    AsyncStorage.getItem('scan_disclaimer_dismissed').then((val) => {
      if (val !== 'true') setDisclaimerVisible(true);
    });
  }, []);

  const dismissDisclaimer = useCallback(async () => {
    if (disclaimerDontShow) {
      await AsyncStorage.setItem('scan_disclaimer_dismissed', 'true');
    }
    setDisclaimerVisible(false);
  }, [disclaimerDontShow]);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: true,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        hapticLight();
        setImageUris((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
        setParseResult(null);
      }
    } catch {
      showToast('Erro ao abrir galeria. Verifica as permissões nas definições.', 'error');
    }
  }, [showToast]);

  const takePhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        hapticLight();
        setImageUris((prev) => [...prev, result.assets[0]!.uri]);
        setParseResult(null);
      }
    } catch {
      showToast('Erro ao abrir câmara. Verifica as permissões nas definições.', 'error');
    }
  }, [showToast]);

  // Auto-load image when screen is opened via Android share intent
  useEffect(() => {
    if (sharedImageUri && imageUris.length === 0) {
      setImageUris([sharedImageUri]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedImageUri]);

  const cancelScan = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const processImage = useCallback(async () => {
    if (imageUris.length === 0) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsProcessing(true);

    const allBoletins: BetclicPdfResult['boletins'] = [];
    let totalFound = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < imageUris.length; i++) {
        setScanProgress({ current: i + 1, total: imageUris.length });
        const uri = imageUris[i]!;

        // Compress & resize to max 1000px wide JPEG 80% — reduces upload & AI processing time
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1000 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );

        // Read compressed image as base64
        const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const mimeType = 'image/jpeg';

        // Send to backend AI parser
        const result = await scanImageAiRequest(base64, mimeType, controller.signal);

        // Store raw AI result + image for silent feedback submission after successful import
        storeScanFeedbackContext({ imageBase64: base64, mimeType, aiOutput: result });

        // Post-process: resolve Portuguese team name aliases + infer missing competitions
        const processed = result.boletins.map((b) => ({
          ...b,
          items: b.items.map((item) => {
            const home = resolveTeamAlias(item.homeTeam);
            const away = resolveTeamAlias(item.awayTeam);
            const competition =
              inferCompetition(home, away) ||
              normalizeCompetitionName(item.competition);
            return { ...item, homeTeam: home, awayTeam: away, competition };
          }),
        }));

        allBoletins.push(...processed);
        totalFound += result.totalFound;
        errorCount += result.errorCount;
      }

      const merged: BetclicPdfResult = { boletins: allBoletins, totalFound, errorCount };
      setParseResult(merged);

      if (allBoletins.length === 0) {
        hapticError();
        showToast('Nenhuma aposta encontrada. Confirma que é um screenshot de uma aposta.', 'error');
      } else if (errorCount > 0) {
        hapticLight();
        showToast('Apostas lidas com alguns erros. Revê os dados antes de importar.', 'info');
      } else {
        hapticSuccess();
        showToast(`${totalFound} aposta(s) encontrada(s)!`, 'success');
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      hapticError();
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ScanScreen] scan error:', msg);
      showToast(
        msg.includes('timeout')
          ? 'A análise demorou demasiado. Tenta novamente.'
          : `Erro: ${msg}`,
        'error',
      );
    } finally {
      setIsProcessing(false);
      setScanProgress(null);
      abortControllerRef.current = null;
    }
  }, [imageUris, showToast]);

  const navigateToReview = useCallback(() => {
    if (!parseResult || parseResult.boletins.length === 0) return;
    const pdfResult: BetclicPdfResult = {
      boletins: parseResult.boletins,
      totalFound: parseResult.totalFound,
      errorCount: parseResult.errorCount,
    };
    router.push({ pathname: '/boletins/import-review', params: { data: JSON.stringify(pdfResult), siteSlug: selectedSite } });
  }, [parseResult, router, selectedSite]);

  const reset = useCallback(() => {
    setImageUris([]);
    setParseResult(null);
    setExpandedBoletins(new Set());
    setViewingImageIdx(null);
    setSelectedSite('betclic');
  }, []);

  // When images are loaded, intercept Android hardware back to reset instead of leaving
  useEffect(() => {
    if (imageUris.length === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      reset();
      return true;
    });
    return () => sub.remove();
  }, [imageUris, reset]);

  const hasResult = parseResult && parseResult.boletins.length > 0;
  const hasImages = imageUris.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Importar Screenshot',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          headerBackTitle: '',
          // Disable swipe-back when images are loaded so it resets to empty state instead
          gestureEnabled: !hasImages,
          headerLeft: hasImages
            ? ({ tintColor }) => (
                <Pressable hitSlop={12} onPress={reset} style={{ paddingRight: 8 }}>
                  <Ionicons name="arrow-back" size={24} color={tintColor ?? colors.textPrimary} />
                </Pressable>
              )
            : undefined,
        }}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero banner */}
        {!hasImages && (
          <Animated.View entering={FadeInUp.duration(300).springify()} style={[styles.hero, { backgroundColor: `${colors.primary}12` }]}>
            <View style={[styles.heroIconWrap, { backgroundColor: `${colors.primary}20` }]}>
              <MaterialCommunityIcons name="barcode-scan" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Importar Screenshot</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              Seleciona um ou mais screenshots de apostas Betclic e o BetIntel extrai os dados automaticamente.
            </Text>
            <View style={styles.steps}>
              {STEPS.map((step, i) => (
                <View key={i} style={styles.stepItem}>
                  <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <MaterialCommunityIcons name={step.icon} size={18} color={colors.textSecondary} />
                  <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>{step.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Site picker */}
        {!hasImages && (
          <View>
            <Text style={[styles.sitePickerLabel, { color: colors.textSecondary }]}>Site de apostas</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sitePickerRow}>
              {BETTING_SITES.map((site) => {
                const isSelected = selectedSite === site.slug;
                return (
                  <Pressable
                    key={site.slug}
                    onPress={() => setSelectedSite(site.slug)}
                    style={[
                      styles.siteChip,
                      { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? `${colors.primary}18` : colors.surface },
                    ]}
                  >
                    <Text style={[styles.siteChipText, { color: isSelected ? colors.primary : colors.textSecondary }]}>
                      {site.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Source picker or image previews */}
        {!hasImages ? (
          <View style={styles.pickRow}>
            <Animated.View entering={FadeInDown.delay(130).duration(380).springify()} style={styles.pickTileWrapper}>
              <PickTile
                icon="images-outline"
                label="Galeria"
                sub="Abrir fotos"
                onPress={pickImage}
                accent={colors.primary}
                colors={colors}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(240).duration(380).springify()} style={styles.pickTileWrapper}>
              <PickTile
                icon="camera-outline"
                label="Câmara"
                sub="Tirar foto"
                onPress={takePhoto}
                accent={colors.info}
                colors={colors}
              />
            </Animated.View>
          </View>
        ) : (
          <Animated.View entering={FadeInDown.delay(60).duration(220).springify()} style={styles.previewSection}>
            {/* Thumbnail strip */}
            <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnailStrip}
              >
                {imageUris.map((uri, idx) => (
                  <View key={`${uri}-${idx}`} style={styles.thumbnailWrap}>
                    <Pressable onPress={() => setViewingImageIdx(idx)} style={styles.thumbnailPressable}>
                      <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
                      <View style={styles.thumbnailZoomHint}>
                        <Ionicons name="expand-outline" size={13} color="rgba(255,255,255,0.85)" />
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setImageUris((prev) => prev.filter((_, i) => i !== idx));
                        setParseResult(null);
                      }}
                      style={styles.thumbnailRemove}
                      hitSlop={6}
                    >
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}

                {/* Add more button */}
                <Pressable
                  onPress={pickImage}
                  style={[styles.thumbnailAdd, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                >
                  <Ionicons name="add" size={28} color={colors.primary} />
                  <Text style={[styles.thumbnailAddText, { color: colors.primary }]}>Mais</Text>
                </Pressable>
              </ScrollView>

              {imageUris.length > 1 && (
                <Text style={[styles.imageCountLabel, { color: colors.textMuted }]}>
                  {imageUris.length} screenshots selecionados
                </Text>
              )}
            </View>

            {!parseResult && (
              <Button
                title={imageUris.length > 1 ? `Analisar ${imageUris.length} screenshots` : 'Analisar aposta'}
                leftSlot={<MaterialCommunityIcons name="text-recognition" size={20} color="#fff" />}
                onPress={processImage}
                style={styles.processBtn}
              />
            )}
          </Animated.View>
        )}

        {/* Parse result — one card per detected boletin */}
        {hasResult && parseResult && parseResult.boletins.map((boletin, boletinIdx) => {
          const isExpanded = expandedBoletins.has(boletinIdx);
          return (
            <Animated.View key={boletinIdx} entering={FadeInDown.delay(80 + boletinIdx * 40).duration(260).springify()}>
              {parseResult.boletins.length > 1 && (
                <Text style={[styles.boletimCountLabel, { color: colors.textSecondary }]}>
                  {`Boletim ${boletinIdx + 1} de ${parseResult.boletins.length}`}
                </Text>
              )}
              <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: boletin.parseError ? colors.warning : colors.primary }]}>
                <View style={[styles.resultHeader, { backgroundColor: boletin.parseError ? `${colors.warning}18` : `${colors.primary}18`, borderColor: boletin.parseError ? `${colors.warning}40` : `${colors.primary}40` }]}>
                  <Ionicons
                    name={boletin.parseError ? 'warning' : 'checkmark-circle'}
                    size={20}
                    color={boletin.parseError ? colors.warning : colors.primary}
                  />
                  <Text style={[styles.resultHeaderText, { color: boletin.parseError ? colors.warning : colors.primary }]}>
                    {boletin.parseError ? 'Aposta lida com erros' : 'Aposta lida com sucesso!'}
                  </Text>
                </View>

                <View style={styles.metrics}>
                  <Metric label="Seleções" value={String(boletin.items.length)} colors={colors} />
                  <MetricDivider colors={colors} />
                  <Metric label="Cota" value={boletin.totalOdds > 0 ? boletin.totalOdds.toFixed(2) : '—'} colors={colors} accent={colors.gold} />
                  <MetricDivider colors={colors} />
                  <Metric label="Stake" value={boletin.stake > 0 ? `${boletin.stake.toFixed(2)} €` : '—'} colors={colors} />
                  <MetricDivider colors={colors} />
                  <Metric
                    label="Estado"
                    value={boletin.status === 'WON' ? 'Ganhou' : boletin.status === 'LOST' ? 'Perdida' : 'Pendente'}
                    colors={colors}
                    accent={boletin.status === 'WON' ? colors.primary : boletin.status === 'LOST' ? colors.danger : colors.warning}
                  />
                </View>

                <View style={[styles.itemsSection, { borderColor: colors.border }]}>
                  {(isExpanded ? boletin.items : boletin.items.slice(0, 3)).map((item, idx) => (
                    <View key={idx} style={[styles.itemRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={styles.itemLeft}>
                        <Text numberOfLines={2} style={[styles.itemTeams, { color: colors.textPrimary }]}>
                          {item.selection}
                        </Text>
                        <Text numberOfLines={1} style={[styles.itemMarket, { color: colors.textSecondary }]}>
                          {item.market}
                        </Text>
                      </View>
                      <Text style={[styles.itemOdd, { color: colors.gold }]}>
                        {item.oddValue > 0 ? item.oddValue.toFixed(2) : '—'}
                      </Text>
                    </View>
                  ))}
                  {boletin.items.length > 3 && (
                    <Pressable
                      onPress={() => setExpandedBoletins((prev) => {
                        const next = new Set(prev);
                        if (next.has(boletinIdx)) next.delete(boletinIdx); else next.add(boletinIdx);
                        return next;
                      })}
                      style={[styles.expandBtn, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={colors.primary}
                      />
                      <Text style={[styles.moreItems, { color: colors.primary }]}>
                        {isExpanded ? 'Mostrar menos' : `+ ${boletin.items.length - 3} mais seleções`}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {boletin.parseErrorReason && (
                  <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}12` }]}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                    <Text style={[styles.errorText, { color: colors.danger }]}>{boletin.parseErrorReason}</Text>
                  </View>
                )}
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Disclaimer modal */}
      <Modal
        visible={disclaimerVisible}
        transparent
        animationType="fade"
        onRequestClose={dismissDisclaimer}
        statusBarTranslucent
      >
        <View style={styles.disclaimerBackdrop}>
          <View style={[styles.disclaimerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.disclaimerIconWrap, { backgroundColor: `${colors.warning}18` }]}>
              <MaterialCommunityIcons name="information-outline" size={36} color={colors.warning} />
            </View>
            <Text style={[styles.disclaimerTitle, { color: colors.textPrimary }]}>Leitura automática</Text>
            <Text style={[styles.disclaimerBody, { color: colors.textSecondary }]}>
              {'A leitura automática de screenshots '}
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{'pode não ser 100% precisa'}</Text>
              {'.'}
              {'\n\n'}
              {'Verifica sempre os dados antes de importar — cotas, seleções e datas devem ser confirmadas manualmente. O BetIntel não se responsabiliza por erros de leitura automática.'}
            </Text>
            <Pressable
              onPress={() => setDisclaimerDontShow((v) => !v)}
              style={styles.disclaimerCheckRow}
              hitSlop={8}
            >
              <View style={[
                styles.disclaimerCheckbox,
                { borderColor: disclaimerDontShow ? colors.primary : colors.border },
                disclaimerDontShow && { backgroundColor: colors.primary },
              ]}>
                {disclaimerDontShow && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={[styles.disclaimerCheckLabel, { color: colors.textSecondary }]}>Não mostrar novamente</Text>
            </Pressable>
            <Pressable
              onPress={dismissDisclaimer}
              style={[styles.disclaimerBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.disclaimerBtnText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Fullscreen image viewer */}
      {viewingImageIdx !== null && imageUris[viewingImageIdx] && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewingImageIdx(null)}
          statusBarTranslucent
        >
          <View style={styles.imageViewerBackdrop}>
            <Pressable
              style={styles.imageViewerClose}
              onPress={() => setViewingImageIdx(null)}
              hitSlop={16}
            >
              <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
            </Pressable>
            <Image source={{ uri: imageUris[viewingImageIdx] }} style={styles.imageViewerImage} resizeMode="contain" />
            {imageUris.length > 1 && (
              <Text style={styles.imageViewerCount}>
                {viewingImageIdx + 1} / {imageUris.length}
              </Text>
            )}
          </View>
        </Modal>
      )}

      {/* Full-screen analysis overlay — blocks all interaction while processing */}
      {isProcessing && (
        <View style={styles.scanOverlay}>
          <ScanLoadingCard colors={colors} onCancel={cancelScan} scanProgress={scanProgress} />
        </View>
      )}

      {/* Bottom CTA */}
      {hasResult && (
        <Animated.View
          entering={FadeInDown.delay(160).duration(240)}
          style={[styles.bottomBar, { backgroundColor: colors.background, paddingBottom: insets.bottom + 14, borderTopColor: colors.border }]}
        >
          <Button variant="ghost" title="Cancelar" onPress={reset} style={{ flex: 1 }} />
          <Button
            title="Rever e importar"
            leftSlot={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
            onPress={navigateToReview}
            style={{ flex: 2 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS: Array<{ icon: 'image-outline' | 'text-recognition' | 'check-circle-outline'; label: string }> = [
  { icon: 'image-outline', label: 'Escolhe os screenshots' },
  { icon: 'text-recognition', label: 'Análise automática' },
  { icon: 'check-circle-outline', label: 'Revê e importa' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function PickTile({
  icon,
  label,
  sub,
  onPress,
  accent,
  colors,
}: {
  icon: 'images-outline' | 'camera-outline';
  label: string;
  sub: string;
  onPress: () => void;
  accent: string;
  colors: Record<string, string>;
}) {
  return (
    <PressableScale
      scaleDown={0.93}
      onPress={onPress}
      style={[styles.pickTile, { backgroundColor: `${accent}10`, borderColor: `${accent}45` }]}
    >
      <View style={[styles.pickIconWrap, { backgroundColor: `${accent}1E` }]}>
        <Ionicons name={icon} size={42} color={accent} />
      </View>
      <Text style={[styles.pickLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[styles.pickSub, { color: accent }]}>{sub}</Text>
    </PressableScale>
  );
}

function Metric({
  label,
  value,
  colors,
  accent,
}: {
  label: string;
  value: string;
  colors: Record<string, string>;
  accent?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: accent ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function MetricDivider({ colors }: { colors: Record<string, string> }) {
  return <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />;
}

const SCAN_MESSAGES = [
  'A enviar imagem para análise…',
  'A identificar as apostas…',
  'A extrair cotas e seleções…',
  'A verificar resultados…',
  'A finalizar…',
];
// Simulated duration in ms — slightly under typical response time so the bar
// reaches ~85% and holds there until the real response arrives.
const PROGRESS_DURATION_MS = 16_000;

function ScanLoadingCard({
  colors,
  onCancel,
  scanProgress,
}: {
  colors: Record<string, string>;
  onCancel: () => void;
  scanProgress: { current: number; total: number } | null;
}) {
  const progress = useSharedValue(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    progress.value = withTiming(0.85, {
      duration: PROGRESS_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });

    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % SCAN_MESSAGES.length);
    }, PROGRESS_DURATION_MS / SCAN_MESSAGES.length);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: progress.value * trackWidth,
  }));

  const isMulti = scanProgress && scanProgress.total > 1;

  return (
    <Animated.View
      entering={FadeInDown.duration(220).springify()}
      style={[scanLoadingStyles.card, { backgroundColor: colors.surface }]}
    >
      <View style={[scanLoadingStyles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
      <Text style={[scanLoadingStyles.title, { color: colors.textPrimary }]}>
        {isMulti
          ? `Imagem ${scanProgress.current} de ${scanProgress.total}…`
          : 'A analisar o boletim…'}
      </Text>
      <Text style={[scanLoadingStyles.msg, { color: colors.textSecondary }]}>
        {SCAN_MESSAGES[msgIdx]}
      </Text>
      <View
        style={[scanLoadingStyles.track, { backgroundColor: `${colors.primary}20` }]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[scanLoadingStyles.fill, { backgroundColor: colors.primary }, fillStyle]} />
      </View>
      <Pressable
        onPress={onCancel}
        style={[scanLoadingStyles.cancelBtn, { borderColor: colors.border }]}
        hitSlop={8}
      >
        <Text style={[scanLoadingStyles.cancelText, { color: colors.textSecondary }]}>Cancelar</Text>
      </Pressable>
    </Animated.View>
  );
}

const scanLoadingStyles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  msg: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  track: {
    width: '100%',
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 4,
  },
  fill: {
    height: 6,
    borderRadius: 99,
  },
  cancelBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 16 },

  hero: { borderRadius: 20, alignItems: 'center', padding: 24, gap: 12 },
  heroIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  heroSub: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  steps: { flexDirection: 'row', width: '100%', marginTop: 8 },
  stepItem: { flex: 1, alignItems: 'center', gap: 6 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  stepLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  pickRow: { flexDirection: 'row', gap: 14 },
  pickTileWrapper: { flex: 1 },
  pickTile: { borderRadius: 24, borderWidth: 2, paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center', gap: 14 },
  pickIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  pickLabel: { fontSize: 19, fontWeight: '900' },
  pickSub: { fontSize: 13, fontWeight: '700' },

  boletimCountLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 2 },

  previewSection: { gap: 12 },
  previewCard: { borderRadius: 18, borderWidth: 1, padding: 12 },

  // Thumbnail strip
  thumbnailStrip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingBottom: 4 },
  thumbnailWrap: { position: 'relative' },
  thumbnailPressable: { position: 'relative' },
  thumbnail: { width: 110, height: 170, borderRadius: 10 },
  thumbnailZoomHint: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.50)',
    borderRadius: 6,
    padding: 4,
  },
  thumbnailRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 11,
  },
  thumbnailAdd: {
    width: 110,
    height: 170,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thumbnailAddText: { fontSize: 12, fontWeight: '700' },
  imageCountLabel: { fontSize: 12, fontWeight: '600', marginTop: 8, textAlign: 'center' },

  imageViewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' },
  imageViewerClose: { position: 'absolute', top: 52, right: 16, zIndex: 10 },
  imageViewerImage: { width: '100%', height: '88%' },
  imageViewerCount: { position: 'absolute', bottom: 40, color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700' },

  disclaimerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.60)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  disclaimerCard: { width: '100%', maxWidth: 400, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 14 },
  disclaimerIconWrap: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  disclaimerTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  disclaimerBody: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  disclaimerCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  disclaimerCheckbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  disclaimerCheckLabel: { fontSize: 14 },
  disclaimerBtn: { width: '100%', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  disclaimerBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sitePickerLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sitePickerRow: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  siteChip: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },
  siteChipText: { fontSize: 13, fontWeight: '700' },

  processBtn: { marginTop: 20 },

  resultCard: { borderRadius: 20, borderWidth: 1.5, overflow: 'hidden' },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  resultHeaderText: { fontSize: 15, fontWeight: '800' },
  metrics: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  metric: { flex: 1, alignItems: 'center', gap: 3 },
  metricLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 14, fontWeight: '900' },
  metricDivider: { width: 1, height: 28, marginHorizontal: 2 },
  itemsSection: { borderTopWidth: 1, paddingHorizontal: 16 },
  itemRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemLeft: { flex: 1, gap: 2 },
  itemTeams: { fontSize: 14, fontWeight: '700' },
  itemMarket: { fontSize: 12 },
  itemOdd: { fontSize: 15, fontWeight: '900', minWidth: 40, textAlign: 'right' },
  moreItems: { fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 10 },
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, marginTop: 4, padding: 10, borderRadius: 10 },
  errorText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 16 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 50,
  },
});
