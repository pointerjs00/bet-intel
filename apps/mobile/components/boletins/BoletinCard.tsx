import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  LayoutAnimation,
  Modal,
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
import { hapticMedium } from '../../utils/haptics';
import { BETTING_SITES } from '../../utils/sportAssets';
import { useTeams } from '../../services/referenceService';
import { StatusPill } from '../ui/StatusPill';
import { useCardElevation } from '../ui/ListCard';

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

function statusAccentColor(status: BoletinStatus, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case BoletinStatus.WON: return colors.positive;
    case BoletinStatus.LOST: return colors.negative;
    case BoletinStatus.CASHOUT: return colors.gold;
    case BoletinStatus.VOID:
    case BoletinStatus.PARTIAL: return colors.textSecondary;
    default: return colors.warning; // PENDING
  }
}

function itemResultIcon(
  result: ItemResult,
  colors: ReturnType<typeof useTheme>['colors'],
): { name: React.ComponentProps<typeof Ionicons>['name']; color: string } {
  switch (result) {
    case 'WON': return { name: 'checkmark-circle', color: colors.positive };
    case 'LOST': return { name: 'close-circle', color: colors.negative };
    case 'VOID': return { name: 'remove-circle', color: colors.textSecondary };
    default: return { name: 'time-outline', color: colors.warning };
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

/** Name, or the match for singles, or "Múltipla · N seleções". */
function boletinTitle(b: BoletinDetail): string {
  if (b.name) return b.name;
  const first = b.items[0];
  if (b.items.length === 1 && first) return `${first.homeTeam} vs ${first.awayTeam}`;
  return `Múltipla · ${b.items.length} seleções`;
}

/** Summary card used on the user's boletin list. */
export const BoletinCard = React.memo(function BoletinCard({ boletin, onPress, onDelete, onShare, onImageShare, onItemPress }: BoletinCardProps) {
  const { colors } = useTheme();
  const cardElevation = useCardElevation();
  const [expanded, setExpanded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const chevronRotation = useSharedValue(0);
  const shareScale = useSharedValue(1);
  const imageShareScale = useSharedValue(1);
  const deleteScale = useSharedValue(1);

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
    <>
    <PressableScale
      onPress={onPress}
      onLongPress={() => { hapticMedium(); setShowPreview(true); }}
      delayLongPress={300}
      scaleDown={0.98}
      style={[
        styles.card,
        cardElevation,
        // v2 cards: elevation instead of a border, no coloured side stripe (§6.1).
        { backgroundColor: colors.surface, borderWidth: 0 },
      ]}
      accessibilityHint="Abre o boletim"
    >
      {/* Compact v2 card (redesign: simple and concise). Full detail on tap; long-press
          shows the quick preview; share/delete on swipe. */}
      {/* v3: thin status-coloured strip along the top edge */}
      <View pointerEvents="none" style={[styles.cTopBar, { backgroundColor: statusAccentColor(boletin.status, colors) }]} />
      <View style={styles.cRow}>
        {boletin.items.length === 1 && boletin.items[0] ? (
          <View style={styles.cCrests}>
            <TeamBadge name={boletin.items[0].homeTeam} size={30} variant={boletin.items[0].sport === 'TENNIS' ? 'player' : 'auto'} />
            <TeamBadge name={boletin.items[0].awayTeam} size={22} style={styles.cCrestBack} variant={boletin.items[0].sport === 'TENNIS' ? 'player' : 'auto'} />
          </View>
        ) : null}
        <View style={styles.cMain}>
          <Text numberOfLines={1} style={[styles.cTitle, { color: colors.textPrimary }]}>
            {boletinTitle(boletin)}
          </Text>
          {boletin.items.length === 1 ? (
            <Text numberOfLines={1} style={[styles.cSub, { color: colors.textSecondary }]}>
              {boletin.items[0]!.selection}
            </Text>
          ) : null}
        </View>
        <View style={styles.cRight}>
          {(() => {
            const stake = Number(boletin.stake);
            if (boletin.status === BoletinStatus.PENDING) {
              return (
                <>
                  <Text style={[styles.cAmount, { color: colors.textPrimary }]}>{formatCurrency(boletin.potentialReturn)}</Text>
                  <Text style={[styles.cAmountHint, { color: colors.textMuted }]}>{formatCurrency(boletin.stake)} apostados</Text>
                </>
              );
            }
            const ret = Number(boletin.actualReturn ?? (boletin.status === BoletinStatus.CASHOUT ? boletin.cashoutAmount ?? 0 : 0));
            const profit = ret - (boletin.isFreebet ? 0 : stake);
            return (
              <>
                <Text style={[styles.cAmount, { color: profit > 0 ? colors.positive : profit < 0 ? colors.negative : colors.textSecondary }]}>
                  {profit > 0 ? '+' : profit < 0 ? '−' : ''}{formatCurrency(Math.abs(profit))}
                </Text>
                <Text style={[styles.cAmountHint, { color: colors.textMuted }]}>{formatCurrency(boletin.stake)} · @{formatOdds(boletin.totalOdds)}</Text>
              </>
            );
          })()}
        </View>
      </View>

      {boletin.items.length > 1 ? (
        <View style={styles.cLegs}>
          {boletin.items.slice(0, 4).map((item) => {
            const icon = itemResultIcon(item.result, colors);
            return (
              <View key={item.id} style={styles.cLeg}>
                <Ionicons color={icon.color} name={icon.name} size={14} />
                <TeamBadge name={item.homeTeam} size={18} variant={item.sport === 'TENNIS' ? 'player' : 'auto'} />
                <Text numberOfLines={1} style={[styles.cLegText, { color: colors.textSecondary }]}>
                  {item.homeTeam} vs {item.awayTeam} · {item.selection}
                </Text>
              </View>
            );
          })}
          {boletin.items.length > 4 ? (
            <Text style={[styles.cLegText, { color: colors.textMuted }]}>+ {boletin.items.length - 4} seleções</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cMeta}>
        <StatusPill compact status={boletin.status} />
        {boletin.isFreebet ? (
          <View style={[styles.freebetBadge, { backgroundColor: `${colors.info}22`, borderColor: 'transparent' }]}>
            <Text style={[styles.freebetText, { color: colors.info }]}>Freebet</Text>
          </View>
        ) : null}
        <Text numberOfLines={1} style={[styles.cMetaText, { color: colors.textMuted }]}>
          {[BETTING_SITES.find((s) => s.slug === boletin.siteSlug)?.name, new Date(boletin.betDate ?? boletin.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }).replace('.', '')].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </PressableScale>

    {/* Long-press quick preview modal */}
    <Modal
      visible={showPreview}
      transparent
      animationType="fade"
      onRequestClose={() => setShowPreview(false)}
      statusBarTranslucent
    >
      <Pressable style={previewStyles.backdrop} onPress={() => setShowPreview(false)}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[previewStyles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Status header */}
          <View style={[previewStyles.header, { backgroundColor: statusAccentColor(boletin.status, colors) + '18', borderBottomColor: statusAccentColor(boletin.status, colors) + '35' }]}>
            <StatusPill status={boletin.status} />
            {boletin.siteSlug ? <SiteBadge slug={boletin.siteSlug} colors={colors} /> : null}
            <Text style={[previewStyles.date, { color: colors.textMuted }]}>
              {formatLongDate(boletin.betDate ?? boletin.createdAt)}
            </Text>
          </View>

          {/* Name */}
          <Text numberOfLines={2} style={[previewStyles.name, { color: colors.textPrimary }]}>
            {boletinTitle(boletin)}
          </Text>

          {/* Metrics */}
          <View style={previewStyles.metrics}>
            <View style={previewStyles.metric}>
              <Text style={[previewStyles.metricLabel, { color: colors.textMuted }]}>💰 Stake</Text>
              <Text style={[previewStyles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
            </View>
            <View style={previewStyles.metric}>
              <Text style={[previewStyles.metricLabel, { color: colors.textMuted }]}>🎯 Odds</Text>
              <Text style={[previewStyles.metricValue, { color: colors.gold }]}>{formatOdds(boletin.totalOdds)}</Text>
            </View>
            <View style={previewStyles.metric}>
              <Text style={[previewStyles.metricLabel, { color: colors.textMuted }]}>
                {boletin.status === BoletinStatus.LOST
                  ? (boletin.isFreebet ? '🎁 Freebet' : '📉 Perdido')
                  : boletin.status === BoletinStatus.CASHOUT
                  ? '💵 Cashout'
                  : '💸 Retorno'}
              </Text>
              <Text style={[previewStyles.metricValue, {
                color: boletin.status === BoletinStatus.LOST
                  ? (boletin.isFreebet ? colors.info : colors.danger)
                  : boletin.status === BoletinStatus.CASHOUT
                  ? colors.gold
                  : colors.primary,
              }]}>
                {boletin.status === BoletinStatus.LOST
                  ? (boletin.isFreebet ? 'Grátis' : `-${formatCurrency(boletin.stake)}`)
                  : boletin.status === BoletinStatus.CASHOUT
                  ? formatCurrency(boletin.cashoutAmount ?? boletin.actualReturn ?? '0')
                  : formatCurrency(boletin.actualReturn ?? boletin.potentialReturn)}
              </Text>
            </View>
          </View>

          {/* Selections */}
          <View style={previewStyles.items}>
            {boletin.items.map((item) => {
              const icon = itemResultIcon(item.result, colors);
              return (
                <View key={item.id} style={[previewStyles.item, { borderBottomColor: colors.border }]}>
                  <Ionicons name={icon.name} size={14} color={icon.color} />
                  <Text numberOfLines={1} style={[previewStyles.itemTeams, { color: colors.textSecondary }]}>
                    {item.homeTeam} vs {item.awayTeam}
                  </Text>
                  <Text style={[previewStyles.itemOdds, { color: colors.gold }]}>{formatOdds(item.oddValue)}</Text>
                </View>
              );
            })}
          </View>

          <Text style={[previewStyles.hint, { color: colors.textMuted }]}>Toca fora para fechar</Text>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 16,
  },
  cRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  cTopBar: { borderTopLeftRadius: 18, borderTopRightRadius: 18, height: 3, left: 0, position: 'absolute', right: 0, top: 0 },
  cCrests: { height: 40, width: 40 },
  cCrestBack: { bottom: 0, position: 'absolute', right: 0 },
  cMain: { flex: 1, gap: 2 },
  cTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  cSub: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  cRight: { alignItems: 'flex-end', gap: 2 },
  cAmount: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 17 },
  cAmountHint: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  cLegs: { gap: 4 },
  cLeg: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  cLegText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 },
  cMeta: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cMetaText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'right' },
  statusStripe: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 3,
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
  name: { fontSize: 20, fontWeight: '900', lineHeight: 26, marginLeft: 8 },
  metricsRow: {
    flexDirection: 'row',
    gap: 2,
    marginLeft: 8,
  },
  metric: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resultDot: { borderRadius: 4, flexShrink: 0, height: 8, width: 8, marginLeft: 8 },
  previewList: { gap: 4 },
  previewRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  previewVs: { flexShrink: 0, fontSize: 11, fontWeight: '500' },
  previewMeta: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '500',
    minWidth: 0,
  },
  previewOdds: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 0,
    marginLeft: 4,
  },
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
  previewInsightsBtn: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    padding: 4,
  },
  expandedInsightsDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -10,
    marginTop: 4,
  },
  expandedInsightsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingTop: 6,
  },
  expandedInsightsLabel: { flex: 1, fontSize: 11, fontWeight: '700' },
});

const previewStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.60)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  date: { fontSize: 12, fontWeight: '600', marginLeft: 'auto' },
  name: { fontSize: 18, fontWeight: '900', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, lineHeight: 24 },
  metrics: { flexDirection: 'row', gap: 0, paddingHorizontal: 16, paddingVertical: 12 },
  metric: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 11, fontWeight: '600' },
  metricValue: { fontSize: 15, fontWeight: '800' },
  items: { paddingHorizontal: 16, paddingBottom: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemTeams: { flex: 1, fontSize: 13, fontWeight: '600' },
  itemOdds: { fontSize: 13, fontWeight: '800', flexShrink: 0 },
  hint: { fontSize: 11, fontWeight: '500', textAlign: 'center', paddingVertical: 12 },
});
