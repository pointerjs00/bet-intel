// Início — dashboard (redesign D5, PLANO_MELHORIAS.md §6): year profit, key metrics,
// bets in play with their live state (#56) and the most recent boletins.
import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BoletinStatus, type BoletinDetail } from '@betintel/shared';
import { AppText } from '../../components/ui/AppText';
import { Avatar } from '../../components/ui/Avatar';
import { ListCard, ListRow, useCardElevation } from '../../components/ui/ListCard';
import { MetricTile, SectionHeader } from '../../components/ui/SectionHeader';
import { StatusPill } from '../../components/ui/StatusPill';
import { Appear, LiveDot } from '../../components/ui/Appear';
import { HeroCard, HeroTile } from '../../components/ui/HeroCard';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { MarketSelection } from '../../components/boletins/MarketSelection';
import { Skeleton } from '../../components/ui/Skeleton';
import { useBoletins, useLiveItems, useReviewItems, type LiveItem } from '../../services/boletinService';
import { useUnreadNotificationsCount } from '../../services/socialService';
import { useAuthStore } from '../../stores/authStore';
import { useLimitsStore } from '../../stores/limitsStore';
import { computeLimitStatus } from '../../utils/bettingLimits';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { hapticLight } from '../../utils/haptics';

const WEEKS = 8;

function boletinDate(b: BoletinDetail): Date {
  return new Date(b.betDate ?? b.createdAt);
}

function profitOf(b: BoletinDetail): number {
  const stake = b.isFreebet ? 0 : Number(b.stake);
  return Number(b.actualReturn ?? 0) - stake;
}

function titleOf(b: BoletinDetail): string {
  if (b.name) return b.name;
  if (b.items.length === 1) return `${b.items[0]!.homeTeam} vs ${b.items[0]!.awayTeam}`;
  return `Múltipla · ${b.items.length} seleções`;
}

function subtitleOf(b: BoletinDetail): string {
  if (b.items.length === 1) return `${b.items[0]!.selection} · @${formatOdds(b.totalOdds)}`;
  const teams = b.items.slice(0, 2).map((i) => i.homeTeam).join(', ');
  return `${teams}${b.items.length > 2 ? '…' : ''} · @${formatOdds(b.totalOdds)}`;
}

