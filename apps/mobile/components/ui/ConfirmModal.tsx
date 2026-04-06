import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

const PREF_PREFIX = 'betintel:confirm:skip:';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' = red button (default), 'primary' = green */
  confirmVariant?: 'danger' | 'primary';
  /**
   * When provided, shows a "Não mostrar novamente" checkbox and persists the
   * preference in AsyncStorage. On subsequent shows the onConfirm callback is
   * invoked directly without displaying the dialog.
   */
  storageKey?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger',
  storageKey,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors } = useTheme();
  const [isChecking, setIsChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  // Stable ref so the async callback always calls the latest onConfirm without
  // needing to be listed as a useEffect dependency.
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (!visible) {
      setChecked(false);
      return;
    }
    if (!storageKey) {
      setIsChecking(false);
      return;
    }
    setIsChecking(true);
    void AsyncStorage.getItem(PREF_PREFIX + storageKey).then((val) => {
      if (val === 'true') {
        // User previously opted out — fire confirm directly.
        onConfirmRef.current();
        // The parent will set visible=false; isChecking will reset on the next
        // visible=false cycle.
      } else {
        setIsChecking(false);
      }
    });
  }, [visible, storageKey]);

  const handleConfirm = useCallback(async () => {
    if (storageKey && checked) {
      await AsyncStorage.setItem(PREF_PREFIX + storageKey, 'true');
    }
    onConfirm();
  }, [storageKey, checked, onConfirm]);

  // Don't render anything while doing the AsyncStorage look-up, or when hidden.
  if (!visible || isChecking) return null;

  const confirmColor = confirmVariant === 'danger' ? colors.danger : colors.primary;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCancel}>
      {/* Tapping the scrim cancels */}
      <Pressable style={styles.overlay} onPress={onCancel}>
        {/* Inner card — stop propagation so taps inside don't close */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          {storageKey ? (
            <Pressable onPress={() => setChecked((v) => !v)} style={styles.checkRow}>
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: checked ? confirmColor : colors.border,
                    backgroundColor: checked ? confirmColor : 'transparent',
                  },
                ]}
              >
                {checked ? <Ionicons color="#fff" name="checkmark" size={11} /> : null}
              </View>
              <Text style={[styles.checkLabel, { color: colors.textSecondary }]}>
                Não mostrar novamente
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.buttons}>
            <Pressable
              onPress={onCancel}
              style={[
                styles.btn,
                styles.cancelBtn,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.btnText, { color: colors.textPrimary }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleConfirm();
              }}
              style={[styles.btn, { backgroundColor: confirmColor }]}
            >
              <Text style={[styles.btnText, styles.confirmText]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 24,
    width: '100%',
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  message: { fontSize: 15, lineHeight: 22 },
  checkRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingTop: 4 },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  checkLabel: { flex: 1, fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 13,
  },
  cancelBtn: { borderWidth: 1 },
  btnText: { fontSize: 15, fontWeight: '700' },
  confirmText: { color: '#FFFFFF' },
});
