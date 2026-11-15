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
const withMain = (e: SourceEvent, m: SourceMarket[]): SourceEvent => ({ ...e, mainMarkets: m });
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

test('listEvents uses only catalogue main markets and never calls getMarkets', async () => {
  const a = new FakeSource('betclic', [withMain(ev('betclic', 'b1', 'Porto', 'Benfica'), m1x2(2.0, 3.3, 3.6))], m1x2(9, 9, 9));
  const b = new FakeSource('lebull', [withMain(ev('lebull', 'l1', 'Porto', 'Benfica'), [...m1x2(2.1, 3.2, 3.5), { marketLabel: 'Ambas marcam', selectionLabel: 'Sim', odds: 1.8, suspended: false }])], m1x2(9, 9, 9));
  const { svc } = await setup([a, b]);
  const list = await svc.listEvents('FOOTBALL', '2026-11-16');
  assert.equal(a.calls + b.calls, 0);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.houseCount, 2);
  assert.deepEqual(list[0]!.main.map((r) => r.key), ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A']);
  assert.equal(list[0]!.main[0]!.best, 'lebull');
  assert.deepEqual(await svc.listEvents('FOOTBALL', '2026-11-17'), []);
  console.log('LIST', JSON.stringify(list));
});

test('event without mainMarkets is listed with an empty main market', async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'Porto', 'Benfica')], m1x2(2.0, 3.3, 3.6));
  const { svc } = await setup([a]);
  const list = await svc.listEvents('FOOTBALL', '2026-11-16');
  assert.equal(list.length, 1);
  assert.equal(list[0]!.houseCount, 1);
  assert.deepEqual(list[0]!.main, []);
  assert.equal(a.calls, 0);
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
    console.log('LISTHTTP', JSON.stringify(list.body));
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

const TS = '2026-11-16T14:00:00.000Z';
const tev = (house: HouseId, id: string, a: string, b: string, main?: SourceMarket[]): SourceEvent =>
  ({ house, houseEventId: id, sport: 'TENNIS', competition: 'ATP', home: a, away: b, startsAt: TS, live: false, mainMarkets: main });
const win = (a: string, oa: number, b: string, ob: number): SourceMarket[] => [
  { marketLabel: 'Vencedor', selectionLabel: a, odds: oa, suspended: false },
  { marketLabel: 'Vencedor', selectionLabel: b, odds: ob, suspended: false },
];
const tennisCands = async () => [
  { providerMatchId: 't1', league: 'atp', sport: 'TENNIS' as const, home: 'Jannik Sinner', away: 'Carlos Alcaraz', startsAt: TS },
];

test('tennis with swapped player order compares each player with himself', async () => {
  const m1 = win('Jannik Sinner', 1.5, 'Carlos Alcaraz', 2.6);
  const m2 = win('Carlos Alcaraz', 2.5, 'Jannik Sinner', 1.55);
  const a = new FakeSource('betclic', [tev('betclic', 'b1', 'Jannik Sinner', 'Carlos Alcaraz', m1)], m1);
  const b = new FakeSource('lebull', [tev('lebull', 'l1', 'Carlos Alcaraz', 'Jannik Sinner', m2)], m2);
  const store = createOddsStore(createFakeRedis());
  const svc = createOddsService({ sources: [a, b], store, candidates: tennisCands, now: () => NOW, track: (_p, fn) => fn() });
  for (const s of [a, b]) await svc.refreshCatalogue(s, 'TENNIS');
  const view = await svc.getEvent('espn:TENNIS:t1');
  const wa = view!.rows.find((r) => r.key === 'T.WIN.A')!;
  assert.equal(wa.prices.betclic?.odds, 1.5);
  assert.equal(wa.prices.lebull?.odds, 1.55);
  assert.equal(view!.rows.find((r) => r.key === 'T.WIN.B')!.prices.lebull?.odds, 2.5);
  const list = await svc.listEvents('TENNIS', '2026-11-16');
  const la = list[0]!.main.find((r) => r.key === 'T.WIN.A')!;
  assert.equal(la.prices.lebull?.odds, 1.55);
  assert.equal(la.prices.betclic?.odds, 1.5);
});

test('listEvents survives one house with a broken mainMarkets selection', async () => {
  const bad = [{ marketLabel: 'Resultado Final', selectionLabel: null, odds: 2, suspended: false }] as unknown as SourceMarket[];
  const a = new FakeSource('betclic', [withMain(ev('betclic', 'b1', 'Porto', 'Benfica'), m1x2(2.0, 3.3, 3.6))], []);
  const b = new FakeSource('lebull', [withMain(ev('lebull', 'l1', 'Porto', 'Benfica'), bad)], []);
  const { svc } = await setup([a, b]);
  const list = await svc.listEvents('FOOTBALL', '2026-11-16');
  assert.equal(list.length, 1);
  assert.equal(list[0]!.main.length, 3);
});

test('refreshCatalogue skips a malformed event and shares one DayCache', async () => {
  const broken = { ...ev('betclic', 'bx', 'x', 'y'), home: undefined } as unknown as SourceEvent;
  const a = new FakeSource('betclic', [broken, ev('betclic', 'b1', 'Porto', 'Benfica')], []);
  const store = createOddsStore(createFakeRedis());
  const seen: unknown[] = [];
  const svc = createOddsService({
    sources: [a], store, now: () => NOW, track: (_p, fn) => fn(),
    candidates: async (_s, _d, cache) => { seen.push(cache); return candidates(); },
  });
  const cache = new (await import('../sportsData/itemMatch')).DayCache();
  assert.equal(await svc.refreshCatalogue(a, 'FOOTBALL', cache), 1);
  assert.ok(seen.every((c) => c === cache));
  assert.equal(seen.length, 1);
});
