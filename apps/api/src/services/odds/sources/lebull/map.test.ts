import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceMarket } from '../../types';
import { competitionName, mapEvent, mapLeagueGames, mapPrematch, mapStakeTypes, startsAtOf, treeLeagues } from './map';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'lebull');
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

/** Canonical key of the selection `selection` of `market` in the mapped markets of `body`. */
function keyOf(markets: SourceMarket[], sport: OddsSport, ctx: { home: string; away: string }, market: string, selection: string) {
  const m = markets.find((x) => x.marketLabel === market && x.selectionLabel === selection);
  assert.ok(m, `missing ${market} / ${selection}`);
  return canonicalKey(sport, m.marketLabel, m.selectionLabel, ctx);
}

// ─── Calendar ────────────────────────────────────────────────────────────────

test('startsAtOf uses `timestamp` (UTC ms), not the 4 h-behind `date`', () => {
  const g = load('calendar-football.json')[0].games[0];
  assert.match(g.date, /^\/Date\(\d+\+0400\)\/$/);
  assert.equal(startsAtOf(g), '2026-11-21T12:30:00.000Z'); // Man City - Fulham, 12:30 UTC
  assert.notEqual(startsAtOf(g), new Date(Number(g.date.match(/\d+/)![0])).toISOString());
  assert.equal(startsAtOf({}), null);
});

test('competitionName drops the country prefix of football and basketball, never of tennis', () => {
  assert.equal(competitionName('England. Premier League', 'FOOTBALL'), 'Premier League');
  assert.equal(competitionName('Portugal. Primeira League', 'FOOTBALL'), 'Primeira League');
  assert.equal(competitionName('UEFA Champions League', 'FOOTBALL'), 'UEFA Champions League');
  assert.equal(competitionName('NBA', 'BASKETBALL'), 'NBA');
  assert.equal(competitionName('Spain. ACB', 'BASKETBALL'), 'ACB');
  assert.equal(competitionName('ATP Challenger. Helsinki. Hard. Finland', 'TENNIS'), 'ATP Challenger. Helsinki. Hard. Finland');
});

test('football calendar → events with real time, competition, country, market count and the 1X2 main market', () => {
  const events = mapLeagueGames(load('calendar-football.json'), 'FOOTBALL');
  assert.equal(events.length, 4);
  const ev = events[0]!;
  assert.equal(ev.house, 'lebull');
  assert.equal(ev.houseEventId, '42011147');
  assert.equal(ev.home, 'Manchester City');
  assert.equal(ev.away, 'Fulham');
  assert.equal(ev.startsAt, '2026-11-21T12:30:00.000Z');
  assert.equal(ev.competition, 'Premier League');
  assert.equal(ev.countryCode, 'GB-ENG');
  assert.equal(ev.marketCount, 249);
  assert.equal(ev.live, false);
  assert.equal(ev.extraIds, undefined);
  const main = ev.mainMarkets!;
  assert.deepEqual(main.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [
    ['Resultado Final', '1', 1.31],
    ['Resultado Final', 'X', 5.26],
    ['Resultado Final', '2', 6.67],
  ]);
  const ctx = { home: ev.home, away: ev.away };
  assert.deepEqual(main.map((m) => canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx)), ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A']);
});

test('basketball calendar → NBA events with winner (incl. overtime) and regulation 1X2 as main markets', () => {
  const events = mapLeagueGames(load('calendar-basketball.json'), 'BASKETBALL');
  const ev = events[0]!;
  assert.equal(ev.competition, 'NBA');
  assert.equal(ev.home, 'Phoenix Suns');
  assert.equal(ev.startsAt, '2026-11-21T02:30:00.000Z');
  const ctx = { home: ev.home, away: ev.away };
  const keys = ev.mainMarkets!.map((m) => canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, ctx));
  assert.ok(keys.includes('B.ML.H') && keys.includes('B.ML.A'), keys.join());
  assert.ok(keys.includes('B.1X2.H') && keys.includes('B.1X2.D') && keys.includes('B.1X2.A'), keys.join());
});

test('tennis calendar → events keep the tour name; winner main market keyed T.WIN', () => {
  const events = mapLeagueGames(load('calendar-tennis.json'), 'TENNIS');
  const ev = events[0]!;
  assert.equal(ev.competition, 'ATP Finals. Hard');
  assert.equal(ev.home, 'Carlos Alcaraz');
  assert.equal(ev.startsAt, '2026-11-21T13:30:00.000Z');
  const ctx = { home: ev.home, away: ev.away };
  assert.deepEqual(ev.mainMarkets!.map((m) => canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, ctx)), ['T.WIN.A', 'T.WIN.B']);
});

test('mapEvent rejects outrights, one-sided and time-less games', () => {
  const g = load('calendar-football.json')[0].games[0];
  assert.equal(mapEvent({ ...g, isOutright: true }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...g, teamB: '' }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...g, timestamp: undefined }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...g, eventId: 'x' }, 'FOOTBALL'), null);
  assert.equal(mapEvent({ ...g, isLive: true }, 'FOOTBALL')!.live, true);
});

