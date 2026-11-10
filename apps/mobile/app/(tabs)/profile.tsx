// Perfil (redesign D10): identity, this month's metrics with an explicit period, and one list
// of links. Editing name/bio moved to its own screen (/perfil-editar); notifications have their
// own screen behind the bell on Início.
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useDeleteAvatarMutation, useUploadAvatarMutation } from '../../services/accountService';
import { AppText } from '../../components/ui/AppText';
import { AvatarPicker } from '../../components/ui/AvatarPicker';
import { ListCard, ListRow, useCardElevation } from '../../components/ui/ListCard';
import { MetricTile } from '../../components/ui/SectionHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { getApiErrorMessage, useFriendRequests, useMeProfile, useNotifications } from '../../services/socialService';
import { useStatsSummary } from '../../services/statsService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const { showToast } = useToast();
  const router = useRouter();

  const profileQuery = useMeProfile();
  const summary = useStatsSummary('month').data;
  const unread = useNotifications(1, 1).data?.meta.unreadCount ?? 0;
  const pendingFriendRequests = useFriendRequests().data?.received.length ?? 0;
  const uploadAvatar = useUploadAvatarMutation();
  const deleteAvatar = useDeleteAvatarMutation();
  const profile = profileQuery.data;

  const handleAvatarPick = async (result: { base64: string; mimeType: string }) => {
    try {
      await uploadAvatar.mutateAsync(result);
      showToast('Foto de perfil atualizada.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  };

  const handleAvatarRemove = async () => {
    try {
      await deleteAvatar.mutateAsync();
      showToast('Foto de perfil removida.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  };

  const roi = summary?.roi ?? 0;
  const profit = summary?.profitLoss ?? 0;
  const monthName = new Date().toLocaleDateString('pt-PT', { month: 'long' });

  const links: Array<{ icon: IconName; label: string; hint?: string; badge?: number; onPress: () => void }> = [
    { icon: 'create-outline', label: 'Editar perfil', hint: 'Nome e bio', onPress: () => router.push('/perfil-editar') },
    { icon: 'notifications-outline', label: 'Notificações', badge: unread, onPress: () => router.push('/notifications') },
    { icon: 'people-outline', label: 'Amigos', badge: pendingFriendRequests, onPress: () => router.push('/(tabs)/friends') },
    { icon: 'shield-checkmark-outline', label: 'Limites e alertas', hint: 'Perda semanal, total mensal', onPress: () => router.push('/limites') },
    { icon: 'settings-outline', label: 'Definições', hint: 'Tema, conta, importação', onPress: () => router.push('/settings') },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Perfil' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="title">Perfil</AppText>

        {profileQuery.isLoading || !profile ? (
          <View style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
            <Skeleton height={72} width={72} />
            <Skeleton height={20} width="60%" />
            <Skeleton height={14} width="40%" />
          </View>
        ) : (
          <View style={[styles.card, styles.identity, elevation, { backgroundColor: colors.surface }]}>
            <AvatarPicker
              currentUri={profile.avatarUrl}
              name={profile.displayName ?? profile.username}
              onPick={handleAvatarPick}
              onRemove={profile.avatarUrl ? handleAvatarRemove : undefined}
              uploading={uploadAvatar.isPending || deleteAvatar.isPending}
            />
            <View style={styles.identityText}>
              <AppText numberOfLines={1} variant="heading">{profile.displayName ?? profile.username}</AppText>
              <AppText numberOfLines={1} variant="caption">@{profile.username}</AppText>
              {profile.bio ? <AppText numberOfLines={3} variant="caption">{profile.bio}</AppText> : null}
            </View>
          </View>
        )}

        {/* Metrics with an explicit period (§6.4: "ROI MÊS" did not say which month) */}
        <View style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
          <AppText style={styles.capitalize} variant="label">Este mês · {monthName}</AppText>
          <View style={styles.metrics}>
            <MetricTile label="Lucro" tone={profit > 0 ? 'positive' : profit < 0 ? 'negative' : undefined} value={`${profit >= 0 ? '+' : '−'}${formatCurrency(Math.abs(profit))}`} />
            <MetricTile label="ROI" tone={roi > 0 ? 'positive' : roi < 0 ? 'negative' : undefined} value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1).replace('.', ',')}%`} />
            <MetricTile label="Apostado" value={formatCurrency(summary?.totalStaked ?? 0)} />
          </View>
        </View>

        <ListCard>
          {links.map((l) => (
            <ListRow accessibilityLabel={l.badge ? `${l.label}, ${l.badge}` : l.label} key={l.label} onPress={l.onPress}>
              <Ionicons color={colors.textSecondary} name={l.icon} size={20} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{l.label}</AppText>
                {l.hint ? <AppText variant="caption">{l.hint}</AppText> : null}
              </View>
              {l.badge ? (
                <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                  <AppText style={styles.badgeText} variant="label">{l.badge > 99 ? '99+' : l.badge}</AppText>
                </View>
              ) : null}
              <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
            </ListRow>
          ))}
        </ListCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 20 },
  card: { borderRadius: 20, gap: 10, padding: 20 },
  identity: { alignItems: 'center', gap: 12 },
  identityText: { alignItems: 'center', gap: 2 },
  capitalize: { textTransform: 'capitalize' },
  metrics: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  badge: { alignItems: 'center', borderRadius: 10, height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 6 },
  badgeText: { color: '#FFFFFF', fontSize: 11 },
});
