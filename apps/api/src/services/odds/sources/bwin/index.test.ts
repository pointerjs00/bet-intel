import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { BLOCK_MS, CONFIG_TTL_MS, FOOTBALL_REFRESH_MS, MAX_PAGES, PAGE_SIZE, REQUEST_GAP_MS, createBwinSource, type BwinDeps } from './index';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'bwin');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');
const json = (name: string) => JSON.parse(text(name));

const CONFIG = 'https://www.bwin.pt/pt/api/clientconfig?browserUrl=http%3A%2F%2Fwww.bwin.pt%2Fpt%2Fsports';
const ID = 'YmQwNTFkNDAtNzM3Yi00YWIyLThkNDYtYWFmNGY2N2Y1OWIx';
const CDS = 'https://www.bwin.pt/cds-api/bettingoffer';
const FROM = '2026-11-21T00:00:00.000Z';
const TO = '2026-11-23T00:00:00.000Z';

const calUrl = (sportId: number, skip: number, id = ID, from = FROM, to = TO) =>
  `${CDS}/fixtures?x-bwin-accessid=${id}&lang=pt&country=PT&userCountry=PT&fixtureTypes=Standard&state=Latest&offerMapping=Filtered&offerCategories=Gridable` +
  `&fixtureCategories=Gridable&regionIds=&competitionIds=&conferences=&isPriceBoost=false&statisticsModes=None` +
  `&sportIds=${sportId}&skip=${skip}&take=100&sortBy=StartDate&from=${from}&to=${to}`;
const viewUrl = (fixtureId: string, id = ID) =>
  `${CDS}/fixture-view?x-bwin-accessid=${id}&lang=pt&country=PT&userCountry=PT&offerMapping=All&scoreboardMode=Full&fixtureIds=${fixtureId}` +
  '&state=Latest&includePrecreatedBetBuilder=true&supportVirtual=false&isBettingInsightsEnabled=true&useRegionalisedConfiguration=true&includeRelatedFixtures=false';

type Reply = { status?: number; body: string };
const ok = (body: unknown): Reply => ({ body: typeof body === 'string' ? body : JSON.stringify(body) });
const config = () => ok({ msConnection: { publicAccessId: ID, cdsFrontendUrl: 'https://www.bwin.pt/cds-api' } });

function fake(routes: Record<string, Reply | (() => Reply)>, extra: Partial<BwinDeps> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const deps: BwinDeps = {
    fetch: async (url, init) => {
      calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      const r = routes[url];
      const reply = typeof r === 'function' ? r() : (r ?? { status: 404, body: '' });
      return new Response(reply.body, { status: reply.status ?? 200 });
    },
    sleep: async (ms) => void sleeps.push(ms),
    now: () => clock,
    ...extra,
  };
  return { deps, calls, sleeps, advance: (ms: number) => void (clock += ms) };
}

test('start-up reads the public config; calendar requests carry the exact parameters and browser headers; config is cached', async () => {
  const { deps, calls } = fake({ [CONFIG]: config(), [calUrl(5, 0)]: ok(json('calendar-tennis.json')) });
  const source = createBwinSource(deps);
  const events = await source.listEvents('TENNIS', FROM, TO);
  assert.deepEqual(calls.map((c) => c.url), [CONFIG, calUrl(5, 0)]);
  for (const c of calls) {
    assert.match(c.headers['user-agent']!, /Mozilla/);
    assert.equal(c.headers['x-from-product'], 'host-app');
    assert.equal(c.headers['x-bwin-sports-api'], 'prod');
    assert.equal(c.headers['x-bwin-browser-url'], 'http%3A%2F%2Fwww.bwin.pt%2Fpt%2Fsports');
    assert.equal(c.headers.origin, 'https://www.bwin.pt');
  }
  assert.ok(events.length === 2 && events.every((e) => e.house === 'bwin' && e.sport === 'TENNIS'));
  const before = calls.length;
  await source.listEvents('TENNIS', FROM, TO);
  assert.deepEqual(calls.slice(before).map((c) => c.url), [calUrl(5, 0)]);
});

test('concurrent first calls share one config request; it is refetched after 6 h', async () => {
  const { deps, calls, advance } = fake({ [CONFIG]: config(), [calUrl(5, 0)]: ok(json('calendar-tennis.json')), [calUrl(7, 0)]: ok({ fixtures: [] }) });
  const source = createBwinSource(deps);
  await Promise.all([source.listEvents('TENNIS', FROM, TO), source.listEvents('BASKETBALL', FROM, TO)]);
  assert.equal(calls.filter((c) => c.url === CONFIG).length, 1);
  advance(CONFIG_TTL_MS);
  await source.listEvents('TENNIS', FROM, TO);
  assert.equal(calls.filter((c) => c.url === CONFIG).length, 2);
});

