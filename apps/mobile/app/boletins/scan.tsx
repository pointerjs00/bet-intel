import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { Button } from '../../components/ui/Button';
import { PressableScale } from '../../components/ui/PressableScale';
import { useToast } from '../../components/ui/Toast';
import { useTheme } from '../../theme/useTheme';
import type { BetclicPdfResult } from '../../services/importService';
import { scanImageAiRequest } from '../../services/importService';
import { hapticLight, hapticSuccess, hapticError } from '../../utils/haptics';

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { sharedImageUri } = useLocalSearchParams<{ sharedImageUri?: string }>();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseResult, setParseResult] = useState<BetclicPdfResult | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: false,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        hapticLight();
        setImageUri(result.assets[0].uri);
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
        setImageUri(result.assets[0].uri);
        setParseResult(null);
      }
    } catch {
      showToast('Erro ao abrir câmara. Verifica as permissões nas definições.', 'error');
    }
  }, [showToast]);

  // Auto-load image when screen is opened via Android share intent
  useEffect(() => {
    if (sharedImageUri && !imageUri) {
      setImageUri(sharedImageUri);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedImageUri]);

  const processImage = useCallback(async () => {
    if (!imageUri) return;
    setIsProcessing(true);
    try {
      // Read image as base64 and determine MIME type
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const lower = imageUri.toLowerCase();
      const mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';

      // Send to backend AI parser
      const result = await scanImageAiRequest(base64, mimeType);
      setParseResult(result);

      if (result.boletins.length === 0) {
        hapticError();
        showToast('Nenhuma aposta encontrada. Confirma que é um screenshot de uma aposta.', 'error');
      } else if (result.errorCount > 0) {
        hapticLight();
        showToast('Aposta lida com alguns erros. Revê os dados antes de importar.', 'warning');
      } else {
        hapticSuccess();
        showToast(`${result.totalFound} aposta(s) encontrada(s)!`, 'success');
      }
    } catch (err) {
      hapticError();
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ScanScreen] AI scan error:', msg);
      showToast(
        msg.includes('timeout')
          ? 'A análise demorou demasiado. Tenta novamente.'
          : `Erro: ${msg}`,
        'error',
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageUri, showToast]);

  const navigateToReview = useCallback(() => {
    if (!parseResult || parseResult.boletins.length === 0) return;
    const pdfResult: BetclicPdfResult = {
      boletins: parseResult.boletins,
      totalFound: parseResult.totalFound,
      errorCount: parseResult.errorCount,
    };
    router.push({ pathname: '/boletins/import-review', params: { data: JSON.stringify(pdfResult) } });
  }, [parseResult, router]);

  const reset = useCallback(() => {
    setImageUri(null);
    setParseResult(null);
    setShowAllItems(false);
    setImageViewerVisible(false);
  }, []);

  // When an image is loaded, intercept Android hardware back to reset instead of leaving
  useEffect(() => {
    if (!imageUri) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      reset();
      return true;
    });
    return () => sub.remove();
  }, [imageUri, reset]);

  const hasResult = parseResult && parseResult.boletins.length > 0;
  const firstBoletin = parseResult?.boletins[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Importar Screenshot',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          headerBackTitle: '',
          // Disable swipe-back when an image is loaded so it resets to empty state instead
          gestureEnabled: !imageUri,
          headerLeft: imageUri
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
        {!imageUri && (
          <Animated.View entering={FadeInUp.duration(300).springify()} style={[styles.hero, { backgroundColor: `${colors.primary}12` }]}>
            <View style={[styles.heroIconWrap, { backgroundColor: `${colors.primary}20` }]}>
              <MaterialCommunityIcons name="robot-outline" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Leitura com IA</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              Seleciona um screenshot de uma aposta e a IA do BetIntel analisa e extrai os dados automaticamente.
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

        {/* Source picker or image preview */}
        {!imageUri ? (
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
            <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable onPress={() => setImageViewerVisible(true)} style={styles.previewImagePressable}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
                <View style={styles.imageZoomHint}>
                  <Ionicons name="expand-outline" size={16} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.imageZoomHintText}>Toca para ampliar</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={reset}
                style={[styles.changeBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Ionicons name="refresh" size={15} color={colors.textSecondary} />
                <Text style={[styles.changeBtnText, { color: colors.textSecondary }]}>Trocar imagem</Text>
              </Pressable>
            </View>

            {!parseResult && (
              <Button
                title={isProcessing ? 'A analisar com IA...' : 'Analisar aposta'}
                leftSlot={!isProcessing ? <MaterialCommunityIcons name="robot-outline" size={20} color="#fff" /> : undefined}
                loading={isProcessing}
                onPress={processImage}
                disabled={isProcessing}
                style={styles.processBtn}
              />
            )}
          </Animated.View>
        )}

        {/* Parse result */}
        {hasResult && firstBoletin && (
          <Animated.View entering={FadeInDown.delay(80).duration(260).springify()}>
            <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: firstBoletin.parseError ? colors.warning : colors.primary }]}>
              <View style={[styles.resultHeader, { backgroundColor: firstBoletin.parseError ? `${colors.warning}18` : `${colors.primary}18`, borderColor: firstBoletin.parseError ? `${colors.warning}40` : `${colors.primary}40` }]}>
                <Ionicons
                  name={firstBoletin.parseError ? 'warning' : 'checkmark-circle'}
                  size={20}
                  color={firstBoletin.parseError ? colors.warning : colors.primary}
                />
                <Text style={[styles.resultHeaderText, { color: firstBoletin.parseError ? colors.warning : colors.primary }]}>
                  {firstBoletin.parseError ? 'Aposta lida com erros' : 'Aposta lida com sucesso!'}
                </Text>
              </View>

              <View style={styles.metrics}>
                <Metric label="Seleções" value={String(firstBoletin.items.length)} colors={colors} />
                <MetricDivider colors={colors} />
                <Metric label="Cota" value={firstBoletin.totalOdds > 0 ? firstBoletin.totalOdds.toFixed(2) : '—'} colors={colors} accent={colors.gold} />
                <MetricDivider colors={colors} />
                <Metric label="Stake" value={firstBoletin.stake > 0 ? `${firstBoletin.stake.toFixed(2)} €` : '—'} colors={colors} />
                <MetricDivider colors={colors} />
                <Metric
                  label="Estado"
                  value={firstBoletin.status === 'WON' ? 'Ganhou' : firstBoletin.status === 'LOST' ? 'Perdida' : 'Pendente'}
                  colors={colors}
                  accent={firstBoletin.status === 'WON' ? colors.primary : firstBoletin.status === 'LOST' ? colors.danger : colors.warning}
                />
              </View>

              <View style={[styles.itemsSection, { borderColor: colors.border }]}>
                {(showAllItems ? firstBoletin.items : firstBoletin.items.slice(0, 3)).map((item, idx) => (
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
                {firstBoletin.items.length > 3 && (
                  <Pressable
                    onPress={() => setShowAllItems((v) => !v)}
                    style={[styles.expandBtn, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <Ionicons
                      name={showAllItems ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={[styles.moreItems, { color: colors.primary }]}>
                      {showAllItems
                        ? 'Mostrar menos'
                        : `+ ${firstBoletin.items.length - 3} mais seleções`}
                    </Text>
                  </Pressable>
                )}
              </View>

              {firstBoletin.parseErrorReason && (
                <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}12` }]}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                  <Text style={[styles.errorText, { color: colors.danger }]}>{firstBoletin.parseErrorReason}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Fullscreen image viewer */}
      {imageUri && (
        <Modal
          visible={imageViewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setImageViewerVisible(false)}
          statusBarTranslucent
        >
          <View style={styles.imageViewerBackdrop}>
            <Pressable
              style={styles.imageViewerClose}
              onPress={() => setImageViewerVisible(false)}
              hitSlop={16}
            >
              <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
            </Pressable>
            <Image source={{ uri: imageUri }} style={styles.imageViewerImage} resizeMode="contain" />
          </View>
        </Modal>
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
  { icon: 'image-outline', label: 'Escolhe o screenshot' },
  { icon: 'text-recognition', label: 'IA analisa a aposta' },
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

  previewSection: { gap: 12 },
  previewCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 12, alignItems: 'center' },
  previewImagePressable: { width: '100%', position: 'relative' },
  previewImage: { width: '100%', height: 360, borderRadius: 12 },
  imageZoomHint: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  imageZoomHintText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  imageViewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' },
  imageViewerClose: { position: 'absolute', top: 52, right: 16, zIndex: 10 },
  imageViewerImage: { width: '100%', height: '88%' },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1, marginTop: 10, paddingHorizontal: 14, paddingVertical: 7 },
  changeBtnText: { fontSize: 13, fontWeight: '600' },
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
  cancelText: { fontSize: 15, fontWeight: '700' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
