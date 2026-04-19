import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useCustomMetricsStore } from '../stores/customMetricsStore';
import { useTheme } from '../theme/useTheme';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import type {
  BreakdownMetric,
  BreakdownSource,
  CustomMetricDataSource,
  CustomMetricDef,
  MetricFormat,
  SummaryField,
  TimelineMetric,
  VisualizationType,
} from '../types/customMetric';
import {
  BREAKDOWN_OPTIONS,
  METRIC_COLOR_OPTIONS,
  METRIC_ICON_OPTIONS,
  SUMMARY_FIELD_OPTIONS,
  TIMELINE_METRIC_OPTIONS,
} from '../types/customMetric';

// ── Source type tabs ────────────────────────────────────────────────────────

type SourceTab = 'summary' | 'breakdown' | 'timeline';

const SOURCE_TABS: Array<{ key: SourceTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'summary', label: 'Valor', icon: 'text-outline' },
  { key: 'breakdown', label: 'Tabela', icon: 'bar-chart-outline' },
  { key: 'timeline', label: 'Gráfico', icon: 'trending-up-outline' },
];

// Visualizations available per source type
const VIS_FOR_SOURCE: Record<SourceTab, Array<{ key: VisualizationType; label: string; icon: keyof typeof Ionicons.glyphMap }>> = {
  summary: [
    { key: 'number', label: 'Número', icon: 'text-outline' },
    { key: 'progress-ring', label: 'Anel', icon: 'radio-button-on-outline' },
  ],
  breakdown: [
    { key: 'bar-chart', label: 'Barras', icon: 'bar-chart-outline' },
    { key: 'number', label: 'Top 1', icon: 'text-outline' },
  ],
  timeline: [
    { key: 'line-chart', label: 'Linha', icon: 'trending-up-outline' },
    { key: 'bar-chart', label: 'Barras', icon: 'bar-chart-outline' },
  ],
};

const BREAKDOWN_METRIC_OPTIONS: Array<{ key: BreakdownMetric; label: string }> = [
  { key: 'roi', label: 'ROI' },
  { key: 'winRate', label: 'Win %' },
  { key: 'totalBets', label: 'Apostas' },
  { key: 'profitLoss', label: 'P&L' },
];

