import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createOddsService, ESPN_BONUS, foldLine, mapLimit } from './service';
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
  hints: Array<{ pageUrl?: string } | undefined> = [];
  async listEvents() { return this.events; }
  async getMarkets(_id?: string, hint?: { pageUrl?: string }): Promise<SourceMarket[]> {
    this.calls++;
    this.hints.push(hint);
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

test("getEvent carries each house's own participant names", async () => {
  const a = new FakeSource('betclic', [ev('betclic', 'b1', 'FC Porto', 'SL Benfica')], m1x2(2.0, 3.3, 3.6));
  const b = new FakeSource('lebull', [ev('lebull', 'l1', 'Porto', 'Benfica')], m1x2(2.1, 3.2, 3.5));
  const { svc } = await setup([a, b]);
  const view = await svc.getEvent(KEY);
  assert.deepEqual(view?.names, {
    betclic: { home: 'FC Porto', away: 'SL Benfica' },
    lebull: { home: 'Porto', away: 'Benfica' },
  });
});

test('multiple over several events keeps leg order and fetches each event once', async () => {
  const START2 = '2026-11-16T18:00:00.000Z';
  const cands = async () => [
    { providerMatchId: '99', league: 'por.1', sport: 'FOOTBALL' as const, home: 'Porto', away: 'Benfica', startsAt: START },
    { providerMatchId: '98', league: 'por.1', sport: 'FOOTBALL' as const, home: 'Braga', away: 'Sporting', startsAt: START2 },
  ];
  const marketsById: Record<string, SourceMarket[]> = { b1: m1x2(2.0, 3.3, 3.6), b2: m1x2(1.5, 4.0, 6.0) };
  let calls = 0;
  const src: OddsSource = {
    house: 'betclic',
    listEvents: async () => [ev('betclic', 'b1', 'Porto', 'Benfica'), { ...ev('betclic', 'b2', 'Braga', 'Sporting'), startsAt: START2 }],
    getMarkets: async (id) => { calls++; await new Promise((r) => setTimeout(r, id === 'b1' ? 20 : 1)); return marketsById[id]!; },
  };
  const store = createOddsStore(createFakeRedis());
  const svc = createOddsService({ sources: [src], store, candidates: cands, now: () => NOW, track: (_p, fn) => fn() });
  await svc.refreshCatalogue(src, 'FOOTBALL');
  const K2 = 'espn:FOOTBALL:98';
  const got = await svc.multiple([
    { eventKey: KEY, selectionKey: 'FT.1X2.H' },
    { eventKey: K2, selectionKey: 'FT.1X2.A' },
  ]);
  assert.deepEqual(got, compareMultiple([{ betclic: { odds: 2.0, suspended: false } }, { betclic: { odds: 6.0, suspended: false } }]));
  assert.equal(calls, 2);
});

test('mapLimit keeps order and never exceeds the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const got = await mapLimit([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, n));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(got, [50, 10, 40, 20, 30, 0, 60]);
  assert.equal(peak, 3);
  assert.deepEqual(await mapLimit([], 4, async (n: number) => n), []);
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
    const sel = { eventKey: KEY, selectionKey: 'FT.1X2.H' };
    const tooMany = await fetch(base + '/multiple', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selections: Array(31).fill(sel) }) });
    assert.equal(tooMany.status, 400);
    const thirty = await fetch(base + '/multiple', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selections: Array(30).fill(sel) }) });
    assert.equal(thirty.status, 200);
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

import { swapTennisKey } from './canonical';

test('swapTennisKey swaps sides only', () => {
  assert.equal(swapTennisKey('T.WIN.A'), 'T.WIN.B');
  assert.equal(swapTennisKey('T.SET2.WIN.B'), 'T.SET2.WIN.A');
  assert.equal(swapTennisKey('T.GAMES.HCP.A.-2.5'), 'T.GAMES.HCP.B.-2.5');
  assert.equal(swapTennisKey('T.SETS.2-0'), 'T.SETS.0-2');
  assert.equal(swapTennisKey('T.GAMES.O.22.5'), 'T.GAMES.O.22.5');
  assert.equal(swapTennisKey('T.WIN.A+T.SETS.2-1'), 'T.WIN.B+T.SETS.1-2');
});

