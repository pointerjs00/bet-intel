import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BetclicDecodeError,
  ScoreboardStatus,
  SelectionStatus,
  decodeMatchFrame,
  decodeMatchesBySportFrame,
  encodeMatchRequest,
  encodeMatchesBySportRequest,
  type BetclicMarket,
  type BetclicSelection,
} from './schema';

const DIR = join(__dirname, '../../__fixtures__/betclic');
const frame = (name: string) => Buffer.from(readFileSync(join(DIR, `${name}.b64`), 'utf8'), 'base64');
const meta = (name: string) =>
  JSON.parse(readFileSync(join(DIR, `${name}.meta.json`), 'utf8')) as { capturedAt: string; request: Record<string, unknown> };

const HOUR = 3_600_000;

/** Every selection in a market, wherever the layout puts it. */
function selectionsOf(m: BetclicMarket): BetclicSelection[] {
  return [
    ...m.mainSelections,
    ...m.selectionMatrix.flatMap((row) => row.selections.flatMap((s) => (s.selection ? [s.selection] : []))),
    ...m.splitCardGroups.flatMap((g) => g.selections),
    ...m.groupMarkets.flatMap(selectionsOf),
    ...m.tabs.flatMap((t) => t.tabMarkets.flatMap(selectionsOf)),
    ...m.sliders.flatMap((sl) => sl.sliderValues.flatMap((v) => v.selections.flatMap((s) => (s.selection ? [s.selection] : [])))),
  ];
}

const LISTS = [
  { name: 'football-list', sport: 'football', market: 'ftb_rsm', mainSize: 3 },
  { name: 'basketball-list', sport: 'basketball', market: 'bkb_rsm2w', mainSize: 2 },
  { name: 'tennis-list', sport: 'tennis', market: 'ten_rsm', mainSize: 2 },
] as const;

for (const l of LISTS) {
  test(`${l.name}: decodes the snapshot with plausible values`, () => {
    const p = decodeMatchesBySportFrame(frame(l.name));
    const capturedAt = Date.parse(meta(l.name).capturedAt);
    assert.equal(p.defaultMarketTypeCode, l.market);
    assert.ok(p.matches.length >= 30, `${p.matches.length} matches`);
    assert.ok(p.totalCount > p.matches.length);

    for (const m of p.matches) {
      assert.match(m.matchId, /^\d{10,}$/);
      assert.equal(m.competition?.sport?.code, l.sport);
      assert.ok(m.competition?.name);
      assert.equal(m.contestants.length, 2, m.name);
      for (const c of m.contestants) {
        assert.ok(c.name.trim().length > 0);
        assert.match(c.contestantId, /^\d+$/);
      }
      // The event name is "home - away" in contestant order.
      assert.equal(m.name, `${m.contestants[0].name} - ${m.contestants[1].name}`);
      // Started up to 6 h before the capture (live) or starts within 3 days.
      const start = Date.parse(m.matchDateUtc);
      assert.ok(start > capturedAt - 6 * HOUR && start < capturedAt + 72 * HOUR, m.matchDateUtc);
      if (!m.isLive) assert.ok(start > capturedAt, `${m.name} is not live but started at ${m.matchDateUtc}`);
      // isLive can be set a few minutes before the start (scoreboard still NOT_STARTED, no score).
      if (m.isLive) assert.ok(m.scoreboard, `${m.name} is live without a scoreboard`);
      if (m.scoreboard?.liveDisplayStatus === ScoreboardStatus.RUNNING) {
        assert.ok(m.isLive);
        assert.ok(m.scoreboard.currentScore, `${m.name} is running without a score`);
      }
      assert.ok(m.widgets.some((w) => /^\d+$/.test(w.sportradarWidget?.externalMatchRef ?? '')), 'sportradar ref');
    }

    const withMarket = p.matches.filter((m) => m.market);
    assert.ok(withMarket.length >= p.matches.length - 2);
    for (const m of withMarket) {
      const sels = m.market!.mainSelections;
      assert.equal(sels.length, l.mainSize, m.name);
      for (const s of sels) {
        assert.ok(s.name.trim().length > 0);
        assert.ok(s.status === SelectionStatus.ONLINE || s.status === SelectionStatus.SUSPENDED, `status ${s.status}`);
        // Suspended selections can carry odds 1; open ones always pay more than the stake.
        if (s.status === SelectionStatus.ONLINE) assert.ok(s.odds > 1 && s.odds < 1000, `${s.name} ${s.odds}`);
      }
    }
  });
}

