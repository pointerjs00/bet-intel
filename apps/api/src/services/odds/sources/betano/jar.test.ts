import test from 'node:test';
import assert from 'node:assert/strict';
import { createJar, type JarStore } from './jar';

function memStore(): JarStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    del: async (k) => void data.delete(k),
  };
}

test('merge keeps prior cookies, overrides, and sets warmedAt', async () => {
  const jar = createJar(memStore(), () => 1234);
  await jar.merge({ a: '1', b: '2' }, 'sid1');
  const next = await jar.merge({ b: '3' });
  assert.deepEqual(next, { sid: 'sid1', cookies: { a: '1', b: '3' }, warmedAt: 1234 });
  assert.deepEqual(await jar.read(), next);
});

test('reset keeps only long-lived cookies and clears sid', async () => {
  const jar = createJar(memStore(), () => 5);
  await jar.merge({ cf_clearance: 'x', datadome: 'y', __cf_bm: 'z', random: 'q' }, 'sid1');
  const r = await jar.reset();
  assert.deepEqual(r, { sid: null, cookies: { cf_clearance: 'x', datadome: 'y' }, warmedAt: 0 });
});

test('missing or corrupt JSON reads as empty jar; clear deletes', async () => {
  const store = memStore();
  const jar = createJar(store);
  assert.deepEqual(await jar.read(), { sid: null, cookies: {}, warmedAt: 0 });
  store.data.set('betano:jar', '{not json');
  assert.deepEqual(await jar.read(), { sid: null, cookies: {}, warmedAt: 0 });
  await jar.clear();
  assert.equal(store.data.size, 0);
});