export default function HomeDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const user = useAuthStore((s) => s.user);
  const boletinsQuery = useBoletins();
  const liveQuery = useLiveItems();
  const reviewCount = useReviewItems().data?.length ?? 0;
  const unread = useUnreadNotificationsCount().data ?? 0;

  const boletins = useMemo(() => boletinsQuery.data ?? [], [boletinsQuery.data]);

  const year = new Date().getFullYear();
  const summary = useMemo(() => {
    const thisYear = boletins.filter((b) => boletinDate(b).getFullYear() === year);
    const settled = thisYear.filter((b) => b.status !== BoletinStatus.PENDING);
    const staked = settled.reduce((acc, b) => acc + (b.isFreebet ? 0 : Number(b.stake)), 0);
    const profit = settled.reduce((acc, b) => acc + profitOf(b), 0);
    const won = settled.filter((b) => b.status === BoletinStatus.WON || b.status === BoletinStatus.PARTIAL || b.status === BoletinStatus.CASHOUT).length;
    const lost = settled.filter((b) => b.status === BoletinStatus.LOST).length;

    // Profit per week for the last WEEKS weeks (oldest first).
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const weekly = Array.from({ length: WEEKS }, (_, i) => {
      const end = now - (WEEKS - 1 - i) * weekMs;
      const start = end - weekMs;
      return boletins
        .filter((b) => b.status !== BoletinStatus.PENDING)
        .filter((b) => { const t = boletinDate(b).getTime(); return t > start && t <= end; })
        .reduce((acc, b) => acc + profitOf(b), 0);
    });

    return {
      staked,
      profit,
      roi: staked > 0 ? (profit / staked) * 100 : 0,
      winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
      pending: boletins.filter((b) => b.status === BoletinStatus.PENDING).length,
      weekly,
      settledCount: settled.length,
    };
  }, [boletins, year]);

  // Personal limits (plan #34): warn from 80% of a limit, or when a recent bet looks like chasing losses.
  const { weeklyLossLimit, monthlyStakeLimit, chaseAlert } = useLimitsStore();
  const limitWarning = useMemo(() => {
    const s = computeLimitStatus(boletins, { weeklyLossLimit, monthlyStakeLimit });
    if (s.weekLossRatio !== null && s.weekLossRatio >= 0.8) {
      return { severe: s.weekLossRatio >= 1, text: s.weekLossRatio >= 1 ? `Limite semanal de perdas atingido (−${formatCurrency(s.weekLoss)})` : `Perto do limite semanal: −${formatCurrency(s.weekLoss)} de ${formatCurrency(weeklyLossLimit ?? 0)}` };
    }
    if (s.monthStakeRatio !== null && s.monthStakeRatio >= 0.8) {
      return { severe: s.monthStakeRatio >= 1, text: s.monthStakeRatio >= 1 ? `Limite mensal apostado atingido (${formatCurrency(s.monthStaked)})` : `Já apostaste ${formatCurrency(s.monthStaked)} de ${formatCurrency(monthlyStakeLimit ?? 0)} este mês` };
    }
    if (chaseAlert && s.chaseCount > 0) {
      return { severe: false, text: `${s.chaseCount === 1 ? 'Uma aposta' : `${s.chaseCount} apostas`} acima do habitual logo a seguir a uma perda` };
    }
    return null;
  }, [boletins, weeklyLossLimit, monthlyStakeLimit, chaseAlert]);

  const recent = useMemo(
    () => [...boletins].sort((a, b) => boletinDate(b).getTime() - boletinDate(a).getTime()).slice(0, 5),
    [boletins],
  );

  const live = liveQuery.data ?? [];
  const firstName = (user?.displayName ?? user?.username ?? '').split(' ')[0];
  const maxWeekly = Math.max(1, ...summary.weekly.map((v) => Math.abs(v)));
  const profitTone = summary.profit >= 0 ? 'positive' : 'negative';
  const today = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}
      refreshControl={
        <RefreshControl
          onRefresh={() => { hapticLight(); void boletinsQuery.refetch(); void liveQuery.refetch(); }}
          refreshing={boletinsQuery.isRefetching}
          tintColor={colors.primary}
        />
      }
      style={{ backgroundColor: colors.background }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText style={styles.capitalize} variant="label">{today}</AppText>
          <AppText variant="title">{firstName ? `Olá, ${firstName}` : 'Olá'}</AppText>
        </View>
        <Pressable
          accessibilityLabel={unread > 0 ? `Notificações, ${unread} por ler` : 'Notificações'}
          accessibilityRole="button"
          onPress={() => router.push('/notifications')}
          style={[styles.iconButton, { backgroundColor: colors.surface }]}
        >
          <Ionicons color={colors.textPrimary} name="notifications-outline" size={20} />
          {unread > 0 ? <View style={[styles.dot, { backgroundColor: colors.danger }]} /> : null}
        </Pressable>
        <Pressable accessibilityLabel="Perfil" accessibilityRole="button" onPress={() => router.push('/(tabs)/profile')}>
          <Avatar name={user?.displayName ?? user?.username} size="md" uri={user?.avatarUrl} />
        </Pressable>
      </View>

      {/* Hero: profit this year */}
      <Appear index={0}>
      <HeroCard accessibilityHint="Abre a análise" onPress={() => router.push('/(tabs)/stats')}>
        <View style={styles.rowBetween}>
          <AppText variant="label">Lucro · {year}</AppText>
          {summary.settledCount > 0 ? (
            <View style={[styles.roiPill, { backgroundColor: summary.roi >= 0 ? 'rgba(61,255,162,0.16)' : 'rgba(255,107,122,0.18)' }]}>
              <AppText tone={profitTone} variant="label">ROI {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(1).replace('.', ',')}%</AppText>
            </View>
          ) : null}
        </View>
        {boletinsQuery.isLoading ? (
          <Skeleton height={42} width="60%" />
        ) : (
          <AppText tone={profitTone} variant="numberLarge">
            {summary.profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(summary.profit))}
          </AppText>
        )}
        <View accessibilityLabel={`Lucro nas últimas ${WEEKS} semanas`} style={styles.bars}>
          {summary.weekly.map((v, i) => (
            <View key={i} style={styles.barSlot}>
              <View
                style={{
                  backgroundColor: v >= 0 ? colors.heroPositive : colors.heroNegative,
                  borderRadius: 4,
                  height: `${Math.max(6, (Math.abs(v) / maxWeekly) * 100)}%`,
                  opacity: v === 0 ? 0.25 : 1,
                }}
              />
            </View>
          ))}
        </View>
        <AppText variant="caption">Últimas {WEEKS} semanas</AppText>
        <View style={styles.metrics}>
          <HeroTile><MetricTile label="Apostado" value={formatCurrency(summary.staked)} /></HeroTile>
          <HeroTile><MetricTile label="Vitórias" value={summary.winRate === null ? '—' : `${summary.winRate}%`} /></HeroTile>
          <HeroTile><MetricTile label="Pendentes" tone={summary.pending > 0 ? 'pending' : undefined} value={String(summary.pending)} /></HeroTile>
        </View>
      </HeroCard>
      </Appear>

      {limitWarning ? (
        <Pressable
          accessibilityHint="Abre os limites e alertas"
          accessibilityRole="button"
          onPress={() => router.push('/limites')}
          style={[styles.banner, elevation, { backgroundColor: colors.surface }]}
        >
          <Ionicons color={limitWarning.severe ? colors.danger : colors.warning} name="shield-outline" size={20} />
          <AppText style={styles.flex} variant="bodyStrong">{limitWarning.text}</AppText>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
        </Pressable>
      ) : null}

      {/* In play */}
      {live.length > 0 ? (
        <>
          <SectionHeader actionLabel="Ver jogos" onAction={() => router.push('/(tabs)/fixtures')} title="A decorrer" />
          <Appear index={1}>
            <ListCard>
              {live.map((item) => <LiveRow item={item} key={item.itemId} onPress={() => router.push(`/boletins/${item.boletinId}`)} />)}
            </ListCard>
          </Appear>
        </>
      ) : null}

      {/* Auto-settlement could not decide (plan #36) */}
      {reviewCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/boletins/rever')}
          style={[styles.banner, elevation, { backgroundColor: colors.surface }]}
        >
          <Ionicons color={colors.warning} name="alert-circle-outline" size={20} />
          <AppText style={styles.flex} variant="bodyStrong">{reviewCount} seleç{reviewCount === 1 ? 'ão' : 'ões'} a rever</AppText>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
        </Pressable>
      ) : null}

      {/* Pending to resolve */}
      {summary.pending > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/boletins/batch-resolve')}
          style={[styles.banner, elevation, { backgroundColor: colors.surface }]}
        >
          <Ionicons color={colors.warning} name="checkmark-done" size={20} />
          <AppText style={styles.flex} variant="bodyStrong">Resolver {summary.pending} pendentes</AppText>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
        </Pressable>
      ) : null}

      {/* Recent */}
      <SectionHeader actionLabel="Todos" onAction={() => router.push('/(tabs)/boletins')} title="Recentes" />
      {boletinsQuery.isLoading ? (
        <ListCard>
          {[0, 1, 2].map((i) => <ListRow key={i}><Skeleton height={36} width="100%" /></ListRow>)}
        </ListCard>
      ) : recent.length === 0 ? (
        <ListCard>
          <ListRow onPress={() => router.push('/boletins/novo')}>
            <Ionicons color={colors.primary} name="add-circle-outline" size={22} />
            <AppText style={styles.flex} variant="bodyStrong">Regista o teu primeiro boletim</AppText>
          </ListRow>
        </ListCard>
      ) : (
        <Appear index={2}>
        <ListCard>
          {recent.map((b) => {
            const pending = b.status === BoletinStatus.PENDING;
            const p = profitOf(b);
            const first = b.items[0];
            return (
              <ListRow accessibilityLabel={titleOf(b)} key={b.id} onPress={() => router.push(`/boletins/${b.id}`)}>
                {first ? (
                  b.items.length === 1 ? (
                    <TeamBadge name={first.homeTeam} size={34} variant={first.sport === 'TENNIS' ? 'player' : 'auto'} />
                  ) : (
                    <View style={styles.stack}>
                      <TeamBadge name={first.homeTeam} size={26} variant={first.sport === 'TENNIS' ? 'player' : 'auto'} />
                      <View style={[styles.stackCount, { backgroundColor: colors.accent }]}>
                        <AppText style={styles.stackCountText}>{b.items.length}</AppText>
                      </View>
                    </View>
                  )
                ) : null}
                <View style={styles.flex}>
                  <AppText numberOfLines={1} variant="bodyStrong">{titleOf(b)}</AppText>
                  {b.items.length === 1 && b.items[0] ? (
                    <MarketSelection market={b.items[0].market} selection={b.items[0].selection} trailing={`@${formatOdds(b.totalOdds)}`} />
                  ) : (
                    <AppText numberOfLines={1} variant="caption">{subtitleOf(b)}</AppText>
                  )}
                </View>
                <View style={styles.right}>
                  {pending ? (
                    <AppText variant="number">{formatCurrency(b.stake)}</AppText>
                  ) : (
                    <AppText tone={p >= 0 ? 'positive' : 'negative'} variant="number">
                      {p >= 0 ? '+' : '−'}{formatCurrency(Math.abs(p))}
                    </AppText>
                  )}
                  <StatusPill compact status={b.status} />
                </View>
              </ListRow>
            );
          })}
        </ListCard>
        </Appear>
      )}
    </ScrollView>
  );
}