function positional(h1: number, h2: number, s20: number, s02: number, l1 = '-2.5', l2 = '+2.5'): SourceMarket[] {
  return [
    { marketLabel: 'Handicap de jogos', selectionLabel: `Handicap 1 ${l1}`, odds: h1, suspended: false },
    { marketLabel: 'Handicap de jogos', selectionLabel: `Handicap 2 ${l2}`, odds: h2, suspended: false },
    { marketLabel: 'Resultado em Sets', selectionLabel: '2-0', odds: s20, suspended: false },
    { marketLabel: 'Resultado em Sets', selectionLabel: '0-2', odds: s02, suspended: false },
  ];
}

async function swappedTennis(opts: { candidate: boolean; radar?: string; second?: [string, string] }) {
  const [x, y] = ['Jannik Sinner', 'Carlos Alcaraz'];
  const second = opts.second ?? [y, x];
  const mk = (house: HouseId, id: string, a: string, b: string, m: SourceMarket[]): SourceEvent => ({
    ...tev(house, id, a, b, m), extraIds: opts.radar ? { betRadarId: opts.radar } : undefined,
  });
  const m1 = positional(1.8, 2.0, 3.0, 9.0);
  const m2 = positional(3.0, 1.3, 7.0, 2.2, '+2.5', '-2.5');
  const a = new FakeSource('betclic', [mk('betclic', 'b1', x, y, m1)], m1);
  const b = new FakeSource('lebull', [mk('lebull', 'l1', second[0], second[1], m2)], m2);
  const store = createOddsStore(createFakeRedis());
  const cands = async () => (opts.candidate
    ? [{ providerMatchId: 't1', league: 'atp', sport: 'TENNIS' as const, home: y, away: x, startsAt: TS }] : []);
  const svc = createOddsService({ sources: [a, b], store, candidates: cands, now: () => NOW, track: (_p, fn) => fn() });
  for (const s of [a, b]) await svc.refreshCatalogue(s, 'TENNIS');
  return svc;
}

async function checkPositional(svc: Awaited<ReturnType<typeof swappedTennis>>, key: string) {
  const view = await svc.getEvent(key);
  const rows = view!.rows;
  // Sinner is betclic "Handicap 1" (1.8) and lebull "Handicap 2" (1.3): same player, same row.
  const hcp = rows.filter((r) => r.key?.startsWith('T.GAMES.HCP.') && r.prices.betclic?.odds === 1.8)[0]!;
  assert.equal(hcp.prices.lebull?.odds, 1.3, 'Sinner handicap: betclic 1.8 vs lebull 1.3');
  const sets = rows.find((r) => r.prices.betclic?.odds === 3.0 && r.key?.startsWith('T.SETS.'))!;
  assert.equal(sets.prices.lebull?.odds, 2.2, 'Sinner 2-0');
}

test('tennis positional labels in swapped order: espn: key', async () => {
  const svc = await swappedTennis({ candidate: true });
  await checkPositional(svc, 'espn:TENNIS:t1');
});

test('tennis positional labels in swapped order: bet: key', async () => {
  const svc = await swappedTennis({ candidate: false, radar: '77' });
  await checkPositional(svc, 'bet:TENNIS:77');
});

test('tennis positional labels in swapped order: n: key', async () => {
  const svc = await swappedTennis({ candidate: false });
  const list = await svc.listEvents('TENNIS', '2026-11-16');
  await checkPositional(svc, list[0]!.eventKey);
});

test('tennis abbreviated house names: never a wrong player, orientation unknown drops the house', async () => {
  const mb = win('Jannik Sinner', 1.5, 'Carlos Alcaraz', 2.6);
  const ml = win('Alcaraz Garfia C.', 2.5, 'Sinner J.', 1.55);
  const mk = (h: HouseId, id: string, a: string, b: string, m: SourceMarket[]) => ({ ...tev(h, id, a, b, m), extraIds: { betRadarId: '88' } });
  const a = new FakeSource('betclic', [mk('betclic', 'b1', 'Jannik Sinner', 'Carlos Alcaraz', mb)], mb);
  const b = new FakeSource('lebull', [mk('lebull', 'l1', 'Alcaraz Garfia C.', 'Sinner J.', ml)], ml);
  const store = createOddsStore(createFakeRedis());
  const svc = createOddsService({ sources: [a, b], store, candidates: async () => [], now: () => NOW, track: (_p, fn) => fn() });
  for (const s of [a, b]) await svc.refreshCatalogue(s, 'TENNIS');
  const view = await svc.getEvent('bet:TENNIS:88');
  const wa = view!.rows.find((r) => r.key === 'T.WIN.A');
  assert.equal(wa?.prices.betclic?.odds, 1.5);
  if (wa?.prices.lebull) assert.equal(wa.prices.lebull.odds, 1.55);
});

