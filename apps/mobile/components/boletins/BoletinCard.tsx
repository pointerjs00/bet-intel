import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import type { BoletinDetail, ItemResult } from '@betintel/shared';
import { BoletinStatus } from '@betintel/shared';
import { TeamBadge } from '../ui/TeamBadge';
import { MarketSelection } from './MarketSelection';
import { PressableScale } from '../ui/PressableScale';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatLongDate, formatOdds, plural } from '../../utils/formatters';
import { hapticMedium } from '../../utils/haptics';
import { BETTING_SITES } from '../../utils/sportAssets';
import { StatusPill } from '../ui/StatusPill';
import { SiteMark } from '../ui/SiteMark';
import { useCardElevation } from '../ui/ListCard';

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
export const BoletinCard = React.memo(function BoletinCard({ boletin, onPress }: BoletinCardProps) {
  const { colors } = useTheme();
  const cardElevation = useCardElevation();
  const [showPreview, setShowPreview] = useState(false);

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
      {/* Meta line: status, freebet, site, date */}
      <View style={styles.cMeta}>
        <StatusPill compact status={boletin.status} />
        {boletin.isFreebet ? (
          <View style={[styles.freebetBadge, { backgroundColor: `${colors.info}22`, borderColor: 'transparent' }]}>
            <Text style={[styles.freebetText, { color: colors.info }]}>Freebet</Text>
          </View>
        ) : null}
        {boletin.items.length > 1 ? (
          <Text style={[styles.cMetaText, { color: colors.textSecondary }]}>{`Múltipla · ${boletin.items.length}`}</Text>
        ) : null}
        <View style={styles.cMetaRightRow}>
          <SiteMark size={16} slug={boletin.siteSlug} />
          <Text numberOfLines={1} style={[styles.cMetaText, { color: colors.textMuted }]}>
            {boletin.siteSlug ? '· ' : ''}{new Date(boletin.betDate ?? boletin.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }).replace('.', '')}
          </Text>
        </View>
      </View>

      {boletin.items.length === 1 && boletin.items[0] ? (
        <View style={styles.cRow}>
          <View style={styles.cCrestPair}>
            <TeamBadge name={boletin.items[0].homeTeam} size={26} variant={boletin.items[0].sport === 'TENNIS' ? 'player' : 'auto'} />
            <TeamBadge name={boletin.items[0].awayTeam} size={26} variant={boletin.items[0].sport === 'TENNIS' ? 'player' : 'auto'} />
          </View>
          <View style={styles.cMain}>
            <Text numberOfLines={1} style={[styles.cTitle, { color: colors.textPrimary }]}>
              {boletinTitle(boletin)}
            </Text>
            <MarketSelection market={boletin.items[0].market} selection={boletin.items[0].selection} />
          </View>
        </View>
      ) : (
        <View style={styles.cLegs}>
          {boletin.name ? (
            <Text numberOfLines={1} style={[styles.cTitle, { color: colors.textPrimary }]}>{boletin.name}</Text>
          ) : null}
          {boletin.items.slice(0, 4).map((item) => {
            const icon = itemResultIcon(item.result, colors);
            return (
              <View key={item.id} style={styles.cLeg}>
                <Ionicons color={icon.color} name={icon.name} size={15} />
                <TeamBadge name={item.homeTeam} size={20} variant={item.sport === 'TENNIS' ? 'player' : 'auto'} />
                <View style={styles.cLegBody}>
                  <Text numberOfLines={1} style={[styles.cLegText, { color: colors.textPrimary }]}>
                    {item.homeTeam} vs {item.awayTeam}
                  </Text>
                  <MarketSelection inline market={item.market} selection={item.selection} />
                </View>
                <Text style={[styles.cLegOdd, { color: colors.textSecondary }]}>{formatOdds(item.oddValue)}</Text>
              </View>
            );
          })}
          {boletin.items.length > 4 ? (
            <Text style={[styles.cMore, { color: colors.textMuted }]}>+{plural(boletin.items.length - 4, 'seleção', 'seleções')}</Text>
          ) : null}
        </View>
      )}

      {/* Figures strip: stake · odd · return/profit */}
      {(() => {
        const stake = Number(boletin.stake);
        const pending = boletin.status === BoletinStatus.PENDING;
        const ret = Number(boletin.actualReturn ?? (boletin.status === BoletinStatus.CASHOUT ? boletin.cashoutAmount ?? 0 : 0));
        const profit = ret - (boletin.isFreebet ? 0 : stake);
        const resultColor = pending ? colors.textPrimary : profit > 0 ? colors.positive : profit < 0 ? colors.negative : colors.textSecondary;
        return (
          <View style={[styles.cStrip, { backgroundColor: colors.surfaceRaised }]}>
            <View style={styles.cCell}>
              <Text style={[styles.cCellLabel, { color: colors.textMuted }]}>APOSTA</Text>
              <Text style={[styles.cCellValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
            </View>
            <View style={[styles.cDivider, { backgroundColor: colors.border }]} />
            <View style={styles.cCell}>
              <Text style={[styles.cCellLabel, { color: colors.textMuted }]}>ODD</Text>
              <Text style={[styles.cCellValue, { color: colors.textPrimary }]}>{formatOdds(boletin.totalOdds)}</Text>
            </View>
            <View style={[styles.cDivider, { backgroundColor: colors.border }]} />
            <View style={[styles.cCell, styles.cCellEnd]}>
              <Text style={[styles.cCellLabel, { color: colors.textMuted }]}>{pending ? 'RETORNO POSSÍVEL' : 'LUCRO'}</Text>
              <Text style={[styles.cCellValue, styles.cCellBig, { color: resultColor }]}>
                {pending
                  ? formatCurrency(boletin.potentialReturn)
                  : `${profit > 0 ? '+' : profit < 0 ? '−' : ''}${formatCurrency(Math.abs(profit))}`}
              </Text>
            </View>
          </View>
        );
      })()}
    </PressableScale>

    {/* Long-press quick preview modal */}
    {showPreview ? (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => setShowPreview(false)}
      statusBarTranslucent
    >
      <Pressable feedback="none" style={previewStyles.backdrop} onPress={() => setShowPreview(false)}>
        <Pressable feedback="none" onPress={(e) => e.stopPropagation()} style={[previewStyles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
              <Text style={[previewStyles.metricLabel, { color: colors.textMuted }]}>Odds</Text>
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
    ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  cRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  cTopBar: { borderTopLeftRadius: 18, borderTopRightRadius: 18, height: 3, left: 0, position: 'absolute', right: 0, top: 0 },
  cCrestPair: { gap: 4 },
  cMain: { flex: 1, gap: 4 },
  cTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  cLegs: { gap: 8 },
  cLeg: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cLegBody: { flex: 1, gap: 1 },
  cLegText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  cLegOdd: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13 },
  cMore: { fontFamily: 'Inter_500Medium', fontSize: 12, marginLeft: 23 },
  cMeta: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cMetaText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  cMetaRightRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'flex-end' },
  cStrip: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8 },
  cCell: { flex: 1, gap: 1 },
  cCellEnd: { alignItems: 'flex-end', flex: 1.4 },
  cCellLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.6 },
  cCellValue: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, lineHeight: 20 },
  cCellBig: { fontSize: 16, lineHeight: 20 },
  cDivider: { height: 24, marginHorizontal: 10, width: StyleSheet.hairlineWidth },
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
