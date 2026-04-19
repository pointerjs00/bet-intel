import { apiBaseUrl, isLocalOnlyApiBaseUrl, socketBaseUrl } from '../services/runtimeConfig';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildApiOrigin(): string {
  return stripTrailingSlash(socketBaseUrl || apiBaseUrl.replace(/\/api\/?$/, ''));
}

/**
 * Resolves user-uploaded media URLs against the currently configured API host.
 * This repairs legacy avatar URLs stored with localhost/10.0.2.2 origins and
 * also supports relative upload paths returned by the API.
 */
export function resolveMediaUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed) {
    return null;
  }

  const apiOrigin = buildApiOrigin();

  if (trimmed.startsWith('/')) {
    return `${apiOrigin}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (isLocalOnlyApiBaseUrl(parsed.origin)) {
      return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}