import { Platform } from 'react-native';
import Constants from 'expo-constants';

interface ExpoExtraConfig {
  apiBaseUrl?: string;
  releaseApiBaseUrl?: string;
}

const expoExtra = Constants.expoConfig?.extra as ExpoExtraConfig | undefined;

const DEV_DEFAULT_API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';

// Hardcoded production URL — used as the final fallback in release builds when
// env vars are not inlined by Metro (e.g. local Gradle builds outside EAS).
const PRODUCTION_API_BASE_URL = 'https://betintel-api.stream-intel.online/api';

function normalizeApiBaseUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}

export function isLocalOnlyApiBaseUrl(url?: string | null): boolean {
  const normalized = normalizeApiBaseUrl(url);
  if (!normalized) {
    return false;
  }

  try {
    const { hostname } = new URL(normalized);
    return hostname === '10.0.2.2' || hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function resolveConfiguredApiBaseUrl(): string {
  const devApiBaseUrl = normalizeApiBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL ?? expoExtra?.apiBaseUrl,
  );
  const releaseApiBaseUrl = normalizeApiBaseUrl(
    process.env.EXPO_PUBLIC_RELEASE_API_BASE_URL ?? expoExtra?.releaseApiBaseUrl,
  );

  if (__DEV__) {
    return devApiBaseUrl ?? DEV_DEFAULT_API_BASE_URL;
  }

  if (devApiBaseUrl && !isLocalOnlyApiBaseUrl(devApiBaseUrl)) {
    return devApiBaseUrl;
  }

  return releaseApiBaseUrl ?? PRODUCTION_API_BASE_URL;
}

export const apiBaseUrl = resolveConfiguredApiBaseUrl();
export const socketBaseUrl = apiBaseUrl.replace(/\/api\/?$/, '');
export const releaseBuildUsesLocalOnlyApiUrl = !__DEV__ && isLocalOnlyApiBaseUrl(apiBaseUrl);
