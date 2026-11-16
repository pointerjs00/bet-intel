import test from 'node:test';
import assert from 'node:assert/strict';
import { toBuilderItems, oddsChanged, needsReplaceConfirm, slipMatchesSaved, lockedHouse } from './register';
import type { ComparedSelection, OddsEventView } from './types';

const view = (rows: ComparedSelection[]): OddsEventView => ({ eventKey: 'e1', sport: 'TENNIS', event: { home: 'Sinner', away: 'Alcaraz', startsAt: '2026-11-16T19:00:00Z', competition: 'ATP', live: false }, houses: ['betclic', 'betano'], rows });
const win: ComparedSelection = { key: 'T.WIN.A', label: 'Sinner', market: 'Vencedor', best: 'betano',
  prices: { betclic: { odds: 1.8, suspended: false }, betano: { odds: 1.85, suspended: false } },
  labels: { betclic: { market: 'Vencedor do encontro', selection: 'Sinner' }, betano: { market: 'Vencedor', selection: 'J. Sinner' } } };
const leg = { eventKey: 'e1', selectionKey: 'T.WIN.A', label: 'Sinner', market: 'Vencedor', home: 'Sinner', away: 'Alcaraz', startsAt: '2026-11-16T19:00:00Z', sport: 'TENNIS' as const, competition: 'ATP' };
test('toBuilderItems uses the chosen house text and odds', () => {
  const { items, missing } = toBuilderItems([leg], 'betano', new Map([['e1', view([win])]]));
  assert.equal(missing.length, 0);
  assert.equal(items[0]!.market, 'Vencedor'); assert.equal(items[0]!.selection, 'J. Sinner'); assert.equal(items[0]!.oddValue, 1.85);
  assert.equal(items[0]!.sport, 'TENNIS'); assert.equal(items[0]!.eventDate, '2026-11-16T19:00:00Z');
  assert.equal(items[0]!.id, 'e1|T.WIN.A|betano');
});
test('toBuilderItems uses the chosen house participant names, falling back to the event', () => {
  const named: OddsEventView = { ...view([win]), names: { betano: { home: 'J. Sinner', away: 'C. Alcaraz' }, betclic: { home: 'Jannik Sinner', away: 'Carlos Alcaraz' } } };
  const at = (h: 'betano' | 'betclic', v: OddsEventView) => toBuilderItems([leg], h, new Map([['e1', v]])).items[0]!;
  assert.equal(at('betano', named).homeTeam, 'J. Sinner'); assert.equal(at('betano', named).awayTeam, 'C. Alcaraz');
  assert.equal(at('betclic', named).homeTeam, 'Jannik Sinner');
  const partial: OddsEventView = { ...view([win]), names: { betclic: { home: 'Jannik Sinner', away: 'Carlos Alcaraz' } } };
  assert.equal(at('betano', partial).homeTeam, 'Sinner'); assert.equal(at('betano', partial).awayTeam, 'Alcaraz');
  assert.equal(at('betano', view([win])).homeTeam, 'Sinner');
});
test('legs without a live price at the house are missing', () => {
  const susp = { ...win, prices: { ...win.prices, betano: { odds: 1.85, suspended: true } } };
  assert.equal(toBuilderItems([leg], 'betano', new Map([['e1', view([susp])]])).missing.length, 1);
  assert.equal(toBuilderItems([leg], 'betano', new Map([['e1', null]])).missing.length, 1);
  assert.equal(toBuilderItems([leg], 'placard', new Map([['e1', view([win])]])).missing.length, 1);
});
test('needsReplaceConfirm and slipMatchesSaved', () => {
  assert.equal(needsReplaceConfirm({ items: [] }), false); assert.equal(needsReplaceConfirm({ items: [1] }), true);
  assert.ok(slipMatchesSaved([leg], 'betano', { siteSlug: 'betano', items: [{ id: 'e1|T.WIN.A|betano' }] }));
  assert.ok(!slipMatchesSaved([leg], 'betano', { siteSlug: 'betclic', items: [{ id: 'e1|T.WIN.A|betano' }] }));
  assert.ok(!slipMatchesSaved([leg], 'betano', { siteSlug: 'betano', items: [] }));
});
test('oddsChanged compares by item id', () => {
  const { items } = toBuilderItems([leg], 'betano', new Map([['e1', view([win])]]));
  assert.equal(oddsChanged({ 'e1|T.WIN.A|betano': 1.85 }, items), false);
  assert.equal(oddsChanged({ 'e1|T.WIN.A|betano': 1.8 }, items), true);
  assert.equal(oddsChanged({}, items), false);
});
test('lockedHouse only when every item came from the pending house and the site matches', () => {
  const items = [{ id: 'e1|T.WIN.A|betano' }, { id: 'e2|FT.1X2.H|betano' }];
  assert.equal(lockedHouse('betano', { siteSlug: 'betano', items }), 'betano');
  assert.equal(lockedHouse(null, { siteSlug: 'betano', items }), null);
  assert.equal(lockedHouse('betano', { siteSlug: 'betclic', items }), null);
  assert.equal(lockedHouse('betano', { siteSlug: 'betano', items: [] }), null);
  assert.equal(lockedHouse('betano', { siteSlug: 'betano', items: [...items, { id: 'manual-1' }] }), null);
});
