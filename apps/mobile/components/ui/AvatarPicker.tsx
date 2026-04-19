import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { Avatar } from './Avatar';
import { resolveMediaUrl } from '../../utils/media';

interface AvatarPickerProps {
  currentUri?: string | null;
  name?: string | null;
  uploading?: boolean;
  onPick: (result: { base64: string; mimeType: string }) => void;
  onRemove?: () => void;
}

const CROP_SIZE = Dimensions.get('window').width - 96;

export function AvatarPicker({ currentUri, name, uploading, onPick, onRemove }: AvatarPickerProps) {
  const { colors } = useTheme();
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropSourceUri, setCropSourceUri] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const resolvedCurrentUri = resolveMediaUrl(currentUri);

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

  async function handleAdjustPosition() {
    const uri = previewUri ?? resolvedCurrentUri;
    if (!uri) return;

    try {
      const tmpPath = FileSystem.cacheDirectory + 'avatar_crop_tmp.jpg';

      if (uri.startsWith('http')) {
        await FileSystem.downloadAsync(uri, tmpPath);
        setCropSourceUri(tmpPath);
      } else {
        setCropSourceUri(uri);
      }

      setShowCropModal(true);
    } catch {
      // silently fail — image may have been deleted
    }
  }

  const handleCropSave = useCallback(
    async (sourceUri: string, scaleVal: number, tx: number, ty: number) => {
      setCropping(true);
      try {
        const ratio = 512 / (CROP_SIZE * scaleVal);
        const cropSize = Math.min(CROP_SIZE * ratio, 512);
        const centerX = 256 - tx * ratio;
        const centerY = 256 - ty * ratio;
        const originX = Math.max(0, Math.min(512 - cropSize, centerX - cropSize / 2));
        const originY = Math.max(0, Math.min(512 - cropSize, centerY - cropSize / 2));

        const manipulated = await ImageManipulator.manipulateAsync(
          sourceUri,
          [
            { crop: { originX, originY, width: cropSize, height: cropSize } },
            { resize: { width: 512, height: 512 } },
          ],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );

        setPreviewUri(manipulated.uri);

        const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        onPick({ base64, mimeType: 'image/jpeg' });
      } finally {
        setCropping(false);
        setShowCropModal(false);
      }
    },
    [onPick],
  );

  const displayUri = previewUri ?? resolvedCurrentUri;

  return (
    <View style={styles.container}>
      <Pressable onPress={handlePick} disabled={uploading} style={styles.avatarWrap}>
        {displayUri ? (
          <Image
            source={{ uri: displayUri }}
            cachePolicy="disk"
            contentFit="cover"
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
        {displayUri ? (
          <Pressable onPress={handleAdjustPosition} disabled={uploading} style={styles.actionBtn}>
            <MaterialCommunityIcons name="crop" size={18} color={colors.info} />
            <Text style={[styles.actionText, { color: colors.info }]}>Ajustar</Text>
          </Pressable>
        ) : null}
        {currentUri && onRemove ? (
          <Pressable onPress={onRemove} disabled={uploading} style={styles.actionBtn}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Remover</Text>
          </Pressable>
        ) : null}
      </View>

      {showCropModal && cropSourceUri ? (
        <CropModal
          sourceUri={cropSourceUri}
          colors={colors}
          saving={cropping}
          onSave={handleCropSave}
          onCancel={() => setShowCropModal(false)}
        />
      ) : null}
    </View>
  );
}

/* ── Crop modal ──────────────────────────────────────────────────────── */

interface CropModalProps {
  sourceUri: string;
  colors: ReturnType<typeof useTheme>['colors'];
  saving: boolean;
  onSave: (uri: string, scale: number, tx: number, ty: number) => void;
  onCancel: () => void;
}

function CropModal({ sourceUri, colors, saving, onSave, onCancel }: CropModalProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  function clampPan(tx: number, ty: number, s: number) {
    'worklet';
    const maxPan = ((s - 1) * CROP_SIZE) / 2;
    return {
      x: Math.min(maxPan, Math.max(-maxPan, tx)),
      y: Math.min(maxPan, Math.max(-maxPan, ty)),
    };
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      const clamped = clampPan(translateX.value, translateY.value, scale.value);
      translateX.value = withSpring(clamped.x, { damping: 20 });
      translateY.value = withSpring(clamped.y, { damping: 20 });
      savedTX.value = clamped.x;
      savedTY.value = clamped.y;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const clamped = clampPan(
        savedTX.value + e.translationX,
        savedTY.value + e.translationY,
        scale.value,
      );
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedTX.value = translateX.value;
      savedTY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  function triggerSave() {
    onSave(sourceUri, scale.value, translateX.value, translateY.value);
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={cropStyles.backdrop}>
        <View style={cropStyles.content}>
          <Text style={[cropStyles.title, { color: colors.textPrimary }]}>Ajustar posição</Text>
          <Text style={[cropStyles.hint, { color: colors.textSecondary }]}>
            Arrasta e faz pinch para ajustar
          </Text>

          <View
            style={[
              cropStyles.cropFrame,
              {
                width: CROP_SIZE,
                height: CROP_SIZE,
                borderRadius: CROP_SIZE / 2,
                borderColor: colors.border,
              },
            ]}
          >
            <GestureDetector gesture={composed}>
              <Animated.Image
                source={{ uri: sourceUri }}
                style={[{ width: CROP_SIZE, height: CROP_SIZE }, imageStyle]}
                resizeMode="cover"
              />
            </GestureDetector>
          </View>

          <View style={cropStyles.buttons}>
            <Pressable
              onPress={onCancel}
              disabled={saving}
              style={[cropStyles.btn, { backgroundColor: colors.surfaceRaised }]}
            >
              <Text style={[cropStyles.btnText, { color: colors.textSecondary }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={triggerSave}
              disabled={saving}
              style={[cropStyles.btn, { backgroundColor: colors.primary }]}
            >
              {saving ? (
                <ActivityIndicator size={16} color="#fff" />
              ) : (
                <Text style={[cropStyles.btnText, { color: '#fff' }]}>Guardar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────── */

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

const cropStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    marginTop: -12,
  },
  cropFrame: {
    overflow: 'hidden',
    borderWidth: 2,
  },
  buttons: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  btn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
