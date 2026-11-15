import type { OddsRedis } from './store';

/** In-memory OddsRedis for tests only (no expiry clock; records the TTL set per key). */
export interface FakeRedis extends OddsRedis {
  ttlOf(key: string): number | undefined;
}

/** Creates a tiny in-memory fake of the Redis subset used by the odds store. Test support only. */
export function createFakeRedis(): FakeRedis {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const ttls = new Map<string, number>();
  return {
    async get(key) {
      return strings.get(key) ?? null;
    },
    async set(key, value, _mode, seconds) {
      strings.set(key, value);
      ttls.set(key, seconds);
      return 'OK';
    },
    async hset(key, field, value) {
      const h = hashes.get(key) ?? {};
      h[field] = value;
      hashes.set(key, h);
      return 1;
    },
    async hgetall(key) {
      return { ...(hashes.get(key) ?? {}) };
    },
    async expire(key, seconds) {
      ttls.set(key, seconds);
      return 1;
    },
    ttlOf(key) {
      return ttls.get(key);
    },
  };
}
