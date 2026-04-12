import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { PublicBoletinPreview } from '@betintel/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/boletins/StatusBadge';
import { SocialAvatar } from '../../components/social/SocialAvatar';
import { useToast } from '../../components/ui/Toast';
import {
  getApiErrorMessage,
  useFriends,
  usePublicProfile,
  useSendFriendRequestMutation,
  useRemoveFriendMutation,
} from '../../services/socialService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatPercentage, formatRelativeTime } from '../../utils/formatters';

function MetricPill({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueColor: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[metricStyles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons color={colors.textSecondary} name={icon} size={16} />
      <Text style={[metricStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[metricStyles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  pill: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flex: 1, gap: 4, paddingHorizontal: 8, paddingVertical: 12 },
  label: { fontSize: 11, fontWeight: '600' },
  value: { fontSize: 18, fontWeight: '900' },
});

function BoletinPreviewCard({ item, onPress }: { item: PublicBoletinPreview; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[previewStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={previewStyles.topRow}>
        <Text numberOfLines={1} style={[previewStyles.name, { color: colors.textPrimary }]}>
          {item.name ?? 'Sem nome'}
        </Text>
        <StatusBadge status={item.status} />
      </View>
      <View style={previewStyles.detailRow}>
        <Text style={[previewStyles.detail, { color: colors.textSecondary }]}>
          {item.itemCount} {item.itemCount === 1 ? 'seleção' : 'seleções'}
        </Text>
        <Text style={[previewStyles.detail, { color: colors.textSecondary }]}>
          Odd: <Text style={{ color: colors.gold, fontWeight: '900' }}>{parseFloat(item.totalOdds).toFixed(2)}</Text>
        </Text>
        <Text style={[previewStyles.detail, { color: colors.textSecondary }]}>
          {formatCurrency(parseFloat(item.stake))}
        </Text>
      </View>
      <Text style={[previewStyles.time, { color: colors.textMuted }]}>{formatRelativeTime(item.createdAt)}</Text>
    </Pressable>
  );
}

const previewStyles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, gap: 8, padding: 14 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 14, fontWeight: '800', marginRight: 8 },
  detailRow: { flexDirection: 'row', gap: 16 },
  detail: { fontSize: 12, fontWeight: '600' },
  time: { fontSize: 11, fontWeight: '600' },
});

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  const profileQuery = usePublicProfile(username);
  const friendsQuery = useFriends();
  const sendRequestMutation = useSendFriendRequestMutation();
  const removeFriendMutation = useRemoveFriendMutation();

  const profile = profileQuery.data;
  const isFriend = friendsQuery.data?.some((f) => f.friend.username === username) ?? false;

  const avatarSize = Math.min(width * 0.24, 96);

  if (profileQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: true, headerTintColor: colors.textPrimary, headerStyle: { backgroundColor: colors.background } }} />
        <View style={[styles.loadingWrap, { paddingTop: insets.top + 24 }]}>
          <Skeleton height={96} width={96} style={{ borderRadius: 48 }} />
          <Skeleton height={24} width="50%" />
          <Skeleton height={16} width="30%" />
          <Skeleton height={80} width="100%" />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: true, headerTintColor: colors.textPrimary, headerStyle: { backgroundColor: colors.background } }} />
        <EmptyState icon="account-off-outline" title="Utilizador não encontrado" message="Este perfil pode não existir ou foi removido." />
      </View>
    );
  }

  const { user, stats, publicBoletins } = profile;
  const displayName = user.displayName ?? user.username;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: `@${user.username}`,
          headerShown: true,
          headerTintColor: colors.textPrimary,
          headerStyle: { backgroundColor: colors.background },
        }}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.spacing.xl,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: tokens.spacing.lg,
        }}
        refreshControl={<RefreshControl refreshing={profileQuery.isRefetching} onRefresh={() => void profileQuery.refetch()} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity ─────────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.duration(200).springify()} style={styles.identity}>
          <SocialAvatar avatarUrl={user.avatarUrl} name={displayName} size={avatarSize} />
          <Text style={[styles.displayName, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>@{user.username}</Text>
          {user.bio ? <Text style={[styles.bio, { color: colors.textSecondary }]}>{user.bio}</Text> : null}
          <Text style={[styles.memberSince, { color: colors.textMuted }]}>
            <MaterialCommunityIcons name="calendar-outline" size={12} color={colors.textMuted} />{' '}
            Membro desde {new Date(user.createdAt).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}
          </Text>
        </Animated.View>

        {/* ── Action ───────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(40).duration(200).springify()} style={styles.actionRow}>
          {isFriend ? (
            <Button
              loading={removeFriendMutation.isPending}
              onPress={async () => {
                try {
                  await removeFriendMutation.mutateAsync(user.id);
                  showToast('Amigo removido.', 'success');
                } catch (error) {
                  showToast(getApiErrorMessage(error), 'error');
                }
              }}
              title="Remover amigo"
              variant="secondary"
              style={{ flex: 1 }}
            />
          ) : (
            <Button
              loading={sendRequestMutation.isPending}
              onPress={async () => {
                try {
                  await sendRequestMutation.mutateAsync(user.id);
                  showToast('Pedido enviado!', 'success');
                } catch (error) {
                  showToast(getApiErrorMessage(error), 'error');
                }
              }}
              title="Adicionar amigo"
              style={{ flex: 1 }}
            />
          )}
        </Animated.View>

        {/* ── Stats ────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(200).springify()}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            <MaterialCommunityIcons name="chart-box-outline" size={18} color={colors.info} />{' '}Estatísticas
          </Text>
          <View style={styles.statsRow}>
            <MetricPill
              icon="trending-up"
              label="ROI"
              value={formatPercentage(stats.roi)}
              valueColor={stats.roi >= 0 ? colors.primary : colors.danger}
            />
            <MetricPill
              icon="trophy-outline"
              label="Win Rate"
              value={formatPercentage(stats.winRate)}
              valueColor={colors.gold}
            />
            <MetricPill
              icon="receipt-outline"
              label="Boletins"
              value={String(stats.publicBoletins)}
              valueColor={colors.textPrimary}
            />
          </View>
          <View style={styles.statsRow}>
            <MetricPill
              icon="cash-outline"
              label="Apostado"
              value={formatCurrency(stats.totalStaked)}
              valueColor={colors.textPrimary}
            />
            <MetricPill
              icon="wallet-outline"
              label="Lucro"
              value={formatCurrency(stats.profitLoss)}
              valueColor={stats.profitLoss >= 0 ? colors.primary : colors.danger}
            />
          </View>
        </Animated.View>

        {/* ── Public Boletins ──────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(120).duration(200).springify()}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            <MaterialCommunityIcons name="file-document-outline" size={18} color={colors.primary} />{' '}Boletins públicos
          </Text>
          {publicBoletins.length > 0 ? (
            <View style={styles.boletinList}>
              {publicBoletins.map((b, i) => (
                <Animated.View key={b.id} entering={FadeInDown.delay(140 + i * 25).duration(180).springify()}>
                  <BoletinPreviewCard item={b} onPress={() => router.push(`/boletins/${b.id}`)} />
                </Animated.View>
              ))}
            </View>
          ) : (
            <EmptyState icon="file-hidden" title="Sem boletins públicos" message="Este utilizador ainda não publicou nenhum boletin." />
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingWrap: { alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  identity: { alignItems: 'center', gap: 6, marginBottom: 20 },
  displayName: { fontSize: 22, fontWeight: '900', marginTop: 8 },
  username: { fontSize: 14, fontWeight: '700' },
  bio: { fontSize: 13, lineHeight: 20, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  memberSince: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 14, marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  boletinList: { gap: 12 },
});