function generateId(): string {
  return `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function CustomMetricScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();

  const addMetric = useCustomMetricsStore((s) => s.addMetric);
  const updateMetric = useCustomMetricsStore((s) => s.updateMetric);
  const removeMetric = useCustomMetricsStore((s) => s.removeMetric);
  const existingMetric = useCustomMetricsStore((s) =>
    editId ? s.metrics.find((m) => m.id === editId) : undefined,
  );

  const isEditing = !!existingMetric;

  // ── Form state ──────────────────────────────────────────────────────────
  const [name, setName] = useState(existingMetric?.name ?? '');
  const [sourceTab, setSourceTab] = useState<SourceTab>(existingMetric?.dataSource.type ?? 'summary');
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>(existingMetric?.icon ?? 'analytics-outline');
  const [color, setColor] = useState(existingMetric?.color ?? METRIC_COLOR_OPTIONS[0]!);
  const [format, setFormat] = useState<MetricFormat>(existingMetric?.format ?? 'currency');

  // Summary
  const [summaryField, setSummaryField] = useState<SummaryField>(
    existingMetric?.dataSource.type === 'summary' ? existingMetric.dataSource.field : 'profitLoss',
  );
  // Breakdown
  const [breakdownSource, setBreakdownSource] = useState<BreakdownSource>(
    existingMetric?.dataSource.type === 'breakdown' ? existingMetric.dataSource.source : 'bySport',
  );
  const [breakdownMetric, setBreakdownMetric] = useState<BreakdownMetric>(
    existingMetric?.dataSource.type === 'breakdown' ? existingMetric.dataSource.metric : 'roi',
  );
  const [topN, setTopN] = useState(
    existingMetric?.dataSource.type === 'breakdown' ? existingMetric.dataSource.topN : 5,
  );
  // Timeline
  const [timelineMetric, setTimelineMetric] = useState<TimelineMetric>(
    existingMetric?.dataSource.type === 'timeline' ? existingMetric.dataSource.metric : 'profitLoss',
  );
  const [cumulative, setCumulative] = useState(
    existingMetric?.dataSource.type === 'timeline' ? existingMetric.dataSource.cumulative : true,
  );
  // Visualization
  const [visualization, setVisualization] = useState<VisualizationType>(
    existingMetric?.visualization ?? 'number',
  );

  const visOptions = VIS_FOR_SOURCE[sourceTab];

  // Auto-select first valid visualization when switching source tab
  const handleSourceTabChange = useCallback((tab: SourceTab) => {
    hapticLight();
    setSourceTab(tab);
    const valid = VIS_FOR_SOURCE[tab];
    if (!valid.some((v) => v.key === visualization)) {
      setVisualization(valid[0]!.key);
    }
    // Auto-set format
    if (tab === 'summary') {
      const opt = SUMMARY_FIELD_OPTIONS.find((o) => o.field === summaryField);
      if (opt) setFormat(opt.defaultFormat);
    } else if (tab === 'timeline') {
      const opt = TIMELINE_METRIC_OPTIONS.find((o) => o.metric === timelineMetric);
      if (opt) setFormat(opt.defaultFormat);
    } else {
      setFormat(breakdownMetric === 'roi' || breakdownMetric === 'winRate' ? 'percentage' : breakdownMetric === 'profitLoss' ? 'currency' : 'number');
    }
  }, [visualization, summaryField, timelineMetric, breakdownMetric]);

  const buildDataSource = useCallback((): CustomMetricDataSource => {
    switch (sourceTab) {
      case 'summary':
        return { type: 'summary', field: summaryField };
      case 'breakdown':
        return { type: 'breakdown', source: breakdownSource, metric: breakdownMetric, topN };
      case 'timeline':
        return { type: 'timeline', metric: timelineMetric, cumulative };
    }
  }, [sourceTab, summaryField, breakdownSource, breakdownMetric, topN, timelineMetric, cumulative]);

  const canSave = name.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;

    const metricDef: CustomMetricDef = {
      id: existingMetric?.id ?? generateId(),
      name: name.trim(),
      icon,
      color,
      dataSource: buildDataSource(),
      visualization,
      format,
      createdAt: existingMetric?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    if (isEditing) {
      updateMetric(metricDef.id, metricDef);
    } else {
      addMetric(metricDef);
    }
    hapticSuccess();
    router.back();
  }, [canSave, name, icon, color, buildDataSource, visualization, format, isEditing, existingMetric, addMetric, updateMetric, router]);

  const handleDelete = useCallback(() => {
    if (!existingMetric) return;
    Alert.alert(
      'Apagar métrica',
      `Tens a certeza que queres apagar "${existingMetric.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            removeMetric(existingMetric.id);
            hapticSuccess();
            router.back();
          },
        },
      ],
    );
  }, [existingMetric, removeMetric, router]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons color={colors.textPrimary} name="close" size={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {isEditing ? 'Editar métrica' : 'Nova métrica'}
        </Text>
        <Pressable
          hitSlop={12}
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.headerBtn, !canSave && { opacity: 0.35 }]}
        >
          <Ionicons color={canSave ? colors.primary : colors.textMuted} name="checkmark" size={26} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <Animated.View entering={FadeInDown.delay(30).duration(160)} style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>NOME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex: ROI Futebol, P&L Semanal..."
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
              },
            ]}
            maxLength={40}
          />
        </Animated.View>

        {/* Source type */}
        <Animated.View entering={FadeInDown.delay(60).duration(160)} style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>TIPO DE DADOS</Text>
          <View style={styles.tabRow}>
            {SOURCE_TABS.map((tab) => {
              const active = sourceTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => handleSourceTabChange(tab.key)}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: active ? colors.primary : colors.surfaceRaised,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons color={active ? '#fff' : colors.textSecondary} name={tab.icon} size={16} />
                  <Text style={[styles.tabText, { color: active ? '#fff' : colors.textSecondary }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Source-specific config */}
        <Animated.View entering={FadeInDown.delay(90).duration(160)} style={styles.section}>
          {sourceTab === 'summary' && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>CAMPO</Text>
              <View style={styles.optionGrid}>
                {SUMMARY_FIELD_OPTIONS.map((opt) => {
                  const active = summaryField === opt.field;
                  return (
                    <Pressable
                      key={opt.field}
                      onPress={() => {
                        hapticLight();
                        setSummaryField(opt.field);
                        setFormat(opt.defaultFormat);
                      }}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor: active ? `${color}22` : colors.surfaceRaised,
                          borderColor: active ? color : colors.border,
                        },
                      ]}
                    >
                      <Ionicons color={active ? color : colors.textSecondary} name={opt.icon} size={14} />
                      <Text
                        style={[styles.optionChipText, { color: active ? color : colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {sourceTab === 'breakdown' && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>AGRUPAR POR</Text>
              <View style={styles.optionGrid}>
                {BREAKDOWN_OPTIONS.map((opt) => {
                  const active = breakdownSource === opt.source;
                  return (
                    <Pressable
                      key={opt.source}
                      onPress={() => { hapticLight(); setBreakdownSource(opt.source); }}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor: active ? `${color}22` : colors.surfaceRaised,
                          borderColor: active ? color : colors.border,
                        },
                      ]}
                    >
                      <Ionicons color={active ? color : colors.textSecondary} name={opt.icon} size={14} />
                      <Text
                        style={[styles.optionChipText, { color: active ? color : colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>MÉTRICA</Text>
              <View style={styles.tabRow}>
                {BREAKDOWN_METRIC_OPTIONS.map((opt) => {
                  const active = breakdownMetric === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        hapticLight();
                        setBreakdownMetric(opt.key);
                        setFormat(opt.key === 'roi' || opt.key === 'winRate' ? 'percentage' : opt.key === 'profitLoss' ? 'currency' : 'number');
                      }}
                      style={[
                        styles.tab,
                        {
                          backgroundColor: active ? color : colors.surfaceRaised,
                          borderColor: active ? color : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.tabText, { color: active ? '#fff' : colors.textSecondary }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>TOP N</Text>
              <View style={styles.tabRow}>
                {[3, 5, 10].map((n) => {
                  const active = topN === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => { hapticLight(); setTopN(n); }}
                      style={[
                        styles.tab,
                        {
                          backgroundColor: active ? color : colors.surfaceRaised,
                          borderColor: active ? color : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.tabText, { color: active ? '#fff' : colors.textSecondary }]}>
                        Top {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {sourceTab === 'timeline' && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>MÉTRICA</Text>
              <View style={styles.optionGrid}>
                {TIMELINE_METRIC_OPTIONS.map((opt) => {
                  const active = timelineMetric === opt.metric;
                  return (
                    <Pressable
                      key={opt.metric}
                      onPress={() => {
                        hapticLight();
                        setTimelineMetric(opt.metric);
                        setFormat(opt.defaultFormat);
                      }}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor: active ? `${color}22` : colors.surfaceRaised,
                          borderColor: active ? color : colors.border,
                        },
                      ]}
                    >
                      <Ionicons color={active ? color : colors.textSecondary} name={opt.icon} size={14} />
                      <Text
                        style={[styles.optionChipText, { color: active ? color : colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => { hapticLight(); setCumulative((v) => !v); }}
                style={[
                  styles.toggleRow,
                  {
                    backgroundColor: cumulative ? `${color}18` : colors.surfaceRaised,
                    borderColor: cumulative ? color : colors.border,
                  },
                ]}
              >
                <View style={[styles.toggleDot, { backgroundColor: cumulative ? color : colors.textMuted }]} />
                <Text style={[styles.toggleText, { color: cumulative ? color : colors.textSecondary }]}>
                  Acumulado
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>

        {/* Visualization */}
        <Animated.View entering={FadeInDown.delay(120).duration(160)} style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>VISUALIZAÇÃO</Text>
          <View style={styles.tabRow}>
            {visOptions.map((opt) => {
              const active = visualization === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => { hapticLight(); setVisualization(opt.key); }}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: active ? color : colors.surfaceRaised,
                      borderColor: active ? color : colors.border,
                    },
                  ]}
                >
                  <Ionicons color={active ? '#fff' : colors.textSecondary} name={opt.icon} size={16} />
                  <Text style={[styles.tabText, { color: active ? '#fff' : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Color */}
        <Animated.View entering={FadeInDown.delay(150).duration(160)} style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>COR</Text>
          <View style={styles.colorRow}>
            {METRIC_COLOR_OPTIONS.map((c) => {
              const active = color === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => { hapticLight(); setColor(c); }}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c, borderColor: active ? '#fff' : 'transparent' },
                  ]}
                >
                  {active && <Ionicons color="#fff" name="checkmark" size={16} />}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Icon */}
        <Animated.View entering={FadeInDown.delay(180).duration(160)} style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>ÍCONE</Text>
          <View style={styles.iconGrid}>
            {METRIC_ICON_OPTIONS.map((ic) => {
              const active = icon === ic;
              return (
                <Pressable
                  key={ic}
                  onPress={() => { hapticLight(); setIcon(ic); }}
                  style={[
                    styles.iconCell,
                    {
                      backgroundColor: active ? `${color}22` : colors.surfaceRaised,
                      borderColor: active ? color : colors.border,
                    },
                  ]}
                >
                  <Ionicons color={active ? color : colors.textSecondary} name={ic} size={22} />
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Preview */}
        <Animated.View entering={FadeInDown.delay(210).duration(160)} style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>PRÉ-VISUALIZAÇÃO</Text>
          <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.previewIconWrap, { backgroundColor: `${color}22` }]}>
              <Ionicons color={color} name={icon} size={24} />
            </View>
            <View style={styles.previewContent}>
              <Text style={[styles.previewName, { color: colors.textPrimary }]}>
                {name || 'Nome da métrica'}
              </Text>
              <Text style={[styles.previewType, { color: colors.textMuted }]}>
                {sourceTab === 'summary' ? 'Valor único' : sourceTab === 'breakdown' ? 'Tabela' : 'Gráfico temporal'}
                {' · '}
                {visualization === 'number' ? 'Número' : visualization === 'bar-chart' ? 'Barras' : visualization === 'line-chart' ? 'Linha' : 'Anel'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Delete button */}
        {isEditing && (
          <Animated.View entering={FadeInDown.delay(240).duration(160)} style={styles.section}>
            <Pressable
              onPress={handleDelete}
              style={[styles.deleteBtn, { borderColor: colors.danger }]}
            >
              <Ionicons color={colors.danger} name="trash-outline" size={18} />
              <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Apagar métrica</Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  section: { marginTop: 24, gap: 10 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tabRow: { flexDirection: 'row', gap: 8 },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionChipText: { fontSize: 13, fontWeight: '600' },
  toggleRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toggleDot: { borderRadius: 5, height: 10, width: 10 },
  toggleText: { fontSize: 14, fontWeight: '700' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2.5,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  previewCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  previewIconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  previewContent: { flex: 1, gap: 2 },
  previewName: { fontSize: 16, fontWeight: '800' },
  previewType: { fontSize: 12, fontWeight: '600' },
  deleteBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700' },
});
