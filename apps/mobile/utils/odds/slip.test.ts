import assert from 'node:assert/strict';
import test from 'node:test';
import { legFromRow, pruneLegs, toggleLeg, type SlipLeg } from './slip';

const leg = (ev: string, sel = 'FT.1X2.H', startsAt = '2026-11-16T19:45:00Z'): SlipLeg => ({ eventKey: ev, selectionKey: sel, label: 'x', market: 'm', home: 'A', away: 'B', startsAt, sport: 'FOOTBALL', competition: 'c' });

test('toggle adds, then removes the same selection', () => {
  const a = toggleLeg([], leg('e1')); assert.equal(a.outcome, 'added'); assert.equal(a.legs.length, 1);
  const b = toggleLeg(a.legs, leg('e1')); assert.equal(b.removed, true); assert.equal(b.legs.length, 0);
});
test('a second selection of the same event replaces the first', () => {
  const r = toggleLeg([leg('e1')], leg('e1', 'FT.1X2.A')); assert.equal(r.outcome, 'replaced'); assert.deepEqual(r.legs.map((l) => l.selectionKey), ['FT.1X2.A']);
});
test('the 31st leg is refused', () => {
  const full = Array.from({ length: 30 }, (_, i) => leg(`e${i}`));
  const r = toggleLeg(full, leg('e99')); assert.equal(r.outcome, 'full'); assert.equal(r.legs.length, 30);
});
test('legFromRow refuses null-key rows', () => {
  const view = { eventKey: 'e', sport: 'FOOTBALL' as const, event: { home: 'A', away: 'B', startsAt: 's', competition: 'c', live: false } };
  assert.equal(legFromRow(view, { key: null, label: 'x', market: 'm', prices: {}, best: null, labels: {} }), null);
});
test('prune drops legs that started more than 3 h ago', () => {
  const now = Date.parse('2026-11-16T23:00:00Z');
  assert.deepEqual(pruneLegs([leg('a', 'k', '2026-11-16T19:45:00Z'), leg('b', 'k', '2026-11-16T21:00:00Z')], now).map((l) => l.eventKey), ['b']);
});
