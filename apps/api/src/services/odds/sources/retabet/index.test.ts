import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { BASKETBALL_LEAGUES, BLOCK_MS, CALENDAR_TTL_MS, FOOTBALL_LEAGUES, MAX_PENDING_PAGES, REQUEST_GAP_MS, createRetabetSource, type RetabetDeps } from './index';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'retabet');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');

const SITE = 'https://www.retabet.pt';
const FROM = '2026-11-21T00:00:00.000Z';
const TO = '2026-11-23T00:00:00.000Z';

type Reply = { status?: number; body: string; headers?: [string, string][] };
const ok = (body: string, headers?: [string, string][]): Reply => ({ body, ...(headers ? { headers } : {}) });
const COOKIES: [string, string][] = [
  ['set-cookie', 'ug=10164; expires=Sun, 21 Nov 2027 02:01:21 GMT; domain=.retabet.pt; path=/; secure; httponly'],
  ['set-cookie', 'RETABal=abc123; path=/; secure; HttpOnly'],
];
const HOME = ok('<html><body>home</body></html>', COOKIES);

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** Fake network: `route(call, n)` answers; every call is recorded. */
function fake(route: (call: Call, n: number) => Reply, extra: Partial<RetabetDeps> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  let inFlight = 0;
  let maxInFlight = 0;
  const deps: RetabetDeps = {
    fetch: async (url, init) => {
      const call: Call = { method: String(init.method ?? 'GET'), url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body as string | undefined };
      calls.push(call);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight--;
      const r = route(call, calls.length);
      return new Response(r.body, { status: r.status ?? 200, headers: r.headers });
    },
    sleep: async (ms) => void sleeps.push(ms),
    now: () => clock,
    ...extra,
  };
  return {
    deps,
    calls,
    sleeps,
    urls: () => calls.map((c) => `${c.method} ${c.url.replace(SITE, '')}`),
    maxInFlight: () => maxInFlight,
    advance: (ms: number) => void (clock += ms),
  };
}

const isHome = (c: Call) => c.method === 'GET' && c.url === `${SITE}/`;
const isCalendar = (c: Call) => c.method === 'GET' && c.url === `${SITE}/calendario`;
const isPending = (c: Call) => c.method === 'POST' && c.url === `${SITE}/api/sportsbookCalendarEvents/LoadPending`;
const isLeague = (c: Call) => c.method === 'GET' && /\/desportos\/(futebol|basquetebol)\/liga\/liga\/\d+$/.test(c.url);
const isTennisPage = (c: Call) => c.method === 'GET' && c.url === `${SITE}/desportos/tenis/8`;

/** Happy-path site: home, calendar page, one LoadPending page then the end, league pages, tennis page. */
function site(c: Call): Reply {
  if (isHome(c)) return HOME;
  if (isCalendar(c)) return ok(text('calendar.html'));
  if (isPending(c)) return ok(JSON.parse(c.body!).lei === 38982693 ? text('loadpending.json') : text('loadpending-end.json'));
  if (isLeague(c)) return ok(text('league.html'));
  if (isTennisPage(c)) return ok(text('tennis-page.html'));
  throw new Error(`unexpected request ${c.method} ${c.url}`);
}

test('football refresh: session cookie first, then the calendar, the cursor chain, then one page per league; sorted, de-duplicated, window-filtered', async () => {
  const f = fake(site);
  const events = await createRetabetSource(f.deps).listEvents('FOOTBALL', FROM, TO);
  const urls = f.urls();
  assert.equal(urls[0], 'GET /');
  assert.equal(urls[1], 'GET /calendario');
  assert.equal(urls[2], 'POST /api/sportsbookCalendarEvents/LoadPending');
  assert.equal(urls[3], 'POST /api/sportsbookCalendarEvents/LoadPending');
  assert.equal(urls.filter((u) => /GET \/desportos\/futebol\/liga\/liga\/\d+$/.test(u)).length, FOOTBALL_LEAGUES.length);
  assert.equal(urls.length, 4 + FOOTBALL_LEAGUES.length);
  assert.ok(FOOTBALL_LEAGUES.length <= 25, 'league budget');
  assert.equal(new Set(FOOTBALL_LEAGUES).size, FOOTBALL_LEAGUES.length);
  // 2 football events of the calendar + 2 of the pending page + 4 of the league page (repeated for every league, listed once)
  assert.equal(events.length, 8);
  assert.equal(new Set(events.map((e) => e.houseEventId)).size, 8);
  assert.deepEqual(events.map((e) => e.startsAt), [...events.map((e) => e.startsAt)].sort());
  assert.ok(events.every((e) => e.house === 'retabet' && e.sport === 'FOOTBALL'));
  assert.ok(events.every((e) => Date.parse(e.startsAt) >= Date.parse(FROM) && Date.parse(e.startsAt) <= Date.parse(TO)));
});

