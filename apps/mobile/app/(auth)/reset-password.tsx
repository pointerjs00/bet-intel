import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { resetPasswordSchema } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../../components/ui/Toast';
import { PasswordStrength } from '../../components/auth/PasswordStrength';
import { isInvalidResetTokenError, resetPasswordRequest } from '../../services/passwordResetService';

// Same password rules as the register screen; the token comes from the URL, not a form field.
const formSchema = resetPasswordSchema.innerType().omit({ token: true }).refine(
  (data) => data.newPassword === data.confirmPassword,
  { message: 'As passwords não coincidem', path: ['confirmPassword'] },
);
type FormValues = z.infer<typeof formSchema>;

/** New-password screen opened by the reset email deep link (betintel://reset-password?token=...). */
export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenRejected, setTokenRejected] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const newPassword = watch('newPassword');

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    try {
      setIsSubmitting(true);
      await resetPasswordRequest(token, values.newPassword, values.confirmPassword);
      // The API revoked every refresh token; drop the local session so the AuthGate lets us reach login.
      await useAuthStore.getState().clearLocalSession();
      showToast('Palavra-passe alterada. Já podes entrar.', 'success');
      router.replace('/(auth)/login');
    } catch (error) {
      if (isInvalidResetTokenError(error)) {
        setTokenRejected(true);
      } else {
        showToast('Não foi possível alterar a palavra-passe. Tenta novamente.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  const invalidLink = !token || tokenRejected;
  const accent = invalidLink ? colors.danger : colors.primary;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.xxl,
          paddingBottom: insets.bottom + tokens.spacing.xl,
          paddingHorizontal: tokens.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: accent + '15' }]}>
            <Ionicons color={accent} name={invalidLink ? 'alert-circle-outline' : 'key-outline'} size={28} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {invalidLink ? 'Link inválido ou expirado' : 'Nova palavra-passe'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {invalidLink
              ? 'Este link de recuperação já não é válido. Pede um novo link para redefinires a palavra-passe.'
              : 'Escolhe uma palavra-passe nova para a tua conta.'}
          </Text>
        </View>

        {invalidLink ? (
          <Link href="/(auth)/forgot-password" style={[styles.link, { color: colors.primary }]}>
            Pedir novo link
          </Link>
        ) : (
          <Card style={styles.formCard}>
            <View style={styles.form}>
              <Controller
                control={control}
                name="newPassword"
                render={({ field: { onChange, value } }) => (
                  <Input
                    error={errors.newPassword?.message}
                    label="Nova palavra-passe"
                    onChangeText={onChange}
                    placeholder="Cria uma palavra-passe forte"
                    secureTextEntry
                    value={value}
                  />
                )}
              />

              <PasswordStrength password={newPassword} />

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, value } }) => (
                  <Input
                    error={errors.confirmPassword?.message}
                    label="Confirmar palavra-passe"
                    onChangeText={onChange}
                    placeholder="Repete a palavra-passe"
                    secureTextEntry
                    value={value}
                  />
                )}
              />

              <Button loading={isSubmitting} onPress={onSubmit} title="Guardar palavra-passe" />
            </View>
          </Card>
        )}

        <Link href="/(auth)/login" style={[styles.link, styles.backLink, { color: colors.info }]}>
          Voltar ao login
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { alignItems: 'center', gap: 12, marginBottom: 32 },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 20,
    height: 56,
    justifyContent: 'center',
    marginBottom: 4,
    width: 56,
  },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  formCard: { gap: 0 },
  form: { gap: 16 },
  link: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  backLink: { marginTop: 28 },
});
