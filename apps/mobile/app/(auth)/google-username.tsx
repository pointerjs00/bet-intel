import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { googleCompleteRegistrationSchema } from '@betintel/shared';
import type { z } from 'zod';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useTheme } from '../../theme/useTheme';
import { apiClient } from '../../services/apiClient';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../stores/authStore';

const formSchema = googleCompleteRegistrationSchema.extend({
  displayName: googleCompleteRegistrationSchema.shape.username.optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function GoogleUsernameScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tempToken, picture, name } = useLocalSearchParams<{
    tempToken?: string;
    picture?: string;
    name?: string;
  }>();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tempToken: tempToken ?? '',
      username: '',
      displayName: '',
    },
  });

  const username = watch('username');

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

  const onSubmit = handleSubmit(async (values) => {
    try {
      setIsSubmitting(true);
      const response = await apiClient.post('/auth/google/complete-registration', {
        tempToken: values.tempToken,
        username: values.username,
      });

      const { user, accessToken, refreshToken } = response.data.data as {
        user: never;
        accessToken: string;
        refreshToken: string;
      };

      await useAuthStore.getState().setSession({ user, accessToken, refreshToken });
      router.replace('/(tabs)');
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
          paddingHorizontal: tokens.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeader}>
          {typeof picture === 'string' && picture.length > 0 ? (
            <Image source={{ uri: picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceRaised }]} />
          )}
          <Text style={[styles.title, { color: colors.textPrimary }]}>Escolhe o teu username</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {typeof name === 'string' && name.length > 0 ? `${name}, ` : ''}escolhe um nome de utilizador único para o BetIntel.
          </Text>
        </View>

        <View style={styles.form}>
          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, value } }) => (
              <Input
                autoCapitalize="none"
                error={errors.username?.message}
                label="Username"
                onChangeText={onChange}
                placeholder="3-20 caracteres, letras, números e underscores"
                value={value}
              />
            )}
          />

          <Text style={[styles.rules, { color: colors.textSecondary }]}>Regras: 3-20 caracteres, letras, números e underscores apenas.</Text>
          {usernameAvailable !== null ? (
            <Text style={{ color: usernameAvailable ? colors.primary : colors.danger, fontWeight: '600' }}>
              {usernameAvailable ? 'Username disponível' : 'Username indisponível'}
            </Text>
          ) : null}

          <Button loading={isSubmitting} onPress={onSubmit} title="Continuar" />
        </View>
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
  return 'Não foi possível concluir o registo Google.';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  avatar: {
    borderRadius: 44,
    height: 88,
    width: 88,
  },
  avatarFallback: {
    borderRadius: 44,
    height: 88,
    width: 88,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  rules: {
    fontSize: 13,
    lineHeight: 19,
  },
});
