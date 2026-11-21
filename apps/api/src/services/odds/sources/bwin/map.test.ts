import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceMarket } from '../../types';
import { mapCalendar, mapEvent, mapFixtureView, parseClientConfig, sportOfId, stripCountry } from './map';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'bwin');
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

type Ctx = { home: string; away: string };
const FOOTBALL: Ctx = { home: 'Jeonbuk Hyundai Motors', away: 'FC Seoul' };
const TENNIS: Ctx = { home: 'Carlos Alcaraz', away: 'Ben Shelton' };
const BASKET: Ctx = { home: 'Los Angeles Lakers', away: 'Sacramento Kings' };

function keyOf(markets: SourceMarket[], sport: OddsSport, ctx: Ctx, market: string, selection: string) {
  const m = markets.find((x) => x.marketLabel === market && x.selectionLabel === selection);
  assert.ok(m, `missing ${market} / ${selection}`);
  return canonicalKey(sport, m.marketLabel, m.selectionLabel, ctx);
}

// ─── Start-up config ─────────────────────────────────────────────────────────

test('parseClientConfig reads the access id and CDS url; anything else is null', () => {
  assert.deepEqual(parseClientConfig(load('clientconfig.json')), {
    accessId: 'YmQwNTFkNDAtNzM3Yi00YWIyLThkNDYtYWFmNGY2N2Y1OWIx',
    cdsUrl: 'https://www.bwin.pt/cds-api',
  });
  assert.equal(parseClientConfig({}), null);
  assert.equal(parseClientConfig({ msConnection: { publicAccessId: 'x', cdsFrontendUrl: 'https://www.bwin.pt/cds-api' } }), null);
  assert.equal(parseClientConfig({ msConnection: { publicAccessId: 'YmQwNTFkNDAtNzM3Yi00YWIy', cdsFrontendUrl: 'http://evil' } }), null);
});

test('sportOfId and stripCountry', () => {
  assert.equal(sportOfId(4), 'FOOTBALL');
  assert.equal(sportOfId('5'), 'TENNIS');
  assert.equal(sportOfId(7), 'BASKETBALL');
  assert.equal(sportOfId(11), null);
  assert.equal(stripCountry('Roger Federer (SUI)'), 'Roger Federer');
  assert.equal(stripCountry('Carlos Alcaraz (ESP) -2,5'), 'Carlos Alcaraz -2,5');
  assert.equal(stripCountry('Sendai Ladies (F)'), 'Sendai Ladies (F)');
});

// ─── Calendar ────────────────────────────────────────────────────────────────

test('football calendar → events with UTC time, BetRadar id, country, market count and the plain 1X2 as main market', () => {
  const events = mapCalendar(load('calendar-football.json'), 'FOOTBALL');
  assert.equal(events.length, 3);
  const ev = events[0]!;
  assert.equal(ev.house, 'bwin');
  assert.equal(ev.houseEventId, '2:7914039');
  assert.equal(ev.home, 'Sendai Ladies (F)');
  assert.equal(ev.away, 'Cerezo Osaka Ladies (F)');
  assert.equal(ev.startsAt, '2026-11-21T05:00:00.000Z');
  assert.equal(ev.competition, 'WE League - Feminina');
  assert.deepEqual(ev.extraIds, { betRadarId: '72339106' });
  assert.equal(ev.countryCode, 'JP');
  assert.equal(ev.marketCount, 15);
  assert.equal(ev.live, false);
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds, canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ev)]),
    [['Resultado Final', '1', 3.3, 'FT.1X2.H'], ['Resultado Final', 'X', 3.1, 'FT.1X2.D'], ['Resultado Final', '2', 1.98, 'FT.1X2.A']],
  );
  assert.ok(events[2]!.live, 'Live stage → live');
});

test('the "Resultado do Jogo - 2GV" market is never a 1X2: no main market and every canonical key is null', () => {
  const raw = load('calendar-football.json');
  const ev = mapCalendar(raw, 'FOOTBALL').find((e) => e.houseEventId === '2:7910804')!;
  assert.equal(ev.mainMarkets, undefined);
  const fixture = raw.fixtures.find((f: { id: string }) => f.id === '2:7910804');
  assert.ok(fixture.optionMarkets.some((m: { name: { value: string } }) => m.name.value === 'Resultado do Jogo - 2GV'));
  const view = mapFixtureView({ fixture });
  const gv = view!.markets.filter((m) => /2GV/.test(m.marketLabel));
  assert.equal(gv.length, 3, 'kept with the house label');
  for (const m of gv) {
    for (const sel of [m.selectionLabel, '1', 'X', '2', ev.home, ev.away]) {
      assert.equal(canonicalKey('FOOTBALL', m.marketLabel, sel, ev), null, `${m.marketLabel} / ${sel}`);
    }
  }
  assert.ok(!view!.markets.some((m) => m.marketLabel === 'Resultado Final'));
});

