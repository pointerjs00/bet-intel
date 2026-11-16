import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { getSources } from '../../registry';
import type { OddsSport } from '../../types';
import { encodeFrame } from './grpcWeb';
import {
  CATEGORY_GAP_MS,
  MAX_PAGES,
  PAGE_GAP_MS,
  PAGE_SIZE,
  callFirstFrame,
  createBetclicSource,
  getBetclicMarkets,
  listBetclicEvents,
  mapMarkets,
  mapMatch,
  toIsoUtc,
  type FetchLike,
} from './index';
import {
  ScoreboardStatus,
  SelectionStatus,
  decodeMatchFrame,
  decodeMatchesBySportFrame,
  type BetclicMarket,
  type BetclicSelection,
} from './schema';

const DIR = join(__dirname, '../../__fixtures__/betclic');
const fixture = (name: string) => new Uint8Array(Buffer.from(readFileSync(join(DIR, `${name}.b64`), 'utf8'), 'base64'));
const capturedAt = (name: string) => (JSON.parse(readFileSync(join(DIR, `${name}.meta.json`), 'utf8')) as { capturedAt: string }).capturedAt;
const HOUR = 3_600_000;

const LISTS: { name: string; sport: OddsSport }[] = [
  { name: 'football-list', sport: 'FOOTBALL' },
  { name: 'basketball-list', sport: 'BASKETBALL' },
  { name: 'tennis-list', sport: 'TENNIS' },
];

// ─── helpers: frames and a fake fetch ────────────────────────────────────────

/** A trailer frame (flag 0x80). */
function trailer(text: string): Uint8Array {
  const body = Buffer.from(text, 'utf8');
  const out = new Uint8Array(5 + body.length);
  out[0] = 0x80;
  new DataView(out.buffer).setUint32(1, body.length, false);
  out.set(body, 5);
  return out;
}

/** A streaming body: the given chunks, then (optionally) never closes, like the real stream. */
function streamOf(chunks: Uint8Array[], keepOpen = false): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else if (!keepOpen) controller.close();
      else return new Promise<void>(() => undefined);
      return undefined;
    },
  });
}

/** Snapshot frame + one notification frame + trailer, over an open-ended stream. */
const grpcResponse = (snapshot: Uint8Array) =>
  new Response(streamOf([encodeFrame(snapshot), encodeFrame(new Uint8Array([0x12, 0x00])), trailer('grpc-status: 14\r\n')], true), {
    status: 200,
    headers: { 'content-type': 'application/grpc-web+proto' },
  });

/** Raw protobuf bytes of each match in a list fixture (payload field 3). */
function rawMatches(listBytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const r = protobuf.Reader.create(listBytes);
  while (r.pos < r.len) {
    const t = r.uint32();
    if (t >>> 3 !== 1) { r.skipType(t & 7); continue; }
    const p = protobuf.Reader.create(r.bytes());
    while (p.pos < p.len) {
      const pt = p.uint32();
      if (pt >>> 3 === 3) out.push(p.bytes());
      else p.skipType(pt & 7);
    }
  }
  return out;
}

/** A list snapshot (GetMatchesBySportResponse) holding these matches. */
function listSnapshot(matches: Uint8Array[], total: number): Uint8Array {
  const w = protobuf.Writer.create();
  w.uint32(0x0a).fork();
  w.uint32(0x0a).string('ftb_rsm');
  for (const m of matches) w.uint32(0x1a).bytes(m);
  w.uint32(0x28).int32(total);
  w.ldelim();
  return w.finish();
}

/** Offset of a GetMatchBySportRequest (field 4), from the framed body. */
function offsetOf(body: Uint8Array): number {
  const r = protobuf.Reader.create(body.subarray(5));
  let offset = 0;
  while (r.pos < r.len) {
    const t = r.uint32();
    if (t >>> 3 === 4) offset = r.int32();
    else r.skipType(t & 7);
  }
  return offset;
}

const categoryOf = (body: Uint8Array) => /ca_[a-z]+_[a-z]+/.exec(Buffer.from(body).toString('latin1'))?.[0] ?? null;

interface Call { url: string; body: Uint8Array; headers: Record<string, string> }