test('treeLeagues lists the sport leagues that have events, biggest first', () => {
  const tree = load('sports-tree.json');
  const football = treeLeagues(tree, 'FOOTBALL');
  assert.ok(football.length >= 3);
  assert.ok(football.every((l) => l.eventsCount > 0));
  assert.deepEqual(football.map((l) => l.eventsCount), [...football.map((l) => l.eventsCount)].sort((a, b) => b - a));
  assert.ok(football.some((l) => l.leagueId === 4485 && l.leagueName === 'England. Premier League'));
  assert.ok(treeLeagues(tree, 'BASKETBALL').some((l) => l.leagueId === 998));
  assert.ok(treeLeagues(tree, 'TENNIS').some((l) => l.leagueId === 33669));
  assert.deepEqual(treeLeagues({ sports: [] }, 'FOOTBALL'), []);
});

// ─── Markets ─────────────────────────────────────────────────────────────────

test('football prematch: canonical keys of the main selections', () => {
  const body = load('prematch-football.json');
  const markets = mapPrematch(body);
  const ctx = { home: body.teamA, away: body.teamB };
  const k = (m: string, s: string) => keyOf(markets, 'FOOTBALL', ctx, m, s);
  assert.equal(k('Resultado Final', '1'), 'FT.1X2.H');
  assert.equal(k('Resultado Final', 'X'), 'FT.1X2.D');
  assert.equal(k('Resultado Final', '2'), 'FT.1X2.A');
  assert.equal(k('Total de Golos Mais/Menos', 'Mais de 2.5'), 'FT.TOTAL.goals.O.2.5');
  assert.equal(k('Total de Golos Mais/Menos', 'Menos de 2.5'), 'FT.TOTAL.goals.U.2.5');
  assert.equal(k('Ambas as Equipas Marcam', 'Sim'), 'FT.BTTS.Y');
  assert.equal(k('Ambas as Equipas Marcam', 'Não'), 'FT.BTTS.N');
  assert.equal(k('Hipótese Dupla', '1X'), 'FT.DC.HD');
  assert.equal(k('Hipótese Dupla', '12'), 'FT.DC.HA');
  assert.equal(k('Hipótese Dupla', 'X2'), 'FT.DC.DA');
  assert.equal(k('Empate Anula Aposta', 'Manchester City'), 'FT.DNB.H');
  assert.equal(k('Empate Anula Aposta', 'Fulham'), 'FT.DNB.A');
  assert.equal(k('Handicap', 'Manchester City (-1.5)'), 'FT.HCP.EU.H.-1.5');
  assert.equal(k('Handicap', 'Fulham (+1.5)'), 'FT.HCP.EU.A.+1.5');
  assert.equal(k('Total de Golos - Manchester City', 'Mais de 1.5'), 'FT.TOTAL.goals.H.O.1.5');
  assert.equal(k('Total de Golos - Fulham', 'Menos de 0.5'), 'FT.TOTAL.goals.A.U.0.5');
  assert.equal(k('Intervalo/Final', '1/1'), 'HTFT.HH');
  assert.equal(k('Intervalo/Final', 'X/2'), 'HTFT.DA');
  assert.equal(k('Resultado Exato', '3-0'), 'FT.SCORE.3-0');
  assert.equal(k('Total Odd/Even', 'Even'), 'FT.PARITY.EVEN');
});

test('football prematch: whole-number handicaps stay out of the 3-way handicap key; unknown types keep the house label', () => {
  const body = load('prematch-football.json');
  const markets = mapPrematch(body);
  const ctx = { home: body.teamA, away: body.teamB };
  const zero = markets.find((m) => m.marketLabel === 'Handicap Asiático');
  assert.ok(zero, 'handicap 0 is kept under its own label');
  assert.equal(canonicalKey('FOOTBALL', zero.marketLabel, zero.selectionLabel, ctx), null);
  const unknown = markets.filter((m) => /^(Last goal|Result and total|Win 1 in both halves|Team 1 to win to nil|Highest scoring half)$/.test(m.marketLabel));
  assert.ok(unknown.length >= 5);
  for (const m of unknown) assert.equal(canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx), null, `${m.marketLabel} / ${m.selectionLabel}`);
  // Team odd/even must not read as the match parity.
  for (const m of markets.filter((x) => /^Team \d total odd\/even$/.test(x.marketLabel))) {
    assert.equal(canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx), null);
  }
  // A line sent as `stakeArgument` is part of the fallback selection and of `line`.
  const combo = markets.find((m) => m.marketLabel === 'Result and total')!;
  assert.match(combo.selectionLabel, /\d\.\d$/);
  assert.equal(typeof combo.line, 'number');
});

test('football prematch: no selection of a mapped market gets a wrong key (every keyed selection is one we expect)', () => {
  const body = load('prematch-football.json');
  const ctx = { home: body.teamA, away: body.teamB };
  const allowed = /^(FT\.(1X2|DC|TOTAL|BTTS|DNB|HCP|SCORE|PARITY)\.|HTFT\.)/;
  for (const m of mapPrematch(body)) {
    const key = canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx);
    if (key) assert.match(key, allowed, `${m.marketLabel} / ${m.selectionLabel} → ${key}`);
  }
});

