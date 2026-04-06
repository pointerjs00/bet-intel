import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiBaseUrl, releaseBuildUsesLocalOnlyApiUrl } from './runtimeConfig';

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

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
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

    if (!error.response && releaseBuildUsesLocalOnlyApiUrl) {
      return Promise.reject(
        new Error(
          `Esta APK foi construída com um URL de API apenas para emulador (${apiBaseUrl}). `
          + 'Para testar num telemóvel, define EXPO_PUBLIC_RELEASE_API_BASE_URL com o IP local da tua máquina '
          + '(por exemplo http://192.168.x.x:3001/api) ou com uma API pública válida e gera uma nova APK.',
        ),
      );
    }

    const status = error.response?.status;
    const url = originalRequest?.url ?? '';
    const isRefreshRoute = url.includes('/auth/refresh');
    const shouldAttemptRefresh = status === 401 && !originalRequest?._retry && !isRefreshRoute;

    if (__DEV__ && status === 404) {
      console.warn(`[API] 404 Not Found: ${originalRequest?.method?.toUpperCase() ?? 'GET'} ${url}`);
    }

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
