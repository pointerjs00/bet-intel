import test from 'node:test';
import assert from 'node:assert/strict';
import { runOddsCatalogue, ODDS_SPORTS, type CatalogueRunnerDeps } from './catalogueRunner';
import type { OddsSource } from './types';

const src = (house: string) => ({ house } as unknown as OddsSource);

function make(overrides: Partial<CatalogueRunnerDeps> = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const released: string[] = [];
  const caches = new Set<unknown>();
  const deps: CatalogueRunnerDeps = {
    sources: [src('betclic'), src('placard')],
    refresh: async (s, sport, cache) => { calls.push(`${s.house}:${sport}`); caches.add(cache); return 1; },
    acquire: async () => true,
    release: async (h) => { released.push(h); },
    sleep: async (ms) => { sleeps.push(ms); },
    newCache: () => ({}) as never,
    log: { warn: () => {}, error: () => {}, debug: () => {} },
    ...overrides,
  };
  return { deps, calls, sleeps, released, caches };
}

test('runs every sport of every source with one shared cache and pauses between sports', async () => {
  const { deps, calls, sleeps, released, caches } = make();
  await runOddsCatalogue(deps);
  assert.equal(calls.length, 2 * ODDS_SPORTS.length);
  assert.deepEqual(calls.slice(0, 3), ODDS_SPORTS.map((s) => `betclic:${s}`));
  assert.equal(caches.size, 1);
  assert.deepEqual(sleeps, Array(2 * (ODDS_SPORTS.length - 1)).fill(2000));
  assert.deepEqual(released, ['betclic', 'placard']);
});

test('a failing sport or house does not stop the rest', async () => {
  const seen: string[] = [];
  const { deps } = make({
    refresh: async (s, sport) => {
      seen.push(`${s.house}:${sport}`);
      if (s.house === 'betclic' && sport === 'FOOTBALL') throw new Error('403');
      return 1;
    },
  });
  await runOddsCatalogue(deps);
  assert.equal(seen.length, 2 * ODDS_SPORTS.length);
});

test('skips a house whose lock is held and releases only what it took', async () => {
  const { deps, calls, released } = make({ acquire: async (h) => h !== 'betclic' });
  await runOddsCatalogue(deps);
  assert.ok(calls.every((c) => c.startsWith('placard:')));
  assert.deepEqual(released, ['placard']);
});

test('releases the lock even when every sport fails', async () => {
  const { deps, released } = make({ refresh: async () => { throw new Error('x'); } });
  await runOddsCatalogue(deps);
  assert.deepEqual(released, ['betclic', 'placard']);
});
