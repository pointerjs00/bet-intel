import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { encodeFrame } from './sources/betclic/grpcWeb';
import { createBetclicSource, type FetchLike } from './sources/betclic';
import { createOddsService } from './service';
import { createOddsStore } from './store';
import { createFakeRedis } from './fakeRedis';
import { canonicalKey } from './canonical';
import type { Candidate } from './matcher';
import type { SourceMarket } from './types';

const DIR = join(__dirname, '__fixtures__/betclic');
const read = (name: string) => new Uint8Array(Buffer.from(readFileSync(join(DIR, `${name}.b64`), 'utf8'), 'base64'));
const MATCH_ID = '1280435240828928';
const NOW = Date.parse((JSON.parse(readFileSync(join(DIR, 'football-list.meta.json'), 'utf8')) as { capturedAt: string }).capturedAt);

/** A snapshot frame + trailer as a finished stream. */
const grpc = (snapshot: Uint8Array) => {
  const t = Buffer.from('grpc-status: 0\r\n');
  const tr = new Uint8Array(5 + t.length);
  tr[0] = 0x80;
  new DataView(tr.buffer).setUint32(1, t.length, false);
  tr.set(t, 5);
  return new Response(new Blob([Buffer.from(encodeFrame(snapshot)), Buffer.from(tr)]).stream(), { status: 200 });
};

/** An empty list page (short page: the adapter stops paging). */
function emptyPage(): Uint8Array {
  const w = protobuf.Writer.create();
  w.uint32(0x0a).fork();
  w.uint32(0x0a).string('ftb_rsm');
  w.uint32(0x28).int32(0);
  w.ldelim();
  return w.finish();
}

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

/** match_id (varint field 1) of a GetMatchRequest, from the framed body. */
function matchIdOf(body: Uint8Array): string | null {
  const r = protobuf.Reader.create(body.subarray(5));
  while (r.pos < r.len) {
    const t = r.uint32();
    if (t >>> 3 === 1) return r.int64().toString();
    r.skipType(t & 7);
  }
  return null;
}

/** Serves the fixture that matches the gRPC method, sport, offset, match id and category of the request. */
const fakeFetch: FetchLike = async (url, init) => {
  const body = init.body as unknown as Uint8Array;
  const text = Buffer.from(body).toString('latin1');
  if (url.endsWith('GetMatchesBySportWithNotifications')) {
    const sport = /football|basketball|tennis/.exec(text)?.[0];
    if (!sport) return new Response('unknown sport', { status: 400 });
    return grpc(offsetOf(body) === 0 ? read(`${sport}-list`) : emptyPage());
  }
  if (url.endsWith('GetMatchWithNotification')) {
    if (matchIdOf(body) !== MATCH_ID) return new Response('unknown match', { status: 404 });
    const category = /ca_[a-z]+_[a-z]+/.exec(text)?.[0];
    // The only captured category is "goa"; other tabs reuse it (duplicates are dropped by the adapter).
    return grpc(read(category ? 'football-match-category-goa' : 'football-match-detail'));
  }
  return new Response('unexpected', { status: 500 });
};

const source = createBetclicSource({ fetch: fakeFetch, sleep: async () => undefined });

/** Coarse market group of a Betclic market label, for the coverage report. */
function groupOf(label: string): string {
  const l = label.toLowerCase();
  if (/handicap/.test(l)) return 'handicap';
  if (/dupla|ou empate|dupla hip/.test(l)) return 'dupla hipótese';
  if (/ambas|marcam/.test(l)) return 'ambas marcam';
  if (/golos|total|mais de|menos de|par\/ímpar|ímpar/.test(l)) return 'golos / totais';
  if (/resultado|vencedor|1x2|intervalo/.test(l)) return 'resultado';
  if (/canto|cart|penal|fora de jogo/.test(l)) return 'cantos / cartões / outros';
  return 'outros';
}

async function setup() {
  const events = await source.listEvents('FOOTBALL', new Date(NOW).toISOString(), new Date(NOW + 48 * 3600e3).toISOString());
  const ev = events.find((e) => e.houseEventId === MATCH_ID);
  assert.ok(ev, 'the detail fixture match is in the list fixture');
  // No ESPN fixture holds this match: a minimal candidate with the Betclic names and start time.
  const candidates = async (): Promise<Candidate[]> => [
    { providerMatchId: '777', league: 'uefa.nations', sport: 'FOOTBALL', home: ev.home, away: ev.away, startsAt: ev.startsAt },
  ];
  const svc = createOddsService({
    sources: [source], store: createOddsStore(createFakeRedis()), candidates, now: () => NOW, track: (_p, fn) => fn(),
  });
  await svc.refreshCatalogue(source, 'FOOTBALL');
  return { svc, ev };
}

test('Betclic fixtures -> ESPN link -> canonical keys -> getEvent', async () => {
  const { svc, ev } = await setup();
  const key = 'espn:FOOTBALL:777';
  const view = await svc.getEvent(key);
  assert.ok(view, 'event is linked to the ESPN match');
  assert.deepEqual(view.houses, ['betclic']);
  assert.equal(view.event.home, ev.home);

  // main market: FT.1X2.* with Betclic's own odds
  const main = ev.mainMarkets!;
  const home = view.rows.find((r) => r.key === 'FT.1X2.H');
  const draw = view.rows.find((r) => r.key === 'FT.1X2.D');
  const away = view.rows.find((r) => r.key === 'FT.1X2.A');
  assert.ok(home && draw && away);
  assert.equal(home.prices.betclic!.odds, main[0]!.odds);
  assert.equal(draw.prices.betclic!.odds, main[1]!.odds);
  assert.equal(away.prices.betclic!.odds, main[2]!.odds);

  // at least 5 markets of the detail carry a canonical key
  const markets = new Set(view.rows.filter((r) => r.key).map((r) => r.key!.split('.').slice(0, 2).join('.')));
  assert.ok(markets.size >= 5, `distinct keyed markets: ${[...markets].join(', ')}`);
});

test('Betclic detail: canonical-key coverage report', async () => {
  const { ev } = await setup();
  const selections: SourceMarket[] = await source.getMarkets(MATCH_ID);
  const groups = new Map<string, { total: number; keyed: number }>();
  const unkeyed = new Set<string>();
  let keyed = 0;
  for (const s of selections) {
    const k = canonicalKey('FOOTBALL', s.marketLabel, s.selectionLabel, ev);
    const g = groups.get(groupOf(s.marketLabel)) ?? { total: 0, keyed: 0 };
    g.total++;
    if (k) { g.keyed++; keyed++; } else unseen(s);
    groups.set(groupOf(s.marketLabel), g);
  }
  function unseen(s: SourceMarket) { unkeyed.add(`${s.marketLabel} | ${s.selectionLabel}`); }
  assert.equal(selections.length, 357);
  assert.ok(keyed >= 174, `keyed ${keyed}/357 (was 174 when this report was first measured)`);
  if (process.env.ODDS_COVERAGE) {
    const rows = [...groups].map(([g, v]) => `${g}: ${v.keyed}/${v.total} (${((100 * v.keyed) / v.total).toFixed(1)}%)`);
    console.log(`TOTAL ${keyed}/${selections.length} (${((100 * keyed) / selections.length).toFixed(1)}%)\n${rows.join('\n')}\nUNKEYED (${unkeyed.size}):\n${[...unkeyed].sort().join('\n')}`);
  }
});
