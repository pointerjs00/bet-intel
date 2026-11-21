import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { COLUMN_TYPE as T } from './memory';
import { writeMemory, type TableSpec } from './memoryWriter';
import { BLOCK_MS, HOSTS, MARKETS_MAX_AGE_MS, REQUEST_GAP_MS, SYNC_TTL_MS, createSportsWidgetSource, sharedSportsWidgetSource, type SportsWidgetDeps } from './index';

const NOW = Date.parse('2026-11-21T10:00:00Z');
const sec = (ms: number) => Math.floor(ms / 1000);
const CDN = HOSTS.placard.cdn;
const REPO = 1795166563;

// ─── Synthetic feed ──────────────────────────────────────────────────────────

const EVENT_COLS: [string, number][] = [
  ['node_id', T.LONG], ['parent_node_id', T.UINT], ['start_date', T.DATE], ['participant_home_dictionary_id', T.UINT],
  ['participant_away_dictionary_id', T.UINT], ['is_displayed', T.BOOL], ['is_active', T.BOOL],
];
const MARKET_COLS: [string, number][] = [['node_id', T.LONG], ['parent_node_id', T.LONG], ['market_type_id', T.USHORT], ['dictionary_id', T.UINT], ['is_active', T.BOOL], ['is_displayed', T.BOOL]];
const RESULT_COLS: [string, number][] = [['node_id', T.LONG], ['parent_node_id', T.LONG], ['dictionary_id', T.UINT], ['handicap_dictionary_id', T.UINT], ['odd_map_id', T.USHORT]];

const base = (): Record<string, TableSpec> => ({
  DictionaryEntry: {
    columns: [['id', T.UINT], ['value', T.STRING]],
    rows: [[1, 'Futebol'], [2, 'soccer'], [3, 'Ténis'], [4, 'tennis'], [5, 'Europa'], [6, 'Portugal - Primeira Liga'], [7, 'ATP'], [8, 'Paris - Individual'],
      [9, 'PT|Portugal'], [10, 'Resultado Final'], [11, '{0}||1|1|'], [12, 'Empate||X|2|'], [13, '{1}||2|3|'], [14, 'Vencedor do Jogo'], [15, '{0}||P1|10|'], [16, '{1}||P2|20|'],
      [20, 'Benfica'], [21, 'FC Porto'], [22, 'Carlos Alcaraz'], [23, 'Jannik Sinner'], [24, 'Braga'], [25, 'Guimarães']],
  },
  AdditionalValueKey: { columns: [['key_id', T.BYTE], ['key', T.STRING]], rows: [[0, 'SPORT_ID'], [14, 'COUNTRY_ID']] },
  AdditionalValue: { columns: [['node_id', T.LONG], ['key_id', T.BYTE], ['dictionary_id', T.UINT]], rows: [[106, 0, 2], [63, 0, 4], [9000, 14, 9]] },
  MarketType: { columns: [['id', T.USHORT], ['market_type', T.STRING]], rows: [[1, 'MRES'], [2, 'HTOH']] },
  Structure: {
    columns: [['node_id', T.UINT], ['parent_node_id', T.UINT], ['node_type_id', T.BYTE], ['dictionary_id', T.UINT]],
    rows: [[106, 0, 1, 1], [63, 0, 1, 3], [9000, 106, 2, 5], [9001, 9000, 3, 6], [8000, 63, 2, 7], [8001, 8000, 3, 8]],
  },
  OddMap: { columns: [['id', T.USHORT], ['dec', T.UINT]], rows: [[1, 2100], [2, 3300], [3, 3600], [4, 1500], [5, 2600], [6, 1900]] },
});

/** Full partition 0: events; partition 1: their markets and selections; the rest empty. */
function full(p: number, opts: { withBraga?: boolean } = {}): Record<string, TableSpec> {
  if (p === 0) {
    return {
      Event: {
        columns: EVENT_COLS,
        rows: [
          [34000001, 9001, sec(NOW + 3 * 3600e3), 20, 21, true, true],
          [34000002, 8001, sec(NOW + 5 * 3600e3), 22, 23, true, true],
          ...(opts.withBraga === false ? [] : [[34000003, 9001, sec(NOW + 6 * 3600e3), 24, 25, true, true]]),
        ],
      },
    };
  }
  if (p === 1) {
    return {
      Market: { columns: MARKET_COLS, rows: [[500, 34000001, 1, 10, true, true], [501, 34000002, 2, 14, true, true]] },
      Result: { columns: RESULT_COLS, rows: [[600, 500, 11, 0, 1], [601, 500, 12, 0, 2], [602, 500, 13, 0, 3], [603, 501, 15, 0, 4], [604, 501, 16, 0, 5]] },
    };
  }
  return {};
}

