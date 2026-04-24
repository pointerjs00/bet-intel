import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { PublicUser } from '@betintel/shared';
import { apiClient, setAuthStoreBridge } from '../services/apiClient';
import { detachDevicePushToken, resetDevicePushTokenCache } from '../services/notificationService';

const ACCESS_TOKEN_KEY = 'betintel_access_token';
const REFRESH_TOKEN_KEY = 'betintel_refresh_token';
const USER_KEY = 'betintel_user';
const BIOMETRIC_ENABLED_KEY = 'betintel_biometric_enabled';

// Module-level reentrancy guard — prevents recursive logout loops that occur when
// detachDevicePushToken() fails with 401 → interceptor calls clearSession() → logout() again.
let isLoggingOut = false;

interface AuthStore {
  user: PublicUser | null;
  accessToken: string | null;
  refreshTokenValue: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  /** Whether biometric login is enabled for cold-launch unlock. */
  biometricEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearLocalSession: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  hydrate: () => Promise<void>;
  setSession: (payload: {
    user: PublicUser;
    accessToken: string;
    refreshToken: string;
  }) => Promise<void>;
  /** Updates the in-memory user after account linking/unlinking/set-password. */
  updateUser: (user: PublicUser) => void;
  /**
   * Fetches the authenticated user from /api/users/me and updates the store.
   * Used to recover user data when it is missing from SecureStore after a
   * biometric session restore.
   */
  refreshUser: () => Promise<void>;
  /**
   * Prompts biometric authentication and, on success, restores the session that
   * was kept in SecureStore after a cancelled biometric prompt at app open.
   * Returns true if the session was successfully restored.
   */
  loginWithBiometric: () => Promise<boolean>;
  /**
   * Prompts biometric authentication to confirm identity, then stores the
   * biometric-enabled flag in SecureStore so future cold launches use it.
   * Returns true if biometric was successfully enrolled.
   */
  enableBiometric: () => Promise<boolean>;
  /** Disables biometric login and removes the flag from SecureStore. */
  disableBiometric: () => Promise<void>;
  /**
   * Logs out the user. Biometric preference is always preserved so the user
   * doesn't have to re-enable it after signing back in.
   */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  refreshTokenValue: null,
  isAuthenticated: false,
  isHydrating: true,
  biometricEnabled: false,

  async login(email, password) {
    const response = await apiClient.post('/auth/login', { email, password });
    const { user, accessToken, refreshToken } = response.data.data as {
      user: PublicUser;
      accessToken: string;
      refreshToken: string;
    };
    await get().setSession({ user, accessToken, refreshToken });
  },

  async logout() {
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
      const refreshToken = get().refreshTokenValue;
      try {
        await detachDevicePushToken();

        if (refreshToken) {
          await apiClient.post('/auth/logout', { refreshToken });
        }
      } catch {
        // Best-effort logout — clear local state even if server call fails
      }

      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      // Biometric preference intentionally preserved across all logouts so the
      // user doesn't have to re-enable it every time they sign back in.

      set({
        user: null,
        accessToken: null,
        refreshTokenValue: null,
        isAuthenticated: false,
        isHydrating: false,
      });

      resetDevicePushTokenCache();
    } finally {
      isLoggingOut = false;
    }
  },

  /** Clears local auth state and SecureStore without making any API calls.
   * Use before Google new-user onboarding to prevent stale sessions from
   * interfering with AuthGate routing or push-token sync loops. */
  async clearLocalSession() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    resetDevicePushTokenCache();
    set({
      user: null,
      accessToken: null,
      refreshTokenValue: null,
      isAuthenticated: false,
      isHydrating: false,
    });
  },

  async refreshToken() {
    const currentRefreshToken = get().refreshTokenValue;
    if (!currentRefreshToken) {
      return null;
    }

    try {
      const response = await apiClient.post('/auth/refresh', {
        refreshToken: currentRefreshToken,
      });
      const { accessToken, refreshToken } = response.data.data as {
        accessToken: string;
        refreshToken: string;
      };

      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);

      set({ accessToken, refreshTokenValue: refreshToken, isAuthenticated: true });
      return accessToken;
    } catch {
      await get().logout();
      return null;
    }
  },

  async hydrate() {
    // Show the login screen immediately — do NOT wait for SecureStore.
    // On some Android devices the first-time Keystore initialisation used by
    // expo-secure-store v13 blocks the JS thread indefinitely.
    // Session restoration and biometric prompt continue in the background.
    set({ isHydrating: false });

    try {
      const [accessToken, refreshTokenValue, userJson, biometricFlag] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
        SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY),
      ]);

      const biometricEnabled = biometricFlag === 'true';

      if (biometricEnabled && refreshTokenValue) {
        const { success } = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Entrar no BetIntel',
          cancelLabel: 'Usar password',
          disableDeviceFallback: false,
        });

        if (success) {
          const user: PublicUser | null = userJson ? (JSON.parse(userJson) as PublicUser) : null;
          set({
            user,
            accessToken,
            refreshTokenValue,
            isAuthenticated: true,
            biometricEnabled: true,
          });
          return;
        }

        set({ biometricEnabled: true, refreshTokenValue, accessToken });
        return;
      }

      // Guard: if the user already logged in while SecureStore was loading,
      // do not wipe their freshly-written tokens.
      if (!get().isAuthenticated) {
        await Promise.all([
          SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
          SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
          SecureStore.deleteItemAsync(USER_KEY),
        ]);
        set({ biometricEnabled });
      }
    } catch {
      // Silently ignore — user logs in fresh via the login screen.
    }
  },

  /**
   * Prompts biometric authentication and, on success, restores the session that
   * was kept in SecureStore after a cancelled biometric prompt at app open.
   * Returns true if the session was successfully restored.
   */
  async loginWithBiometric() {
    try {
      const [accessToken, refreshTokenValue, userJson] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (!refreshTokenValue) return false;

      const { success } = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entrar no BetIntel',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (success) {
        const user: PublicUser | null = userJson ? (JSON.parse(userJson) as PublicUser) : null;
        set({ user, accessToken, refreshTokenValue, isAuthenticated: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  async enableBiometric() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return false;

    const { success } = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirmar para activar login biométrico',
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
    });

    if (success) {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
      set({ biometricEnabled: true });
      return true;
    }
    return false;
  },

  async disableBiometric() {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    set({ biometricEnabled: false });
  },

  async setSession({ user, accessToken, refreshToken }) {
    // Update auth state immediately so API interceptors have a valid token
    // before any queued requests fire. SecureStore writes are slow on some
    // Android devices (same Keystore init issue as hydrate) — do them after.
    set({
      user,
      accessToken,
      refreshTokenValue: refreshToken,
      isAuthenticated: true,
      isHydrating: false,
    });

    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]).catch(() => {
      // SecureStore failure is non-fatal — session remains in memory for this launch.
    });
  },

  updateUser(user) {
    set({ user });
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  async refreshUser() {
    try {
      const response = await apiClient.get('/users/me');
      const user = response.data.data as PublicUser;
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      set({ user });
    } catch {
      // Silently fail — user stays null until next explicit login
    }
  },
}));

setAuthStoreBridge({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshToken: () => useAuthStore.getState().refreshToken(),
  clearSession: async () => {
    await useAuthStore.getState().logout();
  },
});
