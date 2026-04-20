import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usernameSchema } from '@betintel/shared';
import { z } from 'zod';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useTheme } from '../../theme/useTheme';
import { apiClient } from '../../services/apiClient';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../stores/authStore';

// Only validate the user-entered fields — tempToken comes from URL params and
// is not registered in the form, so including it in the schema causes silent
// validation failures (handleSubmit never fires).
const formSchema = z.object({
  username: usernameSchema,
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
      username: '',
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
    if (!tempToken) {
      showToast('Sessão inválida. Tenta fazer login com Google novamente.', 'error');
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await apiClient.post('/auth/google/complete-registration', {
        tempToken,
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
          paddingHorizontal: tokens.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInUp.duration(180).springify()} style={styles.profileHeader}>
          {typeof picture === 'string' && picture.length > 0 ? (
            <Image source={{ uri: picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceRaised }]}>
              <Ionicons color={colors.textMuted} name="person" size={36} />
            </View>
          )}
          <Text style={[styles.title, { color: colors.textPrimary }]}>Escolhe o teu username</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {typeof name === 'string' && name.length > 0 ? `${name}, ` : ''}escolhe um nome de utilizador único para o BetIntel.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(45).duration(180).springify()}>
          <Card style={styles.formCard}>
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
                    placeholder="3-20 caracteres, letras, números e _"
                    rightSlot={
                      usernameAvailable === null ? undefined : (
                        <Ionicons
                          color={usernameAvailable ? colors.primary : colors.danger}
                          name={usernameAvailable ? 'checkmark-circle' : 'close-circle'}
                          size={18}
                        />
                      )
                    }
                    value={value}
                  />
                )}
              />

              {usernameAvailable !== null ? (
                <Badge
                  label={usernameAvailable ? 'Disponível' : 'Indisponível'}
                  variant={usernameAvailable ? 'primary' : 'danger'}
                  size="sm"
                />
              ) : null}

              <Text style={[styles.rules, { color: colors.textMuted }]}>Letras, números e underscores. 3 a 20 caracteres.</Text>

              <Button loading={isSubmitting} onPress={onSubmit} title="Continuar" />
            </View>
          </Card>
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
    borderRadius: 40,
    height: 80,
    width: 80,
  },
  avatarFallback: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
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
  rules: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -8,
  },
});