/** Delta that changes the home price of Benfica - FC Porto. */
const oddsMove = (odd: number): Record<string, TableSpec> => ({ ResultSmall: { columns: [['node_id', T.LONG], ['odd_map_id', T.USHORT]], rows: [[600, odd]] } });

interface Meta {
  repositoryId: number;
  baseIndex: number;
  fullIndex: number;
  partialIndex: number;
  upd2fullIndex: number;
  fullPartitions: number;
  cultures: string[];
}
const META: Meta = { repositoryId: REPO, baseIndex: 1, fullIndex: 1000, partialIndex: 1101, upd2fullIndex: 1100, fullPartitions: 5, cultures: ['pt'] };

type Reply = { status?: number; body: Uint8Array | string; type?: string };
interface Call {
  url: string;
  headers: Record<string, string>;
}

function harness(opts: { meta?: () => Meta; slices?: (path: string) => Reply | undefined; house?: 'placard' | 'solverde' } = {}) {
  let clock = NOW;
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let meta = opts.meta ?? (() => META);
  const route = (url: string): Reply => {
    const cdn = HOSTS[opts.house ?? 'placard'].cdn;
    if (url === `${cdn}/v2/getmeta`) return { body: JSON.stringify(meta()), type: 'application/json' };
    if (url === `${cdn}/library/lzma.wasm`) return { body: new Uint8Array([0, 97, 115, 109]), type: 'application/wasm' };
    const path = url.slice(`${cdn}/v2/getslice/`.length);
    const custom = opts.slices?.(path);
    if (custom) return custom;
    const m = path.match(/^(\d+)_(\d)_pt_(\d+)_(\d+)\.bin$/);
    if (!m) return { status: 404, body: 'not found' };
    const [, , type, , part] = m;
    if (type === '8') return { body: writeMemory(base()) };
    if (type === '2') return { body: writeMemory(full(Number(part))) };
    if (type === '3') return { body: writeMemory(oddsMove(6)) };
    return { body: writeMemory({}) };
  };
  const deps: SportsWidgetDeps = {
    fetch: async (url, init) => {
      calls.push({ url, headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)) });
      const r = route(url);
      const body = typeof r.body === 'string' ? new TextEncoder().encode(r.body) : r.body;
      return new Response(new Uint8Array(body), { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'application/octet-stream' } });
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => clock,
    // The slices above are not compressed: the decoder is the identity (the real one is tested in lzma.test.ts).
    loadDecoder: () => () => (bytes) => bytes,
  };
  return {
    deps,
    calls,
    sleeps,
    urls: () => calls.map((c) => c.url.replace(/^https:\/\/[^/]+/, '')),
    advance: (ms: number) => {
      clock += ms;
    },
    setMeta: (m: () => Meta) => {
      meta = m;
    },
  };
}

const FROM = new Date(NOW).toISOString();
const TO = new Date(NOW + 48 * 3600e3).toISOString();

// ─── Tests ───────────────────────────────────────────────────────────────────

