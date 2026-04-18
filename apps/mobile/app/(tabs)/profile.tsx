import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import {
  useDeleteAvatarMutation,
  useUploadAvatarMutation,
} from '../../services/accountService';
import { NotificationItem } from '../../components/social/NotificationItem';
import { AvatarPicker } from '../../components/ui/AvatarPicker';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

import {
  getApiErrorMessage,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useMeProfile,
  useNotifications,
  useUpdateProfileMutation,
} from '../../services/socialService';
import { useStatsSummary } from '../../services/statsService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatPercentage } from '../../utils/formatters';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();

  const profileQuery = useMeProfile();
  const statsSummaryQuery = useStatsSummary('month');
  const notificationsQuery = useNotifications(1, 3);

  const updateProfileMutation = useUpdateProfileMutation();
  const markNotificationReadMutation = useMarkNotificationReadMutation(1, 3);
  const markAllNotificationsReadMutation = useMarkAllNotificationsReadMutation(1, 3);
  const uploadAvatarMutation = useUploadAvatarMutation();
  const deleteAvatarMutation = useDeleteAvatarMutation();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (!profileQuery.data) return;
    setDisplayName(profileQuery.data.displayName ?? '');
    setBio(profileQuery.data.bio ?? '');
  }, [profileQuery.data]);

  const notificationItems = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.meta.unreadCount ?? 0;
  const profile = profileQuery.data;

  const handleAvatarPick = async (result: { base64: string; mimeType: string }) => {
    try {
      await uploadAvatarMutation.mutateAsync(result);
      showToast('Foto de perfil atualizada.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  };

  const handleAvatarRemove = async () => {
    try {
      await deleteAvatarMutation.mutateAsync();
      showToast('Foto de perfil removida.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Perfil' }} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: tokens.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(160).springify()} style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Perfil</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>A tua conta</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Definições"
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={[styles.settingsBtn, { backgroundColor: colors.surfaceRaised }]}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>

        {profileQuery.isLoading || !profile ? (
          <View style={styles.loadingStack}>
            <Card><Skeleton height={200} width="100%" /></Card>
            <Card><Skeleton height={120} width="100%" /></Card>
          </View>
        ) : (
          <View style={styles.sectionStack}>
            {/* ── Avatar + Identity Card ──────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(20).duration(160).springify()}>
              <Card style={styles.identityCard}>
                <AvatarPicker
                  currentUri={profile.avatarUrl}
                  name={profile.displayName ?? profile.username}
                  uploading={uploadAvatarMutation.isPending || deleteAvatarMutation.isPending}
                  onPick={handleAvatarPick}
                  onRemove={profile.avatarUrl ? handleAvatarRemove : undefined}
                />

                <View style={styles.identityInfo}>
                  <Text style={[styles.profileName, { color: colors.textPrimary }]}>
                    {profile.displayName ?? profile.username}
                  </Text>
                  <View style={styles.usernameRow}>
                    <MaterialCommunityIcons name="at" size={16} color={colors.textSecondary} />
                    <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>{profile.username}</Text>
                  </View>
                  <View style={styles.usernameRow}>
                    <MaterialCommunityIcons name="email-outline" size={16} color={colors.textSecondary} />
                    <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>{profile.email}</Text>
                  </View>
                  {profile.bio ? (
                    <Text style={[styles.bioText, { color: colors.textSecondary }]}>{profile.bio}</Text>
                  ) : null}
                </View>
              </Card>
            </Animated.View>

            {/* ── Stats Summary Row ──────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(30).duration(160).springify()} style={styles.statsRow}>
              <MetricCard
                icon="trending-up"
                label="ROI mês"
                value={formatPercentage(statsSummaryQuery.data?.roi ?? 0)}
                valueColor={(statsSummaryQuery.data?.roi ?? 0) >= 0 ? colors.primary : colors.danger}
                iconColor={(statsSummaryQuery.data?.roi ?? 0) >= 0 ? colors.primary : colors.danger}
              />
              <MetricCard
                icon="cash-outline"
                label="Apostado"
                value={formatCurrency(statsSummaryQuery.data?.totalStaked ?? 0)}
                valueColor={colors.textPrimary}
                iconColor={colors.info}
              />
              <MetricCard
                icon="wallet-outline"
                label="Lucro"
                value={formatCurrency(statsSummaryQuery.data?.profitLoss ?? 0)}
                valueColor={(statsSummaryQuery.data?.profitLoss ?? 0) >= 0 ? colors.primary : colors.danger}
                iconColor={(statsSummaryQuery.data?.profitLoss ?? 0) >= 0 ? colors.primary : colors.danger}
              />
            </Animated.View>

            {/* ── Edit Profile Card ──────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(40).duration(160).springify()}>
              <Card style={styles.cardInner}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="account-edit-outline" size={20} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Perfil público</Text>
                </View>
                <Input
                  icon={<MaterialCommunityIcons name="account-outline" size={18} color={colors.textSecondary} />}
                  label="Nome"
                  onChangeText={setDisplayName}
                  value={displayName}
                />
                <Input
                  icon={<MaterialCommunityIcons name="text-box-outline" size={18} color={colors.textSecondary} />}
                  label="Bio"
                  multiline
                  onChangeText={setBio}
                  style={styles.multilineInput}
                  value={bio}
                  maxLength={300}
                  showCharCount
                />
                <Button
                  loading={updateProfileMutation.isPending}
                  onPress={async () => {
                    try {
                      await updateProfileMutation.mutateAsync({
                        displayName: displayName.trim() || undefined,
                        bio: bio.trim() || undefined,
                      });
                      showToast('Perfil atualizado.', 'success');
                    } catch (error) {
                      showToast(getApiErrorMessage(error), 'error');
                    }
                  }}
                  title="Guardar perfil"
                />
              </Card>
            </Animated.View>

            {/* ── Notifications Preview ──────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(50).duration(160).springify()}>
              <Card style={styles.cardInner}>
                <View style={styles.notificationsHeader}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons name="bell-outline" size={20} color={colors.warning} />
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notificações</Text>
                    {unreadCount > 0 ? (
                      <View style={[styles.unreadBadge, { backgroundColor: colors.danger }]}>
                        <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                      </View>
                    ) : null}
                  </View>
                  {notificationItems.length > 0 ? (
                    <Button
                      onPress={async () => {
                        try {
                          await markAllNotificationsReadMutation.mutateAsync();
                          showToast('Notificações marcadas como lidas.', 'success');
                        } catch (error) {
                          showToast(getApiErrorMessage(error), 'error');
                        }
                      }}
                      size="sm"
                      title="Ler todas"
                      variant="ghost"
                    />
                  ) : null}
                </View>

                {notificationItems.length > 0 ? (
                  notificationItems.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={
                        notification.isRead
                          ? undefined
                          : async () => {
                              try {
                                await markNotificationReadMutation.mutateAsync(notification.id);
                              } catch (error) {
                                showToast(getApiErrorMessage(error), 'error');
                              }
                            }
                      }
                    />
                  ))
                ) : (
                  <EmptyState icon="bell-off-outline" title="Sem notificações" message="Ainda não tens notificações." />
                )}

                <Pressable onPress={() => router.push('/notifications')} style={styles.viewAllRow}>
                  <Text style={[styles.viewAllText, { color: colors.primary }]}>Ver todas as notificações</Text>
                  <Ionicons color={colors.primary} name="chevron-forward" size={16} />
                </Pressable>
              </Card>
            </Animated.View>

            {/* ── Quick Links ────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(60).duration(160).springify()}>
              <Card style={styles.cardInner}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="lightning-bolt-outline" size={20} color={colors.info} />
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Acesso rápido</Text>
                </View>

                <QuickLink
                  icon="cog-outline"
                  label="Definições"
                  description="Tema, password, Google, importação"
                  onPress={() => router.push('/settings')}
                  color={colors.textSecondary}
                  labelColor={colors.textPrimary}
                  descColor={colors.textSecondary}
                  chevronColor={colors.textMuted}
                  borderColor={colors.border}
                />
                <QuickLink
                  icon="chart-bar"
                  label="Estatísticas"
                  description="Desempenho detalhado"
                  onPress={() => router.push('/(tabs)/stats')}
                  color={colors.primary}
                  labelColor={colors.textPrimary}
                  descColor={colors.textSecondary}
                  chevronColor={colors.textMuted}
                  borderColor={colors.border}
                />
                <QuickLink
                  icon="account-group-outline"
                  label="Amigos"
                  description="Rede e atividade social"
                  onPress={() => router.push('/(tabs)/friends')}
                  color={colors.info}
                  labelColor={colors.textPrimary}
                  descColor={colors.textSecondary}
                  chevronColor={colors.textMuted}
                  borderColor={colors.border}
                />
              </Card>
            </Animated.View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
  valueColor,
  iconColor,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor: string;
  iconColor: string;
}) {
  const { colors } = useTheme();
  return (
    <Card style={styles.metricCard}>
      <Ionicons name={icon as 'trending-up'} size={18} color={iconColor} />
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
    </Card>
  );
}

function QuickLink({
  icon,
  label,
  description,
  onPress,
  color,
  labelColor,
  descColor,
  chevronColor,
  borderColor,
}: {
  icon: string;
  label: string;
  description: string;
  onPress: () => void;
  color: string;
  labelColor: string;
  descColor: string;
  chevronColor: string;
  borderColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.quickLink, { borderColor }]}
    >
      <MaterialCommunityIcons name={icon as 'cog-outline'} size={22} color={color} />
      <View style={styles.quickLinkText}>
        <Text style={[styles.quickLinkLabel, { color: labelColor }]}>{label}</Text>
        <Text style={[styles.quickLinkDesc, { color: descColor }]}>{description}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={chevronColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  headerTextWrap: { gap: 4, flex: 1 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  loadingStack: { gap: 16 },
  sectionStack: { gap: 16 },

  /* Identity card */
  identityCard: { alignItems: 'center', gap: 16, paddingVertical: 24 },
  identityInfo: { alignItems: 'center', gap: 6 },
  profileName: { fontSize: 24, fontWeight: '900' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  profileMeta: { fontSize: 13, lineHeight: 20 },
  bioText: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 4, paddingHorizontal: 16 },

  /* Stats */
  statsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, gap: 4, alignItems: 'center', paddingVertical: 14 },
  metricLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  metricValue: { fontSize: 16, fontWeight: '900' },

  /* Section */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  cardInner: { gap: 14 },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },

  /* Notifications */
  notificationsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 8 },
  viewAllText: { fontSize: 13, fontWeight: '700' },

  /* Quick links */
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  quickLinkText: { flex: 1, gap: 2 },
  quickLinkLabel: { fontSize: 15, fontWeight: '700' },
  quickLinkDesc: { fontSize: 12, lineHeight: 18 },
});
