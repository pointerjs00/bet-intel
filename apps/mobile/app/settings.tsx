import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import GorhomBottomSheet from '@gorhom/bottom-sheet';
import { AuthProvider } from '@betintel/shared';
import {
  useChangePasswordMutation,
  useLinkGoogleAccountMutation,
  useSetPasswordMutation,
  useUnlinkGoogleAccountMutation,
} from '../services/accountService';
import { useParseBetclicPdfMutation } from '../services/importService';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

import {
  getApiErrorMessage,
  useMeProfile,
  useUpdateProfileMutation,
} from '../services/socialService';
import { useAuthStore } from '../stores/authStore';
import { useBoletinBuilderStore } from '../stores/boletinBuilderStore';
import { useThemeStore, type ThemePreference } from '../stores/themeStore';
import { useTheme } from '../theme/useTheme';

const THEME_OPTIONS: Array<{ key: ThemePreference; label: string; icon: string }> = [
  { key: 'light', label: 'Claro', icon: 'white-balance-sunny' },
  { key: 'dark', label: 'Escuro', icon: 'moon-waning-crescent' },
  { key: 'system', label: 'Sistema', icon: 'cellphone' },
  { key: 'scheduled', label: 'Agendado', icon: 'clock-outline' },
];

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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const storedAuthProvider = useAuthStore((state) => state.user?.authProvider);
  const logout = useAuthStore((state) => state.logout);
  const storedThemePreference = useThemeStore((state) => state.preference);
  const setThemePreference = useThemeStore((state) => state.setPreference);
  const setDefaultPublicPreference = useBoletinBuilderStore((state) => state.setDefaultPublicPreference);

  const profileQuery = useMeProfile();
  const updateProfileMutation = useUpdateProfileMutation();
  const linkGoogleAccountMutation = useLinkGoogleAccountMutation();
  const unlinkGoogleAccountMutation = useUnlinkGoogleAccountMutation();
  const setPasswordMutation = useSetPasswordMutation();
  const changePasswordMutation = useChangePasswordMutation();

  const [themePreference, setLocalThemePreference] = useState<ThemePreference>(storedThemePreference);
  const [currency, setCurrency] = useState('EUR');
  const [defaultBoletinsPublic, setDefaultBoletinsPublic] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  const importSheetRef = useRef<GorhomBottomSheet>(null);
  const [importHelpExpanded, setImportHelpExpanded] = useState(false);
  const parsePdfMutation = useParseBetclicPdfMutation();

  useEffect(() => {
    if (!profileQuery.data) return;
    setCurrency(profileQuery.data.currency ?? 'EUR');
    setDefaultBoletinsPublic(profileQuery.data.defaultBoletinsPublic ?? false);
    setDefaultPublicPreference(profileQuery.data.defaultBoletinsPublic ?? false);
    const nextThemePreference = mapThemeFromApi(profileQuery.data.theme);
    if (storedThemePreference !== 'scheduled') {
      setLocalThemePreference(nextThemePreference);
      setThemePreference(nextThemePreference);
    }
  }, [profileQuery.data, setDefaultPublicPreference, setThemePreference]); // eslint-disable-line react-hooks/exhaustive-deps

  const authProvider = profileQuery.data?.authProvider ?? storedAuthProvider ?? AuthProvider.EMAIL;
  const isGoogleLinked = authProvider === AuthProvider.GOOGLE || authProvider === AuthProvider.HYBRID;
  const isGoogleOnly = authProvider === AuthProvider.GOOGLE;
  const canUnlinkGoogle = authProvider === AuthProvider.HYBRID;
  const authLabel = useMemo(() => {
    const p = profileQuery.data?.authProvider;
    if (p === 'GOOGLE') return 'Google';
    if (p === 'HYBRID') return 'Email + Google';
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
        await setPasswordMutation.mutateAsync({ newPassword, confirmPassword });
        resetPasswordFields();
        showToast('Password definida. A conta agora suporta email e Google.', 'success');
        return;
      }
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword, confirmPassword });
      resetPasswordFields();
      showToast('Password alterada. Entra novamente.', 'success');
      await logout();
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  }

  const handleSelectPdf = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.mimeType && asset.mimeType !== 'application/pdf') {
        showToast('Seleciona um ficheiro PDF válido.', 'error');
        return;
      }
      if (asset.size && asset.size > 10 * 1024 * 1024) {
        showToast('O ficheiro é demasiado grande (máx. 10MB)', 'error');
        return;
      }
      importSheetRef.current?.close();
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const parsed = await parsePdfMutation.mutateAsync(base64);
      router.push({ pathname: '/boletins/import-review', params: { data: JSON.stringify(parsed) } });
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  }, [parsePdfMutation, router, showToast]);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Definições',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
        }}
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: tokens.spacing.lg,
          gap: 16,
          paddingTop: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Appearance ───────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(20).duration(160).springify()}>
          <Card style={styles.cardInner}>
            <SectionHeader icon="palette-outline" title="Aparência" color={colors.info} textColor={colors.textPrimary} />

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
              {themePreference === 'scheduled' && (
                <Text style={[styles.scheduleHint, { color: colors.textMuted }]}>
                  Modo escuro ativo das 22:00 às 07:00
                </Text>
              )}
            </View>

            <Input
              autoCapitalize="characters"
              icon={<MaterialCommunityIcons name="currency-eur" size={18} color={colors.textSecondary} />}
              label="Moeda"
              maxLength={3}
              onChangeText={(v) => setCurrency(v.toUpperCase())}
              value={currency}
            />

            <View style={[styles.toggleRow, { borderColor: colors.border }]}> 
              <View style={styles.toggleCopy}>
                <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>Boletins públicos por defeito</Text>
                <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>Os novos boletins começam como públicos no construtor.</Text>
              </View>
              <Switch onValueChange={setDefaultBoletinsPublic} value={defaultBoletinsPublic} />
            </View>

            <Button
              loading={updateProfileMutation.isPending}
              onPress={async () => {
                try {
                  await updateProfileMutation.mutateAsync({
                    currency: currency.trim().toUpperCase() || undefined,
                    defaultBoletinsPublic,
                    theme: mapThemeToApi(themePreference),
                  });
                  setDefaultPublicPreference(defaultBoletinsPublic);
                  showToast('Preferências guardadas.', 'success');
                } catch (error) {
                  showToast(getApiErrorMessage(error), 'error');
                }
              }}
              title="Guardar preferências"
            />
          </Card>
        </Animated.View>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(30).duration(160).springify()}>
          <Card style={styles.cardInner}>
            <SectionHeader icon="shield-account-outline" title="Conta" color={colors.primary} textColor={colors.textPrimary} />

            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="at" size={18} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>{profileQuery.data?.email ?? '...'}</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="login-variant" size={18} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>Autenticação: {authLabel}</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons
                name={profileQuery.data?.isEmailVerified ? 'check-decagram' : 'alert-circle-outline'}
                size={18}
                color={profileQuery.data?.isEmailVerified ? colors.primary : colors.warning}
              />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Email {profileQuery.data?.isEmailVerified ? 'verificado' : 'por verificar'}
              </Text>
            </View>
          </Card>
        </Animated.View>

        {/* ── Google linking ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(40).duration(160).springify()}>
          <Card style={styles.cardInner}>
            <SectionHeader icon="google" title="Google" color="#4285F4" textColor={colors.textPrimary} />
            <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>
              Liga a tua conta Google para entrares sem password ou desliga-a se já tens password ativa.
            </Text>
            {isGoogleLinked ? (
              <View style={styles.actionsRow}>
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
          </Card>
        </Animated.View>

        {/* ── Password ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(50).duration(160).springify()}>
          <Card style={styles.cardInner}>
            <SectionHeader
              icon="lock-outline"
              title={isGoogleOnly ? 'Definir password' : 'Alterar password'}
              color={colors.warning}
              textColor={colors.textPrimary}
            />
            <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>
              A password precisa de 8+ caracteres, maiúscula, número e símbolo.
            </Text>
            {!isGoogleOnly ? (
              <Input
                icon={<MaterialCommunityIcons name="lock-open-outline" size={18} color={colors.textSecondary} />}
                label="Password atual"
                onChangeText={setCurrentPassword}
                secureTextEntry
                value={currentPassword}
              />
            ) : null}
            <Input
              icon={<MaterialCommunityIcons name="lock-outline" size={18} color={colors.textSecondary} />}
              label="Nova password"
              onChangeText={setNewPassword}
              secureTextEntry
              value={newPassword}
            />
            <Input
              icon={<MaterialCommunityIcons name="lock-check-outline" size={18} color={colors.textSecondary} />}
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
          </Card>
        </Animated.View>

        {/* ── Import ───────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(60).duration(160).springify()}>
          <Card style={styles.cardInner}>
            <SectionHeader icon="file-import-outline" title="Dados & Importação" color={colors.primary} textColor={colors.textPrimary} />
            <Pressable
              onPress={() => importSheetRef.current?.snapToIndex(0)}
              style={[styles.importRow, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="file-pdf-box" size={22} color={colors.danger} />
              <View style={styles.importRowText}>
                <Text style={[styles.importRowLabel, { color: colors.textPrimary }]}>Importar histórico Betclic</Text>
                <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>Importa apostas de um PDF exportado</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/boletins/scan')}
              style={[styles.importRow, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="cellphone-screenshot" size={22} color={colors.primary} />
              <View style={styles.importRowText}>
                <Text style={[styles.importRowLabel, { color: colors.textPrimary }]}>Importar por screenshot</Text>
                <Text style={[styles.preferenceLabel, { color: colors.textSecondary }]}>Lê uma aposta a partir de um screenshot Betclic</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          </Card>
        </Animated.View>

        {/* ── About & Logout ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(70).duration(160).springify()}>
          <Card style={styles.cardInner}>
            <SectionHeader icon="information-outline" title="Sobre" color={colors.textSecondary} textColor={colors.textPrimary} />
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="cellphone" size={18} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>BetIntel mobile • v{appVersion}</Text>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(160).springify()}>
          <Button
            onPress={() => setShowLogoutConfirm(true)}
            title="Terminar sessão"
            variant="danger"
          />
        </Animated.View>
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
        message="Tens a certeza? Continuarás a poder entrar com a tua password."
        confirmLabel="Desligar"
        onConfirm={async () => {
          setShowUnlinkConfirm(false);
          await handleUnlinkGoogleAccount();
        }}
        onCancel={() => setShowUnlinkConfirm(false)}
      />

      {/* Betclic Import Bottom Sheet */}
      <BottomSheet ref={importSheetRef} snapPoints={['55%', '75%']}>
        <View style={styles.importSheetContent}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Importar histórico Betclic</Text>
          <Text style={[styles.importSheetDesc, { color: colors.textSecondary }]}>
            Importa o teu histórico de apostas diretamente do Betclic. Exporta o ficheiro PDF na tua conta Betclic e seleciona-o aqui.
          </Text>
          <Pressable
            onPress={() => setImportHelpExpanded((v) => !v)}
            style={[styles.importHelpHeader, { borderColor: colors.border }]}
          >
            <Text style={[styles.importHelpTitle, { color: colors.info }]}>Como exportar do Betclic?</Text>
            <MaterialCommunityIcons
              name={importHelpExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.info}
            />
          </Pressable>
          {importHelpExpanded && (
            <View style={styles.importHelpSteps}>
              <Text style={[styles.importHelpStep, { color: colors.textSecondary }]}>1. Acede a betclic.pt e inicia sessão</Text>
              <Text style={[styles.importHelpStep, { color: colors.textSecondary }]}>2. Vai a &quot;A minha conta&quot; → &quot;Histórico de apostas&quot;</Text>
              <Text style={[styles.importHelpStep, { color: colors.textSecondary }]}>3. Seleciona o intervalo e clica em &quot;Exportar PDF&quot;</Text>
              <Text style={[styles.importHelpStep, { color: colors.textSecondary }]}>4. Guarda o ficheiro e importa-o aqui</Text>
            </View>
          )}
          <View style={styles.importSheetActions}>
            <Button title="Selecionar PDF" onPress={handleSelectPdf} loading={parsePdfMutation.isPending} />
            <Button title="Cancelar" variant="ghost" onPress={() => importSheetRef.current?.close()} />
          </View>
        </View>
      </BottomSheet>

      {parsePdfMutation.isPending && (
        <View style={styles.loadingOverlay}>
          <Card style={styles.loadingOverlayCard}>
            <Skeleton height={24} width={200} />
            <Text style={[styles.loadingOverlayText, { color: colors.textSecondary }]}>A ler o teu histórico Betclic...</Text>
          </Card>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ icon, title, color, textColor }: { icon: string; title: string; color: string; textColor: string }) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons name={icon as 'palette-outline'} size={20} color={color} />
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cardInner: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  preferenceGroup: { gap: 8 },
  preferenceLabel: { fontSize: 13, lineHeight: 20 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scheduleHint: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  toggleRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  toggleCopy: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 14, fontWeight: '700' },
  toggleSubtitle: { fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  infoText: { fontSize: 13, lineHeight: 20, flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  importRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  importRowText: { flex: 1, gap: 2 },
  importRowLabel: { fontSize: 15, fontWeight: '700' },
  importSheetContent: { gap: 16, paddingBottom: 32 },
  importSheetDesc: { fontSize: 14, lineHeight: 20 },
  importHelpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  importHelpTitle: { fontSize: 14, fontWeight: '600' },
  importHelpSteps: { gap: 6, paddingLeft: 4 },
  importHelpStep: { fontSize: 13, lineHeight: 20 },
  importSheetActions: { gap: 10, marginTop: 8 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  loadingOverlayCard: { alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingVertical: 24 },
  loadingOverlayText: { fontSize: 14, fontWeight: '600' },
});
