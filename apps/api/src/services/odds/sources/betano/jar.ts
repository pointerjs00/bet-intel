/**
 * Cookie jar for the Betano session, in Redis.
 *
 * `cf_clearance`, `datadome`, `sticky_sb` and `_cfuvid` are long-lived and expensive to replace:
 * they survive a reset and are replayed into every new sidecar session. `__cf_bm` is short-lived and
 * simply refreshed.
 */
const KEY = 'betano:jar';
const TTL_S = 12 * 3600;
const LONG_LIVED = new Set(['cf_clearance', 'datadome', 'sticky_sb', '_cfuvid', 'sb_landing']);

/** Minimal Redis surface the jar needs (ioredis satisfies it). */
export interface JarStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** Persisted session state. */
export interface Jar {
  sid: string | null;
  cookies: Record<string, string>;
  warmedAt: number;
}

/** Redis-backed cookie jar; `now` is injectable for tests. */
export function createJar(client: JarStore, now: () => number = Date.now) {
  const read = async (): Promise<Jar> => {
    const raw = await client.get(KEY).catch(() => null);
    if (!raw) return { sid: null, cookies: {}, warmedAt: 0 };
    try {
      const j = JSON.parse(raw) as Partial<Jar>;
      return { sid: j.sid ?? null, cookies: j.cookies ?? {}, warmedAt: j.warmedAt ?? 0 };
    } catch {
      return { sid: null, cookies: {}, warmedAt: 0 };
    }
  };
  return {
    read,
    /** Merges cookies; stamps `warmedAt` unless `opts.warm === false` (cookies-only write, sid and warmedAt untouched). */
    async merge(cookies: Record<string, string>, sid?: string | null, opts: { warm?: boolean } = {}): Promise<Jar> {
      const j = await read();
      const warm = opts.warm !== false;
      const next: Jar = {
        sid: warm && sid !== undefined ? sid : j.sid,
        cookies: { ...j.cookies, ...cookies },
        warmedAt: warm ? now() : j.warmedAt,
      };
      await client.set(KEY, JSON.stringify(next), 'EX', TTL_S);
      return next;
    },
    async reset(): Promise<Jar> {
      const j = await read();
      const kept = Object.fromEntries(Object.entries(j.cookies).filter(([k]) => LONG_LIVED.has(k)));
      const next: Jar = { sid: null, cookies: kept, warmedAt: 0 };
      await client.set(KEY, JSON.stringify(next), 'EX', TTL_S);
      return next;
    },
    clear: () => client.del(KEY),
  };
}
