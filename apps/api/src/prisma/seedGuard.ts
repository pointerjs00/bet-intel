import { createHash } from 'crypto';

/** Redis key holding the hash of the catalogue that was last seeded successfully. */
export const SEED_HASH_KEY = 'seed:catalogue-hash';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value === undefined ? null : value;
}

/**
 * SHA-256 of a JSON-serialisable catalogue. Object key order does not affect the hash;
 * array order does (it is part of the catalogue).
 */
export function computeCatalogueHash(catalogue: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(catalogue))).digest('hex');
}

/** True when the seed can be skipped: not forced and the stored hash equals the current one. */
export function shouldSkipSeed(currentHash: string, storedHash: string | null | undefined, force: boolean): boolean {
  if (force) return false;
  return !!storedHash && storedHash === currentHash;
}
