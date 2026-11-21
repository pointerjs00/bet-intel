import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { BLOCK_MS, CONFIG_TTL_MS, MAX_LEAGUES, REQUEST_GAP_MS, TREE_TTL_MS, createLebullSource, parseProcessEnv, type LebullDeps } from './index';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'lebull');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');
const json = (name: string) => JSON.parse(text(name));

const INIT = 'https://www.lebull.pt/share/content/init';
const PAGE = 'https://lebullpt-ssr.boxwebcdn.work/pt';
const API = 'https://betting-platform.prod.sbteam.xyz';
const TENANT = '126dc7bf-288b-4f72-9536-3aa54648c0f4';
const Q = 'lang=pt&currency=EUR';
const TREE = `${API}/sports?${Q}`;
const league = (id: number, stake = '[1]') => `${API}/leagues/${id}/upcoming?leagueTimeFilter=10&stakeTypes=${stake}&${Q}`;

const FROM = '2026-11-21T00:00:00Z';
const TO = '2026-11-23T00:00:00Z';

type Reply = { status?: number; body: string };
const ok = (body: unknown): Reply => ({ body: typeof body === 'string' ? body : JSON.stringify(body) });

function fake(routes: Record<string, Reply>, extra: Partial<LebullDeps> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const deps: LebullDeps = {
    fetch: async (url, init) => {
      calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      const r = routes[url] ?? { status: 404, body: '' };
      return new Response(r.body, { status: r.status ?? 200 });
    },
    sleep: async (ms) => void sleeps.push(ms),
    now: () => clock,
    ...extra,
  };
  return { deps, calls, sleeps, advance: (ms: number) => void (clock += ms) };
}

const base = (): Record<string, Reply> => ({
  [INIT]: ok(text('init.json')),
  [PAGE]: ok(text('sb-page.html')),
});

const footballTree = { sports: [{ sportId: 1, countries: [{ leagues: [{ leagueId: 4485, leagueName: 'England. Premier League', eventsCount: 20, inplayEventsCount: 0 }] }] }] };

test('parseProcessEnv reads the API URL and tenant from the sportsbook page; garbage is a format error', () => {
  assert.deepEqual(parseProcessEnv(text('sb-page.html')), { apiUrl: API, tenantId: TENANT });
  assert.throws(() => parseProcessEnv('<html></html>'), ProviderFormatError);
  assert.throws(() => parseProcessEnv(`PROCESS_ENV', { value: Object.freeze({"BETTING_PLATFORM_SVC_URL":"http://x"}) })`), ProviderFormatError);
});

test('start-up: init → sportsbook host → PROCESS_ENV; API calls carry the tenant header and lang=pt&currency=EUR; config is cached', async () => {
  const { deps, calls } = fake({ ...base(), [TREE]: ok(footballTree), [league(4485)]: ok(json('calendar-football.json')) });
  const source = createLebullSource(deps);
  const events = await source.listEvents('FOOTBALL', FROM, TO);
  assert.deepEqual(calls.map((c) => c.url), [INIT, PAGE, TREE, league(4485)]);
  assert.equal(calls[0]!.headers['x-locale'], 'pt');
  assert.equal(calls[2]!.headers['x-auth-tenant-id'], TENANT);
  assert.equal(calls[3]!.headers['x-auth-tenant-id'], TENANT);
  assert.ok(events.length >= 1 && events.every((e) => e.house === 'lebull' && Date.parse(e.startsAt) <= Date.parse(TO)));
  // Second call within the TTLs: no init, no page, tree still fresh.
  const before = calls.length;
  await source.listEvents('FOOTBALL', FROM, TO);
  assert.deepEqual(calls.slice(before).map((c) => c.url), [league(4485)]);
});

test('config is refetched after 6 h and the tree after 60 s', async () => {
  const { deps, calls, advance } = fake({ ...base(), [TREE]: ok(footballTree), [league(4485)]: ok(json('calendar-football.json')) });
  const source = createLebullSource(deps);
  await source.listEvents('FOOTBALL', FROM, TO);
  advance(TREE_TTL_MS + 1);
  await source.listEvents('FOOTBALL', FROM, TO);
  assert.equal(calls.filter((c) => c.url === TREE).length, 2);
  assert.equal(calls.filter((c) => c.url === INIT).length, 1);
  advance(CONFIG_TTL_MS);
  await source.listEvents('FOOTBALL', FROM, TO);
  assert.equal(calls.filter((c) => c.url === INIT).length, 2);
});

