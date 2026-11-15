import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCatalogueHash, shouldSkipSeed } from './seedGuard';

test('hash is deterministic', () => {
  const a = { comps: [{ name: 'A', teams: ['x', 'y'] }], markets: ['m'] };
  assert.equal(computeCatalogueHash(a), computeCatalogueHash(JSON.parse(JSON.stringify(a))));
});

test('object key order does not change the hash', () => {
  assert.equal(
    computeCatalogueHash({ a: 1, b: { c: 2, d: 3 } }),
    computeCatalogueHash({ b: { d: 3, c: 2 }, a: 1 }),
  );
});

test('content or array order changes the hash', () => {
  assert.notEqual(computeCatalogueHash({ t: ['x', 'y'] }), computeCatalogueHash({ t: ['y', 'x'] }));
  assert.notEqual(computeCatalogueHash({ t: ['x'] }), computeCatalogueHash({ t: ['x', 'z'] }));
});

test('shouldSkipSeed', () => {
  assert.equal(shouldSkipSeed('h', 'h', false), true);
  assert.equal(shouldSkipSeed('h', 'other', false), false);
  assert.equal(shouldSkipSeed('h', null, false), false);
  assert.equal(shouldSkipSeed('h', undefined, false), false);
  assert.equal(shouldSkipSeed('h', 'h', true), false);
});