test('first calendar: getmeta, the wasm once, base, 5 full partitions, update-to-full and the last partial, paced and with the house origin', async () => {
  const h = harness();
  const src = createSportsWidgetSource('placard', h.deps);
  assert.equal(src.house, 'placard');
  const evs = await src.listEvents('FOOTBALL', FROM, TO);
  assert.deepEqual(h.urls(), [
    '/v2/getmeta',
    '/library/lzma.wasm',
    `/v2/getslice/${REPO}_8_pt_1_0.bin`,
    `/v2/getslice/${REPO}_2_pt_1000_0.bin`,
    `/v2/getslice/${REPO}_2_pt_1000_1.bin`,
    `/v2/getslice/${REPO}_2_pt_1000_2.bin`,
    `/v2/getslice/${REPO}_2_pt_1000_3.bin`,
    `/v2/getslice/${REPO}_2_pt_1000_4.bin`,
    `/v2/getslice/${REPO}_3_pt_1100_0.bin`,
    `/v2/getslice/${REPO}_1_pt_1101_0.bin`,
  ]);
  assert.ok(h.calls.every((c) => c.url.startsWith(CDN)));
  assert.ok(h.calls.every((c) => c.headers.origin === 'https://www.placard.pt' && c.headers.referer === 'https://www.placard.pt/' && /Mozilla/.test(c.headers['user-agent']!)));
  assert.deepEqual(h.sleeps, Array(h.calls.length - 1).fill(REQUEST_GAP_MS), 'one gap before every request but the first');
  assert.deepEqual(evs.map((e) => [e.houseEventId, e.home, e.away, e.competition, e.countryCode]), [
    ['34000001', 'Benfica', 'FC Porto', 'Portugal - Primeira Liga', 'PT'],
    ['34000003', 'Braga', 'Guimarães', 'Portugal - Primeira Liga', 'PT'],
  ]);
  assert.deepEqual(evs[0]!.mainMarkets!.map((m) => [m.selectionLabel, m.odds]), [['1', 1.9], ['X', 3.3], ['2', 3.6]], 'the update-to-full moved the home price');
  assert.equal(evs[1]!.mainMarkets, undefined);
});

test('within SYNC_TTL_MS other sports and markets come from the same model without any request', async () => {
  const h = harness();
  const src = createSportsWidgetSource('placard', h.deps);
  await src.listEvents('FOOTBALL', FROM, TO);
  const n = h.calls.length;
  h.advance(SYNC_TTL_MS - 1000);
  const tennis = await src.listEvents('TENNIS', FROM, TO);
  assert.deepEqual(tennis.map((e) => [e.home, e.away, e.mainMarkets!.map((m) => m.odds)]), [['Carlos Alcaraz', 'Jannik Sinner', [1.5, 2.6]]]);
  const markets = await src.getMarkets('34000001');
  assert.deepEqual(markets.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [['Resultado Final', '1', 1.9], ['Resultado Final', 'X', 3.3], ['Resultado Final', '2', 3.6]]);
  assert.equal(h.calls.length, n);
  assert.deepEqual(await src.getMarkets('99999999'), [], 'an event the feed no longer has');
  await assert.rejects(src.getMarkets('abc'), ProviderFormatError);
  assert.equal(h.calls.length, n);
});

test('the window: events outside [from, to] are left out, a live one that started before "from" stays', async () => {
  const h = harness({
    slices: (path) =>
      path === `${REPO}_1_pt_1101_0.bin`
        ? { body: writeMemory({ NodesInPlayDetail: { columns: [['node_id', T.LONG], ['data', T.STRING]], rows: [[34000001, '{"inPlay":true}']] } }) }
        : undefined,
  });
  const src = createSportsWidgetSource('placard', h.deps);
  const later = new Date(NOW + 4 * 3600e3).toISOString();
  const evs = await src.listEvents('FOOTBALL', later, TO);
  assert.deepEqual(evs.map((e) => [e.houseEventId, e.live]), [['34000001', true], ['34000003', false]]);
  const none = await src.listEvents('FOOTBALL', FROM, new Date(NOW + 3600e3).toISOString());
  assert.deepEqual(none.map((e) => e.houseEventId), [], 'all start after "to"');
});

test('after SYNC_TTL_MS: same full index → getmeta and the missing partials only (incremental)', async () => {
  const h = harness({ slices: (path) => (path === `${REPO}_1_pt_1103_0.bin` ? { body: writeMemory(oddsMove(1)) } : undefined) });
  const src = createSportsWidgetSource('placard', h.deps);
  await src.listEvents('FOOTBALL', FROM, TO);
  const n = h.calls.length;
  h.advance(SYNC_TTL_MS);
  h.setMeta(() => ({ ...META, partialIndex: 1103, upd2fullIndex: 1102 }));
  const evs = await src.listEvents('FOOTBALL', FROM, TO);
  assert.deepEqual(h.urls().slice(n), ['/v2/getmeta', `/v2/getslice/${REPO}_1_pt_1102_0.bin`, `/v2/getslice/${REPO}_1_pt_1103_0.bin`]);
  assert.equal(evs[0]!.mainMarkets![0]!.odds, 2.1, 'partial 1103 moved the price back');
  // Nothing new: only getmeta.
  h.advance(SYNC_TTL_MS);
  await src.listEvents('TENNIS', FROM, TO);
  assert.deepEqual(h.urls().slice(n + 3), ['/v2/getmeta']);
});

