// Início — dashboard (redesign D5, PLANO_MELHORIAS.md §6): year profit, key metrics,
// bets in play with their live state (#56) and the most recent boletins.
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BoletinStatus, type BoletinDetail } from '@betintel/shared';
import { AppText } from '../../components/ui/AppText';
import { Avatar } from '../../components/ui/Avatar';
import { ListCard, ListRow, useCardElevation } from '../../components/ui/ListCard';
import { MetricTile, SectionHeader } from '../../components/ui/SectionHeader';
import { StatusPill } from '../../components/ui/StatusPill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useBoletins, useLiveItems, useReviewItems, type LiveItem } from '../../services/boletinService';
import { useUnreadNotificationsCount } from '../../services/socialService';
import { useAuthStore } from '../../stores/authStore';
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
      <Pressable
        accessibilityHint="Abre a análise"
        accessibilityRole="button"
        onPress={() => router.push('/(tabs)/stats')}
        style={[styles.hero, elevation, { backgroundColor: colors.surface }]}
      >
        <View style={styles.rowBetween}>
          <AppText variant="label">Lucro · {year}</AppText>
          {summary.settledCount > 0 ? (
            <AppText tone={profitTone} variant="label">ROI {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(1).replace('.', ',')}%</AppText>
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
                  backgroundColor: v >= 0 ? colors.primary : colors.danger,
                  borderRadius: 4,
                  height: `${Math.max(6, (Math.abs(v) / maxWeekly) * 100)}%`,
                  opacity: v === 0 ? 0.25 : 1,
                }}
              />
            </View>
          ))}
        </View>
        <AppText variant="caption">Últimas {WEEKS} semanas</AppText>
        <View style={[styles.metrics, { borderTopColor: colors.border }]}>
          <MetricTile label="Apostado" value={formatCurrency(summary.staked)} />
          <MetricTile label="Taxa de vitória" value={summary.winRate === null ? '—' : `${summary.winRate}%`} />
          <MetricTile label="Pendentes" tone={summary.pending > 0 ? 'pending' : undefined} value={String(summary.pending)} />
        </View>
      </Pressable>

      {/* In play */}
      {live.length > 0 ? (
        <>
          <SectionHeader actionLabel="Ver jogos" onAction={() => router.push('/(tabs)/fixtures')} title="A decorrer" />
          <ListCard>
            {live.map((item) => <LiveRow item={item} key={item.itemId} onPress={() => router.push(`/boletins/${item.boletinId}`)} />)}
          </ListCard>
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
        <ListCard>
          {recent.map((b) => {
            const pending = b.status === BoletinStatus.PENDING;
            const p = profitOf(b);
            return (
              <ListRow accessibilityLabel={titleOf(b)} key={b.id} onPress={() => router.push(`/boletins/${b.id}`)}>
                <View style={styles.flex}>
                  <AppText numberOfLines={1} variant="bodyStrong">{titleOf(b)}</AppText>
                  <AppText numberOfLines={1} variant="caption">{subtitleOf(b)}</AppText>
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
      <View style={styles.flex}>
        <View style={styles.liveTop}>
          {inPlay ? <View style={[styles.liveDot, { backgroundColor: colors.live }]} /> : null}
          <AppText tone={inPlay ? undefined : 'secondary'} variant="label">{inPlay ? item.detail || 'Ao vivo' : item.status === 'FINISHED' ? 'Terminado' : item.detail}</AppText>
        </View>
        <AppText numberOfLines={1} variant="bodyStrong">
          {item.home} <AppText variant="number">{item.score ?? '–'}</AppText> {item.away}
        </AppText>
        <AppText numberOfLines={1} variant="caption">{item.selection}</AppText>
      </View>
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
  hero: { borderRadius: 20, gap: 8, padding: 20 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, height: 56, marginTop: 6 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  metrics: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, marginTop: 8, paddingTop: 14 },
  banner: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  right: { alignItems: 'flex-end', gap: 4 },
  liveTop: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  liveDot: { borderRadius: 4, height: 8, width: 8 },
  verdict: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
