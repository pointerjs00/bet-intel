import test from 'node:test';
import assert from 'node:assert/strict';
import { betConditions } from './betConditions';

test('double chance + over: which part failed', () => {
  const c = betConditions('Dortmund / Empate & Acima de 1,5', 'Borussia Dortmund', 'Eintracht Frankfurt', { home: 1, away: 0 }, true);
  assert.equal(c.length, 2);
  assert.equal(c[0]!.ok, true);
  assert.equal(c[1]!.ok, false);
  assert.equal(c[1]!.detail, 'só 1 golo');
});
test('vence ou empata e mais de 1,5 golos', () => {
  const c = betConditions('Sporting CP vence ou empata e Acima de 1,5 golos', 'RC Lens', 'Sporting CP', { home: 0, away: 2 }, true);
  assert.deepEqual(c.map((x) => x.ok), [true, true]);
});
test('unknown selection gives no conditions', () => {
  assert.deepEqual(betConditions('Marcador: Gyökeres', 'A', 'B', { home: 1, away: 0 }, true), []);
});
