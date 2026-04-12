import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { Avatar } from './Avatar';

interface AvatarPickerProps {
  currentUri?: string | null;
  name?: string | null;
  uploading?: boolean;
  onPick: (result: { base64: string; mimeType: string }) => void;
  onRemove?: () => void;
}

export function AvatarPicker({ currentUri, name, uploading, onPick, onRemove }: AvatarPickerProps) {
  const { colors } = useTheme();
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  async function handlePick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    // Resize to 512×512 max
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 512, height: 512 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );

    setPreviewUri(manipulated.uri);

    const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    onPick({ base64, mimeType: 'image/jpeg' });
  }

  const displayUri = previewUri ?? currentUri;

  return (
    <View style={styles.container}>
      <Pressable onPress={handlePick} disabled={uploading} style={styles.avatarWrap}>
        {displayUri ? (
          <Image
            source={{ uri: displayUri }}
            style={[styles.avatar, { borderColor: colors.border }]}
          />
        ) : (
          <Avatar name={name} size="xl" />
        )}
        <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
          {uploading ? (
            <ActivityIndicator size={14} color="#fff" />
          ) : (
            <MaterialCommunityIcons name="camera" size={14} color="#fff" />
          )}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable onPress={handlePick} disabled={uploading} style={styles.actionBtn}>
          <MaterialCommunityIcons name="image-edit-outline" size={18} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>Alterar foto</Text>
        </Pressable>
        {currentUri && onRemove ? (
          <Pressable onPress={onRemove} disabled={uploading} style={styles.actionBtn}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Remover</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0D0D0D',
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
