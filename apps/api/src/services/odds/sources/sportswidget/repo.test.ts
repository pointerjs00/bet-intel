import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { tablesFromRows, type Tables } from './memory';
import { MAX_PARTIALS, PRUNE_AFTER_MS, REBUILD_EVERY_MS, SKIPPED_TYPES, SportsRepo, parseMeta, planSync, type Meta } from './repo';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'sportswidget');
const fixture = (name: string): Tables => tablesFromRows(JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8')).tables);

const NOW = Date.parse('2026-11-21T06:00:00Z');
const sec = (iso: string) => Date.parse(iso) / 1000;

/** A tiny catalogue: soccer (id 1) and volleyball (id 2) sports, one region and competition under each. */
function catalogue(): Tables {
  return tablesFromRows({
    DictionaryEntry: {
      columns: ['id', 'value'],
      rows: [[10, 'Futebol'], [11, 'soccer'], [12, 'Voleibol'], [13, 'volleyball'], [14, 'Europa'], [15, 'Portugal - Primeira Liga'], [16, 'Benfica'], [17, 'FC Porto'], [18, 'PT|Portugal'], [19, 'Resultado Final'], [20, '{0}||1|1|'], [21, 'Liga'], [22, 'Ténis']],
    },
    AdditionalValueKey: { columns: ['key_id', 'key'], rows: [[0, 'SPORT_ID'], [14, 'COUNTRY_ID'], [9, 'VISUALISATION']] },
    AdditionalValue: { columns: ['node_id', 'key_id', 'dictionary_id'], rows: [[1, 0, 11], [2, 0, 13], [101, 14, 18], [101, 9, 16]] },
    MarketType: { columns: ['id', 'market_type'], rows: [[5, 'MRES']] },
    Structure: {
      columns: ['node_id', 'parent_node_id', 'node_type_id', 'dictionary_id'],
      rows: [[1, 0, 1, 10], [2, 0, 1, 12], [100, 1, 2, 14], [101, 100, 3, 15], [200, 2, 2, 14], [201, 200, 3, 21]],
    },
    OddMap: { columns: ['id', 'dec'], rows: [[1, 1500], [2, 2250], [3, 0]] },
  });
}

const EVENT_COLS = ['node_id', 'parent_node_id', 'start_date', 'participant_home_dictionary_id', 'participant_away_dictionary_id', 'is_displayed', 'is_active'];
const MARKET_COLS = ['node_id', 'parent_node_id', 'market_type_id', 'dictionary_id', 'is_active', 'is_displayed'];
const RESULT_COLS = ['node_id', 'parent_node_id', 'dictionary_id', 'handicap_dictionary_id', 'odd_map_id'];

function game(overrides: { start?: string; displayed?: boolean } = {}): Tables {
  return tablesFromRows({
    Event: {
      columns: EVENT_COLS,
      rows: [
        [1000, 101, sec(overrides.start ?? '2026-11-21T20:00:00Z'), 16, 17, overrides.displayed ?? true, true],
        [2000, 201, sec('2026-11-21T20:00:00Z'), 16, 17, true, true], // volleyball: not kept
        [3000, 999, sec('2026-11-21T20:00:00Z'), 16, 17, true, true], // unknown competition: not kept
      ],
    },
    Market: { columns: MARKET_COLS, rows: [[5000, 1000, 5, 19, true, true], [6000, 2000, 5, 19, true, true], [7000, 4242, 5, 19, true, true]] },
    Result: { columns: RESULT_COLS, rows: [[9000, 5000, 20, 0, 1], [9001, 6000, 20, 0, 1], [9002, 4242, 20, 0, 1]] },
  });
}

// ─── Model ───────────────────────────────────────────────────────────────────

test('real Placard rows: the three sports are found by SPORT_ID (not by Structure id), with names, paths and odds', () => {
  const repo = new SportsRepo();
  repo.apply(fixture('placard-events.json'), 'authoritative');
  const ids = (sport: 'FOOTBALL' | 'BASKETBALL' | 'TENNIS') => repo.eventsOf(sport).map((e) => e.id).sort();
  assert.deepEqual(ids('FOOTBALL'), [34240057, 34319247, 34828100]);
  assert.deepEqual(ids('BASKETBALL'), [35022132]);
  assert.deepEqual(ids('TENNIS'), [35073000, 35073159]);
  const ev = repo.event(34319247)!;
  assert.equal(repo.text(ev.home), 'Liverpool');
  assert.equal(repo.text(ev.away), 'Manchester United');
  assert.equal(ev.start, sec('2026-11-22T16:30:00Z'));
  assert.deepEqual(repo.path(ev.parent).map((p) => p.name), ['Futebol', 'Reino Unido', 'Premier League']);
  assert.equal(repo.country(ev.parent), 'EN|England', 'COUNTRY_ID of the nearest structure node');
  const markets = repo.marketsOf(34319247);
  assert.equal(markets.length, 129, '150 markets less 21 player-prop / bet-builder ones');
  assert.ok(!markets.some((m) => SKIPPED_TYPES.test(repo.marketType(m.type)!)));
  const mres = markets.find((m) => repo.marketType(m.type) === 'MRES')!;
  assert.equal(repo.text(mres.dict), 'Resultado Final (TR)');
  const sels = repo.resultsOf(mres.id).map((r) => [repo.text(r.dict), repo.odds(r.odd)]).sort();
  assert.deepEqual(sels, [['Empate||X|3|', 4], ['{0}||1|1|', 1.62], ['{1}||2|5|', 4.45]]);
  assert.equal(repo.isLive(34240057), true, 'NodesInPlayDetail inPlay=true');
  assert.equal(repo.isLive(34319247), false);
});

test('real Solverde rows: other Structure ids, same event id, its own odds', () => {
  const repo = new SportsRepo();
  repo.apply(fixture('solverde-event.json'), 'authoritative');
  const ev = repo.eventsOf('FOOTBALL')[0]!;
  assert.equal(ev.id, 34319247);
  assert.equal(repo.path(ev.parent)[0]!.id, 105, 'Futebol is node 105 at Solverde (106 at Placard)');
  assert.equal(repo.eventsOf('BASKETBALL').length, 0);
});

test('events of other sports or unknown competitions, and markets/results without a kept parent, are not kept', () => {
  const repo = new SportsRepo();
  repo.apply(catalogue(), 'authoritative');
  repo.apply(game(), 'snapshot');
  assert.deepEqual(repo.size(), { events: 1, markets: 1, results: 1 });
  assert.equal(repo.marketsOf(1000)[0]!.id, 5000);
  assert.equal(repo.resultsOf(5000)[0]!.id, 9000);
  assert.equal(repo.odds(1), 1.5);
  assert.equal(repo.odds(3), null, 'dec 0 = no price');
  assert.equal(repo.odds(77), null);
});

test('player props and bet-builder market types are not kept; markets of events past the horizon are not kept', () => {
  for (const code of ['PSCN', 'FGSC', 'LGSC', 'PBBB', 'PBMF', 'TPLP', 'PSXG', 'HATR']) assert.ok(SKIPPED_TYPES.test(code), code);
  for (const code of ['MRES', 'HCTG', 'BTSC', 'H2HT', 'HTOH', 'CSFT', 'FTPO', 'TGHC', 'PSX']) assert.ok(!SKIPPED_TYPES.test(code), code);
  const until = sec('2026-11-21T19:00:00Z');
  const repo = new SportsRepo(until);
  repo.apply(catalogue(), 'authoritative');
  repo.apply(game({ start: '2026-11-21T20:00:00Z' }), 'snapshot');
  assert.deepEqual(repo.size(), { events: 1, markets: 0, results: 0 }, 'the event is kept, its markets are not');
  const near = new SportsRepo(until);
  near.apply(catalogue(), 'authoritative');
  near.apply(game({ start: '2026-11-21T18:00:00Z' }), 'snapshot');
  assert.deepEqual(near.size(), { events: 1, markets: 1, results: 1 });
});

test('snapshot slices only insert (first wins); delta slices update; the parent of an existing node never moves', () => {
  const repo = new SportsRepo();
  repo.apply(catalogue(), 'authoritative');
  repo.apply(game(), 'snapshot');
  repo.apply(game({ start: '2026-11-21T21:00:00Z' }), 'snapshot');
  assert.equal(repo.event(1000)!.start, sec('2026-11-21T20:00:00Z'));
  repo.apply(game({ start: '2026-11-21T21:00:00Z' }), 'delta');
  assert.equal(repo.event(1000)!.start, sec('2026-11-21T21:00:00Z'));
  repo.apply(tablesFromRows({ Result: { columns: RESULT_COLS, rows: [[9000, 5000, 20, 0, 2]] } }), 'delta');
  assert.equal(repo.resultsOf(5000)[0]!.odd, 2);
  repo.apply(tablesFromRows({ Market: { columns: MARKET_COLS, rows: [[5000, 1234, 5, 19, false, true]] } }), 'delta');
  assert.equal(repo.marketsOf(1000)[0]!.active, false);
  assert.equal(repo.marketsOf(1000)[0]!.event, 1000);
});

test('catalogue tables: authoritative and delta slices overwrite, other snapshots only add', () => {
  const repo = new SportsRepo();
  repo.apply(catalogue(), 'authoritative');
  const dict = (v: string) => tablesFromRows({ DictionaryEntry: { columns: ['id', 'value'], rows: [[16, v], [500, 'new']] } });
  repo.apply(dict('SL Benfica'), 'snapshot');
  assert.equal(repo.text(16), 'Benfica');
  assert.equal(repo.text(500), 'new');
  repo.apply(dict('SL Benfica'), 'delta');
  assert.equal(repo.text(16), 'SL Benfica');
  repo.apply(dict('Benfica'), 'authoritative');
  assert.equal(repo.text(16), 'Benfica');
});

test('*Small rows: patch existing nodes on deltas only; for a node not seen yet they wait and win over its first complete row', () => {
  const repo = new SportsRepo();
  repo.apply(catalogue(), 'authoritative');
  repo.apply(game(), 'snapshot');
  const small = (displayed: boolean, odd: number) =>
    tablesFromRows({
      EventSmall: { columns: ['node_id', 'is_displayed', 'is_active'], rows: [[1000, displayed, false]] },
      MarketSmall: { columns: ['node_id', 'is_active', 'is_displayed'], rows: [[5000, false, displayed]] },
      ResultSmall: { columns: ['node_id', 'odd_map_id'], rows: [[9000, odd]] },
    });
  repo.apply(small(false, 2), 'snapshot');
  assert.equal(repo.event(1000)!.displayed, true, 'snapshot small rows do not touch existing nodes');
  repo.apply(small(false, 2), 'delta');
  assert.equal(repo.event(1000)!.displayed, false);
  assert.equal(repo.event(1000)!.active, false);
  assert.equal(repo.marketsOf(1000)[0]!.displayed, false);
  assert.equal(repo.resultsOf(5000)[0]!.odd, 2);

  // A new market and result whose small rows come first (same slice or an earlier one).
  repo.apply(tablesFromRows({ ResultSmall: { columns: ['node_id', 'odd_map_id'], rows: [[9100, 2]] } }), 'delta');
  repo.apply(
    tablesFromRows({
      MarketSmall: { columns: ['node_id', 'is_active', 'is_displayed'], rows: [[5100, false, true]] },
      Market: { columns: MARKET_COLS, rows: [[5100, 1000, 5, 19, true, true]] },
      Result: { columns: RESULT_COLS, rows: [[9100, 5100, 20, 0, 1]] },
    }),
    'delta',
  );
  assert.equal(repo.marketsOf(1000).find((m) => m.id === 5100)!.active, false, 'small row of the same slice wins for a new node');
  assert.equal(repo.resultsOf(5100)[0]!.odd, 2, 'small row of an earlier slice of the same sync wins too');
  // Pending small rows do not outlive the sync.
  repo.apply(
    tablesFromRows({
      ResultSmall: { columns: ['node_id', 'odd_map_id'], rows: [[9200, 2]] },
      EventSmall: { columns: ['node_id', 'is_displayed', 'is_active'], rows: [[1000, true, true]] },
    }),
    'delta',
  );
  repo.finishSync(NOW);
  repo.apply(tablesFromRows({ Result: { columns: RESULT_COLS, rows: [[9200, 5100, 20, 0, 1]] } }), 'delta');
  assert.equal(repo.resultsOf(5100).find((r) => r.id === 9200)!.odd, 1);
});

test('live state follows NodesInPlayDetail (only for kept events)', () => {
  const repo = new SportsRepo();
  repo.apply(catalogue(), 'authoritative');
  repo.apply(game(), 'snapshot');
  const live = (on: boolean) => tablesFromRows({ NodesInPlayDetail: { columns: ['node_id', 'data'], rows: [[1000, JSON.stringify({ eventType: 'MATCH', inPlay: on })], [2000, '{"inPlay":true}']] } });
  repo.apply(live(true), 'delta');
  assert.equal(repo.isLive(1000), true);
  assert.equal(repo.isLive(2000), false);
  repo.apply(live(false), 'delta');
  assert.equal(repo.isLive(1000), false);
  repo.apply(tablesFromRows({ NodesInPlayDetail: { columns: ['node_id', 'data'], rows: [[1000, 'not json "inPlay":true']] } }), 'delta');
  assert.equal(repo.isLive(1000), false, 'unreadable data is not live');
});

test('finishSync removes hidden events and events that started long ago, with their markets and results', () => {
  const repo = new SportsRepo();
  repo.apply(catalogue(), 'authoritative');
  repo.apply(game({ displayed: false }), 'snapshot');
  assert.equal(repo.size().events, 1);
  repo.finishSync(NOW);
  assert.deepEqual(repo.size(), { events: 0, markets: 0, results: 0 });
  assert.deepEqual(repo.marketsOf(1000), []);

  const old = new SportsRepo();
  old.apply(catalogue(), 'authoritative');
  old.apply(game({ start: new Date(NOW - PRUNE_AFTER_MS - 60_000).toISOString() }), 'snapshot');
  old.finishSync(NOW);
  assert.equal(old.size().events, 0);
  const recent = new SportsRepo();
  recent.apply(catalogue(), 'authoritative');
  recent.apply(game({ start: new Date(NOW - 60 * 60_000).toISOString() }), 'snapshot');
  recent.finishSync(NOW);
  assert.equal(recent.size().events, 1, 'a game that started an hour ago stays (it may be live)');
});

test('a table without the columns the model needs is a format error', () => {
  const repo = new SportsRepo();
  assert.throws(() => repo.apply(tablesFromRows({ Event: { columns: ['node_id', 'parent_node_id'], rows: [[1, 2]] } }), 'delta'), ProviderFormatError);
  assert.throws(() => repo.apply(tablesFromRows({ OddMap: { columns: ['id'], rows: [[1]] } }), 'delta'), ProviderFormatError);
});

// ─── Meta and sync planning ──────────────────────────────────────────────────

const META: Meta = { repositoryId: 1795166563, baseIndex: 1, fullIndex: 65037, partialIndex: 65413, upd2fullIndex: 65412, fullPartitions: 5, cultures: ['pt'] };

test('parseMeta accepts the real getmeta and rejects what the widget would reject', () => {
  const real = { repositoryId: 1795166563, fullIndex: 65037, baseIndex: 1, partialIndex: 65413, upd2fullIndex: 65412, fullPartitions: 5, cultures: ['pt'], originTimestamp: 1795167138 };
  assert.deepEqual(parseMeta(real), META);
  for (const bad of [null, '<html>', { ...real, fullIndex: 0 }, { ...real, baseIndex: undefined }, { ...real, cultures: [] }, { ...real, upd2fullIndex: 70000 }, { ...real, fullPartitions: 0 }, { ...real, fullPartitions: 40 }]) {
    assert.throws(() => parseMeta(bad), ProviderFormatError, JSON.stringify(bad));
  }
});

const paths = (p: ReturnType<typeof planSync>) => p.slices.map((s) => `${s.path}:${s.policy}`);
const T0 = NOW;

test('first sync: base, the full partitions, update-to-full and the last partial', () => {
  const p = planSync(META, null, T0);
  assert.equal(p.rebuild, true);
  assert.equal(p.reuseBase, false);
  assert.deepEqual(paths(p), [
    '1795166563_8_pt_1_0.bin:authoritative',
    '1795166563_2_pt_65037_0.bin:authoritative',
    '1795166563_2_pt_65037_1.bin:snapshot',
    '1795166563_2_pt_65037_2.bin:snapshot',
    '1795166563_2_pt_65037_3.bin:snapshot',
    '1795166563_2_pt_65037_4.bin:snapshot',
    '1795166563_3_pt_65412_0.bin:delta',
    '1795166563_1_pt_65413_0.bin:delta',
  ]);
  assert.equal(p.index, 65413);
});

test('first sync without an update-to-full uses the live slice; too many partials are not fetched (state at the last full)', () => {
  const p = planSync({ ...META, upd2fullIndex: 65037, partialIndex: 65037 + MAX_PARTIALS + 1 }, null, T0);
  assert.deepEqual(paths(p).slice(6), ['live/1795166563/pt.bin:delta']);
  assert.equal(p.index, 65037);
});

test('same repository and full index: nothing, a few partials, or update-to-full + partials', () => {
  const applied = { repositoryId: META.repositoryId, baseIndex: 1, fullIndex: 65037, index: 65413, builtAt: T0 - 60_000 };
  const none = planSync(META, applied, T0);
  assert.deepEqual(none, { rebuild: false, reuseBase: true, slices: [], index: 65413 });
  const few = planSync({ ...META, partialIndex: 65416, upd2fullIndex: 65415 }, applied, T0);
  assert.equal(few.rebuild, false);
  assert.deepEqual(paths(few), ['1795166563_1_pt_65414_0.bin:delta', '1795166563_1_pt_65415_0.bin:delta', '1795166563_1_pt_65416_0.bin:delta']);
  const many = planSync({ ...META, partialIndex: 66001, upd2fullIndex: 66000 }, applied, T0);
  assert.deepEqual(paths(many), ['1795166563_3_pt_66000_0.bin:delta', '1795166563_1_pt_66001_0.bin:delta']);
  assert.equal(many.index, 66001);
  const lagging = planSync({ ...META, partialIndex: 66050, upd2fullIndex: 66000 }, applied, T0);
  assert.deepEqual(paths(lagging), ['1795166563_3_pt_66000_0.bin:delta'], 'partials after the update-to-full are skipped when too many');
  assert.equal(lagging.index, 66000);
});

test('a new full index rebuilds from the kept base; a new repository or base index rebuilds from scratch', () => {
  const applied = { repositoryId: META.repositoryId, baseIndex: 1, fullIndex: 65037, index: 65413, builtAt: T0 - 60_000 };
  const full = planSync({ ...META, fullIndex: 65629, upd2fullIndex: 65760, partialIndex: 65761 }, applied, T0);
  assert.equal(full.rebuild, true);
  assert.equal(full.reuseBase, true);
  assert.equal(full.slices[0]!.path, '1795166563_2_pt_65629_0.bin');
  assert.equal(full.slices.length, 7);
  assert.equal(planSync({ ...META, repositoryId: 42 }, applied, T0).reuseBase, false);
  assert.equal(planSync({ ...META, baseIndex: 2 }, applied, T0).reuseBase, false);
  assert.equal(planSync({ ...META, baseIndex: 2 }, applied, T0).slices[0]!.path, '1795166563_8_pt_2_0.bin');
});

test('a model older than REBUILD_EVERY_MS is rebuilt from the kept base even on the same full index', () => {
  const applied = { repositoryId: META.repositoryId, baseIndex: 1, fullIndex: 65037, index: 65413, builtAt: T0 - REBUILD_EVERY_MS };
  const p = planSync({ ...META, partialIndex: 65414, upd2fullIndex: 65413 }, applied, T0);
  assert.equal(p.rebuild, true);
  assert.equal(p.reuseBase, true);
  assert.equal(p.slices[0]!.path, '1795166563_2_pt_65037_0.bin');
});

test('the language is pt when the repository offers it, else its first culture', () => {
  assert.match(planSync({ ...META, cultures: ['en', 'pt'] }, null, T0).slices[0]!.path, /_8_pt_/);
  assert.match(planSync({ ...META, cultures: ['pt-PT'] }, null, T0).slices[0]!.path, /_8_pt_PT_/);
});

test('only the base slice carries the base flag (a partial numbered 8 does not)', () => {
  const p = planSync({ ...META, fullIndex: 5, upd2fullIndex: 6, partialIndex: 8 }, null, T0);
  assert.deepEqual(p.slices.filter((s) => s.base).map((s) => s.path), ['1795166563_8_pt_1_0.bin']);
  assert.ok(p.slices.some((s) => s.path === '1795166563_1_pt_8_0.bin' && !s.base));
});