test('tennis calendar: the country suffix is dropped from the players, main market is the winner', () => {
  const events = mapCalendar(load('calendar-tennis.json'), 'TENNIS');
  assert.equal(events.length, 2);
  const ev = events[0]!;
  assert.equal(ev.home, 'James Trotter');
  assert.equal(ev.away, 'Aidan Mayo');
  assert.equal(ev.competition, 'ATP Challenger - Drummondville (CAN) - Piso Duro');
  assert.deepEqual(ev.extraIds, { betRadarId: '76683330' });
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds, canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, ev)]),
    [['Vencedor', 'James Trotter', 2.65, 'T.WIN.A'], ['Vencedor', 'Aidan Mayo', 1.33, 'T.WIN.B']],
  );
});

test('basketball "X em casa dos Y": home is Y, away is X, and the main market names the right teams (selection "1" is the visitor)', () => {
  const events = mapCalendar(load('calendar-basketball.json'), 'BASKETBALL');
  const ev = events.find((e) => e.houseEventId === '20100419')!;
  assert.equal(ev.home, 'Chicago Bulls');
  assert.equal(ev.away, 'Washington Wizards');
  const raw = load('calendar-basketball.json').fixtures.find((f: { id: string }) => f.id === '20100419');
  assert.match(raw.name.value, /Washington Wizards em casa dos Chicago Bulls/);
  const ml = raw.optionMarkets.find((m: { isMain: boolean }) => m.isMain);
  assert.equal(ml.options[0].sourceName.value, '1'); // the house's "1" is the first participant, the visitor
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds, canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, ev)]),
    [['Vencedor (incl. prolongamento)', 'Washington Wizards', ml.options[0].price.odds, 'B.ML.A'], ['Vencedor (incl. prolongamento)', 'Chicago Bulls', ml.options[1].price.odds, 'B.ML.H']],
  );
  assert.equal(events.find((e) => e.houseEventId === '20100828')!.live, true);
});

test('fixtures that are not an open pre-match/live game of the sport are skipped', () => {
  const f = load('calendar-football.json').fixtures[0];
  assert.ok(mapEvent(f, 'FOOTBALL'));
  assert.equal(mapEvent(f, 'TENNIS'), null, 'wrong sport');
  assert.equal(mapEvent({ ...f, stage: 'Finished' }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...f, isOpenForBetting: false }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...f, id: 'abc' }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...f, startDate: 'nope' }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...f, participants: [] }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...f, addons: { betRadar: 0 } }, 'FOOTBALL')!.extraIds, undefined, 'only real BetRadar ids');
  assert.deepEqual(mapCalendar({}, 'FOOTBALL'), []);
});

// ─── Markets ─────────────────────────────────────────────────────────────────

test('football fixture-view → labels canonicalKey reads, with the expected keys', () => {
  const view = mapFixtureView(load('view-football.json'))!;
  assert.equal(view.sport, 'FOOTBALL');
  const k = (m: string, s: string) => keyOf(view.markets, 'FOOTBALL', FOOTBALL, m, s);
  assert.equal(k('Resultado Final', '1'), 'FT.1X2.H');
  assert.equal(k('Resultado Final', 'X'), 'FT.1X2.D');
  assert.equal(k('Resultado Final', '2'), 'FT.1X2.A');
  assert.equal(k('Total de Golos Mais/Menos', 'Mais de 2.5'), 'FT.TOTAL.goals.O.2.5');
  assert.equal(k('Total de Golos Mais/Menos', 'Menos de 2.5'), 'FT.TOTAL.goals.U.2.5');
  assert.equal(k('Ambas as Equipas Marcam', 'Sim'), 'FT.BTTS.Y');
  assert.equal(k('Ambas as Equipas Marcam', 'Não'), 'FT.BTTS.N');
  assert.equal(k('Hipótese Dupla', '1X'), 'FT.DC.HD');
  assert.equal(k('Hipótese Dupla', 'X2'), 'FT.DC.DA');
  assert.equal(k('Hipótese Dupla', '12'), 'FT.DC.HA');
  assert.equal(k('Empate Anula Aposta', 'FC Seoul'), 'FT.DNB.A');
  assert.equal(k('Resultado Exato', '1-0'), 'FT.SCORE.1-0');
  assert.equal(k('Intervalo/Final', '1/2'), 'HTFT.HA');
  assert.equal(k('Total de Golos Mais/Menos - FC Seoul', 'Mais de 1.5'), 'FT.TOTAL.goals.A.O.1.5');
  assert.equal(k('Total de Golos Mais/Menos - Jeonbuk Hyundai Motors', 'Menos de 1.5'), 'FT.TOTAL.goals.H.U.1.5');
  assert.equal(k('Total de Cantos Mais/Menos', 'Mais de 8.5'), 'FT.TOTAL.corners.O.8.5');
  assert.equal(k('1ª Parte - Total de Golos Mais/Menos', 'Mais de 1.5'), '1H.TOTAL.goals.O.1.5');
  assert.equal(k('Resultado da 1ª Parte', '1'), '1H.1X2.H');
  assert.equal(k('Resultado da 2ª Parte', '2'), '2H.1X2.A');
  assert.equal(k('1ª Parte - Hipótese Dupla', '1X'), '1H.DC.HD');
  assert.equal(k('1ª Parte - Ambas as Equipas Marcam', 'Sim'), '1H.BTTS.Y');
  const total = view.markets.find((m) => m.marketLabel === 'Total de Golos Mais/Menos' && m.selectionLabel === 'Mais de 2.5')!;
  assert.equal(total.line, 2.5);
  assert.equal(total.odds, 1.72);
  assert.equal(total.suspended, false);
});

