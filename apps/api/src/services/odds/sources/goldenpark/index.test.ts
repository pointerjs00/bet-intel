import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { MAX_COMPETITIONS, REQUEST_GAP_MS, createGoldenParkSource, type GoldenParkDeps } from './index';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'goldenpark');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');
const json = (name: string) => JSON.parse(text(name));

const ENDPOINT = 'https://ws.goldenpark.pt/component/datatree';
const FROM = '2026-11-21T00:00:00.000Z';
const TO = '2026-11-30T00:00:00.000Z';

type Reply = { status?: number; body: string };
const ok = (body: unknown): Reply => ({ body: typeof body === 'string' ? body : JSON.stringify(body) });

/** Fake network: routes by the `url_key` of the POSTed context. */
function fake(routes: Record<string, Reply | (() => Reply)>, extra: Partial<GoldenParkDeps> = {}, fallback: Reply = { status: 404, body: '' }) {
  const calls: { url: string; method: string; headers: Record<string, string>; context: Record<string, unknown> }[] = [];
  const sleeps: number[] = [];
  const deps: GoldenParkDeps = {
    fetch: async (url, init) => {
      const context = JSON.parse(String(init.body)).context as Record<string, unknown>;
      calls.push({ url, method: String(init.method), headers: (init.headers ?? {}) as Record<string, string>, context });
      const r = routes[String(context.url_key)];
      const reply = typeof r === 'function' ? r() : (r ?? fallback);
      return new Response(reply.body, { status: reply.status ?? 200 });
    },
    sleep: async (ms) => void sleeps.push(ms),
    ...extra,
  };
  return { deps, calls, sleeps, keys: () => calls.map((c) => String(c.context.url_key)) };
}

/** A sport page listing competitions `/competicao/<id>-c<id>` with the given event counts. */
function sportPage(counts: number[]) {
  return {
    tree: { components: [{ tree_compo_key: 'sport_page_all', data: { a_z: { categories: [{ name: 'X', links: counts.map((n, i) => ({
      id: 100 + i, url: `/competicao/${100 + i}-c${100 + i}`, label: `C${100 + i}`, nb_events: n, identifier: 'competition', is_pinned: false,
    })) }] } } }] },
  };
}

test('football calendar: sport page, then the competitions with most events; the request carries the exact context and browser headers', async () => {
  const { deps, calls, keys } = fake({
    '/desporte/13-futebol': ok(json('sport-football.json')),
    '/competicao/154-primeira-liga': ok(json('competition-football.json')),
    '/competicao/6674-liga-dos-campeoes': ok(json('competition-football-ucl.json')),
  });
  const events = await createGoldenParkSource(deps).listEvents('FOOTBALL', FROM, TO);
  const comps = keys().slice(1);
  assert.equal(keys()[0], '/desporte/13-futebol');
  assert.ok(comps.every((k) => /^\/competicao\/\d+-/.test(k)));
  assert.ok(comps.length >= 5 && comps.length <= MAX_COMPETITIONS.FOOTBALL);
  assert.equal(comps[0], '/competicao/6674-liga-dos-campeoes', 'most events first');
  for (const c of calls) {
    assert.equal(c.url, ENDPOINT);
    assert.equal(c.method, 'POST');
    assert.deepEqual(c.context, {
      url_key: c.context.url_key, url_params: {}, device: 'web_vuejs_desktop', version: '1.0.1', lang: 'pt', timezone: 'Europe/Lisbon', clientIp: '1.1.1.1',
    });
    assert.equal(c.headers['content-type'], 'application/json');
    assert.equal(c.headers.origin, 'https://apostas.goldenpark.pt');
    assert.equal(c.headers.referer, 'https://apostas.goldenpark.pt/');
    assert.match(c.headers['user-agent']!, /Mozilla/);
    assert.match(c.headers['accept-encoding']!, /gzip/);
  }
  // 3 + 2 events from the two fixtures; the other competitions answer 404 (skipped).
  assert.equal(events.length, 5);
  assert.ok(events.every((e) => e.house === 'goldenpark' && e.sport === 'FOOTBALL'));
});

test('competitions are capped per sport (football 20, basketball 8, tennis 6) and taken by number of events', async () => {
  assert.deepEqual(MAX_COMPETITIONS, { FOOTBALL: 20, BASKETBALL: 8, TENNIS: 6 });
  const counts = Array.from({ length: 30 }, (_, i) => i + 1); // ids 100..129, events 1..30
  for (const [sport, page, cap] of [['FOOTBALL', '/desporte/13-futebol', 20], ['BASKETBALL', '/desporte/4-basquetebol', 8], ['TENNIS', '/desporte/21-tenis', 6]] as const) {
    const { deps, keys } = fake({ [page]: ok(sportPage(counts)) }, {}, ok({ tree: { components: [] } }));
    await createGoldenParkSource(deps).listEvents(sport, FROM, TO);
    const comps = keys().slice(1);
    assert.equal(comps.length, cap, sport);
    assert.deepEqual(comps[0], '/competicao/129-c129');
    assert.deepEqual(comps.at(-1), `/competicao/${130 - cap}-c${130 - cap}`);
  }
});

