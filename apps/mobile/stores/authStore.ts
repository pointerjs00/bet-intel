import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { PublicUser } from '@betintel/shared';
import { apiClient, setAuthStoreBridge } from '../services/apiClient';
import { detachDevicePushToken, resetDevicePushTokenCache } from '../services/notificationService';

const ACCESS_TOKEN_KEY = 'betintel_access_token';
const REFRESH_TOKEN_KEY = 'betintel_refresh_token';
const USER_KEY = 'betintel_user';

// Module-level reentrancy guard — prevents recursive logout loops that occur when
// detachDevicePushToken() fails with 401 → interceptor calls clearSession() → logout() again.
let isLoggingOut = false;

interface AuthStore {
  user: PublicUser | null;
  accessToken: string | null;
  refreshTokenValue: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
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
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  refreshTokenValue: null,
  isAuthenticated: false,
  isHydrating: true,

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
    // Always start unauthenticated on cold launch (app killed and reopened).
    // Tokens are only kept in-memory during an active session; once the app
    // process is terminated, the user must sign in again.
    // Any stale tokens still sitting in SecureStore from a prior session are
    // cleared here so they cannot be accidentally restored.
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
      ]);
    } catch {
      // SecureStore unavailable — ignore
    }
    set({ isHydrating: false });
  },

  async setSession({ user, accessToken, refreshToken }) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);

    set({
      user,
      accessToken,
      refreshTokenValue: refreshToken,
      isAuthenticated: true,
      isHydrating: false,
    });
  },

  updateUser(user) {
    set({ user });
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },
}));

setAuthStoreBridge({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshToken: () => useAuthStore.getState().refreshToken(),
  clearSession: async () => {
    await useAuthStore.getState().logout();
  },
});