test('window: events after `to` and non-live events before `from` are dropped; list is sorted by start', async () => {
  const body = json('calendar-football.json');
  const games = body[0].games;
  assert.ok(games.length >= 3);
  const { deps } = fake({ ...base(), [TREE]: ok(footballTree), [league(4485)]: ok(body) });
  const first = Date.parse(games[0].timestamp ? new Date(games[0].timestamp).toISOString() : '');
  const out = await createLebullSource(deps).listEvents('FOOTBALL', new Date(first).toISOString(), new Date(first + 60_000).toISOString());
  assert.deepEqual(out.map((e) => e.houseEventId), [String(games[0].eventId)]);
  const sorted = await createLebullSource(fake({ ...base(), [TREE]: ok(footballTree), [league(4485)]: ok(body) }).deps).listEvents('FOOTBALL', new Date(first - 1).toISOString(), new Date(first + 365 * 86_400_000).toISOString());
  assert.deepEqual(sorted.map((e) => e.startsAt), [...sorted.map((e) => e.startsAt)].sort());
});

test('requests are paced ≥ 300 ms apart (none before the first)', async () => {
  const { deps, calls, sleeps } = fake({ ...base(), [TREE]: ok(footballTree), [league(4485)]: ok(json('calendar-football.json')) });
  await createLebullSource(deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(sleeps.length, calls.length - 1);
  assert.ok(sleeps.every((ms) => ms >= REQUEST_GAP_MS));
});

test('calendar per sport requests the sport main market(s) and shares one tree request across sports', async () => {
  const tree = {
    sports: [
      { sportId: 1, countries: [{ leagues: [{ leagueId: 1, leagueName: 'A', eventsCount: 5 }] }] },
      { sportId: 3, countries: [{ leagues: [{ leagueId: 3, leagueName: 'B', eventsCount: 5 }] }] },
      { sportId: 4, countries: [{ leagues: [{ leagueId: 4, leagueName: 'C', eventsCount: 5 }] }] },
    ],
  };
  const { deps, calls } = fake({ ...base(), [TREE]: ok(tree), [league(1)]: ok([]), [league(3, '[702]')]: ok([]), [league(4, '[702,1]')]: ok([]) });
  const source = createLebullSource(deps);
  await Promise.all([source.listEvents('FOOTBALL', FROM, TO), source.listEvents('TENNIS', FROM, TO), source.listEvents('BASKETBALL', FROM, TO)]);
  assert.equal(calls.filter((c) => c.url === TREE).length, 1);
  assert.deepEqual(calls.filter((c) => c.url.includes('/leagues/')).map((c) => c.url).sort(), [league(1), league(3, '[702]'), league(4, '[702,1]')].sort());
});

test('at most 60 leagues per sport, the ones with most events first', async () => {
  const leagues = Array.from({ length: 80 }, (_, i) => ({ leagueId: 1000 + i, leagueName: `L${i}`, eventsCount: i + 1, inplayEventsCount: 0 }));
  const tree = { sports: [{ sportId: 1, countries: [{ leagues }] }] };
  const routes: Record<string, Reply> = { ...base(), [TREE]: ok(tree) };
  for (const l of leagues) routes[league(l.leagueId)] = ok([]);
  const { deps, calls } = fake(routes);
  await createLebullSource(deps).listEvents('FOOTBALL', FROM, TO);
  const asked = calls.filter((c) => c.url.includes('/leagues/'));
  assert.equal(asked.length, MAX_LEAGUES);
  assert.equal(asked[0]!.url, league(1079));
  assert.ok(!asked.some((c) => c.url === league(1000)));
});

test('a failing league keeps the others; every league failing throws', async () => {
  const tree = { sports: [{ sportId: 1, countries: [{ leagues: [{ leagueId: 4485, eventsCount: 9 }, { leagueId: 4484, eventsCount: 8 }] }] }] };
  const partial = fake({ ...base(), [TREE]: ok(tree), [league(4485)]: ok(json('calendar-football.json')), [league(4484)]: { status: 500, body: '' } });
  assert.ok((await createLebullSource(partial.deps).listEvents('FOOTBALL', FROM, TO)).length >= 1);
  const none = fake({ ...base(), [TREE]: ok(tree), [league(4485)]: { status: 500, body: '' }, [league(4484)]: { status: 502, body: '' } });
  await assert.rejects(createLebullSource(none.deps).listEvents('FOOTBALL', FROM, TO), /HTTP 500/);
});

test('start-up failures are errors of the house: init down, no sportsbook host, page without PROCESS_ENV', async () => {
  await assert.rejects(createLebullSource(fake({}).deps).listEvents('FOOTBALL', FROM, TO), /init: HTTP 404/);
  await assert.rejects(createLebullSource(fake({ [INIT]: ok({ data: { bootstrap: {} } }) }).deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
  await assert.rejects(createLebullSource(fake({ [INIT]: ok(text('init.json')), [PAGE]: ok('<html>Just a moment...</html>') }).deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
});

test('a failed start-up is retried by the next call (nothing cached)', async () => {
  const routes: Record<string, Reply> = { ...base(), [PAGE]: { status: 503, body: '' }, [TREE]: ok(footballTree), [league(4485)]: ok([]) };
  const source = createLebullSource(fake(routes).deps);
  await assert.rejects(source.listEvents('FOOTBALL', FROM, TO));
  routes[PAGE] = ok(text('sb-page.html'));
  assert.deepEqual(await source.listEvents('FOOTBALL', FROM, TO), []);
});

test('getMarkets maps a prematch body by its own sport; 404 falls back to /live', async () => {
  const pre = `${API}/games/42011147/prematch?${Q}`;
  const { deps, calls } = fake({ ...base(), [pre]: ok(text('prematch-football.json')) });
  const markets = await createLebullSource(deps).getMarkets('42011147');
  assert.ok(markets.some((m) => m.marketLabel === 'Resultado Final' && m.selectionLabel === '1' && m.odds === 1.31));
  assert.equal(calls.at(-1)!.url, pre);

  const live = `${API}/games/42011147/live?${Q}`;
  const fb = fake({ ...base(), [live]: ok(text('prematch-football.json')) });
  assert.ok((await createLebullSource(fb.deps).getMarkets('42011147')).length > 10);
  assert.deepEqual(fb.calls.slice(-2).map((c) => c.url), [`${API}/games/42011147/prematch?${Q}`, live]);

  await assert.rejects(createLebullSource(fake(base()).deps).getMarkets('abc'), ProviderFormatError);
  const hockey = `${API}/games/9/prematch?${Q}`;
  await assert.rejects(createLebullSource(fake({ ...base(), [hockey]: ok({ sportId: 10, teamA: 'A', teamB: 'B', stakeTypes: [] }) }).deps).getMarkets('9'), ProviderFormatError);
});

test('basketball and tennis prematch go through their own mappers', async () => {
  for (const [file, id, label] of [['prematch-basketball.json', '42534149', 'Vencedor (incl. prolongamento)'], ['prematch-tennis.json', '42534849', 'Vencedor']] as const) {
    const { deps } = fake({ ...base(), [`${API}/games/${id}/prematch?${Q}`]: ok(text(file)) });
    const markets = await createLebullSource(deps).getMarkets(id);
    assert.ok(markets.some((m) => m.marketLabel === label), label);
  }
});

test('a 429/403/HTML answer stops the refresh and starts a 10 min block with no request at all; a 500 does not', async () => {
  assert.equal(BLOCK_MS, 10 * 60 * 1000);
  const tree = { sports: [{ sportId: 1, countries: [{ leagues: [{ leagueId: 4485, eventsCount: 9 }, { leagueId: 4484, eventsCount: 8 }] }] }] };
  for (const reply of [{ status: 429, body: '' }, { status: 403, body: '' }, ok('<html>captcha</html>')]) {
    const f = fake({ ...base(), [TREE]: ok(tree), [league(4485)]: reply, [league(4484)]: ok(json('calendar-football.json')) });
    const s = createLebullSource(f.deps);
    await assert.rejects(s.listEvents('FOOTBALL', FROM, TO));
    assert.deepEqual(f.calls.map((c) => c.url), [INIT, PAGE, TREE, league(4485)], 'nothing after the blocked league');
    await assert.rejects(s.getMarkets('123'), /blocked until/);
    f.advance(BLOCK_MS - 1000);
    await assert.rejects(s.listEvents('TENNIS', FROM, TO), /blocked until/);
    assert.equal(f.calls.length, 4, 'no requests during the block');
    f.advance(2000);
    await s.listEvents('FOOTBALL', FROM, TO).catch(() => undefined);
    assert.ok(f.calls.length > 4, 'requests resume after the block');
  }
  const flaky = fake({ ...base(), [TREE]: ok(tree), [league(4485)]: { status: 500, body: '' }, [league(4484)]: ok(json('calendar-football.json')) });
  const s = createLebullSource(flaky.deps);
  assert.ok((await s.listEvents('FOOTBALL', FROM, TO)).length >= 1);
  await assert.rejects(s.getMarkets('999'), /HTTP 404/);
});
