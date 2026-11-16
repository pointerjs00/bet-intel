import test from 'node:test';
import assert from 'node:assert/strict';
import { competitionsByCount, lisbonTime, mainCaption, orderMain } from './list';
import type { ComparedSelection } from './types';

const row = (key: string | null, label = 'x'): ComparedSelection => ({ key, label, market: '', prices: {}, best: null, labels: {} });
const ev = (competition: string) => ({ event: { home: 'A', away: 'B', startsAt: '', competition, live: false } });

test('competitions ordered by count desc', () => {
  assert.deepEqual(competitionsByCount([ev('X'), ev('Y'), ev('Y'), ev('Z'), ev('Y'), ev('X')]), ['Y', 'X', 'Z']);
});

test('captions and order', () => {
  const it = ev('c');
  assert.equal(mainCaption(it, row('FT.1X2.D')), 'Empate');
  assert.equal(mainCaption(it, row('T.WIN.B')), 'B');
  assert.equal(mainCaption(it, row('B.ML.H')), 'A');
  assert.equal(mainCaption(it, row('Q', 'lbl')), 'lbl');
  assert.deepEqual(orderMain([row('FT.1X2.A'), row('FT.1X2.H'), row('FT.1X2.D')]).map((r) => r.key), ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A']);
});

test('lisbon time', () => {
  assert.equal(lisbonTime('2026-07-01T19:30:00Z'), '20:30');
  assert.equal(lisbonTime('2026-12-01T19:30:00Z'), '19:30');
});
