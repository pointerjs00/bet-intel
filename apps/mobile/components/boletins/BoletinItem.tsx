import React, { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { useTheme } from '../../theme/useTheme';
import { formatOdds } from '../../utils/formatters';

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
  };
  onRemove?: () => void;
  onEdit?: () => void;
  onResultChange?: (result: ItemResult) => void;
  onInsights?: () => void;
}

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
function BoletinItemInner({ item, onRemove, onEdit, onResultChange, onInsights }: BoletinItemProps) {
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
          backgroundColor: `${resultMeta.color}0D`,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Result accent stripe */}
      <View
        style={[
          styles.resultStripe,
          { backgroundColor: resultMeta.color },
        ]}
      />
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <View style={styles.teamRow}>
            <TeamBadge
              imageUrl={item.homeTeamImageUrl}
              name={item.homeTeam}
              size={28}
              variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
            />
            <Text style={[styles.vsText, { color: colors.textSecondary }]}>vs</Text>
            <TeamBadge
              imageUrl={item.awayTeamImageUrl}
              name={item.awayTeam}
              size={28}
              variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
            />
            {onEdit ? (
              <Pressable hitSlop={10} onPress={onEdit} style={styles.editIconBtn}>
                <Ionicons color={colors.info} name="create-outline" size={17} />
              </Pressable>
            ) : null}
          </View>

          <Text numberOfLines={1} style={[styles.teamsSubtitle, { color: colors.textPrimary }]}>
            {item.homeTeam} vs {item.awayTeam}
          </Text>

          {/* ── Kickoff date/time — own dedicated row ───────────────── */}
          {item.kickoffAt ? (
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
                activeBackground="rgba(0,200,81,0.18)"
                activeColor={colors.primary}
                icon="checkmark"
                inactiveBackground={colors.surfaceRaised}
                inactiveColor={colors.textMuted}
                onPress={() => onResultChange(item.result === ItemResult.WON ? ItemResult.PENDING : ItemResult.WON)}
              />
              <ResultToggleButton
                accessibilityLabel="Marcar como perdeu"
                active={item.result === ItemResult.LOST}
                activeBackground="rgba(255,59,48,0.18)"
                activeColor={colors.danger}
                icon="close"
                inactiveBackground={colors.surfaceRaised}
                inactiveColor={colors.textMuted}
                onPress={() => onResultChange(item.result === ItemResult.LOST ? ItemResult.PENDING : ItemResult.LOST)}
              />
              <ResultToggleButton
                accessibilityLabel="Marcar como cancelado"
                active={item.result === ItemResult.VOID}
                activeBackground="rgba(0,122,255,0.18)"
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
          <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Mercado</Text>
          <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
            {item.market === item.selection
              ? item.market
              : `${item.market} • ${item.selection}`}
          </Text>
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
      return { icon: 'checkmark', color: colors.primary, background: 'rgba(0, 200, 81, 0.12)', a11yLabel: 'Ganhou' } as const;
    case ItemResult.LOST:
      return { icon: 'close', color: colors.danger, background: 'rgba(255, 59, 48, 0.12)', a11yLabel: 'Perdeu' } as const;
    case ItemResult.VOID:
      return { icon: 'remove', color: colors.info, background: 'rgba(0, 122, 255, 0.12)', a11yLabel: 'Cancelado' } as const;
    case ItemResult.PENDING:
    default:
      return { icon: 'time-outline', color: colors.warning, background: 'rgba(255, 149, 0, 0.12)', a11yLabel: 'Pendente' } as const;
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
        {pct.toFixed(0)}% prob.
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
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 14,
  },
  resultStripe: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 4,
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
    textTransform: 'uppercase',
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
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
});