import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createOddsService, foldLine } from './service';
import { createOddsStore } from './store';
import { createFakeRedis } from './fakeRedis';
import { compareMultiple } from './compare';
import { createOddsRouter } from '../../routes/oddsRoutes';
import { getSources } from './registry';
import type { HouseId, OddsSource, SourceEvent, SourceMarket } from './types';

const START = '2026-11-16T20:00:00.000Z';
const NOW = Date.parse('2026-11-15T12:00:00.000Z');

class FakeSource implements OddsSource {
  calls = 0;
  constructor(
    public house: HouseId,
    private events: SourceEvent[],
    private markets: SourceMarket[] | Error,
  ) {}
  async listEvents() { return this.events; }
  async getMarkets(): Promise<SourceMarket[]> {
    this.calls++;
    if (this.markets instanceof Error) throw this.markets;
    return this.markets;
  }
}

const ev = (house: HouseId, id: string, home: string, away: string): SourceEvent =>
  ({ house, houseEventId: id, sport: 'FOOTBALL', competition: 'Liga', home, away, startsAt: START, live: false });
const m1x2 = (h: number, d: number, a: number): SourceMarket[] => [
  { marketLabel: 'Resultado Final', selectionLabel: '1', odds: h, suspended: false },
  { marketLabel: 'Resultado Final', selectionLabel: 'X', odds: d, suspended: false },
  { marketLabel: 'Resultado Final', selectionLabel: '2', odds: a, suspended: false },
];
const candidates = async () => [
  { providerMatchId: '99', league: 'por.1', sport: 'FOOTBALL' as const, home: 'Porto', away: 'Benfica', startsAt: START },
];
const KEY = 'espn:FOOTBALL:99';

async function setup(sources: OddsSource[]) {
  const store = createOddsStore(createFakeRedis());
  const svc = createOddsService({ sources, store, candidates, now: () => NOW, track: (_p, fn) => fn() });
  for (const s of sources) await svc.refreshCatalogue(s, 'FOOTBALL');
  return { svc, store };
}

test('one event in two houses is joined and the best price chosen', async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'FC Porto', 'SL Benfica')], m1x2(2.0, 3.3, 3.6));
  const b = new FakeSource('lebull', [ev('lebull', 'l1', 'Porto', 'Benfica')], m1x2(2.1, 3.2, 3.5));
  const { svc } = await setup([a, b]);
  const view = await svc.getEvent(KEY);
  assert.ok(view);
  assert.deepEqual(view.houses, ['betclic', 'lebull']);
  const home = view.rows.find((r) => r.key === 'FT.1X2.H')!;
  assert.deepEqual(home.prices, { betclic: { odds: 2.0, suspended: false }, lebull: { odds: 2.1, suspended: false } });
  assert.equal(home.best, 'lebull');
  assert.equal(view.rows.length, 3);
  console.log('EVENT', JSON.stringify(view));
});

test('a house that throws is left out and does not break the result', async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'Porto', 'Benfica')], m1x2(2.0, 3.3, 3.6));
  const b = new FakeSource('lebull', [ev('lebull', 'l1', 'Porto', 'Benfica')], new Error('403'));
  const { svc } = await setup([a, b]);
  const view = await svc.getEvent(KEY);
  assert.deepEqual(view?.houses, ['betclic']);
  assert.equal(view?.rows.find((r) => r.key === 'FT.1X2.H')?.prices.lebull, undefined);
});

test('markets are cached for 60 s (getMarkets only on cache miss)', async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'Porto', 'Benfica')], m1x2(2.0, 3.3, 3.6));
  const { svc } = await setup([a]);
  await svc.getEvent(KEY);
  await svc.getEvent(KEY);
  assert.equal(a.calls, 1);
});

test('listEvents returns the day with main market and house count', async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'Porto', 'Benfica')], m1x2(2.0, 3.3, 3.6));
  const b = new FakeSource('lebull', [ev('lebull', 'l1', 'Porto', 'Benfica')], m1x2(2.1, 3.2, 3.5));
  const { svc } = await setup([a, b]);
  const list = await svc.listEvents('FOOTBALL', '2026-11-16');
  assert.equal(list.length, 1);
  assert.equal(list[0]!.houseCount, 2);
  assert.deepEqual(list[0]!.main.map((r) => r.key), ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A']);
  assert.deepEqual(await svc.listEvents('FOOTBALL', '2026-11-17'), []);
  console.log('LIST', JSON.stringify(list));
});

test('multiple computes like compareMultiple; unknown legs are missing everywhere', async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'Porto', 'Benfica')], m1x2(2.0, 3.3, 3.6));
  const b = new FakeSource('lebull', [ev('lebull', 'l1', 'Porto', 'Benfica')], m1x2(2.1, 3.2, 3.5));
  const { svc } = await setup([a, b]);
  const sels = [{ eventKey: KEY, selectionKey: 'FT.1X2.H' }, { eventKey: KEY, selectionKey: 'FT.1X2.D' }];
  const got = await svc.multiple(sels);
  const exp = compareMultiple([
    { betclic: { odds: 2.0, suspended: false }, lebull: { odds: 2.1, suspended: false } },
    { betclic: { odds: 3.3, suspended: false }, lebull: { odds: 3.2, suspended: false } },
  ]);
  assert.deepEqual(got, exp);
  const bad = await svc.multiple([...sels, { eventKey: 'espn:FOOTBALL:nope', selectionKey: 'FT.1X2.H' }]);
  assert.equal(bad.best, null);
  assert.deepEqual(bad.perHouse.betclic, { total: null, missing: 1 });
});

test('foldLine adds the line only when the label lacks it', () => {
  assert.equal(foldLine('Over', 2.5), 'Over 2.5');
  assert.equal(foldLine('Over 2.5', 2.5), 'Over 2.5');
  assert.equal(foldLine('Over', null), 'Over');
});

test('getSources follows ODDS_SOURCES (empty by default)', () => {
  assert.deepEqual(getSources(undefined), []);
  assert.deepEqual(getSources('nonexistent'), []);
});

test('routes: envelope, validation, URL-encoded key, health', async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'Porto', 'Benfica')], m1x2(2.0, 3.3, 3.6));
  const { svc } = await setup([a]);
  const app = express();
  app.use(express.json());
  app.use(createOddsRouter(() => svc, async () => ({ 'odds-betclic': { ok: true }, livescore: { ok: true } })));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: (await r.json()) as any }; };
    const list = await get('/events?sport=FOOTBALL&date=2026-11-16');
    assert.equal(list.body.success, true);
    assert.equal(list.body.data.length, 1);
    assert.equal((await get('/events?sport=HOCKEY&date=2026-11-16')).status, 400);
    const one = await get(`/events/${encodeURIComponent(KEY)}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.eventKey, KEY);
    assert.equal((await get('/events/espn%3AFOOTBALL%3Anope')).status, 404);
    const post = await fetch(base + '/multiple', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selections: [{ eventKey: KEY, selectionKey: 'FT.1X2.H' }] }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const multi = (await post.json()) as any;
    assert.equal(multi.data.perHouse.betclic.total, 2);
    const bad = await fetch(base + '/multiple', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"selections":[]}' });
    assert.equal(bad.status, 400);
    const health = await get('/health');
    assert.deepEqual(Object.keys(health.body.data), ['odds-betclic']);
    console.log('MULTIPLE', JSON.stringify(multi));
    console.log('HEALTH', JSON.stringify(health.body));
  } finally {
    server.close();
  }
});