test('football calendar is paged with take=100 until a short page or totalCount; every page is requested once', async () => {
  const f = json('calendar-football.json').fixtures;
  let tag = 0;
  const page = (n: number) => ({ totalCount: 230, fixtures: Array.from({ length: n }, () => ({ ...f[0], id: `2:${++tag}` })) });
  const routes = { [CONFIG]: config(), [calUrl(4, 0)]: ok(page(PAGE_SIZE)), [calUrl(4, 100)]: ok(page(PAGE_SIZE)), [calUrl(4, 200)]: ok(page(30)) };
  const { deps, calls } = fake(routes);
  const events = await createBwinSource(deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(events.length, 230);
  assert.deepEqual(calls.slice(1).map((c) => c.url), [calUrl(4, 0), calUrl(4, 100), calUrl(4, 200)]);
});

test('paging stops at totalCount even if the last page is full, and never beyond MAX_PAGES', async () => {
  const f = json('calendar-football.json').fixtures[0];
  let seq = 0;
  const full = () => ({ totalCount: 200, fixtures: Array.from({ length: PAGE_SIZE }, () => ({ ...f, id: `2:${++seq}` })) });
  const a = fake({ [CONFIG]: config(), [calUrl(4, 0)]: ok(full()), [calUrl(4, 100)]: ok(full()) });
  await createBwinSource(a.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(a.calls.length, 3);
  let n = 0;
  const endless = fake({ [CONFIG]: config() });
  endless.deps.fetch = async (url) => {
    if (url === CONFIG) return new Response(config().body);
    n++;
    return new Response(JSON.stringify({ totalCount: 99999, fixtures: Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...f, id: `2:${n}${i}` })) }));
  };
  await createBwinSource(endless.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(n, MAX_PAGES);
});

test('window: events after `to` and non-live events before `from` are dropped; live ones stay; list is sorted by start', async () => {
  const body = json('calendar-football.json');
  const { deps } = fake({ [CONFIG]: config(), [calUrl(4, 0)]: ok(body) });
  const all = await createBwinSource(deps).listEvents('FOOTBALL', '2026-11-21T00:00:00.000Z', '2026-11-23T00:00:00.000Z');
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((e) => e.startsAt), [...all.map((e) => e.startsAt)].sort());
  const [nf, nt] = ['2026-11-21T02:00:00.000Z', '2026-11-21T04:00:00.000Z'];
  const narrow = fake({ [CONFIG]: config(), [calUrl(4, 0, ID, nf, nt)]: ok(body) });
  const out = await createBwinSource(narrow.deps).listEvents('FOOTBALL', nf, nt);
  // 2:7910804 starts 01:00 (before), 2:7914039 at 05:00 (after), the live one started 00:00 and stays.
  assert.deepEqual(out.map((e) => [e.houseEventId, e.live]), [['2:7916453', true]]);
});

test('requests are paced ≥ 300 ms apart (none before the first)', async () => {
  const { deps, calls, sleeps } = fake({ [CONFIG]: config(), [calUrl(5, 0)]: ok(json('calendar-tennis.json')) });
  await createBwinSource(deps).listEvents('TENNIS', FROM, TO);
  assert.equal(sleeps.length, calls.length - 1);
  assert.ok(sleeps.every((ms) => ms >= REQUEST_GAP_MS));
});

test('anti-bot / HTML answers are format errors; HTTP errors are plain errors; nothing is retried around them', async () => {
  const html = fake({ [CONFIG]: config(), [calUrl(5, 0)]: ok('<html><title>Just a moment...</title></html>') });
  await assert.rejects(createBwinSource(html.deps).listEvents('TENNIS', FROM, TO), (e: unknown) => e instanceof ProviderFormatError && /HTML/.test((e as Error).message));
  const cfgHtml = fake({ [CONFIG]: ok('<html>blocked</html>') });
  await assert.rejects(createBwinSource(cfgHtml.deps).listEvents('TENNIS', FROM, TO), ProviderFormatError);
  const noId = fake({ [CONFIG]: ok({ msConnection: {} }) });
  await assert.rejects(createBwinSource(noId.deps).listEvents('TENNIS', FROM, TO), ProviderFormatError);
  const noList = fake({ [CONFIG]: config(), [calUrl(5, 0)]: ok({ nope: 1 }) });
  await assert.rejects(createBwinSource(noList.deps).listEvents('TENNIS', FROM, TO), ProviderFormatError);
  const err = fake({ [CONFIG]: config(), [calUrl(5, 0)]: { status: 500, body: '' } });
  await assert.rejects(createBwinSource(err.deps).listEvents('TENNIS', FROM, TO), /HTTP 500/);
  assert.equal(err.calls.length, 2);
});

test('a 403 re-reads the config once (rotated access id) and retries; a second 403 is an error', async () => {
  const NEW = 'bmV3QWNjZXNzSWQtMTIzNDU2Nzg5MA';
  let cfg = 0;
  const routes: Record<string, Reply | (() => Reply)> = {
    [CONFIG]: () => ({ body: cfg++ === 0 ? config().body : JSON.stringify({ msConnection: { publicAccessId: NEW, cdsFrontendUrl: 'https://www.bwin.pt/cds-api' } }) }),
    [calUrl(5, 0)]: { status: 403, body: '' },
    [calUrl(5, 0, NEW)]: ok(json('calendar-tennis.json')),
  };
  const { deps, calls } = fake(routes);
  const events = await createBwinSource(deps).listEvents('TENNIS', FROM, TO);
  assert.equal(events.length, 2);
  assert.deepEqual(calls.map((c) => c.url), [CONFIG, calUrl(5, 0), CONFIG, calUrl(5, 0, NEW)]);
  const dead = fake({ [CONFIG]: config(), [calUrl(5, 0)]: { status: 403, body: '' } });
  await assert.rejects(createBwinSource(dead.deps).listEvents('TENNIS', FROM, TO), /HTTP 403/);
  assert.equal(dead.calls.length, 4);
});