test('swapTennisKey only touches keys that start a leg', () => {
  assert.equal(swapTennisKey('B.X:T.WIN.A'), 'B.X:T.WIN.A');
  assert.equal(swapTennisKey('ANY(T.WIN.A)'), 'ANY(T.WIN.A)');
  assert.equal(swapTennisKey('FT.1X2.H+T.WIN.A'), 'FT.1X2.H+T.WIN.B');
});

test('started tennis event: cached markets of a reversed house keep their orientation; dropped house is not counted', async () => {
  let now = NOW;
  const m1 = positional(1.8, 2.0, 3.0, 9.0);
  const m2 = positional(3.0, 1.85, 7.0, 2.2, '+2.5', '-2.5');
  const a = new FakeSource('betclic', [tev('betclic', 'b1', 'Jannik Sinner', 'Carlos Alcaraz', m1)], m1);
  const b = new FakeSource('lebull', [tev('lebull', 'l1', 'Carlos Alcaraz', 'Jannik Sinner', m2)], m2);
  const store = createOddsStore(createFakeRedis());
  const cands = async () => [{ providerMatchId: 't1', league: 'atp', sport: 'TENNIS' as const, home: 'Carlos Alcaraz', away: 'Jannik Sinner', startsAt: TS }];
  const svc = createOddsService({ sources: [a, b], store, candidates: cands, now: () => now, track: (_p, fn) => fn() });
  for (const s of [a, b]) await svc.refreshCatalogue(s, 'TENNIS');
  const before = await svc.getEvent('espn:TENNIS:t1');
  const hb = before!.rows.find((r) => r.prices.betclic?.odds === 1.8)!;
  assert.equal(hb.prices.lebull?.odds, 1.85);
  // kickoff passed, calendars no longer list the event
  now = Date.parse(TS) + 60_000;
  await store.setEvents('betclic', 'TENNIS', []);
  await store.setEvents('lebull', 'TENNIS', []);
  const after = await svc.getEvent('espn:TENNIS:t1');
  const ha = after!.rows.find((r) => r.prices.betclic?.odds === 1.8)!;
  assert.equal(ha.key, hb.key);
  assert.equal(ha.prices.lebull?.odds, 1.85);

  // a house whose orientation cannot be determined is excluded from houses and houseCount
  const odd = positional(2, 2, 2, 2);
  const c = new FakeSource('placard', [tev('placard', 'p1', 'Zzz Qqq', 'Xxx Yyy', odd)], odd);
  const store2 = createOddsStore(createFakeRedis());
  const svc2 = createOddsService({ sources: [a, c], store: store2, candidates: cands, now: () => NOW, track: (_p, fn) => fn() });
  await svc2.refreshCatalogue(a, 'TENNIS');
  await store2.setLink('placard', 'p1', 'espn:TENNIS:t1');
  await store2.setIndex('espn:TENNIS:t1', 'placard', 'p1');
  await store2.setEvents('placard', 'TENNIS', [tev('placard', 'p1', 'Zzz Qqq', 'Xxx Yyy', odd)]);
  const list = await svc2.listEvents('TENNIS', '2026-11-16');
  assert.deepEqual(list[0]!.houses, ['betclic']);
  assert.equal(list[0]!.houseCount, 1);
  const view = await svc2.getEvent('espn:TENNIS:t1');
  assert.deepEqual(view!.houses, ['betclic']);
});

test('the calendar pageUrl reaches source.getMarkets as a hint', async () => {
  const a = new FakeSource('betclic', [{ ...ev('betclic', 'b1', 'Porto', 'Benfica'), pageUrl: '/jogo/b1' }], m1x2(2.0, 3.3, 3.6));
  const { svc } = await setup([a]);
  await svc.getEvent(KEY);
  assert.deepEqual(a.hints, [{ pageUrl: '/jogo/b1' }]);
});