test('basketball prematch: canonical keys', () => {
  const body = load('prematch-basketball.json');
  const markets = mapPrematch(body);
  const ctx = { home: body.teamA, away: body.teamB };
  const k = (m: string, s: string) => keyOf(markets, 'BASKETBALL', ctx, m, s);
  assert.equal(k('Vencedor (incl. prolongamento)', 'Phoenix Suns'), 'B.ML.H');
  assert.equal(k('Vencedor (incl. prolongamento)', 'Utah Jazz'), 'B.ML.A');
  assert.equal(k('Resultado 1X2 (sem prolongamento)', 'Phoenix Suns'), 'B.1X2.H');
  assert.equal(k('Resultado 1X2 (sem prolongamento)', 'X'), 'B.1X2.D');
  assert.equal(k('Handicap', 'Phoenix Suns (-19.5)'), 'B.HCP.H.-19.5');
  assert.equal(k('Handicap', 'Utah Jazz (+19.5)'), 'B.HCP.A.+19.5');
  assert.equal(k('Total de Pontos Mais/Menos', 'Mais de 206.5'), 'B.TOTAL.O.206.5');
  assert.equal(k('Total de Pontos - Phoenix Suns', 'Mais de 102.5'), 'B.TEAMTOTAL.H.O.102.5');
  assert.equal(k('Total de Pontos - Utah Jazz', 'Menos de 98.5'), 'B.TEAMTOTAL.A.U.98.5');
  assert.equal(k('1ª Parte - Resultado 1X2', 'Phoenix Suns'), 'H1:B.1X2.H');
  assert.equal(k('1º Quarto - Total de Pontos', 'Mais de 49.5'), 'Q1:B.TOTAL.O.49.5');
  assert.equal(k('3º Quarto - Handicap', 'Phoenix Suns (-8.5)'), 'Q3:B.HCP.H.-8.5');
  // 2-way quarter/half winners are not comparable (a 3-way 1X2 shares the wording), odd/even and props are not keyed.
  for (const m of markets.filter((x) => /sem empate|odd\/even|Highest Scoring|Score Points First/i.test(x.marketLabel))) {
    assert.equal(canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, ctx), null, m.marketLabel);
  }
});

test('tennis prematch: canonical keys', () => {
  const body = load('prematch-tennis.json');
  const markets = mapPrematch(body);
  const ctx = { home: body.teamA, away: body.teamB };
  const k = (m: string, s: string) => keyOf(markets, 'TENNIS', ctx, m, s);
  assert.equal(k('Vencedor', 'Carlos Alcaraz'), 'T.WIN.A');
  assert.equal(k('Vencedor', 'Ben Shelton'), 'T.WIN.B');
  assert.equal(k('1.º Set - Vencedor', 'Carlos Alcaraz'), 'T.SET1.WIN.A');
  assert.equal(k('2.º Set - Vencedor', 'Ben Shelton'), 'T.SET2.WIN.B');
  assert.equal(k('Handicap de Jogos', 'Carlos Alcaraz (-6.5)'), 'T.GAMES.HCP.A.-6.5');
  assert.equal(k('Handicap de Jogos', 'Ben Shelton (+6.5)'), 'T.GAMES.HCP.B.+6.5');
  assert.equal(k('Total de Jogos', 'Mais de 18.5'), 'T.GAMES.O.18.5');
  assert.equal(k('Total de Jogos', 'Menos de 18.5'), 'T.GAMES.U.18.5');
  assert.equal(k('Resultado Exato em Sets', '2-0'), 'T.SETS.2-0');
  assert.equal(k('Resultado Exato em Sets', '2-1'), 'T.SETS.2-1');
  // Set-scoped games markets, set handicap, scores and odd/even stay house-only.
  for (const m of markets.filter((x) => /^(Sets Handicap|1st Set: |2nd Set: |Total odd\/even)/.test(x.marketLabel))) {
    assert.equal(canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, ctx), null, `${m.marketLabel} / ${m.selectionLabel}`);
  }
});

test('mapStakeTypes: prices of 1 or less and inactive stakes are suspended; deleted ones are dropped', () => {
  const stakeTypes = [
    {
      stakeTypeId: 1,
      stakeTypeName: 'Result',
      stakes: [
        { stakeName: 'A', betFactor: 1.5, isActive: true },
        { stakeName: 'X', betFactor: 1, isActive: true },
        { stakeName: 'B', betFactor: 2.5, isActive: false },
        { stakeName: 'A', betFactor: 9, isActive: true, isDeleted: true },
      ],
    },
  ];
  const out = mapStakeTypes(stakeTypes, { sport: 'FOOTBALL', home: 'A', away: 'B' });
  assert.deepEqual(out.map((m) => [m.selectionLabel, m.suspended]), [['1', false], ['X', true], ['2', true]]);
});

test('mapPrematch returns [] for a sport the comparator does not cover', () => {
  assert.deepEqual(mapPrematch({ sportId: 13, teamA: 'A', teamB: 'B', stakeTypes: [] }), []);
});
