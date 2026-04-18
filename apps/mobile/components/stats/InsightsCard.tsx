import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsInsight } from '@betintel/shared';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';

interface InsightsCardProps {
  insights: StatsInsight[];
  onInfoPress?: () => void;
}

const SENTIMENT_COLORS = {
  positive: (c: { primary: string }) => c.primary,
  negative: (c: { danger: string }) => c.danger,
  neutral: (c: { info: string }) => c.info,
} as const;

export const InsightsCard = React.memo(function InsightsCard({ insights, onInfoPress }: InsightsCardProps) {
  const { colors } = useTheme();

  if (insights.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre insights" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Insights</Text>
      </View>

      {insights.map((insight) => {
        const accentColor = SENTIMENT_COLORS[insight.sentiment](colors);
        return (
          <View key={insight.id} style={[styles.insightRow, { borderColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${accentColor}18` }]}>
              <Ionicons color={accentColor} name={insight.icon as any} size={18} />
            </View>
            <View style={styles.insightText}>
              <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>{insight.title}</Text>
              <Text style={[styles.insightBody, { color: colors.textSecondary }]}>{insight.body}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  insightRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  insightText: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  insightBody: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
});
