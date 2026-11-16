import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { createJar, type JarStore } from './jar';
import { API_HEADERS, WARM_PATHS, navigationHeaders, ORIGIN } from './profile';
import { UnknownSessionError, type BetanoResponse, type BetanoTransport } from './transport';

/** Minimum age of a warm session before it is rebuilt. */
export const WARM_TTL_MS = 20 * 60_000;
const LOCK_KEY = 'betano:warm';
const LOCK_TTL_S = 60;
export const CHALLENGE_KEY = 'betano:challenge';
const CHALLENGE_TTL_S = 15 * 60;

/** Redis surface the session needs: the jar store plus an atomic `SET key value EX s NX`. */
export interface LockStore extends JarStore {
  set(key: string, value: string, mode: 'EX', seconds: number, nx?: 'NX'): Promise<string | null>;
}

export interface BetanoSessionDeps {
  transport: BetanoTransport;
  redis: LockStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log: { warn: (m: string, meta?: unknown) => void };
}

const CHALLENGE_BODY = [/just a moment/i, /captcha-delivery\.com/i, /_cf_chl_opt/i, /access denied/i];

/** True when the response is a challenge or a rate block rather than content. */
export function isChallenge(res: BetanoResponse): boolean {
  if (res.status === 403 || res.status === 429 || res.status === 451) return true;
  if (/challenge/i.test(res.headers['cf-mitigated'] ?? '')) return true;
  return CHALLENGE_BODY.some((re) => re.test(res.text.slice(0, 4096)));
}

/**
 * One persistent, warmed session against the Betano API.
 *
 * A warm-up walks the home page and a listing with navigation headers, so the cookies Cloudflare
 * mints (`__cf_bm`, `_cfuvid`) land on the same connection, profile and IP the data calls then use.
 * A data call that comes back challenged (or on a session the sidecar forgot) is retried once on a
 * rebuilt session; a second challenge marks the house as challenged and surfaces through health.
 */
export function createBetanoSession(deps: BetanoSessionDeps) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const jar = createJar(deps.redis, now);

  async function markChallenge(why: string): Promise<void> {
    await deps.redis.set(CHALLENGE_KEY, why, 'EX', CHALLENGE_TTL_S).catch(() => undefined);
    deps.log.warn(`[odds] Betano challenge: ${why}`);
  }

  /** Builds a fresh warm session. The warm lock is released in `finally` when this call took it. */
  async function warmUp(): Promise<string> {
    const held = await deps.redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_S, 'NX').catch(() => null);
    const owned = held === 'OK';
    try {
      if (!owned) {
        await sleep(1500);
        // Another caller is warming up: never warm in parallel, just reuse its result or fail.
        const j = await jar.read();
        const challenged = await deps.redis.get(CHALLENGE_KEY).catch(() => null);
        if (challenged) throw new ProviderFormatError(`Betano challenged: ${challenged}`);
        if (j.sid && now() - j.warmedAt < WARM_TTL_MS) return j.sid;
        throw new ProviderFormatError('Betano: warm-up em curso');
      }
      const stale = await jar.read();
      const sid = await deps.transport.session();
      if (Object.keys(stale.cookies).length) await deps.transport.setCookies(sid, stale.cookies);
      let from: string | null = null;
      for (const path of WARM_PATHS) {
        const url = new URL(path, ORIGIN).toString();
        const res = await deps.transport.fetch(sid, url, { headers: navigationHeaders(url, from) });
        // Cookies only: the session is not marked warm until every warm path has passed.
        await jar.merge(await deps.transport.cookies(sid), undefined, { warm: false });
        if (isChallenge(res)) {
          await jar.reset();
          await markChallenge(`warm-up ${path}: HTTP ${res.status}`);
          throw new ProviderFormatError(`Betano warm-up challenged (${res.status})`);
        }
        from = url;
        await sleep(400);
      }
      await jar.merge(await deps.transport.cookies(sid), sid);
      await deps.redis.del(CHALLENGE_KEY).catch(() => undefined);
      return sid;
    } finally {
      if (owned) await deps.redis.del(LOCK_KEY).catch(() => undefined);
    }
  }

  async function context(): Promise<string> {
    const j = await jar.read();
    if (j.sid && now() - j.warmedAt < WARM_TTL_MS) return j.sid;
    return warmUp();
  }

  /** Data call on the warm session; retries once on a challenge or an unknown sidecar session. */
  async function request(
    url: string,
    init: { method?: string; headers?: ReadonlyArray<readonly [string, string]>; body?: string } = {},
  ): Promise<BetanoResponse> {
    // Fail fast while challenged: no network call until the flag expires or the solve script clears it.
    const challenged = await deps.redis.get(CHALLENGE_KEY).catch(() => null);
    if (challenged) throw new ProviderFormatError(`Betano challenged: ${challenged}`);
    for (let attempt = 0; attempt < 2; attempt++) {
      const sid = await context();
      let res: BetanoResponse;
      try {
        res = await deps.transport.fetch(sid, url, { ...init, headers: init.headers ?? API_HEADERS });
      } catch (err) {
        if (!(err instanceof UnknownSessionError)) throw err;
        await jar.reset();
        if (attempt === 0) continue;
        throw new ProviderFormatError(`Betano session lost on ${url}`);
      }
      if (!isChallenge(res)) return res;
      await jar.reset();
      if (attempt === 0) continue;
      await markChallenge(`${url}: HTTP ${res.status}`);
      throw new ProviderFormatError(`Betano blocked (${res.status}) on ${url}`);
    }
    throw new ProviderFormatError(`Betano blocked on ${url}`);
  }

  return { request, warmUp, jar };
}

export type BetanoSession = ReturnType<typeof createBetanoSession>;
