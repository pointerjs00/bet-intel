import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { betanoSourceFactory, createBetanoSource, getBetanoMarkets, listBetanoEvents, type BetanoDeps } from './index';
import { ORIGIN } from './profile';
import type { BetanoSession } from './session';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const FROM = '2026-11-16T12:00:00Z';
const TO = '2026-11-18T12:00:00Z';
const hours = (h: number) => NOW + h * 3_600_000;

const SHELL = `${ORIGIN}/api/sport/futebol/jogos-de-hoje/?req=s,stnf,c,mb`;
const CAL = `${ORIGIN}/api/sports/upcoming/calendar/FOOT/?lang=pt`;
const ev = (id: string, startTime: number, extra: object = {}) => ({
  id,
  name: `Casa${id} - Fora${id}`,
  startTime,
  url: `/odds/casa-fora/${id}/`,
  ...extra,
});

type Reply = { status: number; text: string };
interface Call {
  url: string;
  init?: { headers?: ReadonlyArray<readonly [string, string]> };
}

function fake(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const session = {
    request: async (url: string, init?: Call['init']) => {
      calls.push({ url, init });
      const r = routes[url] ?? { status: 404, text: '' };
      return { status: r.status, headers: {}, text: r.text, url };
    },
  } as unknown as BetanoSession;
  const sleeps: number[] = [];
  const deps: BetanoDeps = { session, now: () => NOW, sleep: async (ms) => void sleeps.push(ms) };
  return { deps, calls, sleeps };
}

const ok = (body: unknown): Reply => ({ status: 200, text: JSON.stringify(body) });
const shell = ok({ data: { calendarDataUrl: '/api/sports/upcoming/calendar/{sportId}/?lang=pt' } });