test('football: Draw and participant options resolve by id even when the house abbreviates a team ("Seul")', () => {
  const view = mapFixtureView(load('view-football.json'))!;
  const odds = (m: string, s: string) => view.markets.find((x) => x.marketLabel === m && x.selectionLabel === s)!.odds;
  assert.equal(odds('Resultado Final', '2'), 2.55);
  assert.equal(odds('Empate Anula Aposta', 'FC Seoul'), 1.95);
  assert.equal(odds('Hipótese Dupla', 'X2'), 1.52);
});

test('football: a market the translator does not know never gets a canonical key (house label kept, or dropped)', () => {
  const view = mapFixtureView(load('view-football.json'))!;
  const labels = new Set(view.markets.map((m) => m.marketLabel));
  // "Equipa que marca o 1º golo" would read as "team scores" with the raw label: it must not be offered under a wrong key.
  assert.ok(!labels.has('Equipa que marca o 1º golo'));
  assert.ok(!labels.has('Jeonbuk Hyundai Motors marca'));
  assert.ok(labels.has('Margem de Vitória'), 'unknown but harmless markets stay (own house only)');
  assert.ok(labels.has('1X2 & Total golos 2.5'));
});

test('football: every selection that gets a canonical key has a key from the expected families, none is a wrong 1X2', () => {
  const view = mapFixtureView(load('view-football.json'))!;
  const allowed = /^(FT|1H|2H)\.(1X2|DC|BTTS|TOTAL|DNB|SCORE)\.|^HTFT\./;
  for (const m of view.markets) {
    const key = canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, FOOTBALL);
    if (key === null) continue;
    assert.match(key, allowed, `${m.marketLabel} / ${m.selectionLabel} → ${key}`);
    if (/^FT\.1X2\./.test(key)) assert.equal(m.marketLabel, 'Resultado Final', `${m.marketLabel} / ${m.selectionLabel} got a 1X2 key`);
  }
  const keyed = view.markets.filter((m) => canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, FOOTBALL) !== null).length;
  assert.ok(keyed >= 60, `expected most translated markets to be keyed, got ${keyed}`);
});

test('tennis fixture-view (games format): winner, total games, set winner, handicap of games, exact sets', () => {
  const view = mapFixtureView(load('view-tennis.json'))!;
  assert.equal(view.sport, 'TENNIS');
  const k = (m: string, s: string) => keyOf(view.markets, 'TENNIS', TENNIS, m, s);
  assert.equal(k('Vencedor', 'Carlos Alcaraz'), 'T.WIN.A');
  assert.equal(k('Vencedor', 'Ben Shelton'), 'T.WIN.B');
  assert.equal(k('Total de Jogos Mais/Menos', 'Mais de 21.5'), 'T.GAMES.O.21.5');
  assert.equal(k('Total de Jogos Mais/Menos', 'Menos de 22.5'), 'T.GAMES.U.22.5');
  assert.equal(k('1º Set - Vencedor', 'Ben Shelton'), 'T.SET1.WIN.B');
  assert.equal(k('2º Set - Vencedor', 'Carlos Alcaraz'), 'T.SET2.WIN.A');
  assert.equal(k('Handicap de Jogos', 'Carlos Alcaraz -2.5'), 'T.GAMES.HCP.A.-2.5');
  assert.equal(k('Handicap de Jogos', 'Ben Shelton +2.5'), 'T.GAMES.HCP.B.+2.5');
  assert.equal(k('Resultado Exato em Sets', '2-1'), 'T.SETS.2-1');
  // The abbreviated "C. Alcaraz" of the winner market resolved to the full name by player id.
  assert.ok(!view.markets.some((m) => /^[A-Z]\. /.test(m.selectionLabel)));
  assert.ok(!view.markets.some((m) => /\([A-Z]{3}\)/.test(m.selectionLabel)), 'no country suffix left');
  for (const m of view.markets.filter((x) => /Handicap de sets|pelo menos|Quantos jogos vencerá/.test(x.marketLabel))) {
    assert.equal(canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, TENNIS), null, m.marketLabel);
  }
});

