export interface BetanoResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  url: string;
}

export interface BetanoRequest {
  method?: string;
  headers?: ReadonlyArray<readonly [string, string]>;
  body?: string;
}

/** Thrown when the sidecar no longer knows a session id (HTTP 404), e.g. after a sidecar restart. */
export class UnknownSessionError extends Error {
  constructor(message = 'betano-egress: unknown session') {
    super(message);
    this.name = 'UnknownSessionError';
  }
}

/**
 * HTTP surface the session needs. `sid` names a persistent connection and cookie jar on the far
 * side and never reaches Betano. Implementations: the sidecar (real browser TLS) and plain
 * `fetch` (direct mode, tests).
 */
export interface BetanoTransport {
  ping(): Promise<boolean>;
  session(): Promise<string>;
  destroy(sid: string): Promise<void>;
  fetch(sid: string, url: string, req?: BetanoRequest): Promise<BetanoResponse>;
  cookies(sid: string): Promise<Record<string, string>>;
  setCookies(sid: string, cookies: Record<string, string>): Promise<void>;
}

/** Talks to the betano-egress sidecar. `fetchImpl` is injectable for offline tests. */
export function createImpersonateTransport(
  baseUrl: string,
  token: string,
  timeoutMs = 25_000,
  fetchImpl: typeof fetch = fetch,
): BetanoTransport {
  const call = async <T>(path: string, init: RequestInit = {}, sessionScoped = false): Promise<T> => {
    const res = await fetchImpl(baseUrl.replace(/\/$/, '') + path, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', 'x-egress-token': token, ...(init.headers as Record<string, string> | undefined) },
    });
    if (res.status === 404 && sessionScoped) throw new UnknownSessionError(`betano-egress ${path}: unknown session`);
    if (!res.ok) throw new Error(`betano-egress ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    ping: () => call<{ ok: boolean }>('/ping').then((r) => r.ok).catch(() => false),
    session: () => call<{ sid: string }>('/session', { method: 'POST' }).then((r) => r.sid),
    destroy: (sid) => call(`/session/${sid}`, { method: 'DELETE' }).then(() => undefined),
    fetch: (sid, url, req = {}) =>
      call<BetanoResponse>(
        '/fetch',
        { method: 'POST', body: JSON.stringify({ sid, url, method: req.method ?? 'GET', headers: req.headers ?? [], body: req.body }) },
        true,
      ),
    cookies: (sid) => call<{ cookies: Record<string, string> }>(`/cookies/${sid}`, {}, true).then((r) => r.cookies),
    setCookies: (sid, cookies) =>
      call(`/cookies/${sid}`, { method: 'POST', body: JSON.stringify({ cookies }) }, true).then(() => undefined),
  };
}

/** Plain `fetch`, cookies held locally. Same headers; differs only at the TLS layer. */
export function createUndiciTransport(fetchImpl: typeof fetch = fetch): BetanoTransport {
  const jars = new Map<string, Record<string, string>>();
  let next = 0;
  return {
    ping: async () => true,
    session: async () => {
      const sid = `u${++next}`;
      jars.set(sid, {});
      return sid;
    },
    destroy: async (sid) => void jars.delete(sid),
    fetch: async (sid, url, req = {}) => {
      const jar = jars.get(sid) ?? {};
      const headers = new Headers(req.headers as [string, string][] | undefined);
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookie) headers.set('cookie', cookie);
      const res = await fetchImpl(url, {
        method: req.method ?? 'GET',
        headers,
        ...(req.body ? { body: req.body } : {}),
        signal: AbortSignal.timeout(25_000),
      });
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const i = pair!.indexOf('=');
        if (i > 0) jar[pair!.slice(0, i).trim()] = pair!.slice(i + 1).trim();
      }
      jars.set(sid, jar);
      const flat: Record<string, string> = {};
      res.headers.forEach((v, k) => (flat[k] = v));
      return { status: res.status, headers: flat, text: await res.text(), url: res.url };
    },
    cookies: async (sid) => jars.get(sid) ?? {},
    setCookies: async (sid, cookies) => void jars.set(sid, { ...(jars.get(sid) ?? {}), ...cookies }),
  };
}
