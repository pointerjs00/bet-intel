import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvent, compareMultiple } from './compare';
import type { CanonicalSelection, HouseId } from './types';

function sel(house: HouseId, key: string | null, odds: number, suspended = false): CanonicalSelection {
  return { key, house, marketLabel: 'm', selectionLabel: `${house}-${key}`, odds, suspended };
}

const ok = (odds: number) => ({ odds, suspended: false });

test('mergeEvent joins the same key across two houses', () => {
  const out = mergeEvent({
    betano: [sel('betano', 'FT.1X2.H', 2.1)],
    betclic: [sel('betclic', 'FT.1X2.H', 2.0)],
  });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].prices, { betclic: ok(2.0), betano: ok(2.1) });
  assert.equal(out[0].label, 'betclic-FT.1X2.H');
});

test('mergeEvent picks the best non-suspended price', () => {
  const out = mergeEvent({
    betclic: [sel('betclic', 'k', 2.0)],
    betano: [sel('betano', 'k', 2.5)],
    placard: [sel('placard', 'k', 3.0, true)],
  });
  assert.equal(out[0].best, 'betano');
  assert.equal(out[0].prices.placard?.suspended, true);
});

test('mergeEvent best is null when all are suspended', () => {
  const out = mergeEvent({ betclic: [sel('betclic', 'k', 2.0, true)] });
  assert.equal(out[0].best, null);
});

test('mergeEvent tie follows house order betclic, betano, lebull, placard, solverde, bwin, casinoportugal, goldenpark, retabet', () => {
  const out = mergeEvent({
    solverde: [sel('solverde', 'k', 2.0)],
    placard: [sel('placard', 'k', 2.0)],
    betano: [sel('betano', 'k', 2.0)],
  });
  assert.equal(out[0].best, 'betano');
  assert.equal(out[0].label, 'betano-k');
  const out2 = mergeEvent({ lebull: [sel('lebull', 'k', 1.5)], betclic: [sel('betclic', 'k', 1.5)] });
  assert.equal(out2[0].best, 'betclic');
  const out3 = mergeEvent({ betano: [sel('betano', 'k', 1.5)], lebull: [sel('lebull', 'k', 1.5)] });
  assert.equal(out3[0].best, 'betano');
  const out4 = mergeEvent({ goldenpark: [sel('goldenpark', 'k', 1.5)], bwin: [sel('bwin', 'k', 1.5)] });
  assert.equal(out4[0].best, 'bwin');
  const out5 = mergeEvent({ goldenpark: [sel('goldenpark', 'k', 1.5)], solverde: [sel('solverde', 'k', 1.5)] });
  assert.equal(out5[0].best, 'solverde');
  const out6 = mergeEvent({ goldenpark: [sel('goldenpark', 'k', 1.5)], casinoportugal: [sel('casinoportugal', 'k', 1.5)] });
  assert.equal(out6[0].best, 'casinoportugal');
  const out7 = mergeEvent({ casinoportugal: [sel('casinoportugal', 'k', 1.5)], bwin: [sel('bwin', 'k', 1.5)] });
  assert.equal(out7[0].best, 'bwin');
  const out8 = mergeEvent({ retabet: [sel('retabet', 'k', 1.5)], goldenpark: [sel('goldenpark', 'k', 1.5)] });
  assert.equal(out8[0].best, 'goldenpark');
});

test('mergeEvent keeps null-key selections as one row per house', () => {
  const out = mergeEvent({
    betclic: [sel('betclic', null, 2.0)],
    betano: [sel('betano', null, 2.0)],
  });
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.key === null && Object.keys(r.prices).length === 1));
});

test('compareMultiple multiplies and rounds to 2 decimals', () => {
  const r = compareMultiple([
    { betclic: ok(1.1), betano: ok(1.2) },
    { betclic: ok(1.1), betano: ok(1.3) },
    { betclic: ok(1.1), betano: ok(1.5) },
  ]);
  assert.deepEqual(r.perHouse.betclic, { total: 1.33, missing: 0 }); // 1.331
  assert.deepEqual(r.perHouse.betano, { total: 2.34, missing: 0 }); // 2.34
  assert.equal(r.best, 'betano');
});

test('compareMultiple rounds half up without float drift', () => {
  const r = compareMultiple([{ betclic: ok(1.05) }, { betclic: ok(1.05) }]);
  assert.equal(r.perHouse.betclic?.total, 1.1); // 1.1025
  const r2 = compareMultiple([{ betclic: ok(1.5) }, { betclic: ok(1.01) }, { betclic: ok(1.01) }]);
  assert.equal(r2.perHouse.betclic?.total, 1.53); // 1.530150
  const r3 = compareMultiple([{ betclic: ok(1.25) }, { betclic: ok(1.1) }]);
  assert.equal(r3.perHouse.betclic?.total, 1.38); // 1.375 exactly -> half up
});

test('compareMultiple: missing leg gives null total and a count', () => {
  const r = compareMultiple([
    { betclic: ok(2), betano: ok(2) },
    { betclic: ok(2) },
    { betclic: ok(2) },
  ]);
  assert.deepEqual(r.perHouse.betano, { total: null, missing: 2 });
  assert.deepEqual(r.perHouse.betclic, { total: 8, missing: 0 });
  assert.equal(r.best, 'betclic');
});

test('compareMultiple: suspended leg gives null total; best null if none complete; tie by order', () => {
  const r = compareMultiple([{ betclic: { odds: 2, suspended: true } }]);
  assert.equal(r.perHouse.betclic?.total, null);
  assert.equal(r.best, null);
  const t = compareMultiple([{ placard: ok(2), lebull: ok(2) }]);
  assert.equal(t.best, 'lebull');
});

test('mergeEvent keeps each house original market/selection text and the row market', () => {
  const a: CanonicalSelection = { key: 'FT.1X2.H', house: 'betclic', marketLabel: 'Resultado (Tempo Regulamentar)', selectionLabel: 'Alemanha', odds: 1.84, suspended: false };
  const b: CanonicalSelection = { key: 'FT.1X2.H', house: 'betano', marketLabel: 'Resultado Final', selectionLabel: '1', odds: 1.9, suspended: false };
  const [row] = mergeEvent({ betano: [b], betclic: [a] });
  assert.equal(row!.market, 'Resultado (Tempo Regulamentar)');
  assert.deepEqual(row!.labels, {
    betclic: { market: 'Resultado (Tempo Regulamentar)', selection: 'Alemanha' },
    betano: { market: 'Resultado Final', selection: '1' },
  });
});
test('mergeEvent null-key rows carry their own market and labels', () => {
  const [row] = mergeEvent({ betano: [{ key: null, house: 'betano', marketLabel: '+2 Golos Vantagem', selectionLabel: 'Alemanha', odds: 1.8, suspended: false }] });
  assert.equal(row!.market, '+2 Golos Vantagem');
  assert.deepEqual(row!.labels, { betano: { market: '+2 Golos Vantagem', selection: 'Alemanha' } });
});