test('event info carries the competition country and, for ESPN matches, the ESPN names', async () => {
  const a = new FakeSource('betclic', [{ ...ev('betclic', 'b1', 'FC Porto', 'SL Benfica'), countryCode: 'PT' }], m1x2(2.0, 3.3, 3.6));
  const b = new FakeSource('lebull', [ev('lebull', 'l1', 'Porto', 'Benfica')], m1x2(2.1, 3.2, 3.5));
  const { svc } = await setup([b, a]);
  const view = await svc.getEvent(KEY);
  assert.equal(view?.event.countryCode, 'PT');
  assert.deepEqual(view?.event.canonical, { home: 'Porto', away: 'Benfica' });
  const [item] = await svc.listEvents('FOOTBALL', START);
  assert.equal(item?.event.countryCode, 'PT');
  assert.deepEqual(item?.event.canonical, { home: 'Porto', away: 'Benfica' });
});

test('events without an ESPN match have no canonical names', async () => {
  const lone = (house: HouseId, id: string): SourceEvent => ({ ...ev(house, id, 'Clube A', 'Clube B'), extraIds: { betRadarId: '7' } });
  const store = createOddsStore(createFakeRedis());
  const a = new FakeSource('betclic', [lone('betclic', 'b9')], m1x2(2, 3, 4));
  const svc = createOddsService({ sources: [a], store, candidates: async () => [], now: () => NOW, track: (_p, fn) => fn() });
  await svc.refreshCatalogue(a, 'FOOTBALL');
  const [item] = await svc.listEvents('FOOTBALL', START);
  assert.equal(item?.event.canonical, undefined);
  assert.equal(item?.event.countryCode, undefined);
});

test('popularity: most markets any house opens, with a bonus for ESPN-matched games', async () => {
  const a = new FakeSource('betclic', [{ ...ev('betclic', 'b1', 'FC Porto', 'SL Benfica'), marketCount: 157 }], m1x2(2, 3, 4));
  const b = new FakeSource('lebull', [{ ...ev('lebull', 'l1', 'Porto', 'Benfica'), marketCount: 287 }], m1x2(2, 3, 4));
  const { svc } = await setup([a, b]);
  const [item] = await svc.listEvents('FOOTBALL', START);
  assert.equal(item?.popularity, 287 + ESPN_BONUS);
  const store = createOddsStore(createFakeRedis());
  const lone = new FakeSource('betclic', [{ ...ev('betclic', 'b9', 'Clube A', 'Clube B'), extraIds: { betRadarId: '7' } }], m1x2(2, 3, 4));
  const svc2 = createOddsService({ sources: [lone], store, candidates: async () => [], now: () => NOW, track: (_p, fn) => fn() });
  await svc2.refreshCatalogue(lone, 'FOOTBALL');
  const [plain] = await svc2.listEvents('FOOTBALL', START);
  assert.equal(plain?.popularity, 0);
});

test('a house that missed ESPN joins the ESPN key through a shared BetRadar id, in either order', async () => {
  const radar = (e: SourceEvent, id: string): SourceEvent => ({ ...e, extraIds: { betRadarId: id } });
  for (const order of [0, 1]) {
    // "Porto B" never matches ESPN's "Porto" (variant), so only the BetRadar id can join it.
    const missed = new FakeSource('betclic', [withMain(radar(ev('betclic', 'b1', 'Porto B', 'Benfica'), '777'), m1x2(2.0, 3.3, 3.6))], []);
    const hit = new FakeSource('betano', [withMain(radar(ev('betano', 'n1', 'FC Porto', 'SL Benfica'), '777'), m1x2(2.1, 3.2, 3.5))], []);
    const { svc, store } = await setup(order === 0 ? [missed, hit] : [hit, missed]);
    assert.equal(await store.getLink('betclic', 'b1'), KEY, `order ${order}`);
    assert.equal(await store.getLink('betano', 'n1'), KEY);
    const list = await svc.listEvents('FOOTBALL', START);
    assert.equal(list.length, 1, `order ${order}`);
    assert.deepEqual([...list[0]!.houses].sort(), ['betano', 'betclic']);
    // Canonical order stays ESPN's.
    assert.deepEqual(await store.getCtx(KEY), { home: 'Porto', away: 'Benfica', startsAt: START });
  }
});
