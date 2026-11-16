import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub utils/redis before providerHealth lazily requires it.
const redisPath = require.resolve('../../utils/redis');
let store: Record<string, string> = {};
let broken = false;
require.cache[redisPath] = {
  id: redisPath, filename: redisPath, loaded: true, children: [], paths: [],
  exports: {
    redis: {
      hgetall: async () => ({ 'odds-betano': JSON.stringify({ ok: false }) }),
      get: async (k: string) => { if (broken) throw new Error('down'); return store[k] ?? null; },
    },
  },
} as unknown as NodeModule;

import { getProviderHealth } from './providerHealth';

test('challenge flag is merged into odds-betano', async () => {
  store = { 'betano:challenge': 'captcha' };
  const out = await getProviderHealth();
  assert.deepEqual(out['odds-betano'], { ok: false, challenged: true, reason: 'captcha' });
});

test('no flag leaves the entry untouched; errors never throw', async () => {
  store = {};
  assert.deepEqual((await getProviderHealth())['odds-betano'], { ok: false });
  store = { 'betano:challenge': 'x' }; broken = true;
  assert.deepEqual((await getProviderHealth())['odds-betano'], { ok: false });
});