test('a new full index rebuilds from the kept base (not downloaded again); events gone from the full leave the model', async () => {
  const h = harness({
    slices: (path) => (path.startsWith(`${REPO}_2_pt_2000_`) ? { body: writeMemory(full(Number(path.slice(-5, -4)), { withBraga: false })) } : undefined),
  });
  const src = createSportsWidgetSource('placard', h.deps);
  assert.equal((await src.listEvents('FOOTBALL', FROM, TO)).length, 2);
  const n = h.calls.length;
  h.advance(SYNC_TTL_MS);
  h.setMeta(() => ({ ...META, fullIndex: 2000, upd2fullIndex: 2100, partialIndex: 2101 }));
  const evs = await src.listEvents('FOOTBALL', FROM, TO);
  const urls = h.urls().slice(n);
  assert.equal(urls[0], '/v2/getmeta');
  assert.ok(!urls.some((u) => /_8_pt_/.test(u)), 'base not downloaded again');
  assert.ok(!urls.includes('/library/lzma.wasm'), 'wasm not downloaded again');
  assert.equal(urls.filter((u) => /_2_pt_2000_/.test(u)).length, 5);
  assert.deepEqual(evs.map((e) => e.houseEventId), ['34000001']);
});

test('an HTML answer to a slice is a format error and blocks the house for BLOCK_MS without any request', async () => {
  const h = harness({ slices: (path) => (path.includes('_2_pt_1000_2') ? { body: '<!DOCTYPE html><title>Just a moment...</title>', type: 'text/html' } : undefined) });
  const src = createSportsWidgetSource('placard', h.deps);
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), (e: unknown) => e instanceof ProviderFormatError && /HTML/.test((e as Error).message));
  const n = h.calls.length;
  h.advance(BLOCK_MS - 1000);
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), /blocked until/);
  await assert.rejects(src.getMarkets('34000001'), /blocked until/);
  assert.equal(h.calls.length, n, 'no request while blocked');
  h.advance(2000);
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), ProviderFormatError, 'tries again after the block');
  assert.ok(h.calls.length > n);
});

test('an HTML body without an HTML content type is also caught', async () => {
  const h = harness({ slices: (path) => (path.includes('_8_pt_') ? { body: '  <html><body>blocked</body></html>' } : undefined) });
  const src = createSportsWidgetSource('placard', h.deps);
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), /HTML/);
  const n = h.calls.length;
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), /blocked until/);
  assert.equal(h.calls.length, n);
});

test('429 and 403 block; other HTTP errors and a bad getmeta do not', async () => {
  for (const status of [429, 403]) {
    const h = harness({ slices: (path) => (path.includes('_2_pt_1000_0') ? { status, body: 'no' } : undefined) });
    const src = createSportsWidgetSource('placard', h.deps);
    await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), new RegExp(`HTTP ${status}`));
    const n = h.calls.length;
    await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), /blocked until/);
    assert.equal(h.calls.length, n);
  }
  const h = harness({ slices: (path) => (path.includes('_2_pt_1000_0') ? { status: 500, body: 'oops' } : undefined) });
  const src = createSportsWidgetSource('placard', h.deps);
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), /HTTP 500/);
  const n = h.calls.length;
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO), /HTTP 500/);
  assert.ok(h.calls.length > n, 'not blocked: tried again');

  const bad = harness({ meta: () => ({ ...META, fullIndex: 0 }) });
  await assert.rejects(createSportsWidgetSource('placard', bad.deps).listEvents('FOOTBALL', FROM, TO), ProviderFormatError);
});

test('a failed sync keeps no half-built model: the next call syncs again from scratch', async () => {
  let fail = true;
  const h = harness({ slices: (path) => (fail && path.includes('_2_pt_1000_4') ? { status: 500, body: 'oops' } : undefined) });
  const src = createSportsWidgetSource('placard', h.deps);
  await assert.rejects(src.listEvents('FOOTBALL', FROM, TO));
  fail = false;
  const n = h.calls.length;
  assert.equal((await src.listEvents('FOOTBALL', FROM, TO)).length, 2);
  assert.ok(h.urls().slice(n).some((u) => /_8_pt_/.test(u)), 'base downloaded again (nothing was kept)');
});