test('calendar URL comes from the shell with {sportId} substituted; paging stops on an empty page', async () => {
  const { deps, calls, sleeps } = fake({
    [SHELL]: shell,
    [CAL]: ok({ data: { events: [ev('1', hours(2)), ev('2', hours(3))] } }),
    [`${CAL}&page=1`]: ok({ data: { events: [ev('3', hours(4))] } }),
    [`${CAL}&page=2`]: ok({ data: { events: [] } }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['1', '2', '3']);
  assert.deepEqual(calls.map((c) => c.url), [SHELL, CAL, `${CAL}&page=1`, `${CAL}&page=2`]);
  assert.equal(sleeps.length, 2);
  assert.equal(out[0]!.pageUrl, '/odds/casa-fora/1/');
});

test('events outside the window are dropped; live events started earlier are kept', async () => {
  const { deps } = fake({
    [SHELL]: shell,
    [CAL]: ok({
      data: {
        events: [
          ev('past', hours(-5)),
          ev('late', hours(100)),
          ev('live', hours(-1), { liveData: {} }),
          ev('in', hours(10)),
        ],
      },
    }),
    [`${CAL}&page=1`]: ok({ data: { events: [] } }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId).sort(), ['in', 'live']);
});

test('calendar non-200 falls back to the trending leagues', async () => {
  const leagues = `${ORIGIN}/api/sports/FOOT/hot/trending/leagues/77/events`;
  const { deps, calls } = fake({
    [SHELL]: ok({
      data: {
        calendarDataUrl: '/api/sports/upcoming/calendar/{sportId}/?lang=pt',
        segments: [{ components: [{ url: '/api/sports/FOOT/hot/trending/leagues/77/events' }] }],
      },
    }),
    [CAL]: { status: 400, text: '' },
    [leagues]: ok({ data: [ev('9', hours(6))] }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['9']);
  assert.ok(calls.some((c) => c.url === leagues));
});

const PAGE = `${ORIGIN}/odds/casa-fora/5/`;
const html = (state: unknown) => `<html><script>window["initial_state"]=${JSON.stringify(state)}</script></html>`;
const stateOk = {
  x: { markets: [{ type: 'MRES', name: 'Resultado Final', selections: [{ id: 1, name: '1', price: 1.9 }, { id: 2, name: '2', price: 3.2 }] }] },
};

test('getMarkets absolutises a relative pageUrl and fetches it with navigation headers', async () => {
  const { deps, calls } = fake({ [PAGE]: { status: 200, text: html(stateOk) } });
  const out = await getBetanoMarkets('5', { pageUrl: '/odds/casa-fora/5/' }, deps);
  assert.deepEqual(out.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [
    ['Resultado Final', '1', 1.9],
    ['Resultado Final', '2', 3.2],
  ]);
  assert.equal(calls[0]!.url, PAGE);
  const headers = new Map(calls[0]!.init!.headers!);
  assert.equal(headers.get('sec-fetch-dest'), 'document');
  assert.equal(headers.get('referer'), `${ORIGIN}/sport/futebol/`);
});

test('getMarkets through createBetanoSource passes the hint', async () => {
  const { deps } = fake({ [PAGE]: { status: 200, text: html(stateOk) } });
  const source = createBetanoSource(deps);
  const out = await source.getMarkets('5', { pageUrl: PAGE });
  assert.equal(out.length, 2);
});

test('getMarkets rejects missing pageUrl, foreign hosts, missing state, HTTP errors and empty markets', async () => {
  const { deps, calls } = fake({
    [PAGE]: { status: 200, text: '<html>nothing</html>' },
    [`${ORIGIN}/odds/a/6/`]: { status: 503, text: '' },
    [`${ORIGIN}/odds/a/7/`]: { status: 200, text: html({ a: 1 }) },
  });
  await assert.rejects(getBetanoMarkets('5', undefined, deps), ProviderFormatError);
  await assert.rejects(getBetanoMarkets('5', {}, deps), ProviderFormatError);
  await assert.rejects(getBetanoMarkets('5', { pageUrl: 'https://evil.example/odds/x/5/' }, deps), ProviderFormatError);
  await assert.rejects(getBetanoMarkets('5', { pageUrl: 'http://www.betano.pt.evil.example/' }, deps), ProviderFormatError);
  assert.equal(calls.length, 0);
  await assert.rejects(getBetanoMarkets('5', { pageUrl: '/odds/casa-fora/5/' }, deps), ProviderFormatError);
  await assert.rejects(getBetanoMarkets('6', { pageUrl: '/odds/a/6/' }, deps), ProviderFormatError);
  await assert.rejects(getBetanoMarkets('7', { pageUrl: '/odds/a/7/' }, deps), ProviderFormatError);
});

test('shell without calendarDataUrl or calendar component falls back to the /api calendar', async () => {
  const fallback = `${ORIGIN}/api/sports/upcoming/calendar/FOOT/`;
  const { deps, calls } = fake({
    [SHELL]: ok({ data: {} }),
    [fallback]: ok({ data: { events: [ev('1', hours(2))] } }),
    [`${fallback}?page=1`]: ok({ data: { events: [] } }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['1']);
  assert.equal(calls[1]!.url, fallback);
});

test('trending leagues are only fetched when the calendar yields nothing', async () => {
  const trending = `${ORIGIN}/api/sports/FOOT/hot/trending/leagues`;
  const { deps, calls } = fake({
    [SHELL]: shell,
    [CAL]: { status: 400, text: '' },
    [trending]: ok({ data: [{ id: 5 }] }),
    [`${ORIGIN}/api/sports/FOOT/hot/trending/leagues/5/events`]: ok({ data: [ev('8', hours(3))] }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['8']);
  assert.ok(calls.some((c) => c.url === trending));
});

test('paging stops once raw events reach totalCount, even if the window filtered some out', async () => {
  const { deps, calls } = fake({
    [SHELL]: shell,
    [CAL]: ok({ data: { totalCount: 2, events: [ev('a', hours(-9)), ev('b', hours(3))] } }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['b']);
  assert.equal(calls.length, 2);
});

test('one league with invalid JSON is skipped; all leagues invalid throws', async () => {
  const L = (id: string) => `${ORIGIN}/api/sports/FOOT/hot/trending/leagues/${id}/events`;
  const sh = ok({
    data: {
      calendarDataUrl: '/api/sports/upcoming/calendar/{sportId}/?lang=pt',
      segments: [{ components: [{ url: '/api/sports/FOOT/hot/trending/leagues/1/events' }, { url: '/api/sports/FOOT/hot/trending/leagues/2/events' }] }],
    },
  });
  const mixed = fake({ [SHELL]: sh, [CAL]: { status: 400, text: '' }, [L('1')]: { status: 200, text: '<html>' }, [L('2')]: ok({ data: [ev('4', hours(2))] }) });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, mixed.deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['4']);
  const bad = fake({ [SHELL]: sh, [CAL]: { status: 400, text: '' }, [L('1')]: { status: 200, text: '<html>' }, [L('2')]: { status: 200, text: 'x' } });
  await assert.rejects(listBetanoEvents('FOOTBALL', FROM, TO, bad.deps), ProviderFormatError);
});

test('a 200 calendar with only out-of-window events does not trigger the league fallback', async () => {
  const { deps, calls } = fake({
    [SHELL]: shell,
    [CAL]: ok({ data: { events: [ev('late', hours(100))], totalCount: 1 } }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out, []);
  assert.deepEqual(calls.map((c) => c.url), [SHELL, CAL]);
});

test('paging stops once a page is entirely after the window', async () => {
  const { deps, calls } = fake({
    [SHELL]: shell,
    [CAL]: ok({ data: { events: [ev('1', hours(2))] } }),
    [`${CAL}&page=1`]: ok({ data: { events: [ev('2', hours(100)), ev('3', hours(101))] } }),
    [`${CAL}&page=2`]: ok({ data: { events: [ev('4', hours(5))] } }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['1']);
  assert.deepEqual(calls.map((c) => c.url), [SHELL, CAL, `${CAL}&page=1`]);
});

test('a calendar with zero raw events still falls back to the leagues', async () => {
  const leagues = `${ORIGIN}/api/sports/FOOT/hot/trending/leagues/77/events`;
  const { deps, calls } = fake({
    [SHELL]: ok({
      data: {
        calendarDataUrl: '/api/sports/upcoming/calendar/{sportId}/?lang=pt',
        segments: [{ components: [{ url: '/api/sports/FOOT/hot/trending/leagues/77/events' }] }],
      },
    }),
    [CAL]: ok({ data: { events: [] } }),
    [leagues]: ok({ data: [ev('9', hours(6))] }),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['9']);
  assert.ok(calls.some((c) => c.url === leagues));
});

test('factory with URL but no token yields a source that rejects without network', async () => {
  const source = betanoSourceFactory({ BETANO_EGRESS_URL: 'http://betano-egress:8765' } as NodeJS.ProcessEnv);
  await assert.rejects(source.listEvents('FOOTBALL', FROM, TO), /BETANO_EGRESS_TOKEN em falta/);
  await assert.rejects(source.getMarkets('1', { pageUrl: '/x/' }), ProviderFormatError);
});

test('getMarkets only returns the matching event markets, not related events', async () => {
  const state = {
    event: { id: 5, markets: [{ type: 'MRES', name: 'Resultado Final', selections: [{ id: 1, name: '1', price: 1.9 }] }] },
    related: [{ id: 99, markets: [{ type: 'MRES', name: 'Outro Jogo', selections: [{ id: 2, name: '1', price: 7 }] }] }],
  };
  const { deps } = fake({ [PAGE]: { status: 200, text: html(state) } });
  const out = await getBetanoMarkets('5', { pageUrl: PAGE }, deps);
  assert.deepEqual(out.map((m) => m.marketLabel), ['Resultado Final']);
});

// Real calendar shape (2026-11-16): events grouped by league in data.blocks[].events, sorted by league.
const blockEv = (id: string, startTime: number) => ({
  id,
  name: `Casa${id} - Fora${id}`,
  startTime,
  url: `/odds/casa-fora/${id}/`,
  participants: [{ name: `Casa${id}`, id: 'h' }, { name: `Fora${id}`, id: 'a' }],
  markets: [{ name: 'Resultado Final', type: 'MRES', selections: [{ name: '1', price: 1.9, handicap: 0 }] }],
});
const blocks = (...groups: object[][]) => ok({ data: { header: {}, sortBy: [], marketTabs: [], blocks: groups.map((events, i) => ({ id: String(i), events })) } });

test('blocks-shaped calendar: events flattened with pageUrl; a page repeating page 0 stops the walk', async () => {
  const { deps, calls } = fake({
    [SHELL]: shell,
    [CAL]: blocks([blockEv('1', hours(30)), blockEv('2', hours(2))], [blockEv('3', hours(5))]),
    [`${CAL}&page=1`]: blocks([blockEv('1', hours(30)), blockEv('2', hours(2))], [blockEv('3', hours(5))]),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['1', '2', '3']);
  assert.equal(out[0]!.home, 'Casa1');
  assert.equal(out[0]!.pageUrl, '/odds/casa-fora/1/');
  assert.equal(out[0]!.mainMarkets?.length, 1);
  assert.deepEqual(calls.map((c) => c.url), [SHELL, CAL, `${CAL}&page=1`]);
});

test('blocks-shaped calendar is not time-sorted: a page entirely after the window does not stop paging', async () => {
  const { deps, calls } = fake({
    [SHELL]: shell,
    [CAL]: blocks([blockEv('1', hours(2))]),
    [`${CAL}&page=1`]: blocks([blockEv('2', hours(100))]),
    [`${CAL}&page=2`]: blocks([blockEv('3', hours(5))]),
  });
  const out = await listBetanoEvents('FOOTBALL', FROM, TO, deps);
  assert.deepEqual(out.map((e) => e.houseEventId), ['1', '3']);
  assert.equal(calls.length, 5); // shell + pages 0,1,2 + page 3 (404) ends it
});
