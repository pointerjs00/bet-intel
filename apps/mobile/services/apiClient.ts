import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';

interface AuthStoreBridge {
  getAccessToken: () => string | null;
  refreshToken: () => Promise<string | null>;
  clearSession: () => Promise<void>;
}

let authStoreBridge: AuthStoreBridge | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAuthStoreBridge(bridge: AuthStoreBridge): void {
  authStoreBridge = bridge;
}

const expoExtra = Constants.expoConfig?.extra as {
  apiBaseUrl?: string;
} | undefined;

const baseURL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  expoExtra?.apiBaseUrl ??
  'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStoreBridge?.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const status = error.response?.status;
    const url = originalRequest?.url ?? '';
    const isRefreshRoute = url.includes('/auth/refresh');
    const shouldAttemptRefresh = status === 401 && !originalRequest?._retry && !isRefreshRoute;

    if (!shouldAttemptRefresh || !authStoreBridge) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!refreshPromise) {
      refreshPromise = authStoreBridge.refreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const nextAccessToken = await refreshPromise;
    if (!nextAccessToken) {
      await authStoreBridge.clearSession();
      return Promise.reject(error);
    }

    originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
    return apiClient(originalRequest);
  },
);
