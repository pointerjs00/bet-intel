import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { NotificationItem } from '../../components/social/NotificationItem';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useBettingSites } from '../../services/oddsService';
import {
  getApiErrorMessage,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useMeProfile,
  useNotifications,
  useUpdateProfileMutation,
} from '../../services/socialService';
import { useStatsSummary } from '../../services/statsService';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore, type ThemePreference } from '../../stores/themeStore';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatPercentage } from '../../utils/formatters';

const THEME_OPTIONS: Array<{ key: ThemePreference; label: string }> = [
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Escuro' },
  { key: 'system', label: 'Sistema' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const logout = useAuthStore((state) => state.logout);
  const storedThemePreference = useThemeStore((state) => state.preference);
  const setThemePreference = useThemeStore((state) => state.setPreference);

  const profileQuery = useMeProfile();
  const statsSummaryQuery = useStatsSummary('month');
  const bettingSitesQuery = useBettingSites();
  const notificationsQuery = useNotifications(1, 3);

  const updateProfileMutation = useUpdateProfileMutation();
  const markNotificationReadMutation = useMarkNotificationReadMutation(1, 3);
  const markAllNotificationsReadMutation = useMarkAllNotificationsReadMutation(1, 3);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [preferredSites, setPreferredSites] = useState<string[]>([]);
  const [themePreference, setLocalThemePreference] = useState<ThemePreference>(storedThemePreference);

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setDisplayName(profileQuery.data.displayName ?? '');
    setBio(profileQuery.data.bio ?? '');
    setAvatarUrl(profileQuery.data.avatarUrl ?? '');
    setCurrency(profileQuery.data.currency);
    setPreferredSites(profileQuery.data.preferredSites);
    const nextThemePreference = mapThemeFromApi(profileQuery.data.theme);
    setLocalThemePreference(nextThemePreference);
    setThemePreference(nextThemePreference);
  }, [profileQuery.data, setThemePreference]);

  const unreadCount = notificationsQuery.data?.meta.unreadCount ?? 0;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const authLabel = useMemo(() => {
    const provider = profileQuery.data?.authProvider;
    if (provider === 'GOOGLE') return 'Google';
    if (provider === 'HYBRID') return 'Email + Google';
    return 'Email';
  }, [profileQuery.data?.authProvider]);

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
        <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.headerWrap}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Perfil</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Ajusta identidade, preferências e o resumo da tua conta.</Text>
        </Animated.View>

        {profileQuery.isLoading || !profileQuery.data ? (
          <View style={styles.loadingStack}>
            <Card><Skeleton height={160} width="100%" /></Card>
            <Card><Skeleton height={320} width="100%" /></Card>
          </View>
        ) : (
          <View style={styles.sectionStack}>
            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <Card style={styles.profileCard}>
                <Avatar name={profileQuery.data.displayName ?? profileQuery.data.username} size="lg" uri={profileQuery.data.avatarUrl ?? undefined} />
                <View style={styles.profileInfo}>
                  <Text style={[styles.profileName, { color: colors.textPrimary }]}>{profileQuery.data.displayName ?? profileQuery.data.username}</Text>
                  <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>@{profileQuery.data.username} • {profileQuery.data.email}</Text>
                  <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>Autenticação: {authLabel} • Email {profileQuery.data.isEmailVerified ? 'verificado' : 'por verificar'}</Text>
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()} style={styles.statsRow}>
              <MetricCard label="ROI mês" value={formatPercentage(statsSummaryQuery.data?.roi ?? 0)} valueColor={(statsSummaryQuery.data?.roi ?? 0) >= 0 ? colors.primary : colors.danger} />
              <MetricCard label="Apostado" value={formatCurrency(statsSummaryQuery.data?.totalStaked ?? 0)} valueColor={colors.textPrimary} />
              <MetricCard label="Lucro" value={formatCurrency(statsSummaryQuery.data?.profitLoss ?? 0)} valueColor={(statsSummaryQuery.data?.profitLoss ?? 0) >= 0 ? colors.primary : colors.danger} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300).duration(400).springify()}>
              <Card style={styles.cardInner}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Perfil público</Text>
                <Input label="Nome" onChangeText={setDisplayName} value={displayName} />
                <Input label="Bio" multiline onChangeText={setBio} style={styles.multilineInput} value={bio} />
                <Input autoCapitalize="none" label="Avatar URL" onChangeText={setAvatarUrl} value={avatarUrl} />
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).duration(400).springify()}>
              <Card style={styles.cardInner}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Preferências</Text>
                <Input autoCapitalize="characters" label="Moeda" maxLength={3} onChangeText={(value) => setCurrency(value.toUpperCase())} value={currency} />

                <View style={styles.preferenceGroup}>
                  <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>Tema</Text>
                  <View style={styles.chipWrap}>
                    {THEME_OPTIONS.map((option) => (
                      <Chip
                        key={option.key}
                        label={option.label}
                        selected={themePreference === option.key}
                        onPress={() => {
                          setLocalThemePreference(option.key);
                          setThemePreference(option.key);
                        }}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.preferenceGroup}>
                  <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>Casas favoritas</Text>
                  <View style={styles.chipWrap}>
                    {(bettingSitesQuery.data ?? []).map((site) => (
                      <Chip
                        key={site.id}
                        label={site.name}
                        selected={preferredSites.includes(site.slug)}
                        onPress={() => {
                          setPreferredSites((current) =>
                            current.includes(site.slug)
                              ? current.filter((slug) => slug !== site.slug)
                              : [...current, site.slug],
                          );
                        }}
                      />
                    ))}
                  </View>
                </View>

                <Button
                  loading={updateProfileMutation.isPending}
                  onPress={async () => {
                    try {
                      await updateProfileMutation.mutateAsync({
                        displayName: displayName.trim() || undefined,
                        bio: bio.trim() || undefined,
                        avatarUrl: avatarUrl.trim() || undefined,
                        currency: currency.trim().toUpperCase() || undefined,
                        preferredSites,
                        theme: mapThemeToApi(themePreference),
                      });
                      showToast('Perfil atualizado.', 'success');
                    } catch (error) {
                      showToast(getApiErrorMessage(error), 'error');
                    }
                  }}
                  title="Guardar alterações"
                />
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500).duration(400).springify()}>
              <Card style={styles.cardInner}>
                <View style={styles.notificationsHeader}>
                  <View style={styles.notificationsTitleWrap}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notificações</Text>
                    <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>{unreadCount} por ler</Text>
                  </View>
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
                </View>

                {notificationsQuery.data?.items.length ? (
                  notificationsQuery.data.items.map((notification) => (
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
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(600).duration(400).springify()}>
              <Card style={styles.cardInner}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Conta</Text>
                <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>As ações de password e email já existem na API e podem ser ligadas a um fluxo dedicado quando quiseres fechar essa UX.</Text>
                <Button
                  onPress={async () => {
                    await logout();
                  }}
                  title="Terminar sessão"
                  variant="danger"
                />
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(700).duration(400).springify()}>
              <Card style={styles.cardInner}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Sobre</Text>
                <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>BetIntel mobile • versão {appVersion}</Text>
              </Card>
            </Animated.View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <Card style={styles.metricCard}>
      <Text style={[styles.metricLabel, { color: valueColor }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
    </Card>
  );
}

function mapThemeFromApi(theme: 'LIGHT' | 'DARK' | 'SYSTEM'): ThemePreference {
  switch (theme) {
    case 'LIGHT':
      return 'light';
    case 'DARK':
      return 'dark';
    case 'SYSTEM':
    default:
      return 'system';
  }
}

function mapThemeToApi(theme: ThemePreference): 'LIGHT' | 'DARK' | 'SYSTEM' {
  switch (theme) {
    case 'light':
      return 'LIGHT';
    case 'dark':
      return 'DARK';
    case 'system':
    default:
      return 'SYSTEM';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 8, marginBottom: 18 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  loadingStack: { gap: 16 },
  sectionStack: { gap: 18 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 24, fontWeight: '900' },
  profileMeta: { fontSize: 13, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  metricValue: { fontSize: 16, fontWeight: '900' },
  cardInner: { gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  preferenceGroup: { gap: 8 },
  preferenceLabel: { fontSize: 13, lineHeight: 20 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notificationsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notificationsTitleWrap: { gap: 2, flex: 1, paddingRight: 12 },
});