test('basketball fixture-view: names of the visitor/home in the right order, totals and handicaps with Q/H scopes', () => {
  const view = mapFixtureView(load('view-basketball.json'))!;
  assert.equal(view.sport, 'BASKETBALL');
  const k = (m: string, s: string) => keyOf(view.markets, 'BASKETBALL', BASKET, m, s);
  assert.equal(k('Vencedor (incl. prolongamento)', 'Sacramento Kings'), 'B.ML.A'); // "1" = first participant = visitor
  assert.equal(k('Vencedor (incl. prolongamento)', 'Los Angeles Lakers'), 'B.ML.H');
  assert.equal(view.markets.find((m) => m.selectionLabel === 'Sacramento Kings')!.odds, 5.75);
  assert.equal(k('Total de Pontos Mais/Menos', 'Mais de 227.5'), 'B.TOTAL.O.227.5');
  assert.equal(k('Handicap', 'Sacramento Kings +19.5'), 'B.HCP.A.+19.5');
  assert.equal(k('Handicap', 'Los Angeles Lakers -19.5'), 'B.HCP.H.-19.5');
  assert.equal(k('1ª Parte - Total de Pontos Mais/Menos', 'Mais de 123.5'), 'H1:B.TOTAL.O.123.5');
  assert.equal(k('1ª Parte - Handicap', 'Sacramento Kings +13.5'), 'H1:B.HCP.A.+13.5');
  assert.equal(k('1º Quarto - Total de Pontos Mais/Menos', 'Menos de 62.5'), 'Q1:B.TOTAL.U.62.5');
  assert.equal(k('1º Quarto - Handicap', 'Los Angeles Lakers -5.5'), 'Q1:B.HCP.H.-5.5');
  // Player props, odd/even, margins and combos stay without a key.
  for (const m of view.markets.filter((x) => /triplos|ímpar|Margem|Intervalo|&/.test(x.marketLabel))) {
    assert.equal(canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, BASKET), null, m.marketLabel);
  }
});

test('options without a usable price are skipped; suspended ones are flagged', () => {
  const raw = load('view-football.json');
  const mk = raw.fixture.optionMarkets.find((m: { name: { value: string } }) => m.name.value === 'Resultado do jogo');
  mk.options[0].price.odds = 0;
  mk.options[1].status = 'Suspended';
  const view = mapFixtureView(raw)!;
  const res = view.markets.filter((m) => m.marketLabel === 'Resultado Final');
  assert.deepEqual(res.map((m) => [m.selectionLabel, m.suspended]), [['X', true], ['2', false]]);
  assert.equal(mapFixtureView({ fixture: { sport: { id: 11 } } }), null);
  assert.equal(mapFixtureView({}), null);
});

test('basketball "A - B" (not American naming): the first participant is the home team and "1"', () => {
  const raw = load('calendar-basketball.json').fixtures.find((f: { id: string }) => f.id === '20105757');
  assert.equal(raw.name.value, 'Geelong Venom - Southside Flyers');
  const ev = mapEvent(raw, 'BASKETBALL')!;
  assert.equal(ev.home, 'Geelong Venom');
  assert.equal(ev.away, 'Southside Flyers');
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.selectionLabel, m.odds, canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, ev)]),
    [['Geelong Venom', 1.28, 'B.ML.H'], ['Southside Flyers', 2.7, 'B.ML.A']],
  );
  const markets = mapFixtureView({ fixture: raw })!.markets;
  const k = (m: string, s: string) => keyOf(markets, 'BASKETBALL', ev, m, s);
  assert.equal(k('Handicap', 'Geelong Venom -7.5'), 'B.HCP.H.-7.5');
  assert.equal(k('Handicap', 'Southside Flyers +7.5'), 'B.HCP.A.+7.5');
  assert.equal(k('Total de Pontos Mais/Menos', 'Mais de 155.5'), 'B.TOTAL.O.155.5');
  assert.equal(k('1ª Parte - Handicap', 'Southside Flyers +3.5'), 'H1:B.HCP.A.+3.5');
  assert.equal(k('1º Quarto - Handicap', 'Geelong Venom -1.5'), 'Q1:B.HCP.H.-1.5');
  // The two-way half winner is not comparable with a 3-way 1X2: no key.
  for (const m of markets.filter((x) => /Resultado do 1º/.test(x.marketLabel))) assert.equal(canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, ev), null);
});
