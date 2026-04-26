import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { BoletinDetail, ItemResult } from '@betintel/shared';
import { BoletinStatus, Sport } from '@betintel/shared';
import { TeamBadge } from '../ui/TeamBadge';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { PressableScale } from '../ui/PressableScale';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatLongDate, formatOdds } from '../../utils/formatters';
import { BETTING_SITES } from '../../utils/sportAssets';
import { useTeams } from '../../services/referenceService';
import { StatusBadge } from './StatusBadge';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface BoletinCardProps {
  boletin: BoletinDetail;
  onPress?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onImageShare?: () => void;
  onItemPress?: (item: BoletinDetail['items'][number]) => void;
}

function statusAccentColor(status: BoletinStatus): string {
  switch (status) {
    case BoletinStatus.WON:     return '#00C851';
    case BoletinStatus.LOST:    return '#FF3B30';
    case BoletinStatus.CASHOUT: return '#FFD700';
    case BoletinStatus.VOID:
    case BoletinStatus.PARTIAL: return '#A0A0A0';
    default:                    return '#FF9500'; // PENDING
  }
}

function itemResultIcon(result: ItemResult): { name: React.ComponentProps<typeof Ionicons>['name']; color: string } {
  switch (result) {
    case 'WON': return { name: 'checkmark-circle', color: '#00C851' };
    case 'LOST': return { name: 'close-circle', color: '#FF3B30' };
    case 'VOID': return { name: 'remove-circle', color: '#A0A0A0' };
    default: return { name: 'time-outline', color: '#FF9500' };
  }
}

