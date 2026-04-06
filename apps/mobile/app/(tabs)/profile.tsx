import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { AuthProvider } from '@betintel/shared';
import {
  useChangePasswordMutation,
  useLinkGoogleAccountMutation,
  useSetPasswordMutation,
  useUnlinkGoogleAccountMutation,
} from '../../services/accountService';
import { NotificationItem } from '../../components/social/NotificationItem';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
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
  const storedAuthProvider = useAuthStore((state) => state.user?.authProvider);
  const logout = useAuthStore((state) => state.logout);
  const storedThemePreference = useThemeStore((state) => state.preference);
  const setThemePreference = useThemeStore((state) => state.setPreference);

  const profileQuery = useMeProfile();
  const statsSummaryQuery = useStatsSummary('month');

  const notificationsQuery = useNotifications(1, 3);

  const updateProfileMutation = useUpdateProfileMutation();
  const markNotificationReadMutation = useMarkNotificationReadMutation(1, 3);
  const markAllNotificationsReadMutation = useMarkAllNotificationsReadMutation(1, 3);
  const linkGoogleAccountMutation = useLinkGoogleAccountMutation();
  const unlinkGoogleAccountMutation = useUnlinkGoogleAccountMutation();
  const setPasswordMutation = useSetPasswordMutation();
  const changePasswordMutation = useChangePasswordMutation();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currency, setCurrency] = useState('EUR');

  const [themePreference, setLocalThemePreference] = useState<ThemePreference>(storedThemePreference);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Confirmation modals
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setDisplayName(profileQuery.data.displayName ?? '');
    setBio(profileQuery.data.bio ?? '');
    setAvatarUrl(profileQuery.data.avatarUrl ?? '');
    setCurrency(profileQuery.data.currency ?? 'EUR');

    const nextThemePreference = mapThemeFromApi(profileQuery.data.theme);
    setLocalThemePreference(nextThemePreference);
    setThemePreference(nextThemePreference);
  }, [profileQuery.data, setThemePreference]);

  const notificationItems = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.meta.unreadCount ?? 0;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const authProvider = profileQuery.data?.authProvider ?? storedAuthProvider ?? AuthProvider.EMAIL;
  const isGoogleLinked = authProvider === AuthProvider.GOOGLE || authProvider === AuthProvider.HYBRID;
  const isGoogleOnly = authProvider === AuthProvider.GOOGLE;
  const canUnlinkGoogle = authProvider === AuthProvider.HYBRID;
  const authLabel = useMemo(() => {
    const provider = profileQuery.data?.authProvider;
    if (provider === 'GOOGLE') return 'Google';
    if (provider === 'HYBRID') return 'Email + Google';
    return 'Email';
  }, [profileQuery.data?.authProvider]);
  const passwordConfirmationError =
    confirmPassword.length > 0 && confirmPassword !== newPassword
      ? 'As passwords não coincidem'
      : undefined;

  function resetPasswordFields() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleLinkGoogleAccount() {
    try {
      await linkGoogleAccountMutation.mutateAsync();
      showToast('Conta Google ligada com sucesso.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  }

  async function handleUnlinkGoogleAccount() {
    try {
      await unlinkGoogleAccountMutation.mutateAsync();
      showToast('Conta Google desligada.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  }

  async function handlePasswordSubmit() {
    if (newPassword !== confirmPassword) {
      showToast('As passwords não coincidem.', 'error');
      return;
    }

    try {
      if (isGoogleOnly) {
        await setPasswordMutation.mutateAsync({
          newPassword,
          confirmPassword,
        });
        resetPasswordFields();
        showToast('Password definida. A conta agora suporta email e Google.', 'success');
        return;
      }

      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      resetPasswordFields();
      showToast('Password alterada. Entra novamente.', 'success');
      await logout();
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  }

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



                <Button
                  loading={updateProfileMutation.isPending}
                  onPress={async () => {
                    try {
                      await updateProfileMutation.mutateAsync({
                        displayName: displayName.trim() || undefined,
                        bio: bio.trim() || undefined,
                        avatarUrl: avatarUrl.trim() || undefined,
                        currency: currency.trim().toUpperCase() || undefined,
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
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(600).duration(400).springify()}>
              <Card style={styles.cardInner}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Conta</Text>
                <View style={styles.accountSection}>
                  <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>Método atual: {authLabel}</Text>
                  <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>Email {profileQuery.data.isEmailVerified ? 'verificado' : 'por verificar'}.</Text>
                </View>

                <View style={styles.accountSection}>
                  <Text style={[styles.accountHeading, { color: colors.textPrimary }]}>Google</Text>
                  <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>Liga a tua conta Google para entrares sem password ou desliga-a se já tens password ativa.</Text>
                  {isGoogleLinked ? (
                    <View style={styles.accountActionsRow}>
                      <Button disabled title="Google ligado" variant="secondary" />
                      <Button
                        disabled={!canUnlinkGoogle}
                        loading={unlinkGoogleAccountMutation.isPending}
                        onPress={() => canUnlinkGoogle && setShowUnlinkConfirm(true)}
                        title={canUnlinkGoogle ? 'Desligar Google' : 'Define password primeiro'}
                        variant="ghost"
                      />
                    </View>
                  ) : (
                    <Button
                      loading={linkGoogleAccountMutation.isPending}
                      onPress={handleLinkGoogleAccount}
                      title="Ligar conta Google"
                      variant="secondary"
                    />
                  )}
                </View>

                <View style={styles.accountSection}>
                  <Text style={[styles.accountHeading, { color: colors.textPrimary }]}>
                    {isGoogleOnly ? 'Definir password' : 'Alterar password'}
                  </Text>
                  <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>A password precisa de 8+ caracteres, maiúscula, número e símbolo.</Text>
                  {!isGoogleOnly ? (
                    <Input
                      label="Password atual"
                      onChangeText={setCurrentPassword}
                      secureTextEntry
                      value={currentPassword}
                    />
                  ) : null}
                  <Input
                    label="Nova password"
                    onChangeText={setNewPassword}
                    secureTextEntry
                    value={newPassword}
                  />
                  <Input
                    error={passwordConfirmationError}
                    label="Confirmar password"
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    value={confirmPassword}
                  />
                  <Button
                    loading={setPasswordMutation.isPending || changePasswordMutation.isPending}
                    onPress={handlePasswordSubmit}
                    title={isGoogleOnly ? 'Guardar password' : 'Alterar password'}
                  />
                </View>

                <Button
                  onPress={() => setShowLogoutConfirm(true)}
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

      <ConfirmModal
        visible={showLogoutConfirm}
        title="Terminar sessão"
        message="Tens a certeza que queres sair? Precisarás entrar novamente para aceder à tua conta."
        confirmLabel="Sair"
        cancelLabel="Ficar"
        onConfirm={async () => {
          setShowLogoutConfirm(false);
          await logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
      <ConfirmModal
        visible={showUnlinkConfirm}
        title="Desligar conta Google"
        message="Tens a certeza? Continuarás a poder entrar com a tua password. Não poderás desligar se não tiveres password definida."
        confirmLabel="Desligar"
        onConfirm={async () => {
          setShowUnlinkConfirm(false);
          await handleUnlinkGoogleAccount();
        }}
        onCancel={() => setShowUnlinkConfirm(false)}
      />
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
  accountSection: { gap: 10 },
  accountHeading: { fontSize: 15, fontWeight: '800' },
  accountActionsRow: { flexDirection: 'row', gap: 10 },
});