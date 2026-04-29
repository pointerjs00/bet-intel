import React, { useCallback, useRef, useState } from 'react';
import { Alert, Animated as RNAnimated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StatsPeriod } from '@betintel/shared';
import { usePersonalStats } from '../../services/statsService';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss';
import { useTheme } from '../../theme/useTheme';
import { Skeleton } from '../ui/Skeleton';
import { StatsShareCard, type ShareMode, type StatsShareCardHandle } from './StatsShareCard';

const PERIOD_OPTIONS: Array<{ key: StatsPeriod; label: string }> = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'year', label: 'Ano' },
  { key: 'all', label: 'Sempre' },
];

const MODES: Array<{ key: ShareMode; label: string }> = [
  { key: 'simple', label: 'Resumido' },
  { key: 'detailed', label: 'Detalhado' },
];

const DETAILED_PAGE_COUNT = 4;

interface StatsShareSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function StatsShareSheet({ visible, onClose }: StatsShareSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [mode, setMode] = useState<ShareMode>('simple');
  const [currentPage, setCurrentPage] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const cardRef = useRef<StatsShareCardHandle>(null);

  const statsQuery = usePersonalStats(period, [], undefined, undefined, visible);
  const stats = statsQuery.data;

  const { panHandlers, animatedStyle } = useSwipeToDismiss(onClose, { visible });

  // ── Capture helper ─────────────────────────────────────────────────────────

  const captureCard = useCallback(async (): Promise<string | null> => {
    const uri = await cardRef.current?.capture();
    return uri ?? null;
  }, []);

  // ── Share ──────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      const uri = await captureCard();
      if (!uri) return;
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partilhar estatísticas' });
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível partilhar a imagem.');
    } finally {
      setSharing(false);
    }
  }, [captureCard]);

  // ── Download (save to camera roll) ────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const uri = await captureCard();
      if (!uri) return;

      // Ask for media library permission if not yet granted
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permite o acesso à galeria para guardar a imagem.');
        return;
      }

      // Copy the temp file to a named destination so the filename is meaningful
      const destUri = `${FileSystem.cacheDirectory}betintel_stats_${Date.now()}.png`;
      await FileSystem.copyAsync({ from: uri, to: destUri });

      await MediaLibrary.saveToLibraryAsync(destUri);
      Alert.alert('Guardado!', 'A imagem foi guardada na tua galeria.');
    } catch {
      Alert.alert('Erro', 'Não foi possível guardar a imagem.');
    } finally {
      setDownloading(false);
    }
  }, [captureCard]);

  const isLoading = statsQuery.isLoading || !stats;
  const canAct = !isLoading && !!cardRef.current?.isReady;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        {/* Sheet uses flex column so header + footer are pinned and only the
            card area scrolls — no matter how tall the card is */}
        <RNAnimated.View style={[styles.sheet, { backgroundColor: colors.surface }, animatedStyle]}>

          {/* ── Fixed header ──────────────────────────────────────────────── */}
          <View>
            {/* Drag handle */}
            <View {...panHandlers} style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>

            <Text style={[styles.title, { color: colors.textPrimary }]}>Partilhar estatísticas</Text>

            {/* Mode selector */}
            <View style={[styles.segmentRow, { backgroundColor: colors.surfaceRaised }]}>
              {MODES.map((m) => {
                const active = mode === m.key;
                return (
                  <Pressable
                    key={m.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => { setMode(m.key); setCurrentPage(0); }}
                    style={[styles.segment, active && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.segmentText, { color: active ? '#fff' : colors.textSecondary }]}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Period selector */}
            <View style={[styles.segmentRow, { backgroundColor: colors.surfaceRaised }]}>
              {PERIOD_OPTIONS.map((o) => {
                const active = period === o.key;
                return (
                  <Pressable
                    key={o.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setPeriod(o.key)}
                    style={[styles.segment, active && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.segmentText, { color: active ? '#fff' : colors.textSecondary }]}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Scrollable card area ───────────────────────────────────────── */}
          <ScrollView
            contentContainerStyle={styles.cardScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.cardScrollView}
          >
            {isLoading ? (
              <View style={styles.skeletonWrap}>
                <Skeleton height={mode === 'detailed' ? 480 : 260} width="100%" />
              </View>
            ) : (
              <StatsShareCard
                ref={cardRef}
                mode={mode}
                period={period}
                stats={stats}
                onPageChange={setCurrentPage}
              />
            )}
          </ScrollView>

          {/* Page dots (detailed mode only) — between card and footer */}
          {mode === 'detailed' && (
            <View style={styles.dots}>
              {Array.from({ length: DETAILED_PAGE_COUNT }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: i === currentPage ? colors.primary : colors.border },
                    i === currentPage && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* ── Fixed footer ──────────────────────────────────────────────── */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* Share button — primary, takes most space */}
            <Pressable
              accessibilityRole="button"
              disabled={!canAct || sharing}
              onPress={handleShare}
              style={[
                styles.shareBtn,
                { backgroundColor: canAct && !sharing ? colors.primary : colors.border },
              ]}
            >
              <Ionicons color="#fff" name="share-outline" size={18} />
              <Text style={styles.shareBtnText}>
                {sharing ? 'A partilhar…' : 'Partilhar'}
              </Text>
            </Pressable>

            {/* Download button — icon-only pill */}
            <Pressable
              accessibilityLabel="Guardar na galeria"
              accessibilityRole="button"
              disabled={!canAct || downloading}
              onPress={handleDownload}
              style={[
                styles.iconBtn,
                { borderColor: canAct && !downloading ? colors.border : colors.surfaceRaised, backgroundColor: colors.surfaceRaised },
              ]}
            >
              <Ionicons
                color={canAct && !downloading ? colors.textPrimary : colors.textMuted}
                name={downloading ? 'hourglass-outline' : 'download-outline'}
                size={20}
              />
            </Pressable>

            {/* Close button — ghost pill */}
            <Pressable
              accessibilityLabel="Fechar"
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
            >
              <Ionicons color={colors.textSecondary} name="close" size={20} />
            </Pressable>
          </View>
        </RNAnimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    // maxHeight keeps the sheet from covering the entire screen on tablets
    maxHeight: '92%',
    // flex column: header (fixed) + cardScrollView (flex: 1) + footer (fixed)
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { borderRadius: 3, height: 4, width: 40 },
  title: { fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 2 },
  segmentRow: {
    borderRadius: 12,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingVertical: 8,
  },
  segmentText: { fontSize: 13, fontWeight: '700' },

  // The card area is the only part that grows/shrinks to fill available space
  cardScrollView: { flex: 1 },
  cardScroll: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  skeletonWrap: { borderRadius: 20, overflow: 'hidden', width: '100%' },

  // Page dots
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 4 },
  dot: { borderRadius: 4, height: 6, width: 6 },
  dotActive: { width: 18 },

  // Footer — always pinned at the bottom of the sheet
  footer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingTop: 8,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    width: 50,
    height: 50,
  },
});