test('window: events outside [from, to] are dropped, duplicates across competitions collapse, the list is sorted by start', async () => {
  const body = json('competition-football.json'); // 2026-11-27 20:15Z, 11-28 15:30Z, 11-28 18:00Z...
  const { deps } = fake({ '/desporte/13-futebol': ok(sportPage([5, 4])), '/competicao/100-c100': ok(body), '/competicao/101-c101': ok(body) });
  const all = await createGoldenParkSource(deps).listEvents('FOOTBALL', '2026-11-21T00:00:00.000Z', '2026-12-31T00:00:00.000Z');
  assert.equal(all.length, 3, 'same events in two competitions are listed once');
  assert.deepEqual(all.map((e) => e.startsAt), [...all.map((e) => e.startsAt)].sort());
  const narrow = fake({ '/desporte/13-futebol': ok(sportPage([5])), '/competicao/100-c100': ok(body) });
  const out = await createGoldenParkSource(narrow.deps).listEvents('FOOTBALL', '2026-11-28T00:00:00.000Z', '2026-11-28T17:00:00.000Z');
  assert.deepEqual(out.map((e) => e.houseEventId), ['12394030', '12394034'], 'both start 15:30Z; the 18:00Z one is out');
});

test('basketball and tennis calendars map their sport only', async () => {
  const b = fake({ '/desporte/4-basquetebol': ok(sportPage([3])), '/competicao/100-c100': ok(json('competition-basketball.json')) });
  const basket = await createGoldenParkSource(b.deps).listEvents('BASKETBALL', FROM, TO);
  assert.equal(basket.length, 3);
  assert.ok(basket.every((e) => e.sport === 'BASKETBALL'));
  const t = fake({ '/desporte/21-tenis': ok(sportPage([2, 1])), '/competicao/100-c100': ok(json('competition-tennis.json')), '/competicao/101-c101': ok(json('competition-tennis-doubles.json')) });
  const tennis = await createGoldenParkSource(t.deps).listEvents('TENNIS', FROM, TO);
  assert.equal(tennis.length, 3);
  const wrong = fake({ '/desporte/21-tenis': ok(sportPage([2])), '/competicao/100-c100': ok(json('competition-basketball.json')) });
  assert.deepEqual(await createGoldenParkSource(wrong.deps).listEvents('TENNIS', FROM, TO), []);
});

test('requests are paced REQUEST_GAP_MS (2 s, ≥ 300 ms) apart, none before the first', async () => {
  const { deps, calls, sleeps } = fake({ '/desporte/21-tenis': ok(sportPage([2, 1])), '/competicao/100-c100': ok(json('competition-tennis.json')), '/competicao/101-c101': ok(json('competition-tennis-doubles.json')) });
  await createGoldenParkSource(deps).listEvents('TENNIS', FROM, TO);
  assert.equal(calls.length, 3);
  assert.equal(sleeps.length, calls.length - 1);
  assert.ok(sleeps.every((ms) => ms >= REQUEST_GAP_MS));
  assert.ok(REQUEST_GAP_MS >= 2000);
});

test('concurrent sports share one gate: two parallel calendars still never overlap or skip the gap', async () => {
  const { deps, calls, sleeps } = fake({
    '/desporte/21-tenis': ok(sportPage([1])), '/competicao/100-c100': ok(json('competition-tennis.json')),
    '/desporte/4-basquetebol': ok(sportPage([1])),
  });
  const s = createGoldenParkSource(deps);
  await Promise.all([s.listEvents('TENNIS', FROM, TO), s.listEvents('BASKETBALL', FROM, TO)]);
  assert.equal(sleeps.length, calls.length - 1);
});

test('anti-bot / HTML answers are format errors; HTTP errors are plain errors; a body without a component tree is a format error', async () => {
  const html = fake({ '/desporte/21-tenis': ok('<html><title>Just a moment...</title></html>') });
  await assert.rejects(createGoldenParkSource(html.deps).listEvents('TENNIS', FROM, TO), (e: unknown) => e instanceof ProviderFormatError && /HTML/.test((e as Error).message));
  const noTree = fake({ '/desporte/21-tenis': ok({ nope: 1 }) });
  await assert.rejects(createGoldenParkSource(noTree.deps).listEvents('TENNIS', FROM, TO), ProviderFormatError);
  const noComps = fake({ '/desporte/21-tenis': ok({ tree: { components: [{ tree_compo_key: 'page_404' }] } }) });
  await assert.rejects(createGoldenParkSource(noComps.deps).listEvents('TENNIS', FROM, TO), ProviderFormatError);
  const err = fake({ '/desporte/21-tenis': { status: 500, body: '' } });
  await assert.rejects(createGoldenParkSource(err.deps).listEvents('TENNIS', FROM, TO), /HTTP 500/);
  assert.equal(err.calls.length, 1, 'nothing is retried around it');
  const blocked = fake({ '/desporte/21-tenis': { status: 403, body: '<html>blocked</html>' } });
  await assert.rejects(createGoldenParkSource(blocked.deps).listEvents('TENNIS', FROM, TO), /HTTP 403/);
});