function SiteBadge({ slug, colors }: { slug: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  const site = BETTING_SITES.find((s) => s.slug === slug);
  if (!site) return null;
  return (
    <View style={[styles.siteBadge, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {site.logo ? (
        <Image source={site.logo} style={styles.siteLogo} resizeMode="contain" />
      ) : null}
      <Text style={[styles.siteBadgeName, { color: colors.textSecondary }]}>{site.name}</Text>
    </View>
  );
}

/** Summary card used on the user's boletin list. */
export const BoletinCard = React.memo(function BoletinCard({ boletin, onPress, onDelete, onShare, onImageShare, onItemPress }: BoletinCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const chevronRotation = useSharedValue(0);
  const shareScale = useSharedValue(1);
  const imageShareScale = useSharedValue(1);
  const deleteScale = useSharedValue(1);

  // Resolve ATP player photos using the same reference data as the create screen.
  // React Query deduplicates concurrent calls and serves cached data (staleTime 24h).
  // Only fetch tennis teams when the boletin actually contains tennis items.
  const hasTennis = useMemo(() => boletin.items.some((i) => i.sport === Sport.TENNIS), [boletin.items]);
  const { data: atpTeams } = useTeams({ sport: 'TENNIS', competition: 'ATP Tour' }, { enabled: hasTennis });
  const { data: wtaTeams } = useTeams({ sport: 'TENNIS', competition: 'WTA Tour' }, { enabled: hasTennis });

  const tennisPhotoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const team of [...(atpTeams ?? []), ...(wtaTeams ?? [])]) {
      const url = team.imageUrl ?? null;
      if (team.displayName) map.set(team.displayName, url);
      map.set(team.name, url);
    }
    return map;
  }, [atpTeams, wtaTeams]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const shareButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shareScale.value }],
  }));

  const imageShareButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: imageShareScale.value }],
  }));

  const deleteButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: deleteScale.value }],
  }));

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    chevronRotation.value = withTiming(expanded ? 0 : 180, {
      duration: 100,
      easing: Easing.out(Easing.ease),
    });
    setExpanded((prev) => !prev);
  };

  return (
    <PressableScale
      onPress={onPress}
      scaleDown={0.98}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Status accent stripe */}
      <View
        style={[
          styles.statusStripe,
          { backgroundColor: statusAccentColor(boletin.status) },
        ]}
      />
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <StatusBadge status={boletin.status} />
          {boletin.isFreebet ? (
            <View style={[styles.freebetBadge, { backgroundColor: 'rgba(0,122,255,0.15)', borderColor: 'rgba(0,122,255,0.35)' }]}>
              <Text style={[styles.freebetText, { color: '#007AFF' }]}>Freebet</Text>
            </View>
          ) : null}
          {boletin.siteSlug ? (
            <SiteBadge colors={colors} slug={boletin.siteSlug} />
          ) : null}
        </View>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formatLongDate(boletin.betDate ?? boletin.createdAt)}
        </Text>
      </View>

      {/* Name */}
      <Text style={[styles.name, { color: colors.textPrimary }]}>
        {boletin.name || `Boletim com ${boletin.items.length} seleç${boletin.items.length === 1 ? 'ão' : 'ões'}`}
      </Text>

      {/* Metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>💰 Stake</Text>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>🎯 Odds</Text>
          <Text style={[styles.metricValue, { color: colors.gold }]}>{formatOdds(boletin.totalOdds)}</Text>
        </View>
        {boletin.status === BoletinStatus.LOST ? (
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {boletin.isFreebet ? '🎁 Freebet' : '📉 Perdido'}
            </Text>
            <Text style={[styles.metricValue, { color: boletin.isFreebet ? colors.info : colors.danger }]}>
              {boletin.isFreebet ? 'Grátis' : `-${formatCurrency(boletin.stake)}`}
            </Text>
          </View>
        ) : boletin.status === BoletinStatus.CASHOUT ? (
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>💵 Cashout</Text>
            <Text style={[styles.metricValue, { color: colors.gold }]}>
              {formatCurrency(boletin.cashoutAmount ?? boletin.actualReturn ?? '0')}
            </Text>
          </View>
        ) : (
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>💸 Retorno</Text>
            <Text style={[styles.metricValue, { color: colors.primary }]}>
              {formatCurrency(boletin.actualReturn ?? boletin.potentialReturn)}
            </Text>
          </View>
        )}
      </View>

      {/* Collapsed preview (always shown, up to 3 items) */}
      {!expanded ? (
        <View style={styles.previewList}>
          {boletin.items.slice(0, 3).map((item) => {
            const icon = itemResultIcon(item.result);
            return (
              <Pressable
                key={item.id}
                onPress={() => onItemPress?.(item)}
                style={styles.previewRow}
              >
                {/* Result dot */}
                <View style={[styles.resultDot, { backgroundColor: icon.color }]} />

                {/* Home badge */}
                <TeamBadge
                  name={item.homeTeam}
                  size={20}
                  imageUrl={item.sport === Sport.TENNIS ? (tennisPhotoMap.get(item.homeTeam) ?? null) : null}
                  variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                />

                <Text style={[styles.previewVs, { color: colors.textMuted }]}>vs</Text>

                {/* Away badge */}
                <TeamBadge
                  name={item.awayTeam}
                  size={20}
                  imageUrl={item.sport === Sport.TENNIS ? (tennisPhotoMap.get(item.awayTeam) ?? null) : null}
                  variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                />

                {/* Selection & odds — fills remaining space, truncates gracefully */}
                <Text numberOfLines={1} style={[styles.previewMeta, { color: colors.textMuted, flex: 1 }]}>
                  {'  '}{item.selection} @ {formatOdds(item.oddValue)}
                </Text>
              </Pressable>
            );
          })}
          {boletin.items.length > 3 ? (
            <Text style={[styles.previewMore, { color: colors.textMuted }]}>
              + {boletin.items.length - 3} mais
            </Text>
          ) : null}
        </View>
      ) : (
        /* Expanded: all items with full detail */
        <View style={styles.expandedList}>
          {boletin.items.map((item) => {
            const icon = itemResultIcon(item.result);
            return (
              <Pressable
                key={item.id}
                onPress={() => onItemPress?.(item)}
                style={[
                  styles.expandedItem,
                  {
                    backgroundColor: `${icon.color}10`,
                    borderColor: colors.border,
                    borderLeftColor: icon.color,
                    borderLeftWidth: 3,
                  },
                ]}
              >
                <View style={styles.expandedItemTop}>
                  <Ionicons color={icon.color} name={icon.name} size={16} />
                  <View style={styles.expandedTeams}>
                    <TeamBadge
                      name={item.homeTeam}
                      size={14}
                      imageUrl={item.sport === Sport.TENNIS ? (tennisPhotoMap.get(item.homeTeam) ?? null) : null}
                      variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                    />
                    <Text numberOfLines={1} style={[styles.expandedTeamText, { color: colors.textPrimary }]}>
                      {item.homeTeam}
                    </Text>
                    <Text style={[styles.expandedVs, { color: colors.textMuted }]}>vs</Text>
                    <Text numberOfLines={1} style={[styles.expandedTeamText, { color: colors.textPrimary }]}>
                      {item.awayTeam}
                    </Text>
                    <TeamBadge
                      name={item.awayTeam}
                      size={14}
                      imageUrl={item.sport === Sport.TENNIS ? (tennisPhotoMap.get(item.awayTeam) ?? null) : null}
                      variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
                    />
                  </View>
                  <Text style={[styles.expandedOdd, { color: colors.gold }]}>
                    {formatOdds(item.oddValue)}
                  </Text>
                </View>
                <View style={styles.expandedMetaRow}>
                  <CompetitionBadge name={item.competition} size={13} />
                  <Text numberOfLines={1} style={[styles.expandedMeta, { color: colors.textMuted, flex: 1 }]}>
                    {item.competition} • {item.market} • {item.selection}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Action + expand row */}
      <View style={styles.actionRow}>
        {/* Icon-only action buttons */}
        <View style={styles.iconActions}>
          <Animated.View style={shareButtonStyle}>
            <Pressable
              hitSlop={10}
              onPress={(e) => { e.stopPropagation(); onShare?.(); }}
              onPressIn={() => { shareScale.value = withTiming(0.9, { duration: 90 }); }}
              onPressOut={() => { shareScale.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
              style={[styles.iconBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <Ionicons color={colors.textSecondary} name="share-social-outline" size={20} />
            </Pressable>
          </Animated.View>
          <Animated.View style={imageShareButtonStyle}>
            <Pressable
              hitSlop={10}
              onPress={(e) => { e.stopPropagation(); onImageShare?.(); }}
              onPressIn={() => { imageShareScale.value = withTiming(0.9, { duration: 90 }); }}
              onPressOut={() => { imageShareScale.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
              style={[styles.iconBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <Ionicons color={colors.textSecondary} name="image-outline" size={20} />
            </Pressable>
          </Animated.View>
          <Animated.View style={deleteButtonStyle}>
            <Pressable
              hitSlop={10}
              onPress={(e) => { e.stopPropagation(); onDelete?.(); }}
              onPressIn={() => {
                deleteScale.value = withTiming(0.9, { duration: 90 });
              }}
              onPressOut={() => {
                deleteScale.value = withSpring(1, { damping: 12, stiffness: 260 });
              }}
              style={[styles.iconBtn, { backgroundColor: 'rgba(255,59,48,0.10)', borderColor: 'rgba(255,59,48,0.25)' }]}
            >
              <Ionicons color="#FF3B30" name="trash-outline" size={20} />
            </Pressable>
          </Animated.View>
        </View>

        {/* Expand/collapse chevron */}
        <Pressable
          hitSlop={10}
          onPress={(e) => { e.stopPropagation(); toggleExpand(); }}
          style={[styles.expandBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <Text style={[styles.expandBtnLabel, { color: colors.textSecondary }]}>
            {expanded ? 'Fechar' : `Ver Detalhes`}
          </Text>
          <Animated.View style={chevronStyle}>
            <Ionicons color={colors.textSecondary} name="chevron-down" size={16} />
          </Animated.View>
        </Pressable>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 16,
  },
  statusStripe: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 5,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: 4,
  },
  headerLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  freebetBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  freebetText: {
    fontSize: 11,
    fontWeight: '700',
  },
  siteBadge: { alignItems: 'center', borderRadius: 6, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 6, paddingVertical: 2 },
  siteLogo: { borderRadius: 3, height: 14, width: 14 },
  siteBadgeName: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '900', lineHeight: 26, marginLeft: 8, },
  metricsRow: { flexDirection: 'row', gap: 12, marginLeft: 8, },
  metric: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 12, fontWeight: '600' },
  metricValue: { fontSize: 14, fontWeight: '800' },
  resultDot: { borderRadius: 4, flexShrink: 0, height: 8, width: 8, marginLeft: 8, },
  previewList: { gap: 6 },
  previewRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  previewVs: { flexShrink: 0, fontSize: 11, fontWeight: '500' },
  previewMeta: { flexShrink: 1, fontSize: 12, fontWeight: '600', minWidth: 0 },
  previewMore: { fontSize: 12, fontWeight: '600', marginLeft: 8 },
  expandedList: { gap: 8 },
  expandedItem: {
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  expandedItemTop: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  expandedTeams: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 4 },
  expandedTeamText: { flexShrink: 1, fontSize: 12, fontWeight: '700', minWidth: 0 },
  expandedVs: { fontSize: 11, fontWeight: '500' },
  expandedOdd: { fontSize: 13, fontWeight: '800', marginLeft: 'auto' },
  expandedMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginLeft: 22 },
  expandedMeta: { fontSize: 11, fontWeight: '500' },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginLeft: 8,
  },
  iconActions: { flexDirection: 'row', gap: 12 },
  iconBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  expandBtn: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  expandBtnLabel: { fontSize: 13, fontWeight: '600' },
});