function LiveRow({ item, onPress }: { item: LiveItem; onPress: () => void }) {
  const { colors } = useTheme();
  const inPlay = item.status === 'LIVE' || item.status === 'HALFTIME';
  const verdictTone = item.verdict === 'a ganhar' || item.verdict === 'ganha' ? 'positive' : item.verdict ? 'negative' : 'secondary';
  return (
    <ListRow accessibilityLabel={`${item.home} ${item.score ?? ''} ${item.away}, ${item.selection}${item.verdict ? `, ${item.verdict}` : ''}`} onPress={onPress}>
      <View style={[styles.flex, styles.liveBody]}>
        <View style={styles.liveTop}>
          {inPlay ? <LiveDot color={colors.live} /> : null}
          <AppText tone={inPlay ? undefined : 'secondary'} variant="label">{inPlay ? item.detail || 'Ao vivo' : item.status === 'FINISHED' ? 'Terminado' : item.detail}</AppText>
        </View>
        <View style={styles.team}>
          <TeamBadge name={item.home} size={22} variant={item.sport === 'TENNIS' ? 'player' : 'auto'} />
          <AppText numberOfLines={1} style={styles.flex} variant="bodyStrong">{item.home}</AppText>
        </View>
        <View style={styles.team}>
          <TeamBadge name={item.away} size={22} variant={item.sport === 'TENNIS' ? 'player' : 'auto'} />
          <AppText numberOfLines={1} style={styles.flex} variant="bodyStrong">{item.away}</AppText>
        </View>
        <MarketSelection market={item.market} selection={item.selection} />
      </View>
      <AppText style={styles.liveScore} variant="number">{item.score ?? '–'}</AppText>
      {item.verdict ? (
        <View style={[styles.verdict, { backgroundColor: `${verdictTone === 'positive' ? colors.primary : colors.danger}22` }]}>
          <AppText tone={verdictTone} variant="label">{item.verdict}</AppText>
        </View>
      ) : null}
    </ListRow>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 20 },
  flex: { flex: 1 },
  capitalize: { textTransform: 'capitalize' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 4 },
  iconButton: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  dot: { borderRadius: 4, height: 8, position: 'absolute', right: 11, top: 10, width: 8 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  roiPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, height: 56, marginTop: 6 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 8 },
  stack: { height: 34, width: 34 },
  stackCount: { alignItems: 'center', borderRadius: 9, bottom: 0, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 4, position: 'absolute', right: 0 },
  stackCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', lineHeight: 12 },
  liveBody: { gap: 4 },
  team: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  liveScore: { fontSize: 20, marginLeft: 8 },
  banner: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  right: { alignItems: 'flex-end', gap: 4 },
  liveTop: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  liveDot: { borderRadius: 4, height: 8, width: 8 },
  verdict: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
