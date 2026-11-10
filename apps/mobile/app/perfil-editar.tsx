// Edit name and bio (redesign D10): moved out of the Perfil screen into its own screen.
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { getApiErrorMessage, useMeProfile, useUpdateProfileMutation } from '../services/socialService';
import { useTheme } from '../theme/useTheme';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { showToast } = useToast();
  const profile = useMeProfile().data;
  const update = useUpdateProfileMutation();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? '');
    setBio(profile.bio ?? '');
  }, [profile]);

  const save = async () => {
    try {
      await update.mutateAsync({ displayName: displayName.trim() || undefined, bio: bio.trim() || undefined });
      showToast('Perfil atualizado.', 'success');
      router.back();
    } catch (error) {
      showToast(getApiErrorMessage(error), 'error');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Editar perfil',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }}>
        <AppText variant="caption">O nome e a bio aparecem aos teus amigos e nos boletins que partilhas.</AppText>
        <Input
          icon={<MaterialCommunityIcons color={colors.textSecondary} name="account-outline" size={18} />}
          label="Nome"
          onChangeText={setDisplayName}
          value={displayName}
        />
        <Input
          icon={<MaterialCommunityIcons color={colors.textSecondary} name="text-box-outline" size={18} />}
          label="Bio"
          maxLength={300}
          multiline
          onChangeText={setBio}
          showCharCount
          style={styles.multiline}
          value={bio}
        />
        <Button loading={update.isPending} onPress={() => void save()} title="Guardar" />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 20, paddingBottom: 48 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
