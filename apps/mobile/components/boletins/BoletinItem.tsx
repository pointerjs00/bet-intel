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
  };
  onRemove?: () => void;
  onEdit?: () => void;
  onResultChange?: (result: ItemResult) => void;
}

/** Renders one selection row in builder and detail contexts. */
export function BoletinItem({ item, onRemove, onEdit, onResultChange }: BoletinItemProps) {
  const { colors } = useTheme();
  const resultMeta = getResultMeta(item.result, colors);

  const a11yLabel = `${item.selection}, odds ${item.oddValue}, ${item.homeTeam} vs ${item.awayTeam}, ${item.competition}`;

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
              size={15}
              variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
            />
            <Text numberOfLines={1} style={[styles.teamName, { color: colors.textPrimary }]}>
              {item.homeTeam}
            </Text>
            <Text style={[styles.vsText, { color: colors.textSecondary }]}>vs</Text>
            <Text numberOfLines={1} style={[styles.teamNameAway, { color: colors.textPrimary }]}>
              {item.awayTeam}
            </Text>
            <TeamBadge
              imageUrl={item.awayTeamImageUrl}
              name={item.awayTeam}
              size={15}
              variant={item.sport === Sport.TENNIS ? 'player' : 'team'}
            />
          </View>
          <View style={styles.competitionRow}>
            <CompetitionBadge name={item.competition} size={14} />
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {item.competition}
            </Text>
          </View>
        </View>

        {onRemove ? (
          <View style={styles.editRemoveRow}>
            {onEdit ? (
              <Pressable hitSlop={10} onPress={onEdit} style={styles.editIconBtn}>
                <Ionicons color={colors.info} name="pencil-outline" size={17} />
              </Pressable>
            ) : null}
            <Pressable hitSlop={10} onPress={onRemove}>
              <Ionicons color={colors.danger} name="trash-outline" size={18} />
            </Pressable>
          </View>
        ) : onResultChange ? (
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
        ) : (
          <View accessibilityLabel={resultMeta.a11yLabel} style={[styles.resultIcon, { backgroundColor: resultMeta.background }]}>
            <Ionicons color={resultMeta.color} name={resultMeta.icon} size={18} />
          </View>
        )}
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
    </View>
  );
}

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
  const glow = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    if (active) {
      glow.value = withTiming(1, { duration: 180 });
      scale.value = withSequence(
        withTiming(1.16, { duration: 120, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 12, stiffness: 240 }),
      );
      return;
    }

    glow.value = withTiming(0, { duration: 160 });
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [active, glow, scale]);

  const wrapperStyle = useAnimatedStyle(() => ({
    elevation: 1 + glow.value * 4,
    shadowOpacity: 0.12 + glow.value * 0.16,
    shadowRadius: 4 + glow.value * 6,
    transform: [{ scale: scale.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.75,
    transform: [{ scale: 0.88 + glow.value * 0.14 }],
  }));

  return (
    <Animated.View style={[styles.resultBtnWrap, { shadowColor: activeColor }, wrapperStyle]}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={6}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.93, { duration: 70 });
        }}
        onPressOut={() => {
          scale.value = withSpring(active ? 1.04 : 1, { damping: 13, stiffness: 220 });
        }}
        style={[
          styles.resultBtn,
          {
            backgroundColor: active ? activeBackground : inactiveBackground,
            borderColor: active ? activeColor : 'transparent',
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.resultBtnHalo, { backgroundColor: activeBackground }, haloStyle]}
        />
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
  },
  teamName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 0,
  },
  vsText: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
  },
  teamNameAway: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 0,
  },
  competitionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
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
});