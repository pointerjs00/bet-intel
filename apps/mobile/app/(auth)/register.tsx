import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerSchema, type RegisterInput } from '@betintel/shared';
import { apiClient } from '../../services/apiClient';
import { useTheme } from '../../theme/useTheme';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Divider } from '../../components/ui/Divider';
import { useToast } from '../../components/ui/Toast';
import { signInWithGoogle } from '../../services/auth/googleAuth';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: true,
    },
  });

  const username = watch('username');
  const password = watch('password');

  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await apiClient.get('/users/check-username', {
          params: { username },
        });
        setUsernameAvailable(Boolean(response.data.data?.available));
      } catch {
        setUsernameAvailable(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { label: 'Fraca', color: colors.danger, width: '33%' as const };
    if (score <= 3) return { label: 'Média', color: colors.warning, width: '66%' as const };
    return { label: 'Forte', color: colors.primary, width: '100%' as const };
  }, [colors.danger, colors.primary, colors.warning, password]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      setIsSubmitting(true);
      await apiClient.post('/auth/register', {
        email: values.email,
        username: values.username,
        password: values.password,
        displayName: values.displayName,
      });
      showToast('Conta criada. Verifica o teu email.', 'success');
      router.replace('/(auth)/login');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleGoogle = async () => {
    try {
      setIsGoogleLoading(true);
      const result = await signInWithGoogle();
      if (result.isNewUser && result.tempToken) {
        router.push({
          pathname: '/(auth)/google-username',
          params: { tempToken: result.tempToken },
        });
      }
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.xl,
          paddingBottom: insets.bottom + tokens.spacing.xl,
          paddingHorizontal: tokens.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        style={styles.flex}
      >
        <Animated.View entering={FadeInUp.duration(500).springify()} style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Criar conta</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Começa a acompanhar e comparar odds em segundos.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(500).springify()}>
          <Card style={styles.formCard}>
            <View style={styles.form}>
              <Controller
                control={control}
                name="displayName"
                render={({ field: { onChange, value } }) => (
                  <Input
                    error={errors.displayName?.message}
                    label="Nome completo"
                    onChangeText={onChange}
                    placeholder="João Silva"
                    value={value}
                  />
                )}
              />

              <Controller
                control={control}
                name="username"
                render={({ field: { onChange, value } }) => (
                  <Input
                    autoCapitalize="none"
                    error={errors.username?.message}
                    rightSlot={
                      usernameAvailable === null ? undefined : (
                        <Ionicons
                          color={usernameAvailable ? colors.primary : colors.danger}
                          name={usernameAvailable ? 'checkmark-circle' : 'close-circle'}
                          size={18}
                        />
                      )
                    }
                    label="Username"
                    onChangeText={onChange}
                    placeholder="joao_aposta"
                    value={value}
                  />
                )}
              />

              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <Input
                    autoCapitalize="none"
                    autoComplete="email"
                    error={errors.email?.message}
                    keyboardType="email-address"
                    label="Email"
                    onChangeText={onChange}
                    placeholder="teu@email.pt"
                    value={value}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <Input
                    error={errors.password?.message}
                    label="Password"
                    onChangeText={onChange}
                    placeholder="Cria uma password forte"
                    secureTextEntry
                    value={value}
                  />
                )}
              />

              <View style={styles.passwordMeterWrap}>
                <View style={[styles.passwordMeterTrack, { backgroundColor: colors.border }]}>
                  <Animated.View
                    style={[
                      styles.passwordMeterFill,
                      { backgroundColor: passwordStrength.color, width: passwordStrength.width },
                    ]}
                  />
                </View>
                <Text style={[styles.passwordMeterLabel, { color: colors.textMuted }]}>
                  {passwordStrength.label}
                </Text>
              </View>

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, value } }) => (
                  <Input
                    error={errors.confirmPassword?.message}
                    label="Confirmar password"
                    onChangeText={onChange}
                    placeholder="Repete a password"
                    secureTextEntry
                    value={value}
                  />
                )}
              />

              <Controller
                control={control}
                name="acceptTerms"
                render={({ field: { onChange, value } }) => (
                  <Pressable onPress={() => onChange(!value)} style={styles.termsRow}>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: value ? colors.primary : 'transparent',
                          borderColor: value ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      {value ? <Ionicons color="#FFFFFF" name="checkmark" size={14} /> : null}
                    </View>
                    <Text style={[styles.termsText, { color: colors.textSecondary }]}>Aceito os Termos de Serviço e Política de Privacidade</Text>
                  </Pressable>
                )}
              />
              {errors.acceptTerms?.message ? (
                <Text style={[styles.errorText, { color: colors.danger }]}>{errors.acceptTerms.message}</Text>
              ) : null}

              <Button loading={isSubmitting} onPress={onSubmit} title="Criar conta" />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(500).springify()} style={styles.dividerWrap}>
          <Divider style={styles.dividerLine} />
          <Text style={[styles.dividerText, { color: colors.textMuted }]}>ou continuar com</Text>
          <Divider style={styles.dividerLine} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(360).duration(500).springify()}>
          <Button
            leftSlot={<Ionicons color="#1F1F1F" name="logo-google" size={18} />}
            loading={isGoogleLoading}
            onPress={handleGoogle}
            style={styles.googleButton}
            title="Continuar com Google"
            variant="secondary"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(480).duration(500).springify()} style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Já tens conta?</Text>
          <Link href="/(auth)/login" style={[styles.footerLink, { color: colors.primary }]}>Entrar</Link>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data
  ) {
    return String(error.response.data.error);
  }
  return 'Não foi possível concluir o registo.';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    gap: 10,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  formCard: {
    gap: 0,
  },
  form: {
    gap: 16,
  },
  passwordMeterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -8,
  },
  passwordMeterTrack: {
    borderRadius: 999,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  passwordMeterFill: {
    borderRadius: 999,
    height: 6,
  },
  passwordMeterLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  termsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: -8,
  },
  dividerWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DADCE0',
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 28,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});
