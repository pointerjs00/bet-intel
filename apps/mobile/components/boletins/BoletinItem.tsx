import React, { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { ItemResult, Sport } from '@betintel/shared';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { TeamBadge } from '../ui/TeamBadge';
import { MarketSelection } from './MarketSelection';
import type { ItemMatch } from '../../services/sportsService';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { useTheme } from '../../theme/useTheme';
import { formatOdds, formatPercentage } from '../../utils/formatters';

interface BoletinItemProps {
  item: {
    market: string;
    selection: string;
    oddValue: string;
    result: ItemResult;
    homeTeam: string;
    homeTeamImageUrl?: string | null;
    awayTeam: string;
    awayTeamImageUrl?: string | null;
    competition: string;
    sport?: Sport;
    kickoffAt?: string | null;
    needsReview?: boolean;
  };
  onRemove?: () => void;
  onEdit?: () => void;
  onResultChange?: (result: ItemResult) => void;
  onInsights?: () => void;
  /** Real match (score, state) when it was found in the data feeds. */
  match?: ItemMatch | null;
  /** Opens the match (football detail). */
  onMatchPress?: () => void;
}

const LIVE = new Set(['LIVE', 'HALFTIME']);

/** "Terminado", "Int.", "67'", "Adiado"… for the score block. */
function matchStateLabel(m: ItemMatch): string {
  if (m.status === 'FINISHED') return 'Terminado';
  if (m.status === 'HALFTIME') return 'Intervalo';
  if (m.status === 'LIVE') return m.sport === 'TENNIS' ? 'Ao vivo' : m.statusDetail || 'Ao vivo';
  if (m.status === 'POSTPONED') return 'Adiado';
  if (m.status === 'CANCELLED') return 'Cancelado';
  if (m.status === 'RETIRED') return 'Desistência';
  if (m.status === 'WALKOVER') return 'Walkover';
  return formatKickoff(m.kickoffAt);
}

/** Sofascore-style two-line score: crest, name and score per side; the winner in bold. */
function ScoreBlock({ item, match, onPress }: { item: BoletinItemProps['item']; match: ItemMatch; onPress?: () => void }) {
  const { colors } = useTheme();
  const variant = item.sport === Sport.TENNIS ? 'player' : 'team';
  const s = match.score;
  const live = LIVE.has(match.status);
  const done = match.status === 'FINISHED';
  const side = (name: string, score: number | undefined, other: number | undefined, imageUrl?: string | null) => {
    const winner = done && score !== undefined && other !== undefined && score > other;
    const loser = done && score !== undefined && other !== undefined && score < other;
    return (
      <View style={styles.scoreRow}>
        <TeamBadge imageUrl={imageUrl} name={name} size={22} variant={variant} />
        <Text numberOfLines={1} style={[styles.scoreName, { color: loser ? colors.textSecondary : colors.textPrimary, fontWeight: winner ? '800' : '600' }]}>{name}</Text>
        {score !== undefined ? (
          <Text style={[styles.scoreValue, { color: live ? colors.live : loser ? colors.textSecondary : colors.textPrimary }]}>{score}</Text>
        ) : null}
      </View>
    );
  };
  return (
    <Pressable accessibilityHint={onPress ? 'Abre o jogo' : undefined} disabled={!onPress} onPress={onPress} style={[styles.scoreBlock, { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.scoreState}>
        {live ? <View style={[styles.liveDot, { backgroundColor: colors.live }]} /> : null}
        <Text style={[styles.scoreStateText, { color: live ? colors.live : colors.textSecondary }]}>{matchStateLabel(match)}</Text>
        {match.halfTime && done ? <Text style={[styles.scoreStateText, { color: colors.textMuted }]}>Int. {match.halfTime.home}-{match.halfTime.away}</Text> : null}
        {match.line ? <Text numberOfLines={1} style={[styles.scoreStateText, styles.flexShrink, { color: colors.textMuted }]}>{match.line}</Text> : null}
      </View>
      {side(match.home, s?.home, s?.away, teamNamesEqual(match.home, item.homeTeam) ? item.homeTeamImageUrl : item.awayTeamImageUrl)}
      {side(match.away, s?.away, s?.home, teamNamesEqual(match.away, item.awayTeam) ? item.awayTeamImageUrl : item.homeTeamImageUrl)}
    </Pressable>
  );
}

const teamNamesEqual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Formats a kickoff ISO string as "DD/MM  HH:MM" */
function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}  ${hh}:${min}`;
}

/** Estimated match durations in minutes per sport */
const MATCH_DURATION_MINUTES: Record<string, number> = {
  [Sport.FOOTBALL]: 105,        // 90 min + avg stoppage
  [Sport.BASKETBALL]: 150,      // ~2.5h for NBA with breaks
  [Sport.TENNIS]: 120,          // avg 2h
  [Sport.HANDBALL]: 90,         // 60 min + breaks
  [Sport.VOLLEYBALL]: 120,      // up to 5 sets
  [Sport.HOCKEY]: 90,           // 60 min + breaks
  [Sport.RUGBY]: 100,           // 80 min + breaks
  [Sport.AMERICAN_FOOTBALL]: 210, // ~3.5h for NFL
  [Sport.BASEBALL]: 180,        // ~3h
  [Sport.OTHER]: 120,
};

type KickoffStatus = 'future' | 'live' | 'finished';

function getKickoffStatus(iso: string, sport?: Sport): KickoffStatus {
  const kickoffMs = new Date(iso).getTime();
  const now = Date.now();
  if (kickoffMs > now) return 'future';
  const durationMs = (MATCH_DURATION_MINUTES[sport ?? Sport.OTHER] ?? 120) * 60 * 1000;
  return kickoffMs + durationMs < now ? 'finished' : 'live';
}

/** Renders one selection row in builder and detail contexts. */
function BoletinItemInner({ item, onRemove, onEdit, onResultChange, onInsights, match, onMatchPress }: BoletinItemProps) {
  const { colors } = useTheme();
  const resultMeta = getResultMeta(item.result, colors);

  const a11yLabel = `${item.selection}, odds ${item.oddValue}, ${item.homeTeam} vs ${item.awayTeam}, ${item.competition}`;

  const kickoffStatus = item.kickoffAt ? getKickoffStatus(item.kickoffAt, item.sport) : 'future';
  const kickoffColor = kickoffStatus === 'live' ? colors.danger : colors.textMuted;

  return (
    <View
      accessibilityLabel={a11yLabel}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: 'transparent',
        },
      ]}
    >
      {/* Result shown by the icon + label pills only (no side stripe, §6.1) */}
      <View
        pointerEvents="none"
        style={[
          styles.resultStripe,
          { backgroundColor: resultMeta.color },
        ]}
      />
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          {match ? (
            <ScoreBlock item={item} match={match} onPress={onMatchPress} />
          ) : (
            <>
              <View style={styles.teamRow}>
                <TeamBadge imageUrl={item.homeTeamImageUrl} name={item.homeTeam} size={24} variant={item.sport === Sport.TENNIS ? 'player' : 'team'} />
                <Text numberOfLines={1} style={[styles.teamsSubtitle, { color: colors.textPrimary }]}>{item.homeTeam}</Text>
              </View>
              <View style={styles.teamRow}>
                <TeamBadge imageUrl={item.awayTeamImageUrl} name={item.awayTeam} size={24} variant={item.sport === Sport.TENNIS ? 'player' : 'team'} />
                <Text numberOfLines={1} style={[styles.teamsSubtitle, { color: colors.textPrimary }]}>{item.awayTeam}</Text>
              </View>
            </>
          )}
          {onEdit ? (
            <Pressable hitSlop={10} onPress={onEdit} style={styles.editIconBtn}>
              <Ionicons color={colors.info} name="create-outline" size={17} />
            </Pressable>
          ) : null}

          {/* ── Kickoff date/time — own dedicated row (when the match isn't known) ── */}
          {item.kickoffAt && !match ? (
            <View style={styles.kickoffRow}>
              <Ionicons
                name={kickoffStatus === 'live' ? 'radio-button-on' : kickoffStatus === 'finished' ? 'checkmark-circle-outline' : 'time-outline'}
                size={12}
                color={kickoffColor}
              />
              <Text style={[styles.kickoffText, { color: kickoffColor }]}>
                {kickoffStatus === 'live' ? 'Em curso · ' : kickoffStatus === 'finished' ? 'Terminado · ' : ''}{formatKickoff(item.kickoffAt)}
              </Text>
            </View>
          ) : null}

          {/* ── Competition row ─────────────────────────────────────── */}
          <View style={styles.competitionRow}>
            <CompetitionBadge name={item.competition} size={14} />
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {item.competition}
            </Text>
          </View>
        </View>

        <View style={styles.topRightActions}>
          {(onRemove || onEdit) ? (
            <View style={styles.editRemoveRow}>
              {onRemove ? (
                <Pressable hitSlop={10} onPress={onRemove}>
                  <Ionicons color={colors.danger} name="trash-outline" size={18} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {onResultChange ? (
            <View style={styles.resultButtons}>
              <ResultToggleButton
                accessibilityLabel="Marcar como ganhou"
                active={item.result === ItemResult.WON}
                activeBackground={`${colors.positive}2E`}
                activeColor={colors.primary}
                icon="checkmark"
                inactiveBackground={colors.surfaceRaised}
                inactiveColor={colors.textMuted}
                onPress={() => onResultChange(item.result === ItemResult.WON ? ItemResult.PENDING : ItemResult.WON)}
              />
              <ResultToggleButton
                accessibilityLabel="Marcar como perdeu"
                active={item.result === ItemResult.LOST}
                activeBackground={`${colors.negative}2E`}
                activeColor={colors.danger}
                icon="close"
                inactiveBackground={colors.surfaceRaised}
                inactiveColor={colors.textMuted}
                onPress={() => onResultChange(item.result === ItemResult.LOST ? ItemResult.PENDING : ItemResult.LOST)}
              />
              <ResultToggleButton
                accessibilityLabel="Marcar como cancelado"
                active={item.result === ItemResult.VOID}
                activeBackground={`${colors.info}2E`}
                activeColor={colors.info}
                icon="remove"
                inactiveBackground={colors.surfaceRaised}
                inactiveColor={colors.textMuted}
                onPress={() => onResultChange(item.result === ItemResult.VOID ? ItemResult.PENDING : ItemResult.VOID)}
              />
            </View>
          ) : (!onRemove && !onEdit) ? (
            <View accessibilityLabel={resultMeta.a11yLabel} style={[styles.resultIcon, { backgroundColor: resultMeta.background }]}>
              <Ionicons color={resultMeta.color} name={resultMeta.icon} size={18} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.metaBlock}>
          <MarketSelection market={item.market === item.selection ? 'Seleção' : item.market} selection={item.selection} />
          {item.needsReview && item.result === ItemResult.PENDING ? (
            <View
              accessibilityLabel="A liquidação automática não teve certeza: marca o resultado à mão"
              style={[styles.reviewPill, { backgroundColor: `${colors.warning}22`, borderColor: colors.warning }]}
            >
              <Ionicons color={colors.warning} name="alert-circle-outline" size={13} />
              <Text style={[styles.reviewPillText, { color: colors.warning }]}>A rever</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaBlockRight}>
          <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Odd</Text>
          <Text style={[styles.metaValue, { color: colors.gold }]}>{formatOdds(item.oddValue)}</Text>
          <ImpliedProbability oddValue={item.oddValue} result={item.result} />
        </View>
      </View>

      {onInsights ? (
        <>
          <View style={[styles.insightsDivider, { backgroundColor: colors.border }]} />
          <Pressable hitSlop={4} onPress={onInsights} style={styles.insightsRow}>
            <Ionicons color={colors.primary} name="stats-chart-outline" size={14} />
            <Text style={[styles.insightsLabel, { color: colors.primary }]}>Ver detalhes da seleção</Text>
            <Ionicons color={colors.primary} name="chevron-forward" size={14} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export const BoletinItem = React.memo(BoletinItemInner);

interface ResultToggleButtonProps {
  accessibilityLabel: string;
  active: boolean;
  activeBackground: string;
  activeColor: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  inactiveBackground: string;
  inactiveColor: string;
  onPress: () => void;
}

function ResultToggleButton({
  accessibilityLabel,
  active,
  activeBackground,
  activeColor,
  icon,
  inactiveBackground,
  inactiveColor,
  onPress,
}: ResultToggleButtonProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withSequence(
        withTiming(1.16, { duration: 80, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 14, stiffness: 300 }),
      );
      return;
    }
    scale.value = withSpring(1, { damping: 16, stiffness: 280 });
  }, [active, scale]);

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.resultBtnWrap, wrapperStyle]}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={6}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.9, { duration: 40 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 14, stiffness: 300 });
        }}
        style={[
          styles.resultBtn,
          {
            backgroundColor: active ? activeBackground : inactiveBackground,
            borderColor: active ? activeColor : 'transparent',
          },
        ]}
      >
        <Ionicons color={active ? activeColor : inactiveColor} name={icon} size={18} />
      </Pressable>
    </Animated.View>
  );
}

function getResultMeta(result: ItemResult, colors: ReturnType<typeof useTheme>['colors']) {
  switch (result) {
    case ItemResult.WON:
      return { icon: 'checkmark', color: colors.positive, background: `${colors.positive}1F`, a11yLabel: 'Certa' } as const;
    case ItemResult.LOST:
      return { icon: 'close', color: colors.negative, background: `${colors.negative}1F`, a11yLabel: 'Perdeu' } as const;
    case ItemResult.VOID:
      return { icon: 'remove', color: colors.info, background: `${colors.info}1F`, a11yLabel: 'Anulada' } as const;
    case ItemResult.PENDING:
    default:
      return { icon: 'time-outline', color: colors.warning, background: `${colors.warning}1F`, a11yLabel: 'Pendente' } as const;
  }
}

function ImpliedProbability({ oddValue, result }: { oddValue: string; result: ItemResult }) {
  const { colors } = useTheme();
  const odd = parseFloat(oddValue);
  if (!odd || odd < 1.01) return null;
  const pct = (1 / odd) * 100;

  // Color coding: high probability = green, medium = amber, low = red
  const probColor =
    pct >= 60 ? colors.primary :
    pct >= 35 ? colors.warning :
    colors.danger;

  // For settled items keep a neutral muted look
  const displayColor = result === ItemResult.PENDING ? probColor : colors.textMuted;

  return (
    <View style={probStyles.wrap}>
      <View style={[probStyles.bar, { backgroundColor: colors.border }]}>
        <View
          style={[
            probStyles.fill,
            {
              backgroundColor: displayColor,
              width: `${Math.min(pct, 100)}%` as unknown as number,
            },
          ]}
        />
      </View>
      <Text style={[probStyles.label, { color: displayColor }]}>
        {formatPercentage(pct, 0)} prob.
      </Text>
    </View>
  );
}

const probStyles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: 3, marginTop: 2 },
  bar: { borderRadius: 999, height: 3, overflow: 'hidden', width: 60 },
  fill: { borderRadius: 999, height: 3 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
});

const styles = StyleSheet.create({
  reviewPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reviewPillText: { fontSize: 11, fontWeight: '700' },
  card: {
    borderRadius: 18,
    borderWidth: 0,
    gap: 14,
    overflow: 'hidden',
    padding: 14,
  },
  resultStripe: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 0,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleWrap: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  teamRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    flexShrink: 1,
  },
  vsText: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Kickoff — dedicated row so it's always clearly visible ──────────────────
  kickoffRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 1,
  },
  kickoffText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  // ────────────────────────────────────────────────────────────────────────────
  competitionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  resultBtnWrap: {
    borderRadius: 999,
    shadowOffset: { width: 0, height: 3 },
  },
  editRemoveRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  editIconBtn: {
    padding: 2,
  },
  resultBtn: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    height: 36,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 36,
  },
  resultBtnHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaBlock: {
    flex: 1,
    gap: 4,
  },
  metaBlockRight: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 64,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  insightsDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -14,
  },
  insightsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingTop: 2,
  },
  insightsLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  topRightActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  teamsSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  scoreBlock: { borderRadius: 12, gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  scoreState: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  scoreStateText: { fontSize: 11, fontWeight: '700' },
  scoreRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  scoreName: { flex: 1, fontSize: 14 },
  scoreValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 18, textAlign: 'right' },
  liveDot: { borderRadius: 4, height: 7, width: 7 },
  flexShrink: { flexShrink: 1 },
});