test('a request that hangs times out with a clear error', async () => {
  const { deps } = fake({}, {
    timeoutMs: 20,
    fetch: (_url, init) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))),
  });
  await assert.rejects(createBwinSource(deps).listEvents('TENNIS', FROM, TO), /timeout/);
});

test('getMarkets maps fixture-view by the fixture own sport (one request)', async () => {
  const id = '20123088';
  const { deps, calls } = fake({ [CONFIG]: config(), [viewUrl(id)]: ok(text('view-tennis.json')) });
  const markets = await createBwinSource(deps).getMarkets(id);
  assert.ok(markets.some((m) => m.marketLabel === 'Vencedor' && m.selectionLabel === 'Carlos Alcaraz' && m.odds === 1.22));
  assert.equal(calls.at(-1)!.url, viewUrl(id));
  const fb = fake({ [CONFIG]: config(), [viewUrl('2:7914231')]: ok(text('view-football.json')) });
  assert.ok((await createBwinSource(fb.deps).getMarkets('2:7914231')).some((m) => m.marketLabel === 'Resultado Final'));
  await assert.rejects(createBwinSource(fake({ [CONFIG]: config() }).deps).getMarkets('abc'), ProviderFormatError);
  await assert.rejects(createBwinSource(fake({ [CONFIG]: config(), [viewUrl('9')]: ok({ fixture: { sport: { id: 11 } } }) }).deps).getMarkets('9'), ProviderFormatError);
});

test('a 429, an HTML answer or a 403 that survives the config re-read starts a 10 min block with no request at all; a 500 does not', async () => {
  assert.equal(BLOCK_MS, 10 * 60 * 1000);
  for (const reply of [{ status: 429, body: '' }, { status: 403, body: '' }, ok('<html>captcha</html>')]) {
    const f = fake({ [CONFIG]: config(), [calUrl(5, 0)]: reply, [calUrl(4, 0)]: ok(json('calendar-football.json')) });
    const s = createBwinSource(f.deps);
    await assert.rejects(s.listEvents('TENNIS', FROM, TO));
    const sent = f.calls.length;
    await assert.rejects(s.listEvents('FOOTBALL', FROM, TO), /blocked until/);
    await assert.rejects(s.getMarkets('2:7914231'), /blocked until/);
    f.advance(BLOCK_MS - 1000);
    await assert.rejects(s.listEvents('FOOTBALL', FROM, TO), /blocked until/);
    assert.equal(f.calls.length, sent, 'no requests during the block');
    f.advance(2000);
    await s.listEvents('FOOTBALL', FROM, TO).catch(() => undefined);
    assert.ok(f.calls.length > sent, 'requests resume after the block');
  }
  const flaky = fake({ [CONFIG]: config(), [calUrl(5, 0)]: { status: 500, body: '' } });
  const s = createBwinSource(flaky.deps);
  await assert.rejects(s.listEvents('TENNIS', FROM, TO), /HTTP 500/);
  await assert.rejects(s.listEvents('TENNIS', FROM, TO), /HTTP 500/);
  assert.equal(flaky.calls.length, 3);
});

test('football calendar (~14 MB) is fetched at most every 30 min; in between the last one is filtered to the new window', async () => {
  assert.equal(FOOTBALL_REFRESH_MS, 30 * 60_000);
  const f = fake({ [CONFIG]: config(), [calUrl(4, 0)]: ok(json('calendar-football.json')), [calUrl(5, 0)]: ok(json('calendar-tennis.json')) });
  const s = createBwinSource(f.deps);
  const first = await s.listEvents('FOOTBALL', FROM, TO);
  assert.ok(first.length > 0);
  const n = f.calls.length;
  f.advance(FOOTBALL_REFRESH_MS - 1000);
  assert.deepEqual(await s.listEvents('FOOTBALL', FROM, TO), first);
  // A window that starts after every cached game keeps only the live ones.
  const later = await s.listEvents('FOOTBALL', TO, '2026-11-25T00:00:00.000Z');
  assert.ok(later.length < first.length && later.every((e) => e.live));
  assert.equal(f.calls.length, n, 'no request within 30 min');
  await s.listEvents('TENNIS', FROM, TO);
  await s.listEvents('TENNIS', FROM, TO);
  assert.equal(f.calls.length, n + 2, 'other sports are not cached');
  f.advance(2000);
  await s.listEvents('FOOTBALL', FROM, TO);
  assert.equal(f.calls.length, n + 3, 'refetched after 30 min');
});