test('the cursor chain: the first LoadPending continues after the last event of the calendar page, the next one uses the returned cursor', async () => {
  const f = fake(site);
  await createRetabetSource(f.deps).listEvents('FOOTBALL', FROM, TO);
  const pending = f.calls.filter(isPending);
  assert.deepEqual(JSON.parse(pending[0]!.body!), { wpa: 'CentralPanel', wpo: 1, lei: 38982693, let: '2026-11-21T17:00:00.0000000Z' });
  assert.deepEqual(JSON.parse(pending[1]!.body!), { wpa: 'CentralPanel', wpo: 1, lei: 38980586, let: '2026-11-21T02:20:00.0000000Z' });
  assert.equal(pending[0]!.headers['content-type'], 'application/json; charset=UTF-8');
  assert.equal(pending[0]!.headers['x-requested-with'], 'XMLHttpRequest');
  assert.equal(pending[0]!.headers.origin, SITE);
  assert.match(pending[0]!.headers.referer!, /retabet\.pt/);
});

test('requests carry browser headers and the session cookie; they are serialised and spaced by REQUEST_GAP_MS', async () => {
  const f = fake(site);
  const s = createRetabetSource(f.deps);
  await Promise.all([s.listEvents('FOOTBALL', FROM, TO), s.listEvents('TENNIS', FROM, TO)]);
  assert.equal(f.maxInFlight(), 1, 'one request at a time');
  assert.equal(f.sleeps.length, f.calls.length - 1);
  assert.ok(f.sleeps.every((ms) => ms === REQUEST_GAP_MS));
  assert.ok(REQUEST_GAP_MS >= 1000);
  assert.equal(f.calls[0]!.headers.cookie, undefined);
  for (const c of f.calls.slice(1)) {
    assert.equal(c.headers.cookie, 'ug=10164; RETABal=abc123');
    assert.match(c.headers['user-agent']!, /Mozilla/);
    assert.match(c.headers['accept-language']!, /pt-PT/);
  }
});

test('the day calendar is shared by the sports of one refresh and read again after the TTL', async () => {
  const f = fake(site);
  const s = createRetabetSource(f.deps);
  await s.listEvents('FOOTBALL', FROM, TO);
  await s.listEvents('BASKETBALL', FROM, TO);
  await s.listEvents('TENNIS', FROM, TO);
  assert.equal(f.calls.filter(isCalendar).length, 1);
  assert.equal(f.calls.filter(isHome).length, 1, 'one session');
  f.advance(CALENDAR_TTL_MS + 1);
  await s.listEvents('TENNIS', FROM, TO);
  assert.equal(f.calls.filter(isCalendar).length, 2);
  assert.equal(f.calls.filter(isHome).length, 1, 'the session cookie is kept in memory');
});

test('basketball: calendar events of the sport plus the league pages; NBA is among them', async () => {
  const f = fake(site);
  const events = await createRetabetSource(f.deps).listEvents('BASKETBALL', FROM, TO);
  assert.equal(f.calls.filter(isLeague).length, BASKETBALL_LEAGUES.length);
  assert.ok(f.calls.filter(isLeague).every((c) => c.url.includes('/desportos/basquetebol/')));
  assert.ok(BASKETBALL_LEAGUES.includes(41), 'NBA');
  assert.ok(events.every((e) => e.sport === 'BASKETBALL'));
  assert.deepEqual(events.map((e) => e.houseEventId), ['38980990', '38984979'].sort());
});

