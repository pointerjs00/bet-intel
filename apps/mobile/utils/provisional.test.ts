import test from 'node:test';
import assert from 'node:assert/strict';
import { provisional } from './provisional';

test('multiple: one leg losing live → lose', () => {
  const p = provisional([{ id: 'a', result: 'WON', odd: 1.3 }, { id: 'b', result: 'PENDING', odd: 1.41 }, { id: 'c', result: 'PENDING', odd: 1.2 }], 10, false, new Map([['c', 'a perder' as const]]));
  assert.equal(p?.state, 'lose');
  assert.equal(p?.profit, -10);
});
test('all holding → win with the profit', () => {
  const p = provisional([{ id: 'a', result: 'WON', odd: 2 }, { id: 'b', result: 'PENDING', odd: 1.5 }], 10, false, new Map([['b', 'a ganhar' as const]]));
  assert.equal(p?.state, 'win');
  assert.equal(Math.round(p!.profit * 100) / 100, 20);
});
test('no live selection → null', () => {
  assert.equal(provisional([{ id: 'a', result: 'PENDING', odd: 2 }], 10, false, new Map()), null);
});
