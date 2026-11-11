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
import { Appear } from '../../components/ui/Appear';
import { HeroCard, HeroTile } from '../../components/ui/HeroCard';
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

  type Link = { icon: IconName; color: string; label: string; hint?: string; badge?: number; onPress: () => void };
  // Grouped by intent: people first (things that need attention), then account settings.
  const groups: Array<{ title: string; links: Link[] }> = [
    {
      title: 'Social',
      links: [
        { icon: 'people', color: colors.accentText, label: 'Amigos', hint: 'Atividade e pedidos', badge: pendingFriendRequests, onPress: () => router.push('/(tabs)/friends') },
        { icon: 'notifications', color: colors.accentAlt, label: 'Notificações', badge: unread, onPress: () => router.push('/notifications') },
      ],
    },
    {
      title: 'Conta',
      links: [
        { icon: 'create', color: colors.primary, label: 'Editar perfil', hint: 'Nome e bio', onPress: () => router.push('/perfil-editar') },
        { icon: 'shield-checkmark', color: colors.warning, label: 'Limites e alertas', hint: 'Perda semanal, total mensal', onPress: () => router.push('/limites') },
        { icon: 'settings', color: colors.textSecondary, label: 'Definições', hint: 'Tema, conta, importação', onPress: () => router.push('/settings') },
      ],
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Perfil' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="title">Perfil</AppText>

        {/* Identity and this month in one hero card (v3) */}
        <Appear index={0}>
          {profileQuery.isLoading || !profile ? (
            <View style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
              <Skeleton height={72} width={72} />
              <Skeleton height={20} width="60%" />
              <Skeleton height={14} width="40%" />
            </View>
          ) : (
            <HeroCard style={styles.identity}>
              <AvatarPicker
                compact
                currentUri={profile.avatarUrl}
                name={profile.displayName ?? profile.username}
                onPick={handleAvatarPick}
                onRemove={profile.avatarUrl ? handleAvatarRemove : undefined}
                uploading={uploadAvatar.isPending || deleteAvatar.isPending}
              />
              <View style={styles.identityText}>
                <AppText numberOfLines={1} variant="title">{profile.displayName ?? profile.username}</AppText>
                <AppText numberOfLines={1} variant="caption">@{profile.username}</AppText>
                {profile.bio ? <AppText numberOfLines={3} style={styles.center} variant="caption">{profile.bio}</AppText> : null}
              </View>
              <AppText style={[styles.capitalize, styles.monthLabel]} variant="label">Este mês · {monthName}</AppText>
              <View style={styles.metrics}>
                <HeroTile><MetricTile label="Lucro" tone={profit > 0 ? 'positive' : profit < 0 ? 'negative' : undefined} value={`${profit >= 0 ? '+' : '−'}${formatCurrency(Math.abs(profit))}`} /></HeroTile>
                <HeroTile><MetricTile label="ROI" tone={roi > 0 ? 'positive' : roi < 0 ? 'negative' : undefined} value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1).replace('.', ',')}%`} /></HeroTile>
                <HeroTile><MetricTile label="Apostado" value={formatCurrency(summary?.totalStaked ?? 0)} /></HeroTile>
              </View>
            </HeroCard>
          )}
        </Appear>

        {groups.map((g, gi) => (
          <Appear index={gi + 1} key={g.title} style={styles.group}>
            <AppText variant="label">{g.title}</AppText>
            <ListCard>
              {g.links.map((l) => (
                <ListRow accessibilityLabel={l.badge ? `${l.label}, ${l.badge}` : l.label} key={l.label} onPress={l.onPress}>
                  <View style={[styles.iconTile, { backgroundColor: `${l.color}22` }]}>
                    <Ionicons color={l.color} name={l.icon} size={19} />
                  </View>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{l.label}</AppText>
                    {l.hint ? <AppText variant="caption">{l.hint}</AppText> : null}
                  </View>
                  {l.badge ? (
                    <View style={[styles.badge, { backgroundColor: colors.accentAlt }]}>
                      <AppText style={styles.badgeText} variant="label">{l.badge > 99 ? '99+' : l.badge}</AppText>
                    </View>
                  ) : null}
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
                </ListRow>
              ))}
            </ListCard>
          </Appear>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 20 },
  card: { borderRadius: 20, gap: 10, padding: 20 },
  identity: { alignItems: 'center', gap: 10, paddingTop: 24 },
  identityText: { alignItems: 'center', gap: 2 },
  center: { textAlign: 'center' },
  capitalize: { textTransform: 'capitalize' },
  monthLabel: { alignSelf: 'flex-start', marginTop: 8 },
  metrics: { alignSelf: 'stretch', flexDirection: 'row', gap: 8 },
  group: { gap: 8 },
  iconTile: { alignItems: 'center', borderRadius: 11, height: 36, justifyContent: 'center', width: 36 },
  flex: { flex: 1 },
  badge: { alignItems: 'center', borderRadius: 10, height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 6 },
  badgeText: { color: '#FFFFFF', fontSize: 11 },
});
