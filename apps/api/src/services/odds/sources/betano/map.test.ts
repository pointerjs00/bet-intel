import assert from 'node:assert/strict';
import test from 'node:test';
import { mapEvent, mapMarkets, marketsFromState, parseInitialState } from './map';

const NOW = 1_700_000_000_000;

// Trimmed from docs/analise-2026-11/odds/samples/betano-prematch-event.json
const prematch = {
  id: '95324745',
  name: 'Benfica - Porto',
  startTime: 1794765600000,
  betRadarId: 72531670,
  leagueName: 'Liga 2',
  url: '/odds/benfica-porto/95324745/',
  markets: [
    {
      name: 'Resultado Final',
      selections: [
        { name: '1', price: 1.85, handicap: 0 },
        { name: 'X', price: 3.35, handicap: 0 },
        { name: '2', price: 3.85, handicap: 0 },
      ],
    },
    {
      name: 'Total de Golos Mais/Menos',
      selections: [
        { name: 'Mais de 2.5', price: 1.75, handicap: 2.5 },
        { name: 'Menos 2.5', price: 1.7, handicap: 2.5 },
      ],
    },
  ],
};

// Trimmed from betano-live-tennis-event.json
const live = {
  event: {
    id: 95704410,
    startTime: 1794764700000,
    participants: [
      { name: 'Eliakim Coulibaly' },
      { name: 'Filippo Moroni', isHome: true },
    ],
    liveData: { score: {} },
    betradarMatchId: 76806836,
  },
  markets: [{ selectionIdList: [1, 2], marketCloseTimeMillis: 0, id: 9, name: 'Vencedor' }],
  selections: [
    { id: 1, price: 3.05, name: 'Filippo Moroni' },
    { id: 2, price: 1.26, name: 'Eliakim Coulibaly' },
  ],
};

test('mapEvent maps a prematch event with markets, handicap, pageUrl and betRadarId', () => {
  const e = mapEvent(prematch, 'FOOTBALL', NOW)!;
  assert.equal(e.house, 'betano');
  assert.equal(e.houseEventId, '95324745');
  assert.equal(e.home, 'Benfica');
  assert.equal(e.away, 'Porto');
  assert.equal(e.competition, 'Liga 2');
  assert.equal(e.startsAt, new Date(1794765600000).toISOString());
  assert.equal(e.live, false);
  assert.equal(e.pageUrl, '/odds/benfica-porto/95324745/');
  assert.deepEqual(e.extraIds, { betRadarId: '72531670' });
  assert.equal(e.mainMarkets?.length, 5);
  const over = e.mainMarkets!.find((m) => m.selectionLabel === 'Mais de 2.5')!;
  assert.equal(over.line, 2.5);
  assert.equal(over.odds, 1.75);
  assert.equal(over.suspended, false);
  assert.equal(e.mainMarkets![0]!.line, null);
});

test('mapEvent maps a live event via participants and selectionIdList', () => {
  const e = mapEvent(live, 'TENNIS', NOW)!;
  assert.equal(e.home, 'Filippo Moroni');
  assert.equal(e.away, 'Eliakim Coulibaly');
  assert.equal(e.live, true);
  assert.equal(e.houseEventId, '95704410');
  assert.deepEqual(e.extraIds, { betRadarId: '76806836' });
  assert.equal(e.pageUrl, undefined);
  assert.deepEqual(
    e.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds]),
    [
      ['Vencedor', 'Filippo Moroni', 3.05],
      ['Vencedor', 'Eliakim Coulibaly', 1.26],
    ],
  );
});

test('mapEvent returns null for bad id, start or name', () => {
  assert.equal(mapEvent({ ...prematch, id: '' }, 'FOOTBALL', NOW), null);
  assert.equal(mapEvent({ ...prematch, startTime: 0 }, 'FOOTBALL', NOW), null);
  assert.equal(mapEvent({ ...prematch, startTime: 'x' }, 'FOOTBALL', NOW), null);
  assert.equal(mapEvent({ ...prematch, name: 'Benfica' }, 'FOOTBALL', NOW), null);
  assert.equal(mapEvent({ ...prematch, name: 'A - B - C' }, 'FOOTBALL', NOW), null);
  assert.equal(mapEvent(null, 'FOOTBALL', NOW), null);
});

test('mapMarkets suspends by price <= 1 and by past close time', () => {
  const out = mapMarkets(
    [
      { name: 'M1', selections: [{ name: 'a', price: 1 }, { name: 'b', price: 2 }] },
      { name: 'M2', marketCloseTimeMillis: NOW - 1, selections: [{ name: 'c', price: 2 }] },
      { name: 'M3', marketCloseTimeMillis: NOW + 1000, selections: [{ name: 'd', price: 2 }] },
    ],
    undefined,
    NOW,
  );
  assert.deepEqual(out.map((m) => m.suspended), [true, false, true, false]);
});

test('mapMarkets dedupes identical market/selection labels and skips unusable rows', () => {
  const out = mapMarkets(
    [
      { name: 'M', selections: [{ name: 'a', price: 2 }, { name: 'a', price: 3 }, { name: '', price: 2 }, { name: 'z' }] },
      { name: '', selections: [{ name: 'q', price: 2 }] },
    ],
    undefined,
    NOW,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.odds, 2);
});

test('parseInitialState extracts the state and returns null on garbage', () => {
  const html = '<html><script>window["initial_state"]={"a":{"markets":[{"type":"X","name":"N"}]}}</script></html>';
  assert.deepEqual(parseInitialState(html), { a: { markets: [{ type: 'X', name: 'N' }] } });
  assert.equal(parseInitialState('<html>nothing</html>'), null);
  assert.equal(parseInitialState('<script>window["initial_state"]={broken</script>'), null);
});

test('marketsFromState finds nested markets/selections and ignores cycles', () => {
  const state: any = {
    a: { b: { markets: [{ type: 'T', name: 'N', selections: [{ id: 1, price: 2, name: 's' }] }, { name: 'no type' }] } },
    c: { selections: [{ id: 5 }, { name: 'no id' }] },
  };
  state.self = state;
  state.a.back = state.a;
  const out = marketsFromState(state);
  assert.equal(out.markets.length, 1);
  assert.deepEqual(out.selections.map((s: any) => s.id), [1, 5]);
});

test('marketsFromState with eventId keeps only that event subtree; falls back to the whole walk without a match', () => {
  const state = {
    main: { id: '5', markets: [{ type: 'A', name: 'Mine', selections: [{ id: 1, name: '1', price: 2 }] }] },
    other: { id: '6', markets: [{ type: 'A', name: 'Theirs', selections: [{ id: 2, name: '1', price: 3 }] }] },
  };
  assert.deepEqual(marketsFromState(state, '5').markets.map((m: any) => m.name), ['Mine']);
  assert.deepEqual(marketsFromState(state, '404').markets.map((m: any) => m.name), ['Mine', 'Theirs']);
  assert.deepEqual(marketsFromState(state).markets.length, 2);
});

test('mapMarkets keeps selections that share labels but differ in line', () => {
  const out = mapMarkets(
    [{ name: 'Total', selections: [{ name: 'Mais', price: 1.9, handicap: 2.5 }, { name: 'Mais', price: 1.4, handicap: 1.5 }] }],
    undefined,
    0,
  );
  assert.deepEqual(out.map((m) => m.line), [2.5, 1.5]);
});