function fakeFetch(respond: (call: Call) => Response | Promise<Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    const call = { url, body: init.body as unknown as Uint8Array, headers: init.headers as Record<string, string> };
    calls.push(call);
    return respond(call);
  };
  return { fetch: f, calls };
}

function fakeSleep(): { sleep: (ms: number) => Promise<void>; waits: number[] } {
  const waits: number[] = [];
  return { sleep: async (ms) => { waits.push(ms); }, waits };
}

const FOOTBALL = rawMatches(fixture('football-list'));

// ─── pure mapping ────────────────────────────────────────────────────────────

test('toIsoUtc trims the 7-digit fraction and keeps UTC', () => {
  assert.equal(toIsoUtc('2026-11-16T17:00:00.0000000Z'), '2026-11-16T17:00:00.000Z');
  assert.equal(toIsoUtc('2026-11-16T17:00:00Z'), '2026-11-16T17:00:00.000Z');
  assert.equal(toIsoUtc('2026-11-16T17:00:00'), '2026-11-16T17:00:00.000Z');
  assert.equal(toIsoUtc('nope'), null);
});

for (const l of LISTS) {
  test(`mapMatch on ${l.name}: participants, start, live, main market`, () => {
    const p = decodeMatchesBySportFrame(fixture(l.name));
    const at = Date.parse(capturedAt(l.name));
    let mapped = 0;
    for (const m of p.matches) {
      const ev = mapMatch(m, l.sport);
      assert.ok(ev, m.name);
      mapped++;
      assert.equal(ev.house, 'betclic');
      assert.equal(ev.houseEventId, m.matchId);
      assert.equal(ev.sport, l.sport);
      assert.equal(ev.home, m.contestants[0]!.name.replace(/\s+/g, ' ').trim());
      assert.equal(ev.away, m.contestants[1]!.name.replace(/\s+/g, ' ').trim());
      for (const name of [ev.home, ev.away, ev.competition]) assert.equal(name, name.trim().replace(/\s+/g, ' '));
      assert.match(ev.startsAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
      assert.equal(Date.parse(ev.startsAt), Date.parse(m.matchDateUtc.replace(/(\.\d{3})\d+/, '$1')));
      assert.ok(Math.abs(Date.parse(ev.startsAt) - at) < 72 * HOUR);
      const notStarted = m.scoreboard?.liveDisplayStatus === ScoreboardStatus.NOT_STARTED;
      assert.equal(ev.live, m.isLive && !notStarted);
      if (ev.extraIds?.betRadarId) assert.match(ev.extraIds.betRadarId, /^\d+$/);
      if (!m.market) {
        assert.equal(ev.mainMarkets, undefined);
        continue;
      }
      const main = ev.mainMarkets ?? [];
      const sels = m.market.mainSelections;
      assert.equal(main.length, sels.length);
      main.forEach((s, i) => {
        assert.equal(s.marketLabel, m.market!.name.trim());
        assert.equal(s.selectionLabel, sels[i]!.name.replace(/\s+/g, ' ').trim());
        assert.equal(s.odds, sels[i]!.odds);
        assert.equal(s.line, undefined);
        assert.equal(s.suspended, sels[i]!.status !== SelectionStatus.ONLINE);
      });
      if (l.sport === 'FOOTBALL') assert.deepEqual(main.map((s) => s.selectionLabel), [ev.home, 'Empate', ev.away]);
      else assert.deepEqual(main.map((s) => s.selectionLabel), [ev.home, ev.away]);
    }
    assert.equal(mapped, p.matches.length);
  });
}

test('mapMatch: live only once the scoreboard runs; suspended odds of 1 are flagged', () => {
  const tennis = decodeMatchesBySportFrame(fixture('tennis-list')).matches;
  const early = tennis.find((m) => m.isLive && m.scoreboard?.liveDisplayStatus === ScoreboardStatus.NOT_STARTED);
  assert.ok(early, 'fixture has an isLive match that has not started');
  assert.equal(mapMatch(early, 'TENNIS')?.live, false);
  const running = tennis.find((m) => m.isLive && m.scoreboard?.liveDisplayStatus === ScoreboardStatus.RUNNING);
  assert.equal(mapMatch(running!, 'TENNIS')?.live, true);

  const all = [...LISTS].flatMap((l) => decodeMatchesBySportFrame(fixture(l.name)).matches.map((m) => mapMatch(m, l.sport)!));
  const suspended = all.flatMap((e) => e.mainMarkets ?? []).filter((s) => s.suspended);
  assert.ok(suspended.length > 0);
  assert.ok(suspended.some((s) => s.odds === 1));
  // Betclic's NBA fixture has a match without a main market.
  assert.ok(all.some((e) => e.sport === 'BASKETBALL' && !e.mainMarkets));
});

test('mapMatch trims stray spaces in doubles names', () => {
  const tennis = decodeMatchesBySportFrame(fixture('tennis-list')).matches;
  const messy = tennis.find((m) => m.contestants.some((c) => c.name !== c.name.trim()));
  assert.ok(messy, 'fixture has a name with stray spaces');
  const ev = mapMatch(messy, 'TENNIS')!;
  assert.equal(ev.home, ev.home.trim());
  assert.equal(ev.away, ev.away.trim());
});

test('mapMatch rejects matches that are not two-sided or have no valid start', () => {
  const m = decodeMatchesBySportFrame(fixture('football-list')).matches[0]!;
  assert.equal(mapMatch({ ...m, contestants: [m.contestants[0]!] }, 'FOOTBALL'), null);
  assert.equal(mapMatch({ ...m, matchDateUtc: '' }, 'FOOTBALL'), null);
  assert.equal(mapMatch({ ...m, contestants: [{ ...m.contestants[0]!, name: '  ' }, m.contestants[1]!] }, 'FOOTBALL'), null);
});

test('mapMarkets on the football detail: PT labels as shown, lines left in the label', () => {
  const match = decodeMatchFrame(fixture('football-match-detail')).match!;
  const out = mapMarkets(match.subCategories.flatMap((s) => s.markets));
  const find = (market: string, sel: string) => out.find((m) => m.marketLabel === market && m.selectionLabel === sel);

  assert.ok(out.length >= 150, `${out.length}`);
  assert.deepEqual(find('Total de golos - acima/abaixo', 'Acima de 2,5'), { marketLabel: 'Total de golos - acima/abaixo', selectionLabel: 'Acima de 2,5', odds: 2.15, suspended: false });
  assert.equal(find('Total de golos - acima/abaixo', 'Abaixo de 2,5')?.odds, 1.44);
  assert.equal(find('Resultado (Tempo Regulamentar)', 'Empate')?.odds, 3.08);
  assert.equal(find('Resultado duplo', 'Estónia ou empate')?.odds, 1.23);
  assert.equal(find('Resultado handicap', 'Estónia (-1)')?.odds, 3.68);
  assert.equal(find('Resultado handicap', 'Empate (Estónia -1)')?.odds, 3.5);
  assert.equal(find('Estónia - Total de golos', 'Acima de 1,5')?.odds, 2.25);
  assert.equal(find('As duas equipas marcam', 'Sim')?.odds, 1.94);
  assert.equal(find('Resultado correcto', '1 - 0')?.odds, 5.4);
  // Group children take their betslip name.
  assert.equal(find('Resultado - Primeira Parte', 'Estónia')?.odds, 2.53);
  assert.equal(find('Resultado - Segunda parte', 'Bulgária')?.odds, 3.33);
  assert.equal(find('Equipa marca o Primeiro golo', 'Nenhum golo')?.odds, 6.6);
  // Split cards (scorers per team).
  assert.equal(find('Marcador', 'Atanas Iliev')?.odds, 4.05);

  for (const m of out) {
    assert.equal(m.line, undefined);
    assert.equal(m.suspended, false);
    assert.ok(m.odds > 1);
  }
  const keys = out.map((m) => `${m.marketLabel}|${m.selectionLabel}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('mapMarkets on the Golos category: trimmed labels, overlaps removed', () => {
  const match = decodeMatchFrame(fixture('football-match-category-goa')).match!;
  assert.ok(match.subCategories.length >= 3);
  const out = mapMarkets(match.subCategories.flatMap((s) => s.markets));
  const keys = out.map((m) => `${m.marketLabel}|${m.selectionLabel}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const m of out) assert.equal(m.marketLabel, m.marketLabel.trim().replace(/\s+/g, ' '));
  assert.ok(out.some((m) => m.marketLabel === 'Estónia - Total de golos - Primeira Parte'));
  assert.ok(out.some((m) => m.marketLabel === 'Total de golos - Primeira Parte' && /^Acima de \d+,5$/.test(m.selectionLabel)));
});

/** Builds a selection / market for hand-made layouts. */
const sel = (name: string, odds: number, status: number = SelectionStatus.ONLINE): BetclicSelection =>
  ({ id: '1', name, betslipName: name, odds, status, betslipMarketId: '1' }) as BetclicSelection;
const market = (over: Partial<BetclicMarket>): BetclicMarket => ({
  id: '1', name: '', betslipName: '', layout: 0, position: 0, mainSelections: [], selectionMatrix: [], splitCardGroups: [],
  groupMarkets: [], tabs: [], sliders: [], ...over,
});

test('mapMarkets: suspension, empty cells, tabs and sliders', () => {
  const out = mapMarkets([
    market({ name: 'Vencedor', mainSelections: [sel(' A ', 1, SelectionStatus.SUSPENDED), sel('B', 2.1), sel('C', 1.8, SelectionStatus.CLOSED)] }),
    market({ name: 'Matriz', selectionMatrix: [{ selections: [{ selection: null }, { selection: sel('X', 3) }] }] }),
    market({ name: 'Total', tabs: [{ name: 'Jogo', tabMarkets: [market({ name: 'Pontos', mainSelections: [sel('Mais de 210,5', 1.9)] })] }] }),
    market({ name: 'Handicap', sliders: [{ name: 's', sliderValues: [{ value: -3.5, selections: [{ selection: sel('A (-3,5)', 1.95) }, { selection: null }] }] }] }),
  ]);
  assert.deepEqual(out, [
    { marketLabel: 'Vencedor', selectionLabel: 'A', odds: 1, suspended: true },
    { marketLabel: 'Vencedor', selectionLabel: 'B', odds: 2.1, suspended: false },
    { marketLabel: 'Vencedor', selectionLabel: 'C', odds: 1.8, suspended: true },
    { marketLabel: 'Matriz', selectionLabel: 'X', odds: 3, suspended: false },
    { marketLabel: 'Total - Jogo - Pontos', selectionLabel: 'Mais de 210,5', odds: 1.9, suspended: false },
    { marketLabel: 'Handicap', selectionLabel: 'A (-3,5)', odds: 1.95, suspended: false },
  ]);
});

// ─── I/O: first frame ────────────────────────────────────────────────────────

test('callFirstFrame: exact request, reads the first data frame of an open stream', async () => {
  const snapshot = fixture('football-match-detail');
  // Split the frame across chunks; the stream never closes.
  const framed = encodeFrame(snapshot);
  const { fetch, calls } = fakeFetch(() => new Response(streamOf([framed.subarray(0, 3), framed.subarray(3, 1000), framed.subarray(1000)], true)));
  const out = await callFirstFrame('GetMatchWithNotification', new Uint8Array([8, 1]), { fetch });
  assert.equal(out.length, snapshot.length);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://offering.begmedia.com/web/offering.access.api/offering.access.api.MatchService/GetMatchWithNotification');
  assert.deepEqual([...calls[0]!.body], [0, 0, 0, 0, 2, 8, 1]);
  const h = calls[0]!.headers;
  assert.equal(h['content-type'], 'application/grpc-web+proto');
  assert.equal(h['x-grpc-web'], '1');
  assert.equal(h['x-bg-ref-brand'], 'BETCLIC');
  assert.equal(h['x-bg-ref-platform'], 'DESKTOP');
  assert.equal(h['x-bg-ref-regulator-zone'], 'PT');
  assert.equal(h['x-bg-regulation'], 'PT');
  assert.equal(h['accept-language'], 'pt-PT');
  assert.match(h['user-agent']!, /^Mozilla\/5\.0 .*Chrome\/\d+/);
  assert.equal(h.cookie, undefined);
});

test('callFirstFrame: HTTP errors, gRPC errors, empty streams and timeouts throw', async () => {
  const run = (respond: () => Response, timeoutMs?: number) =>
    callFirstFrame('M', new Uint8Array(0), { fetch: fakeFetch(respond).fetch, timeoutMs });
  await assert.rejects(run(() => new Response('blocked', { status: 403 })), /HTTP 403/);
  await assert.rejects(run(() => new Response(null, { status: 200, headers: { 'grpc-status': '12', 'grpc-message': 'nope' } })), /grpc-status 12/);
  await assert.rejects(run(() => new Response(streamOf([trailer('grpc-status: 14\r\ngrpc-message: canceled\r\n')]))), /grpc-status 14 canceled/);
  await assert.rejects(run(() => new Response(streamOf([]))), /without data/);
  // A server that never answers: the 10 s timeout (shortened here) aborts it.
  const hanging: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(callFirstFrame('M', new Uint8Array(0), { fetch: hanging, timeoutMs: 20 }), /timeout/);
});

// ─── I/O: calendar pagination ────────────────────────────────────────────────

const FROM = '2026-11-15T23:27:00.000Z';
const TO = '2026-11-17T23:27:00.000Z';

test('listEvents: pages of 40 spaced 1 s apart, stops on a short page', async () => {
  const { fetch, calls } = fakeFetch((c) =>
    grpcResponse(offsetOf(c.body) === 0 ? listSnapshot(FOOTBALL, 870) : listSnapshot(FOOTBALL.slice(0, 10), 870)));
  const { sleep, waits } = fakeSleep();
  const out = await listBetclicEvents('FOOTBALL', FROM, TO, { fetch, sleep });
  assert.deepEqual(calls.map((c) => offsetOf(c.body)), [0, PAGE_SIZE]);
  assert.deepEqual(waits, [PAGE_GAP_MS]);
  // The fixture's 40 matches all start within the 48 h window (or are live); repeats are dropped.
  assert.equal(out.length, 40);
  assert.equal(new Set(out.map((e) => e.houseEventId)).size, 40);
  assert.ok(out.every((e) => e.mainMarkets?.length === 3));
});

test('listEvents: keeps only the window (plus live), stops once a page starts after it', async () => {
  const to = '2026-11-16T13:00:00.000Z';
  const matches = decodeMatchesBySportFrame(fixture('football-list')).matches;
  const late = FOOTBALL.filter((_, i) => Date.parse(toIsoUtc(matches[i]!.matchDateUtc)!) > Date.parse(to) && !matches[i]!.isLive);
  assert.ok(late.length > 0);
  const latePage = Array.from({ length: PAGE_SIZE }, (_, i) => late[i % late.length]!);
  const { fetch, calls } = fakeFetch((c) => grpcResponse(offsetOf(c.body) === 0 ? listSnapshot(FOOTBALL, 870) : listSnapshot(latePage, 870)));
  const { sleep } = fakeSleep();
  const out = await listBetclicEvents('FOOTBALL', '2026-11-16T00:00:00.000Z', to, { fetch, sleep });
  assert.equal(calls.length, 2);
  for (const e of out) {
    const t = Date.parse(e.startsAt);
    assert.ok(t <= Date.parse(to));
    assert.ok(t >= Date.parse('2026-11-16T00:00:00.000Z') || e.live, `${e.home} ${e.startsAt}`);
  }
  assert.ok(out.some((e) => e.live && Date.parse(e.startsAt) < Date.parse('2026-11-16T00:00:00.000Z')));
  assert.ok(out.length < 40);
});

test('listEvents: stops at the total count, and after 25 pages at most', async () => {
  const total = fakeFetch(() => grpcResponse(listSnapshot(FOOTBALL, 80)));
  await listBetclicEvents('BASKETBALL', FROM, TO, { fetch: total.fetch, sleep: fakeSleep().sleep });
  assert.equal(total.calls.length, 2);
  assert.ok(Buffer.from(total.calls[0]!.body).toString('latin1').includes('basketball'));

  const endless = fakeFetch(() => grpcResponse(listSnapshot(FOOTBALL, 100_000)));
  const { sleep, waits } = fakeSleep();
  await listBetclicEvents('FOOTBALL', FROM, TO, { fetch: endless.fetch, sleep });
  assert.equal(endless.calls.length, MAX_PAGES);
  assert.equal(waits.length, MAX_PAGES - 1);
  assert.equal(offsetOf(endless.calls.at(-1)!.body), (MAX_PAGES - 1) * PAGE_SIZE);
});

test('listEvents: a broken payload is a format error; HTTP errors propagate', async () => {
  const garbage = fakeFetch(() => grpcResponse(new Uint8Array([0x0a, 0xff, 0xff])));
  await assert.rejects(listBetclicEvents('FOOTBALL', FROM, TO, { fetch: garbage.fetch, sleep: fakeSleep().sleep }), ProviderFormatError);
  const blocked = fakeFetch(() => new Response('', { status: 403 }));
  await assert.rejects(listBetclicEvents('FOOTBALL', FROM, TO, { fetch: blocked.fetch, sleep: fakeSleep().sleep }), /HTTP 403/);
  assert.equal(blocked.calls.length, 1);
});

// ─── I/O: markets ────────────────────────────────────────────────────────────

const TOP = fixture('football-match-detail');
const GOA = fixture('football-match-category-goa');
const topOnly = mapMarkets(decodeMatchFrame(TOP).match!.subCategories.flatMap((s) => s.markets));

test('getMarkets: Top, then each listed category 500 ms apart, merged without duplicates', async () => {
  const { fetch, calls } = fakeFetch((c) => grpcResponse(categoryOf(c.body) ? GOA : TOP));
  const { sleep, waits } = fakeSleep();
  const out = await createBetclicSource({ fetch, sleep }).getMarkets('1280435240828928');
  assert.deepEqual(calls.map((c) => categoryOf(c.body)), [null, 'ca_ftb_rslt', 'ca_ftb_pssb', 'ca_ftb_gsc', 'ca_ftb_goa', 'ca_ftb_cshcp', 'ca_ftb_prp']);
  assert.deepEqual(waits, Array(6).fill(CATEGORY_GAP_MS));
  assert.ok(out.length > topOnly.length);
  assert.deepEqual(out.slice(0, topOnly.length), topOnly);
  assert.ok(out.some((m) => m.marketLabel === 'Total de golos - Primeira Parte'));
  const keys = out.map((m) => `${m.marketLabel}|${m.selectionLabel}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('getMarkets: a failing category keeps what was read and stops', async () => {
  const first = fakeFetch((c) => (categoryOf(c.body) ? new Response('', { status: 500 }) : grpcResponse(TOP)));
  assert.deepEqual(await getBetclicMarkets('1', { fetch: first.fetch, sleep: fakeSleep().sleep }), topOnly);
  assert.equal(first.calls.length, 2);

  const second = fakeFetch((c) => {
    const cat = categoryOf(c.body);
    if (!cat) return grpcResponse(TOP);
    return cat === 'ca_ftb_rslt' ? grpcResponse(GOA) : new Response('', { status: 403 });
  });
  const out = await getBetclicMarkets('1', { fetch: second.fetch, sleep: fakeSleep().sleep });
  assert.equal(second.calls.length, 3);
  assert.ok(out.length > topOnly.length);
});

test('getMarkets: a category answered with Top (server ignored it) stops the extra fetches', async () => {
  const { fetch, calls } = fakeFetch(() => grpcResponse(TOP));
  assert.deepEqual(await getBetclicMarkets('1', { fetch, sleep: fakeSleep().sleep }), topOnly);
  assert.equal(calls.length, 2);
});

test('getMarkets: a failing Top fails the call', async () => {
  const { fetch } = fakeFetch(() => new Response('', { status: 403 }));
  await assert.rejects(getBetclicMarkets('1', { fetch, sleep: fakeSleep().sleep }), /HTTP 403/);
});

test('registry: betclic is enabled by ODDS_SOURCES', () => {
  assert.deepEqual(getSources('betclic').map((s) => s.house), ['betclic']);
  assert.deepEqual(getSources(' Betclic , nonexistent').map((s) => s.house), ['betclic']);
  assert.deepEqual(getSources(undefined), []);
});
