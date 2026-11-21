import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { BLOCK_MS, CONFIG_TTL_MS, MAX_PAGES, PAGE_SIZE, REQUEST_GAP_MS, createCasinoPortugalSource, type CasinoPortugalDeps } from './index';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'casinoportugal');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');
const json = (name: string) => JSON.parse(text(name));

const API = 'https://aio-offer-distribution.de-2.nsoft.cloud';
const TENANT = '10ca03ad-9dc4-4320-bbc2-c93a42194d08';
const BASE = `${API}/tenants/${TENANT}/games/1,2/languages/pt`;
const FROM = '2026-11-21T02:00:00.000Z';
const TO = '2026-11-23T02:00:00.000Z';

type Reply = { status?: number; body: string };
const ok = (body: unknown): Reply => ({ body: typeof body === 'string' ? body : JSON.stringify(body) });
const cursor = (n: number) => `cursor${String(n).padStart(20, '0')}`;

/** A football calendar page of `n` events (ids from `start`), all 2026-11-22 12:00Z unless given, with an opaque cursor. */
function page(n: number, start = 1, next = cursor(start + n), startsAt = '2026-11-22T12:00:00Z') {
  const body = json('calendar-football.json');
  const proto = body.events[0];
  body.cursorId = next;
  body.events = Array.from({ length: n }, (_, i) => ({ ...proto, id: start + i, startsAt }));
  return body;
}

/** Fake network: `route(url)` answers; every call is recorded. */
function fake(route: (url: string, n: number) => Reply, extra: Partial<CasinoPortugalDeps> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const deps: CasinoPortugalDeps = {
    fetch: async (url, init) => {
      calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      const r = route(url, calls.length);
      return new Response(r.body, { status: r.status ?? 200 });
    },
    sleep: async (ms) => void sleeps.push(ms),
    now: () => clock,
    ...extra,
  };
  return { deps, calls, sleeps, urls: () => calls.map((c) => c.url), advance: (ms: number) => void (clock += ms), setClock: (t: number) => void (clock = t) };
}

const isHtml = (u: string) => u === 'https://www.casinoportugal.pt/desporto';
const WIDGET = ok(text('desporto.html'));

