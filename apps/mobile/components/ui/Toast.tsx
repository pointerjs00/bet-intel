import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastState['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, tokens } = useTheme();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [opacity] = useState(new Animated.Value(0));

  const showToast = useCallback((message: string, type: ToastState['type'] = 'info') => {
    setToast({ message, type });
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: getToastAccentColor(toast.type, colors),
              opacity,
              bottom: tokens.spacing.xxl,
            },
          ]}
        >
          <View style={styles.row}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: getToastAccentBackground(toast.type, colors) },
              ]}
            >
              <Ionicons
                color={getToastAccentColor(toast.type, colors)}
                name={getToastIconName(toast.type)}
                size={16}
              />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{getToastLabel(toast.type)}</Text>
              <Text style={[styles.text, { color: colors.textPrimary }]}>{toast.message}</Text>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}

function getToastAccentColor(type: ToastState['type'], colors: ReturnType<typeof useTheme>['colors']) {
  switch (type) {
    case 'success':
      return colors.primary;
    case 'error':
      return colors.danger;
    case 'info':
    default:
      return colors.info;
  }
}

function getToastAccentBackground(type: ToastState['type'], colors: ReturnType<typeof useTheme>['colors']) {
  const accent = getToastAccentColor(type, colors);
  return `${accent}1F`;
}

function getToastIconName(type: ToastState['type']): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'success':
      return 'checkmark-circle';
    case 'error':
      return 'alert-circle';
    case 'info':
    default:
      return 'information-circle';
  }
}

function getToastLabel(type: ToastState['type']) {
  switch (type) {
    case 'success':
      return 'Sucesso';
    case 'error':
      return 'Erro';
    case 'info':
    default:
      return 'Aviso';
  }
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    borderLeftWidth: 4,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 10,
    left: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'absolute',
    right: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
