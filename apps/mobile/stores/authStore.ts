import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { PublicUser } from '@betintel/shared';
import { apiClient, setAuthStoreBridge } from '../services/apiClient';
import { detachDevicePushToken, resetDevicePushTokenCache } from '../services/notificationService';

const ACCESS_TOKEN_KEY = 'betintel_access_token';
const REFRESH_TOKEN_KEY = 'betintel_refresh_token';

interface AuthStore {
  user: PublicUser | null;
  accessToken: string | null;
  refreshTokenValue: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  hydrate: () => Promise<void>;
  setSession: (payload: {
    user: PublicUser;
    accessToken: string;
    refreshToken: string;
  }) => Promise<void>;
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

    set({
      user: null,
      accessToken: null,
      refreshTokenValue: null,
      isAuthenticated: false,
      isHydrating: false,
    });

    resetDevicePushTokenCache();
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
    const [accessToken, refreshTokenValue] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);

    set({
      accessToken,
      refreshTokenValue,
      isAuthenticated: Boolean(accessToken),
      isHydrating: false,
    });
  },

  async setSession({ user, accessToken, refreshToken }) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);

    set({
      user,
      accessToken,
      refreshTokenValue: refreshToken,
      isAuthenticated: true,
      isHydrating: false,
    });
  },
}));

setAuthStoreBridge({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshToken: () => useAuthStore.getState().refreshToken(),
  clearSession: async () => {
    await useAuthStore.getState().logout();
  },
});
