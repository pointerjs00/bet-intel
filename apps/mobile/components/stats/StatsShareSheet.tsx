import React, { useState } from 'react';
import { Animated as RNAnimated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StatsPeriod } from '@betintel/shared';
import { usePersonalStats } from '../../services/statsService';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss';
import { useTheme } from '../../theme/useTheme';
import { Skeleton } from '../ui/Skeleton';
import { StatsShareCard, type ShareMode } from './StatsShareCard';

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

interface StatsShareSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function StatsShareSheet({ visible, onClose }: StatsShareSheetProps) {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [mode, setMode] = useState<ShareMode>('simple');

  const statsQuery = usePersonalStats(period, [], undefined, undefined, visible);
  const stats = statsQuery.data;

  const { panHandlers, animatedStyle } = useSwipeToDismiss(onClose, { visible });

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <RNAnimated.View style={[styles.sheet, { backgroundColor: colors.surface }, animatedStyle]}>
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
                  onPress={() => setMode(m.key)}
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

          {/* Card preview */}
          <ScrollView
            contentContainerStyle={styles.cardScroll}
            showsVerticalScrollIndicator={false}
          >
            {statsQuery.isLoading || !stats ? (
              <View style={styles.skeletonWrap}>
                <Skeleton height={mode === 'detailed' ? 600 : 260} width={360} />
              </View>
            ) : (
              <StatsShareCard
                mode={mode}
                period={period}
                stats={stats}
                onClose={onClose}
              />
            )}
          </ScrollView>
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
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 14,
  },
  handleArea: { alignItems: 'center', paddingBottom: 4 },
  handle: { borderRadius: 3, height: 4, width: 40 },
  title: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
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
  cardScroll: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  skeletonWrap: { borderRadius: 20, overflow: 'hidden' },
});
