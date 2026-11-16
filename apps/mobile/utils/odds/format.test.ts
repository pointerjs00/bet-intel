import test from 'node:test';
import assert from 'node:assert/strict';
import { bestPrice, formatEuro, formatOdd, housesByOdds, lisbonDay } from './format';
import type { ComparedSelection } from './types';

test('formatOdd / formatEuro', () => { assert.equal(formatOdd(1.9), '1,90'); assert.equal(formatOdd(13.5), '13,50'); assert.equal(formatEuro(84.1), '84,10 €'); });
test('bestPrice skips suspended; null when none', () => {
  const row = { key: 'k', label: 'x', market: 'm', best: 'betano', labels: {}, prices: { betclic: { odds: 3, suspended: true }, betano: { odds: 2, suspended: false } } } as ComparedSelection;
  assert.deepEqual(bestPrice(row), { house: 'betano', odds: 2 });
  assert.equal(bestPrice({ ...row, prices: { betclic: { odds: 3, suspended: true } } }), null);
  assert.deepEqual(housesByOdds(row).map((h) => h.house), ['betano', 'betclic']);
});
test('lisbonDay uses the Lisbon calendar day', () => {
  assert.equal(lisbonDay(0, new Date('2026-07-01T23:30:00Z')), '2026-07-02'); // 00:30 WEST
  assert.equal(lisbonDay(1, new Date('2026-11-16T12:00:00Z')), '2026-11-17');
});
