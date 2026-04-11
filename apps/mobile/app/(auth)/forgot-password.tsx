import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@betintel/shared';
import { apiClient } from '../../services/apiClient';
import { useTheme } from '../../theme/useTheme';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../components/ui/Toast';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setIsSubmitting(true);
      await apiClient.post('/auth/forgot-password', values);
      showToast('Se o email existir, enviámos um link de recuperação.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setIsSubmitting(false);
    }
  });

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
        <Animated.View entering={FadeInUp.duration(180).springify()} style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: colors.warning + '15' }]}>
            <Ionicons color={colors.warning} name="lock-open-outline" size={28} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Esqueceste a password?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Enviaremos um link com validade de 1 hora para redefinires a tua password.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(45).duration(180).springify()}>
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

              <Button loading={isSubmitting} onPress={onSubmit} title="Enviar link" />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(45).duration(180).springify()}>
          <Link href="/(auth)/login" style={[styles.backLink, { color: colors.info }]}>Voltar ao login</Link>
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
  return 'Não foi possível enviar o link.';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 20,
    height: 56,
    justifyContent: 'center',
    marginBottom: 4,
    width: 56,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  formCard: {
    gap: 0,
  },
  form: {
    gap: 16,
  },
  backLink: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 28,
    textAlign: 'center',
  },
});
