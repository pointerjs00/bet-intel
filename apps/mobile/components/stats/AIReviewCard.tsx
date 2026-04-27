import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AiReview } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

interface Props {
  data: AiReview | undefined;
  isLoading: boolean;
  error: Error | null;
  onGenerate: () => void;
}

// ─── Bullet list section ──────────────────────────────────────────────────────

function Section({
  title,
  icon,
  color,
  bullets,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  bullets: string[];
}) {
  const { colors } = useTheme();
  if (bullets.length === 0) return null;
  return (
    <View style={sectionStyles.wrap}>
      <View style={sectionStyles.header}>
        <View style={[sectionStyles.iconWrap, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
        <Text style={[sectionStyles.title, { color }]}>{title}</Text>
      </View>
      {bullets.map((bullet, i) => (
        <View key={i} style={sectionStyles.bulletRow}>
          <View style={[sectionStyles.dot, { backgroundColor: color }]} />
          <Text style={[sectionStyles.bulletText, { color: colors.textSecondary }]}>{bullet}</Text>
        </View>
      ))}
    </View>
  );
}
const sectionStyles = StyleSheet.create({
  wrap: { gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 30 },
  dot: { width: 5, height: 5, borderRadius: 99, marginTop: 8, flexShrink: 0 },
  bulletText: { fontSize: 13, lineHeight: 20, flex: 1 },
});

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <Skeleton height={14} width="60%" borderRadius={6} />
      <Skeleton height={13} width="100%" borderRadius={6} />
      <Skeleton height={13} width="85%" borderRadius={6} />
      <Skeleton height={13} width="92%" borderRadius={6} />
      <Skeleton height={14} width="55%" borderRadius={6} />
      <Skeleton height={13} width="100%" borderRadius={6} />
      <Skeleton height={13} width="78%" borderRadius={6} />
    </View>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function AIReviewCard({ data, isLoading, error, onGenerate }: Props) {
  const { colors } = useTheme();

  const cachedAt = data?.cachedAt ? new Date(data.cachedAt) : null;
  const expiresAt = cachedAt ? new Date(cachedAt.getTime() + 24 * 60 * 60 * 1000) : null;
  const hoursUntilRefresh = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
    : 0;
  const canRefresh = !cachedAt || hoursUntilRefresh === 0;
  const showCTA = (!data || canRefresh) && !isLoading;

  return (
    <Card noPadding>
      {/* Content area — all padding here so button can bleed to edges */}
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Análise IA</Text>
            {cachedAt && (
              <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                {canRefresh ? 'Disponível para atualizar' : `Válida por ${hoursUntilRefresh}h`}
              </Text>
            )}
          </View>
          <View style={[styles.poweredBadge, { borderColor: colors.border }]}>
            <Text style={[styles.poweredText, { color: colors.textMuted }]}>Claude</Text>
          </View>
        </View>

        {/* Body */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {(error as Error & { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Erro ao gerar análise. Tenta novamente.'}
            </Text>
          </View>
        ) : data ? (
          <View style={styles.sections}>
            <Section title="Pontos fortes" icon="trending-up" color={colors.primary} bullets={data.strongPoints} />
            <Section title="Pontos fracos" icon="trending-down" color={colors.danger} bullets={data.weakPoints} />
            <Section title="Padrões identificados" icon="analytics-outline" color={colors.warning} bullets={data.patterns} />
            {data.recommendation ? (
              <View style={[styles.recommendation, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                <Text style={[styles.recommendationText, { color: colors.textPrimary }]}>{data.recommendation}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <Ionicons name="stats-chart-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Análise personalizada</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Obtém uma análise honesta da tua performance com pontos fortes, fraquezas e uma recomendação específica para ti.
            </Text>
          </View>
        )}
      </View>

      {/* CTA — rendered outside the padded content so its background fills edge-to-edge */}
      {showCTA && (
        <>
          <View style={[styles.ctaDivider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={onGenerate}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
            style={({ pressed }) => [styles.generateBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="sparkles" size={15} color="#fff" />
                <Text style={styles.generateBtnText}>
                  {error ? 'Tenta novamente' : data ? 'Atualizar análise' : 'Gerar análise'}
                </Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerSubtitle: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  poweredBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  poweredText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  sections: { gap: 16 },
  recommendation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  recommendationText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 20 },
  emptyState: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', gap: 8, paddingHorizontal: 20, paddingVertical: 24 },
  emptyTitle: { fontSize: 14, fontWeight: '700' },
  emptyBody: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  ctaDivider: { height: StyleSheet.hairlineWidth },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  generateBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