test('football-list: 1X2 main market names home, draw, away', () => {
  const p = decodeMatchesBySportFrame(frame('football-list'));
  for (const m of p.matches) {
    const names = m.market!.mainSelections.map((s) => s.name);
    assert.deepEqual(names, [m.contestants[0].name, 'Empate', m.contestants[1].name]);
  }
});

test('football-list: live scoreboard carries the period and score strings', () => {
  const live = decodeMatchesBySportFrame(frame('football-list')).matches.filter(
    (m) => m.scoreboard?.liveDisplayStatus === ScoreboardStatus.RUNNING,
  );
  assert.ok(live.length > 0);
  for (const m of live) {
    assert.match(m.scoreboard!.currentScore!.contestant1, /^\d+$/);
    assert.match(m.scoreboard!.currentScore!.contestant2, /^\d+$/);
    assert.match(m.scoreboard!.currentPeriodScore?.periodType ?? '', /^ftb_/);
  }
});

test('football-match-detail: decodes the match with many markets', () => {
  const name = 'football-match-detail';
  const m = decodeMatchFrame(frame(name)).match!;
  assert.equal(m.matchId, meta(name).request.match_id);
  assert.equal(m.name, 'Estónia - Bulgária');
  assert.deepEqual(m.contestants.map((c) => c.name), ['Estónia', 'Bulgária']);
  assert.ok(Date.parse(m.matchDateUtc) > Date.parse(meta(name).capturedAt));
  assert.ok(m.openMarketCount >= 100);
  assert.ok(m.categories.some((c) => c.id === 'ca_ftb_top'));

  const markets = m.subCategories.flatMap((c) => c.markets);
  assert.ok(markets.length >= 10, `${markets.length} markets`);
  const all = markets.flatMap(selectionsOf);
  assert.ok(all.length >= 150, `${all.length} selections`);
  for (const s of all) {
    assert.ok(s.name.trim().length > 0);
    assert.ok(s.odds > 1, `${s.name} ${s.odds}`);
    assert.match(s.id, /^\d+$/);
  }

  const byName = (n: string) => markets.find((k) => k.name === n)!;
  const totals = selectionsOf(byName('Total de golos - acima/abaixo'));
  assert.ok(totals.some((s) => s.name === 'Acima de 2,5'));
  assert.ok(totals.some((s) => s.name === 'Abaixo de 2,5'));
  // Each line is its own betslip market.
  assert.ok(new Set(totals.map((s) => s.betslipMarketId)).size >= 5);

  const hcp = selectionsOf(byName('Resultado handicap')).map((s) => s.name);
  assert.ok(hcp.includes('Estónia (-1)'));
  assert.ok(hcp.includes('Empate (Estónia -1)'));
  assert.ok(hcp.includes('Bulgária (+1)'));

  const halves = byName('Resultado');
  assert.deepEqual(halves.groupMarkets.map((g) => g.name), ['1.ª parte', '2.ª parte']);
  assert.ok(halves.groupMarkets.every((g) => selectionsOf(g).length === 3));

  const scorers = byName('Marcador');
  assert.ok(scorers.splitCardGroups.length >= 2);
});

test('request encoders match the wire layout used for the captures', () => {
  // { 1: "football", 3: "pt", 5: 100 }
  assert.equal(
    Buffer.from(encodeMatchesBySportRequest({ sportCode: 'football', language: 'pt', offset: 0, limit: 100 })).toString('hex'),
    '0a08666f6f7462616c6c1a02707428' + '64',
  );
  // offset is written when non-zero: field 4 varint
  assert.equal(
    Buffer.from(encodeMatchesBySportRequest({ sportCode: 'tennis', language: 'pt', offset: 40, limit: 40 })).toString('hex'),
    '0a0674656e6e69731a0270742028' + '2828',
  );
  // { 1: int64 match id, 2: "pt" }
  const bytes = encodeMatchRequest({ matchId: '1280435240828928', language: 'pt' });
  assert.equal(bytes[0], 0x08);
  assert.equal(Buffer.from(bytes.subarray(bytes.length - 4)).toString('hex'), '12027074');
});

test('a frame without a snapshot payload is rejected', () => {
  // { 2: notifications {} } — an odds-update frame, not a snapshot.
  const notifications = Uint8Array.from([0x12, 0x00]);
  assert.throws(() => decodeMatchesBySportFrame(notifications), BetclicDecodeError);
  assert.throws(() => decodeMatchFrame(notifications), BetclicDecodeError);
});
