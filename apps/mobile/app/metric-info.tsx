import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { METRIC_INFO } from '../constants/metricInfo';
import { usePersonalStats } from '../services/statsService';
import { explainMetricFromSummary, type ExplainerVerdict } from '../utils/statExplainers';

// ─── Verdict badge (reused from ExplainBoletinSheet pattern) ─────────────────

function VerdictBadge({ verdict, label, colors }: { verdict: ExplainerVerdict; label: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (verdict === 'info-only' || !label) return null;
  const color = verdict === 'good' ? colors.primary : verdict === 'neutral' ? colors.warning : colors.danger;
  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    verdict === 'good' ? 'checkmark-circle' : verdict === 'neutral' ? 'remove-circle' : 'close-circle';
  return (
    <View style={[vbStyles.badge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[vbStyles.text, { color }]}>{label}</Text>
    </View>
  );
}
const vbStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5 },
  text: { fontSize: 13, fontWeight: '800' },
});

// ─── Explica-me tab content ───────────────────────────────────────────────────

function ExplicaMeTab({ metricKey, colors }: { metricKey: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  const statsQuery = usePersonalStats('all');
  const stats = statsQuery.data;

  if (statsQuery.isLoading) {
    return (
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.bodyText, { color: colors.textMuted }]}>A carregar os teus dados…</Text>
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.bodyText, { color: colors.textMuted }]}>
          Ainda não tens apostas suficientes para calcular este valor. Continua a registar as tuas apostas!
        </Text>
      </View>
    );
  }

  const explanation = explainMetricFromSummary(metricKey, stats);

  if (!explanation) {
    return (
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.bodyText, { color: colors.textMuted }]}>
          Para uma explicação personalizada desta métrica, abre um boletim resolvido e toca em "Explica-me esta aposta".
        </Text>
      </View>
    );
  }

  if (!explanation.isAvailable) {
    return (
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.bodyText, { color: colors.textMuted }]}>{explanation.plainExplanation}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Large value + verdict */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, gap: 12 }]}>
        <Text style={[styles.explainValue, { color: colors.textPrimary }]}>{explanation.statValue}</Text>
        <VerdictBadge verdict={explanation.verdict} label={explanation.verdictLabel} colors={colors} />
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{explanation.plainExplanation}</Text>
      </View>

      {/* Calculation */}
      {explanation.calculationSteps ? (
        <View style={[styles.section, styles.formulaSection, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons color={colors.warning} name="calculator-outline" size={16} />
            <Text style={[styles.sectionLabel, { color: colors.warning }]}>Como foi calculado</Text>
          </View>
          <Text style={[styles.formulaText, { color: colors.textPrimary }]}>{explanation.calculationSteps}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MetricInfoScreen() {
  const { metric, value: valueParam } = useLocalSearchParams<{ metric: string; value?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  const info = metric ? METRIC_INFO[metric] : undefined;
  const numericValue = valueParam !== undefined && valueParam !== '' ? parseFloat(valueParam) : undefined;
  const interpretation =
    info?.interpret && numericValue !== undefined && !Number.isNaN(numericValue)
      ? info.interpret(numericValue)
      : undefined;
  const exampleText =
    info?.exampleFromValue && numericValue !== undefined && !Number.isNaN(numericValue)
      ? info.exampleFromValue(numericValue)
      : info?.example;

  if (!info) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons color={colors.textPrimary} name="arrow-back" size={24} />
        </Pressable>
        <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>
          Métrica não encontrada.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons color={colors.textPrimary} name="arrow-back" size={24} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{info.title}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {info.subtitle}
          </Text>
        </View>
        <View style={[styles.iconBubble, { backgroundColor: colors.surfaceRaised }]}>
          <Ionicons color={colors.primary} name={info.icon as any} size={22} />
        </View>
      </View>

      {/* Segmented control */}
      <View style={[styles.segWrap, { borderBottomColor: colors.border }]}>
        <View style={[styles.segControl, { backgroundColor: colors.surfaceRaised }]}>
          {(['Definição', 'Explica-me'] as const).map((label, idx) => (
            <Pressable
              key={label}
              onPress={() => setActiveTab(idx as 0 | 1)}
              style={[
                styles.segTab,
                activeTab === idx && [styles.segTabActive, { backgroundColor: colors.surface, shadowColor: colors.textPrimary }],
              ]}
            >
              <Text style={[styles.segTabText, { color: activeTab === idx ? colors.textPrimary : colors.textMuted }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 0 ? (
          <>
            {/* Personalised situation — shown only when a value was passed */}
            {interpretation ? (
              <View
                style={[
                  styles.section,
                  styles.situationSection,
                  {
                    backgroundColor:
                      interpretation.sentiment === 'positive'
                        ? `${colors.primary}18`
                        : interpretation.sentiment === 'negative'
                        ? `${colors.danger}18`
                        : colors.surfaceRaised,
                    borderColor:
                      interpretation.sentiment === 'positive'
                        ? colors.primary
                        : interpretation.sentiment === 'negative'
                        ? colors.danger
                        : colors.border,
                  },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Ionicons
                    color={
                      interpretation.sentiment === 'positive'
                        ? colors.primary
                        : interpretation.sentiment === 'negative'
                        ? colors.danger
                        : colors.textSecondary
                    }
                    name={
                      interpretation.sentiment === 'positive'
                        ? 'checkmark-circle-outline'
                        : interpretation.sentiment === 'negative'
                        ? 'alert-circle-outline'
                        : 'ellipse-outline'
                    }
                    size={16}
                  />
                  <Text
                    style={[
                      styles.sectionLabel,
                      {
                        color:
                          interpretation.sentiment === 'positive'
                            ? colors.primary
                            : interpretation.sentiment === 'negative'
                            ? colors.danger
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    A tua situação atual
                  </Text>
                </View>
                <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{interpretation.text}</Text>
              </View>
            ) : null}

            {/* Description */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons color={colors.info} name="book-outline" size={16} />
                <Text style={[styles.sectionLabel, { color: colors.info }]}>O que é</Text>
              </View>
              <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{info.description}</Text>
            </View>

            {/* Formula (optional) */}
            {info.formula ? (
              <View style={[styles.section, styles.formulaSection, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons color={colors.warning} name="calculator-outline" size={16} />
                  <Text style={[styles.sectionLabel, { color: colors.warning }]}>
                    {info.formulaLabel ?? 'Fórmula'}
                  </Text>
                </View>
                <Text style={[styles.formulaText, { color: colors.textPrimary }]}>{info.formula}</Text>
              </View>
            ) : null}

            {/* Example */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons color={colors.primary} name="flash-outline" size={16} />
                <Text style={[styles.sectionLabel, { color: colors.primary }]}>Exemplo</Text>
              </View>
              <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{exampleText}</Text>
            </View>

            {/* Tips */}
            {info.tips.length > 0 ? (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons color={colors.gold} name="bulb-outline" size={16} />
                  <Text style={[styles.sectionLabel, { color: colors.gold }]}>Dicas</Text>
                </View>
                {info.tips.map((tip, i) => (
                  <View key={i} style={styles.tipRow}>
                    <View style={[styles.tipBullet, { backgroundColor: colors.gold }]} />
                    <Text style={[styles.bodyText, styles.tipText, { color: colors.textPrimary }]}>
                      {tip}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <ExplicaMeTab metricKey={metric ?? ''} colors={colors} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 56,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  headerSubtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  iconBubble: { alignItems: 'center', borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
  segWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  segTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  segTabActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segTabText: { fontSize: 14, fontWeight: '700' },
  content: { gap: 12, padding: 16, paddingBottom: 40 },
  section: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
  situationSection: { borderWidth: 1.5 },
  formulaSection: { borderStyle: 'dashed' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  bodyText: { fontSize: 14, fontWeight: '400', lineHeight: 22 },
  formulaText: { fontFamily: 'monospace', fontSize: 13, fontWeight: '600', lineHeight: 22 },
  tipRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  tipBullet: { borderRadius: 3, height: 6, marginTop: 8, width: 6 },
  tipText: { flex: 1 },
  explainValue: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  notFound: { flex: 1, padding: 16 },
  notFoundText: { fontSize: 16, marginTop: 40, textAlign: 'center' },
});