test('one failing competition is skipped; an anti-bot answer in a competition, or all competitions failing, is an error', async () => {
  const good = json('competition-tennis.json');
  const some = fake({ '/desporte/21-tenis': ok(sportPage([3, 2])), '/competicao/100-c100': { status: 500, body: '' }, '/competicao/101-c101': ok(good) });
  const events = await createGoldenParkSource(some.deps).listEvents('TENNIS', FROM, TO);
  assert.equal(events.length, 2);
  assert.equal(some.calls.length, 3);
  const bot = fake({ '/desporte/21-tenis': ok(sportPage([3, 2])), '/competicao/100-c100': ok('<html>captcha</html>'), '/competicao/101-c101': ok(good) });
  await assert.rejects(createGoldenParkSource(bot.deps).listEvents('TENNIS', FROM, TO), ProviderFormatError);
  const all = fake({ '/desporte/21-tenis': ok(sportPage([3, 2])), '/competicao/100-c100': { status: 500, body: '' }, '/competicao/101-c101': { status: 502, body: '' } });
  await assert.rejects(createGoldenParkSource(all.deps).listEvents('TENNIS', FROM, TO), /HTTP 50[02]/);
});

test('a 429 (rate limit) or 403 in a competition stops the refresh at once: no more requests while limited', async () => {
  for (const status of [429, 403]) {
    const f = fake({ '/desporte/21-tenis': ok(sportPage([5, 4, 3, 2])), '/competicao/100-c100': ok(json('competition-tennis.json')), '/competicao/101-c101': ok(json('competition-tennis-doubles.json')), '/competicao/102-c102': { status, body: '<html>rejected</html>' } });
    await assert.rejects(createGoldenParkSource(f.deps).listEvents('TENNIS', FROM, TO), new RegExp(`HTTP ${status}`));
    assert.deepEqual(f.keys(), ['/desporte/21-tenis', '/competicao/100-c100', '/competicao/101-c101', '/competicao/102-c102'], 'nothing is requested after the limited one (103)');
  }
});

test('a sport with no competitions with events gives an empty calendar without extra requests', async () => {
  const { deps, calls } = fake({ '/desporte/21-tenis': ok(sportPage([])) });
  assert.deepEqual(await createGoldenParkSource(deps).listEvents('TENNIS', FROM, TO), []);
  assert.equal(calls.length, 1);
});

test('a request that hangs times out with a clear error', async () => {
  const { deps } = fake({}, {
    timeoutMs: 20,
    fetch: (_url, init) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))),
  });
  await assert.rejects(createGoldenParkSource(deps).listEvents('TENNIS', FROM, TO), /timeout/);
});

test('getMarkets: one request to the event page from the calendar hint (or the bare id), mapped by the event own sport', async () => {
  const page = '/evento/12419841-utah-jazz-phoenix-suns';
  const withHint = fake({ [page]: ok(text('event-basketball.json')) });
  const markets = await createGoldenParkSource(withHint.deps).getMarkets('12419841', { pageUrl: page });
  assert.ok(markets.some((m) => m.marketLabel === 'Vencedor (incl. prolongamento)' && m.selectionLabel === 'Utah Jazz' && m.odds === 2.55));
  assert.deepEqual(withHint.keys(), [page]);
  const noHint = fake({ '/evento/12454722': ok(text('event-tennis.json')) });
  assert.ok((await createGoldenParkSource(noHint.deps).getMarkets('12454722')).some((m) => m.marketLabel === 'Vencedor'));
  assert.deepEqual(noHint.keys(), ['/evento/12454722']);
  await assert.rejects(createGoldenParkSource(fake({}).deps).getMarkets('abc'), ProviderFormatError);
  const nf = fake({ '/evento/9': ok({ tree: { components: [{ tree_compo_key: 'page_404' }] } }) });
  await assert.rejects(createGoldenParkSource(nf.deps).getMarkets('9'), ProviderFormatError);
  const other = fake({ '/evento/9': ok({ tree: { components: [{ tree_compo_key: 'event_market_list', data: { event: { sport: { id: 9 } } } }] } }) });
  await assert.rejects(createGoldenParkSource(other.deps).getMarkets('9'), ProviderFormatError);
});