test('start-up reads the tenant id and API host from /desporto; the calendar request carries the exact query and browser headers', async () => {
  const f = fake((u) => (isHtml(u) ? WIDGET : ok(page(2))));
  const events = await createCasinoPortugalSource(f.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(events.length, 2);
  assert.equal(f.calls[0]!.url, 'https://www.casinoportugal.pt/desporto');
  assert.match(f.calls[0]!.headers['user-agent']!, /Mozilla/);
  assert.equal(
    f.calls[1]!.url,
    `${BASE}/offer/cursors?expectedNumberOfEvents=200&numberOfMarketsPerSport=1&extensions=market-feature-flags&marketTypes=1&eventTypes=1&sports=69&startsAtFrom=2026-11-21T02:00:00&startsAtTo=2026-11-23T02:00:00`,
  );
  assert.equal(f.calls[1]!.headers.origin, 'https://www.casinoportugal.pt');
  assert.equal(f.calls[1]!.headers.referer, 'https://www.casinoportugal.pt/');
  assert.equal(f.calls[1]!.headers.accept, 'application/json');
  assert.match(f.calls[1]!.headers['accept-language']!, /pt/);
  assert.ok(events.every((e) => e.house === 'casinoportugal' && e.sport === 'FOOTBALL'));
});

test('sport ids in the request: football 69, basketball 72, tennis 75', async () => {
  for (const [sport, id, fixture] of [['FOOTBALL', 69, 'calendar-football.json'], ['BASKETBALL', 72, 'calendar-basketball.json'], ['TENNIS', 75, 'calendar-tennis.json']] as const) {
    const f = fake((u) => (isHtml(u) ? WIDGET : ok(json(fixture))));
    await createCasinoPortugalSource(f.deps).listEvents(sport, FROM, TO);
    assert.match(f.calls[1]!.url, new RegExp(`&sports=${id}&`), sport);
  }
});

test('config is cached for 6 h and shared by concurrent first calls; after the TTL it is read again', async () => {
  const f = fake((u) => (isHtml(u) ? WIDGET : ok(json('calendar-tennis.json'))));
  const s = createCasinoPortugalSource(f.deps);
  await Promise.all([s.listEvents('TENNIS', FROM, TO), s.listEvents('TENNIS', FROM, TO)]);
  assert.equal(f.urls().filter(isHtml).length, 1, 'one start-up request for two parallel calls');
  await s.listEvents('TENNIS', FROM, TO);
  assert.equal(f.urls().filter(isHtml).length, 1, 'cached');
  f.advance(CONFIG_TTL_MS + 1);
  await s.listEvents('TENNIS', FROM, TO);
  assert.equal(f.urls().filter(isHtml).length, 2, 'refreshed after 6 h');
  assert.equal(CONFIG_TTL_MS, 6 * 60 * 60 * 1000);
});

test('a failed start-up is not cached: the next call tries again', async () => {
  let n = 0;
  const f = fake((u) => (isHtml(u) ? (++n === 1 ? { status: 500, body: '' } : WIDGET) : ok(json('calendar-tennis.json'))));
  const s = createCasinoPortugalSource(f.deps);
  await assert.rejects(s.listEvents('TENNIS', FROM, TO), /HTTP 500/);
  assert.equal((await s.listEvents('TENNIS', FROM, TO)).length, 3);
});

test('paging: full pages follow the cursor, a short page ends it; the window filters by startsAt and duplicates collapse', async () => {
  const p1 = page(PAGE_SIZE, 1, cursor(1));
  p1.events[0].startsAt = '2026-11-20T10:00:00Z'; // before the window
  p1.events[1].startsAt = '2026-11-25T10:00:00Z'; // after the window
  const p2 = page(139, 150, cursor(2)); // ids 150.. overlap the first page
  Object.assign(p2, { sports: [], markets: [] }); // like the real continuation pages: no sports, no dictionary
  const f = fake((u) => (isHtml(u) ? WIDGET : u.includes(`/offer/cursors/${cursor(1)}`) ? ok(p2) : ok(p1)));
  const events = await createCasinoPortugalSource(f.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(f.calls.length, 3, 'config + 2 pages, nothing after the short page');
  assert.equal(f.calls[2]!.url, `${BASE}/offer/cursors/${cursor(1)}?expectedNumberOfEvents=200&numberOfMarketsPerSport=1&extensions=market-feature-flags`);
  const ids = events.map((e) => e.houseEventId);
  assert.equal(new Set(ids).size, ids.length, 'overlapping ids listed once');
  assert.ok(!ids.includes('1') && !ids.includes('2'), 'events outside the window are dropped');
  assert.equal(ids.length, 198 + 139 - 51, 'pages 1 (198 in window) + 2 (139) minus the 51 ids both pages carry (150..200)');
  assert.deepEqual(events.map((e) => e.startsAt), [...events.map((e) => e.startsAt)].sort());
  assert.ok(events.every((e) => e.mainMarkets?.length === 3), 'page 2 events get their 1X2 from the dictionary of page 1');
});

test(`paging is capped at ${MAX_PAGES} pages per sport and refresh`, async () => {
  let n = 0;
  const f = fake((u) => (isHtml(u) ? WIDGET : ok(page(PAGE_SIZE, 1000 * ++n, cursor(n)))));
  const events = await createCasinoPortugalSource(f.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(f.calls.length, 1 + MAX_PAGES);
  assert.equal(events.length, MAX_PAGES * PAGE_SIZE);
  assert.equal(MAX_PAGES, 5);
});

test('an empty page ends the listing; a later page that fails keeps what was read, the first page failing is an error', async () => {
  const empty = fake((u) => (isHtml(u) ? WIDGET : ok({ ...page(0), cursorId: cursor(9) })));
  assert.deepEqual(await createCasinoPortugalSource(empty.deps).listEvents('FOOTBALL', FROM, TO), []);
  assert.equal(empty.calls.length, 2);
  const tail = fake((u) => (isHtml(u) ? WIDGET : u.includes('/offer/cursors/') ? { status: 500, body: '' } : ok(page(PAGE_SIZE, 1, cursor(1)))));
  const kept = await createCasinoPortugalSource(tail.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(kept.length, PAGE_SIZE);
  const head = fake((u) => (isHtml(u) ? WIDGET : { status: 500, body: '' }));
  await assert.rejects(createCasinoPortugalSource(head.deps).listEvents('FOOTBALL', FROM, TO), /HTTP 500/);
});

test(`requests are paced ${REQUEST_GAP_MS} ms (≥ 300 ms) apart, none before the first`, async () => {
  let n = 0;
  const g = fake((u) => (isHtml(u) ? WIDGET : ++n < 3 ? ok(page(PAGE_SIZE, 1000 * n, cursor(n))) : ok(page(5, 9000))));
  await createCasinoPortugalSource(g.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(g.calls.length, 4);
  assert.equal(g.sleeps.length, g.calls.length - 1);
  assert.ok(g.sleeps.every((ms) => ms >= REQUEST_GAP_MS));
  assert.ok(REQUEST_GAP_MS >= 300);
});

test('concurrent sports share one gate: parallel calendars never overlap or skip the gap', async () => {
  const f = fake((u) => (isHtml(u) ? WIDGET : ok(json('calendar-tennis.json'))));
  const s = createCasinoPortugalSource(f.deps);
  await Promise.all([s.listEvents('TENNIS', FROM, TO), s.listEvents('BASKETBALL', FROM, TO)]);
  assert.equal(f.sleeps.length, f.calls.length - 1);
});

test('HTML / non-JSON answers are format errors; a body without events too; HTTP errors are plain errors and are not retried', async () => {
  const html = fake((u) => (isHtml(u) ? WIDGET : ok('<html><title>Just a moment...</title></html>')));
  await assert.rejects(createCasinoPortugalSource(html.deps).listEvents('FOOTBALL', FROM, TO), (e: unknown) => e instanceof ProviderFormatError && /HTML/.test((e as Error).message));
  const junk = fake((u) => (isHtml(u) ? WIDGET : ok('not json')));
  await assert.rejects(createCasinoPortugalSource(junk.deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
  const noEvents = fake((u) => (isHtml(u) ? WIDGET : ok({ sports: [] })));
  await assert.rejects(createCasinoPortugalSource(noEvents.deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
  const err = fake((u) => (isHtml(u) ? WIDGET : { status: 500, body: '' }));
  await assert.rejects(createCasinoPortugalSource(err.deps).listEvents('FOOTBALL', FROM, TO), /HTTP 500/);
  assert.equal(err.calls.length, 2, 'nothing is retried around it');
});

test('a sports page without the widget config (changed site or anti-bot page) is a format error', async () => {
  const f = fake(() => ok('<html>Verifying you are human</html>'));
  await assert.rejects(createCasinoPortugalSource(f.deps).listEvents('FOOTBALL', FROM, TO), (e: unknown) => e instanceof ProviderFormatError && /tenant/.test((e as Error).message));
});

test('a 429 or 403 aborts the refresh at once and the adapter then makes NO request for 10 minutes; afterwards it resumes', async () => {
  for (const status of [429, 403]) {
    let n = 0;
    const f = fake((u) => (isHtml(u) ? WIDGET : ++n === 2 ? { status, body: '<html>rejected</html>' } : ok(page(PAGE_SIZE, 1000 * n, cursor(n)))));
    const s = createCasinoPortugalSource(f.deps);
    await assert.rejects(s.listEvents('FOOTBALL', FROM, TO), new RegExp(`HTTP ${status}`));
    assert.equal(f.calls.length, 3, `config + page 1 + the limited page 2; nothing after it (${status})`);
    // While blocked: every entry point fails without touching the network.
    const before = f.calls.length;
    await assert.rejects(s.listEvents('TENNIS', FROM, TO), /blocked until/);
    await assert.rejects(s.getMarkets('1605656'), /blocked until/);
    f.advance(BLOCK_MS - 1000);
    await assert.rejects(s.listEvents('BASKETBALL', FROM, TO), /blocked until/);
    assert.equal(f.calls.length, before, 'no requests during the block');
    // After the 10 minutes it tries again.
    f.advance(2000);
    n = 100;
    const events = await s.listEvents('TENNIS', FROM, TO).catch(() => []);
    assert.ok(f.calls.length > before, 'requests resume after the block');
    void events;
  }
  assert.equal(BLOCK_MS, 10 * 60 * 1000);
});

test('an HTML (anti-bot) answer from the API also starts the block; a plain 500 does not', async () => {
  const bot = fake((u) => (isHtml(u) ? WIDGET : ok('<html>captcha</html>')));
  const s = createCasinoPortugalSource(bot.deps);
  await assert.rejects(s.listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
  const before = bot.calls.length;
  await assert.rejects(s.listEvents('FOOTBALL', FROM, TO), /blocked until/);
  assert.equal(bot.calls.length, before);
  const flaky = fake((u) => (isHtml(u) ? WIDGET : { status: 500, body: '' }));
  const t = createCasinoPortugalSource(flaky.deps);
  await assert.rejects(t.listEvents('FOOTBALL', FROM, TO), /HTTP 500/);
  await assert.rejects(t.listEvents('FOOTBALL', FROM, TO), /HTTP 500/);
  assert.equal(flaky.calls.length, 3, 'config once + one request per attempt: no fail-fast after a 500');
});

test('requests queued behind the one that got blocked do not go out', async () => {
  const f = fake((u) => (isHtml(u) ? WIDGET : { status: 429, body: '' }));
  const s = createCasinoPortugalSource(f.deps);
  const results = await Promise.allSettled([s.listEvents('FOOTBALL', FROM, TO), s.listEvents('BASKETBALL', FROM, TO), s.listEvents('TENNIS', FROM, TO)]);
  assert.ok(results.every((r) => r.status === 'rejected'));
  assert.equal(f.calls.length, 2, 'config + the one 429');
});

test('a request that hangs times out with a clear error', async () => {
  const f = fake(() => ok(''), {
    timeoutMs: 20,
    fetch: (_url, init) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))),
  });
  await assert.rejects(createCasinoPortugalSource(f.deps).listEvents('FOOTBALL', FROM, TO), /timeout/);
});

test('getMarkets: one request to offer/events/{id} with the dictionary included, mapped by the event own sport', async () => {
  const f = fake((u) => (isHtml(u) ? WIDGET : ok(json('event-basketball.json'))));
  const markets = await createCasinoPortugalSource(f.deps).getMarkets('1674778');
  assert.equal(
    f.calls[1]!.url,
    `${BASE}/offer/events/1674778?extensions=market-feature-flags&excludeSportCategoryTournamentMetadata=false&excludeMarketMetadata=false&waitForEventsToBecomeAvailable=false`,
  );
  assert.ok(markets.some((m) => m.marketLabel === 'Vencedor (incl. prolongamento)' && m.selectionLabel === 'Pyrinto Tampere' && m.odds === 1.25));
  await assert.rejects(createCasinoPortugalSource(fake(() => WIDGET).deps).getMarkets('abc'), ProviderFormatError);
  await assert.rejects(createCasinoPortugalSource(fake(() => WIDGET).deps).getMarkets('1; drop'), ProviderFormatError);
  const other = fake((u) => (isHtml(u) ? WIDGET : ok({ sports: [{ id: 60 }], events: [{}] })));
  await assert.rejects(createCasinoPortugalSource(other.deps).getMarkets('9'), ProviderFormatError);
});
