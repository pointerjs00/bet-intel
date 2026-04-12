import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
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
import { loginSchema, type LoginInput } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Divider } from '../../components/ui/Divider';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import { signInWithGoogle } from '../../services/auth/googleAuth';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const login = useAuthStore((state) => state.login);

  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setIsEmailLoading(true);
      await login(values.email, values.password);
      router.replace('/(tabs)');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setIsEmailLoading(false);
    }
  });

  const handleGooglePress = async () => {
    try {
      setIsGoogleLoading(true);
      const result = await signInWithGoogle();

      if (result.isNewUser && result.tempToken) {
        // Clear any existing session so AuthGate doesn't redirect to /(tabs)
        // and push-token sync doesn't loop against an expired token.
        await useAuthStore.getState().clearLocalSession();
        router.push({
          pathname: '/(auth)/google-username',
          params: { tempToken: result.tempToken },
        });
        return;
      }

      if (result.accessToken && result.refreshToken && result.user) {
        await useAuthStore.getState().setSession({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user as never,
        });
        router.replace('/(tabs)');
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
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + tokens.spacing.xl,
          paddingHorizontal: tokens.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        style={styles.flex}
      >
        <Animated.View entering={FadeInUp.duration(180).springify()} style={styles.header}>
          <Image
            source={require('../../assets/logo-no-bg.png')}
            style={styles.logoMark}
            resizeMode="contain"
          />
          <Text style={[styles.logo, { color: colors.textPrimary }]}>BetIntel</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(20).duration(180).springify()} style={styles.welcomeWrap}>
          <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>Bem-vindo de volta</Text>
          <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>Inicia sessão para continuar</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(35).duration(180).springify()}>
          <Card style={styles.formCard}>
            <View style={styles.form}>
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
                    autoCapitalize="none"
                    error={errors.password?.message}
                    label="Password"
                    onChangeText={onChange}
                    placeholder="A tua password"
                    secureTextEntry
                    value={value}
                  />
                )}
              />

              <Link asChild href="/(auth)/forgot-password">
                <Pressable style={styles.linkButton}>
                  <Text style={[styles.linkText, { color: colors.info }]}>Esqueceste a password?</Text>
                </Pressable>
              </Link>

              <Button loading={isEmailLoading} onPress={onSubmit} title="Entrar" />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(35).duration(180).springify()} style={styles.dividerWrap}>
          <Divider style={styles.dividerLine} />
          <Text style={[styles.dividerText, { color: colors.textMuted }]}>ou continuar com</Text>
          <Divider style={styles.dividerLine} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(50).duration(180).springify()}>
          <Button
            leftSlot={<Ionicons color="#1F1F1F" name="logo-google" size={18} />}
            loading={isGoogleLoading}
            onPress={handleGooglePress}
            style={styles.googleButton}
            textColor="#1F1F1F"
            title="Continuar com Google"
            variant="secondary"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(35).duration(180).springify()} style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Ainda não tens conta?</Text>
          <Link href="/(auth)/register" style={[styles.footerLink, { color: colors.primary }]}>Criar conta</Link>
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
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Não foi possível concluir a operação.';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  logoMark: {
    height: 120,
    marginBottom: 0,
    width: 120,
  },
  logo: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  welcomeWrap: {
    gap: 6,
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  welcomeSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  formCard: {
    gap: 0,
  },
  form: {
    gap: 16,
  },
  linkButton: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
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