test('concurrent calls share one sync', async () => {
  const h = harness();
  const src = createSportsWidgetSource('placard', h.deps);
  const [a, b, c] = await Promise.all([src.listEvents('FOOTBALL', FROM, TO), src.listEvents('TENNIS', FROM, TO), src.getMarkets('34000002')]);
  assert.equal(a.length, 2);
  assert.equal(b.length, 1);
  assert.equal(c.length, 2);
  assert.equal(h.calls.filter((x) => x.url.endsWith('/v2/getmeta')).length, 1);
});

test('Solverde: its own CDN host and origin, house id solverde', async () => {
  const h = harness({ house: 'solverde' });
  const src = createSportsWidgetSource('solverde', h.deps);
  assert.equal(src.house, 'solverde');
  const evs = await src.listEvents('FOOTBALL', FROM, TO);
  assert.equal(evs[0]!.house, 'solverde');
  assert.ok(h.calls.every((c) => c.url.startsWith('https://sportswidget-cdn.solverde.pt/') && c.headers.origin === 'https://www.solverde.pt'));
});

test('the production factory shares one feed per house (one model, one pacing, one block state) and keeps the houses apart', () => {
  assert.equal(sharedSportsWidgetSource('placard'), sharedSportsWidgetSource('placard'));
  assert.notEqual(sharedSportsWidgetSource('placard'), sharedSportsWidgetSource('solverde'));
  assert.equal(sharedSportsWidgetSource('solverde').house, 'solverde');
  assert.deepEqual(HOSTS, {
    placard: { cdn: 'https://sportswidget-cdn.placard.pt', origin: 'https://www.placard.pt' },
    solverde: { cdn: 'https://sportswidget-cdn.solverde.pt', origin: 'https://www.solverde.pt' },
  });
});

test('a partial slice numbered 8 (right after a repository reset) is never kept as the base', async () => {
  const h = harness({ meta: () => ({ ...META, fullIndex: 5, upd2fullIndex: 6, partialIndex: 8 }) });
  const src = createSportsWidgetSource('placard', h.deps);
  await src.listEvents('FOOTBALL', FROM, TO);
  assert.ok(h.urls().includes(`/v2/getslice/${REPO}_1_pt_8_0.bin`), 'the partial 8 was downloaded after the base');
  h.advance(SYNC_TTL_MS);
  h.setMeta(() => ({ ...META, fullIndex: 20, upd2fullIndex: 21, partialIndex: 22 }));
  const evs = await src.listEvents('FOOTBALL', FROM, TO);
  assert.deepEqual(evs.map((e) => [e.home, e.away]), [['Benfica', 'FC Porto'], ['Braga', 'Guimarães']], 'rebuilt on the real base');
});

test('getMarkets serves the model the calendar synced while it is younger than MARKETS_MAX_AGE_MS (no request); only older is synced', async () => {
  assert.equal(MARKETS_MAX_AGE_MS, 15 * 60_000);
  const h = harness();
  const src = createSportsWidgetSource('placard', h.deps);
  await src.listEvents('FOOTBALL', FROM, TO);
  const n = h.calls.length;
  h.advance(SYNC_TTL_MS + 60_000);
  assert.equal((await src.getMarkets('34000001')).length, 3);
  h.advance(MARKETS_MAX_AGE_MS - SYNC_TTL_MS - 120_000);
  await src.getMarkets('34000001');
  assert.equal(h.calls.length, n, 'a model under 15 min old is served as it is');
  // The calendar path still syncs after SYNC_TTL_MS.
  await src.listEvents('FOOTBALL', FROM, TO);
  assert.equal(h.urls()[n], '/v2/getmeta');
  const m = h.calls.length;
  h.advance(MARKETS_MAX_AGE_MS);
  await src.getMarkets('34000001');
  assert.equal(h.urls()[m], '/v2/getmeta', 'a stale model (the job stopped) is synced by getMarkets');
});

test('getMarkets with no model yet syncs once', async () => {
  const h = harness();
  const src = createSportsWidgetSource('placard', h.deps);
  assert.equal((await src.getMarkets('34000001')).length, 3);
  assert.equal(h.urls()[0], '/v2/getmeta');
});
