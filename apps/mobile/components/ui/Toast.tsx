import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
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
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
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
              backgroundColor: getToastColor(toast.type, colors),
              borderColor: colors.border,
              opacity,
              bottom: tokens.spacing.xxl,
            },
          ]}
        >
          <Text style={styles.text}>{toast.message}</Text>
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

function getToastColor(type: ToastState['type'], colors: ReturnType<typeof useTheme>['colors']) {
  switch (type) {
    case 'success':
      return colors.primary;
    case 'error':
      return colors.danger;
    case 'info':
    default:
      return colors.surfaceRaised;
  }
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    left: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: 'absolute',
    right: 16,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