test('tennis: calendar singles plus the tennis page (today and tomorrow), doubles dropped', async () => {
  const f = fake(site);
  const events = await createRetabetSource(f.deps).listEvents('TENNIS', FROM, TO);
  assert.equal(f.calls.filter(isTennisPage).length, 1);
  assert.equal(f.calls.filter(isLeague).length, 0);
  assert.ok(events.length >= 2);
  assert.ok(events.every((e) => e.sport === 'TENNIS' && !e.home.includes(' / ')));
});

test('league pages that fail (404) are skipped with the others kept; if all of them fail the refresh fails', async () => {
  let n = 0;
  const some = fake((c) => {
    if (isLeague(c)) return ++n === 3 ? { status: 404, body: 'not found' } : site(c);
    return site(c);
  });
  const events = await createRetabetSource(some.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(events.length, 8);
  const all = fake((c) => (isLeague(c) ? { status: 404, body: 'not found' } : site(c)));
  await assert.rejects(() => createRetabetSource(all.deps).listEvents('FOOTBALL', FROM, TO), /league/i);
});

test('league page with the widget missing is skipped too, but a calendar page without it is a ProviderFormatError', async () => {
  const f = fake((c) => (isLeague(c) ? ok('<html><body>sem jogos</body></html>') : site(c)));
  await assert.rejects(() => createRetabetSource(f.deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
  const g = fake((c) => (isCalendar(c) ? ok('<html><body>changed site</body></html>') : site(c)));
  await assert.rejects(() => createRetabetSource(g.deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
  // a changed site is not an anti-bot block: the next call asks again
  await assert.rejects(() => createRetabetSource(g.deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
  assert.equal(g.calls.filter(isCalendar).length, 2);
});

test('paging is capped at MAX_PENDING_PAGES', async () => {
  const f = fake((c) => {
    if (isPending(c)) {
      const page = JSON.parse(text('loadpending.json'));
      page.lei = 38980586 + f.calls.length;
      return ok(JSON.stringify(page));
    }
    return site(c);
  });
  await createRetabetSource(f.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(f.calls.filter(isPending).length, MAX_PENDING_PAGES);
});

test('POST 400 (session cookie rejected): the session is renewed once and the POST retried; a second 400 is an error', async () => {
  let first = true;
  const f = fake((c) => {
    if (isPending(c) && first) {
      first = false;
      return { status: 400, body: '' };
    }
    return site(c);
  });
  const events = await createRetabetSource(f.deps).listEvents('FOOTBALL', FROM, TO);
  assert.equal(events.length, 8);
  const urls = f.urls();
  const i = urls.indexOf('POST /api/sportsbookCalendarEvents/LoadPending');
  assert.deepEqual(urls.slice(i, i + 3), ['POST /api/sportsbookCalendarEvents/LoadPending', 'GET /', 'POST /api/sportsbookCalendarEvents/LoadPending']);
  assert.equal(f.calls.filter(isHome).length, 2);

  const bad = fake((c) => (isPending(c) ? { status: 400, body: '' } : site(c)));
  await assert.rejects(() => createRetabetSource(bad.deps).listEvents('FOOTBALL', FROM, TO), /400/);
  assert.equal(bad.calls.filter(isPending).length, 2, 'exactly one retry');
  assert.equal(bad.calls.filter(isHome).length, 2);
  // a 400 is not a block: the next refresh does try again
  const before = bad.calls.length;
  await assert.rejects(() => createRetabetSource(bad.deps).listEvents('FOOTBALL', FROM, TO), /400/);
  assert.ok(bad.calls.length > before);
});

test('429 / 403: the refresh stops and no request goes out for BLOCK_MS; then it asks again', async () => {
  for (const status of [429, 403]) {
    let blocked = true;
    const f = fake((c) => (isCalendar(c) && blocked ? { status, body: 'blocked' } : site(c)));
    const s = createRetabetSource(f.deps);
    await assert.rejects(() => s.listEvents('FOOTBALL', FROM, TO), new RegExp(String(status)));
    const sent = f.calls.length;
    await assert.rejects(() => s.listEvents('BASKETBALL', FROM, TO), /blocked until/);
    await assert.rejects(() => s.getMarkets('38784300'), /blocked until/);
    assert.equal(f.calls.length, sent, `no request while blocked (${status})`);
    f.advance(BLOCK_MS - 1);
    await assert.rejects(() => s.listEvents('TENNIS', FROM, TO), /blocked until/);
    assert.equal(f.calls.length, sent);
    f.advance(2);
    blocked = false;
    assert.ok((await s.listEvents('TENNIS', FROM, TO)).length > 0, `asks again after the pause (${status})`);
    assert.ok(f.calls.length > sent);
  }
});

test('a 429 on a request queued behind the blocked one is not sent', async () => {
  const f = fake((c) => (isCalendar(c) ? { status: 429, body: 'slow down' } : site(c)));
  const s = createRetabetSource(f.deps);
  const results = await Promise.allSettled([s.listEvents('FOOTBALL', FROM, TO), s.listEvents('BASKETBALL', FROM, TO), s.listEvents('TENNIS', FROM, TO)]);
  assert.ok(results.every((r) => r.status === 'rejected'));
  assert.equal(f.calls.filter(isCalendar).length, 1);
  assert.equal(f.calls.filter(isLeague).length, 0);
});

test('an anti-bot HTML page (200) where JSON or the widget is expected is a ProviderFormatError "(HTML page)" and blocks like a 429', async () => {
  const challenge = '<html><head><title>Access Denied</title></head><body>You don\'t have permission to access. Reference #18.1a2b</body></html>';
  const f = fake((c) => (isPending(c) ? ok(challenge) : site(c)));
  const s = createRetabetSource(f.deps);
  await assert.rejects(
    () => s.listEvents('FOOTBALL', FROM, TO),
    (err: unknown) => err instanceof ProviderFormatError && /HTML page/.test(err.message),
  );
  const sent = f.calls.length;
  await assert.rejects(() => s.listEvents('FOOTBALL', FROM, TO), /blocked until/);
  assert.equal(f.calls.length, sent);

  const g = fake((c) => (isCalendar(c) ? ok(challenge) : site(c)));
  await assert.rejects(
    () => createRetabetSource(g.deps).listEvents('FOOTBALL', FROM, TO),
    (err: unknown) => err instanceof ProviderFormatError && /HTML page/.test(err.message),
  );
});

test('a request that hangs is cut by the timeout', async () => {
  const f = fake(site, {
    timeoutMs: 20,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        (init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
  await assert.rejects(() => createRetabetSource(f.deps).listEvents('FOOTBALL', FROM, TO), /timeout/);
});

// ─── getMarkets ──────────────────────────────────────────────────────────────

const PAGE_URL = `${SITE}/desportos/futebol/inglaterra/inglaterra-premier-league/newcastle-arsenal/38784300`;
function marketsSite(c: Call): Reply {
  if (isHome(c)) return HOME;
  if (c.method === 'GET' && /\/38784300$/.test(c.url)) return ok(text('event-football.html'));
  if (c.method === 'POST' && c.url === `${SITE}/api/sportsbookEventDetail/GetTabsContents`) return ok(text('tabs-football.html'));
  throw new Error(`unexpected request ${c.method} ${c.url}`);
}

test('getMarkets: the game page, then one GetTabsContents for the useful extra tabs only; labels are translated', async () => {
  const f = fake(marketsSite);
  const markets = await createRetabetSource(f.deps).getMarkets('38784300', { pageUrl: PAGE_URL });
  assert.deepEqual(f.urls().map((u) => u.replace(/^(\w+ \/[^/]*).*$/, '$1')), ['GET /', 'GET /desportos', 'POST /api']);
  assert.equal(f.calls[1]!.url, PAGE_URL);
  const post = f.calls[2]!;
  assert.deepEqual(JSON.parse(post.body!), {
    id: '38784300',
    tabsandtags: [
      { tab: 1, tag: 1024 },
      { tab: 1, tag: 1017 },
      { tab: 1, tag: 1049 },
      { tab: 1, tag: 1475 },
    ],
    skey: 'SportsbookEventDetail-38784300',
  });
  assert.equal(post.headers['content-type'], 'application/json; charset=UTF-8');
  assert.ok(markets.some((m) => m.marketLabel === 'Resultado Final' && m.selectionLabel === '1' && m.odds === 5.2));
  assert.ok(markets.some((m) => m.marketLabel === 'Resultado Exato' && m.selectionLabel === '2-1'), 'a market of an extra tab');
});

test('getMarkets without a page hint uses a generic URL (the site redirects to the real one); a bad id or an uncovered sport is an error', async () => {
  const f = fake(marketsSite);
  await createRetabetSource(f.deps).getMarkets('38784300');
  assert.match(f.calls[1]!.url, /^https:\/\/www\.retabet\.pt\/desportos\/futebol\/.+\/38784300$/);
  await assert.rejects(() => createRetabetSource(f.deps).getMarkets('abc'), ProviderFormatError);
  await assert.rejects(() => createRetabetSource(f.deps).getMarkets('38784300', { pageUrl: 'https://evil.example/x/38784300' }), /page URL/);
  const handball = fake((c) => (c.method === 'GET' && /\/38784300$/.test(c.url) ? ok(text('event-basketball.html').split('/desportos/basquetebol/').join('/desportos/andebol/')) : marketsSite(c)));
  await assert.rejects(() => createRetabetSource(handball.deps).getMarkets('38784300'), /not covered/);
});

test('getMarkets: no extra request when the page lists no useful extra tab; a page without the markets structure is a ProviderFormatError', async () => {
  const onlyMain = text('event-tennis.html').replace(/data-tg="(1024|1028)"/g, 'data-tg="1033"');
  const f = fake((c) => (c.method === 'GET' && /\/38986089$/.test(c.url) ? ok(onlyMain) : site(c)));
  const markets = await createRetabetSource(f.deps).getMarkets('38986089');
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 0);
  assert.ok(markets.some((m) => m.marketLabel === 'Vencedor'));

  const g = fake((c) => (c.method === 'GET' && /\/38986089$/.test(c.url) ? ok('<html><body><h1>Página não encontrada</h1></body></html>') : site(c)));
  await assert.rejects(() => createRetabetSource(g.deps).getMarkets('38986089'), ProviderFormatError);
  // tabs response with a renamed structure
  const h = fake((c) => (c.method === 'POST' ? ok(text('tabs-football.html').split('jbcont').join('x')) : marketsSite(c)));
  await assert.rejects(() => createRetabetSource(h.deps).getMarkets('38784300'), ProviderFormatError);
});

test('getMarkets: a tab POST answered with an anti-bot page blocks; 400 renews the session once', async () => {
  const challenge = '<html><body>Request unsuccessful. Incapsula incident ID: 1</body></html>';
  const f = fake((c) => (c.method === 'POST' ? ok(challenge) : marketsSite(c)));
  const s = createRetabetSource(f.deps);
  await assert.rejects(
    () => s.getMarkets('38784300', { pageUrl: PAGE_URL }),
    (err: unknown) => err instanceof ProviderFormatError && /HTML page/.test(err.message),
  );
  await assert.rejects(() => s.getMarkets('38784300', { pageUrl: PAGE_URL }), /blocked until/);

  let first = true;
  const g = fake((c) => {
    if (c.method === 'POST' && first) {
      first = false;
      return { status: 400, body: '' };
    }
    return marketsSite(c);
  });
  const markets = await createRetabetSource(g.deps).getMarkets('38784300', { pageUrl: PAGE_URL });
  assert.ok(markets.length > 50);
  assert.equal(g.calls.filter(isHome).length, 2);
});
