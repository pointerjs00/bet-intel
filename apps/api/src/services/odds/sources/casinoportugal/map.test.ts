import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceMarket } from '../../types';
import { SPORT_ID, mapCalendarPage, mapEventMarketsResponse, nextCursor, parseConfig, playerName } from './map';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'casinoportugal');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');
const load = (name: string) => JSON.parse(text(name));

type Ctx = { home: string; away: string };
const FOOTBALL: Ctx = { home: 'RC Lens', away: 'Toulouse FC' };
const BASKET: Ctx = { home: 'Pyrinto Tampere', away: 'Lahti Basquetebol' };
const TENNIS: Ctx = { home: 'Himeno Sakatsume', away: 'Maria Florencia Urrutia' };

function find(markets: SourceMarket[], market: string, selection: string): SourceMarket {
  const m = markets.find((x) => x.marketLabel === market && x.selectionLabel === selection);
  assert.ok(m, `missing ${market} / ${selection}`);
  return m;
}
const keyOf = (markets: SourceMarket[], sport: OddsSport, ctx: Ctx, market: string, selection: string) => {
  const m = find(markets, market, selection);
  return canonicalKey(sport, m.marketLabel, m.selectionLabel, ctx);
};

// ─── Config and paging ───────────────────────────────────────────────────────

test('sport ids of the three sports', () => {
  assert.deepEqual(SPORT_ID, { FOOTBALL: 69, BASKETBALL: 72, TENNIS: 75 });
});

test('parseConfig reads the tenant id and API host from the sports widget of /desporto; anything else is null', () => {
  assert.deepEqual(parseConfig(text('desporto.html')), { tenantId: '10ca03ad-9dc4-4320-bbc2-c93a42194d08', apiUrl: 'https://aio-offer-distribution.de-2.nsoft.cloud' });
  assert.equal(parseConfig('<html>Just a moment...</html>'), null);
  assert.equal(parseConfig("sportsWidget: { tenantId: 'not-a-uuid', statisticsDomain: 'https://x.example' }"), null);
  assert.equal(parseConfig("sportsWidget: { tenantId: '10ca03ad-9dc4-4320-bbc2-c93a42194d08', statisticsDomain: 'http://plain.example' }"), null);
});

test('nextCursor: only a full page with an opaque cursor continues; short or empty pages end the listing', () => {
  const cursor = 'a'.repeat(800);
  const page = (n: number, c: unknown) => ({ events: Array.from({ length: n }, (_, i) => ({ id: i })), cursorId: c });
  assert.equal(nextCursor(page(200, cursor), 200), cursor);
  assert.equal(nextCursor(page(202, cursor), 200), cursor);
  assert.equal(nextCursor(page(139, cursor), 200), null);
  assert.equal(nextCursor(page(0, cursor), 200), null);
  assert.equal(nextCursor(page(200, ''), 200), null);
  const real = 'KLUv_QBIbRIANit1IzBrrAPDPB7EGA2wHUXsw1crNvjOGAqWbP8JSdbC4cDA-x.y_z'; // the real ones use letters, digits, _ - and .
  assert.equal(nextCursor(page(200, real), 200), real);
  assert.equal(nextCursor(page(200, 'a/b?c=d'), 200), null, 'a cursor is put in a URL path: only plain characters');
  assert.equal(nextCursor(null, 200), null);
});

test('playerName turns "Apelido, Nome" into "Nome Apelido" and leaves other names alone', () => {
  assert.equal(playerName('Sakatsume, Himeno'), 'Himeno Sakatsume');
  assert.equal(playerName('Gauff, Coco '), 'Coco Gauff');
  assert.equal(playerName('Maria Florencia Urrutia'), 'Maria Florencia Urrutia');
  assert.equal(playerName('L Pigossi / L Stefani'), 'L Pigossi / L Stefani');
  assert.equal(playerName(''), '');
});

// ─── Calendar ────────────────────────────────────────────────────────────────

test('football calendar → events with UTC time, country, market count and the 1X2 as main market (odds ÷ 10000); no BetRadar id', () => {
  const events = mapCalendarPage(load('calendar-football.json'), 'FOOTBALL');
  assert.equal(events.length, 5);
  const ev = events[0]!;
  assert.equal(ev.house, 'casinoportugal');
  assert.equal(ev.houseEventId, '1605656');
  assert.equal(ev.home, 'RC Lens');
  assert.equal(ev.away, 'Toulouse FC');
  assert.equal(ev.startsAt, '2026-11-21T19:45:00.000Z');
  assert.equal(ev.competition, 'Ligue 1');
  assert.equal(ev.countryCode, 'FR');
  assert.equal(ev.marketCount, 100);
  assert.equal(ev.live, false);
  assert.equal(ev.extraIds, undefined);
  const main = ev.mainMarkets!;
  assert.deepEqual(main.map((m) => [m.marketLabel, m.selectionLabel, m.odds, m.suspended]).sort(), [
    ['Resultado Final', '1', 2.04, false],
    ['Resultado Final', '2', 3.2, false],
    ['Resultado Final', 'X', 3.6, false],
  ]);
  assert.deepEqual(main.map((m) => canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, FOOTBALL)).sort(), ['FT.1X2.A', 'FT.1X2.D', 'FT.1X2.H']);
});

test('football calendar: double chance, totals and BTTS of the calendar are not main markets', () => {
  for (const e of mapCalendarPage(load('calendar-football.json'), 'FOOTBALL')) {
    assert.ok((e.mainMarkets ?? []).every((m) => m.marketLabel === 'Resultado Final'), e.houseEventId);
  }
});

test('continuation pages carry no sports and no market dictionary: the first page dictionary is carried over, without it events are still listed', () => {
  const known = new Map();
  assert.equal(mapCalendarPage(load('calendar-football.json'), 'FOOTBALL', known).length, 5);
  const next = mapCalendarPage(load('calendar-football-page2.json'), 'FOOTBALL', known);
  assert.equal(next.length, 3);
  assert.deepEqual(next[0]!.mainMarkets!.map((m) => m.marketLabel + '/' + m.selectionLabel).sort(), ['Resultado Final/1', 'Resultado Final/2', 'Resultado Final/X']);
  assert.ok(next.every((e) => e.mainMarkets?.length === 3 && e.countryCode));
  const alone = mapCalendarPage(load('calendar-football-page2.json'), 'FOOTBALL');
  assert.equal(alone.length, 3);
  assert.ok(alone.every((e) => e.mainMarkets === undefined), 'no dictionary: no labels, never a guess');
});

test('basketball calendar: competitors are read by ordinal (not array order); the moneyline is the main market', () => {
  const events = mapCalendarPage(load('calendar-basketball.json'), 'BASKETBALL');
  assert.equal(events.length, 3);
  const ev = events[0]!;
  assert.equal(ev.home, 'Pyrinto Tampere');
  assert.equal(ev.away, 'Lahti Basquetebol');
  assert.equal(ev.startsAt, '2026-11-21T16:00:00.000Z');
  const main = ev.mainMarkets!;
  assert.deepEqual(main.map((m) => [m.marketLabel, m.selectionLabel, m.odds]).sort(), [
    ['Vencedor (incl. prolongamento)', 'Lahti Basquetebol', 2.21],
    ['Vencedor (incl. prolongamento)', 'Pyrinto Tampere', 1.25],
  ]);
  assert.deepEqual(main.map((m) => canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, BASKET)).sort(), ['B.ML.A', 'B.ML.H']);
});

test('tennis calendar: "Apelido, Nome" becomes "Nome Apelido", doubles are skipped, a suspended side is flagged, no country', () => {
  const events = mapCalendarPage(load('calendar-tennis.json'), 'TENNIS');
  assert.equal(events.length, 3, 'the doubles pair is not listed');
  assert.ok(events.every((e) => !/\//.test(e.home + e.away)));
  const ev = events.find((e) => e.houseEventId === '1684120')!;
  assert.equal(ev.home, 'Himeno Sakatsume');
  assert.equal(ev.away, 'Maria Florencia Urrutia');
  assert.equal(ev.competition, 'Taça Billie Jean King');
  assert.equal(ev.countryCode, undefined);
  const main = ev.mainMarkets!;
  assert.deepEqual(main.map((m) => [m.marketLabel, m.selectionLabel, m.odds, m.suspended]).sort(), [
    ['Vencedor', 'Himeno Sakatsume', 1.009, true],
    ['Vencedor', 'Maria Florencia Urrutia', 5.2, false],
  ]);
  assert.deepEqual(main.map((m) => canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, TENNIS)).sort(), ['T.WIN.A', 'T.WIN.B']);
  const swapped = events.find((e) => e.home === 'Clara Burel')!;
  assert.equal(swapped.away, 'Talia Gibson', 'ordinal 1 is the home side even when it comes second in the list');
});

test('a calendar of another sport, or events that are not open pre-match games with two sides, give nothing', () => {
  assert.deepEqual(mapCalendarPage(load('calendar-football.json'), 'TENNIS'), []);
  assert.deepEqual(mapCalendarPage(null, 'FOOTBALL'), []);
  const body = load('calendar-football.json');
  body.events[0].playStatus = 2;
  body.events[1].type = 2;
  body.events[2].competitors = [body.events[2].competitors[0]];
  body.events[3].id = 'abc';
  body.events[4].startsAt = 'not a date';
  assert.deepEqual(mapCalendarPage(body, 'FOOTBALL'), []);
});

// ─── Football markets ────────────────────────────────────────────────────────

test('football event page → labels canonicalKey reads, with the expected keys', () => {
  const r = mapEventMarketsResponse(load('event-football.json'))!;
  assert.equal(r.sport, 'FOOTBALL');
  const k = (market: string, selection: string) => keyOf(r.markets, 'FOOTBALL', FOOTBALL, market, selection);
  assert.equal(k('Resultado Final', '1'), 'FT.1X2.H');
  assert.equal(k('Resultado Final', 'X'), 'FT.1X2.D');
  assert.equal(k('Resultado Final', '2'), 'FT.1X2.A');
  assert.equal(k('Hipótese Dupla', '1X'), 'FT.DC.HD');
  assert.equal(k('Hipótese Dupla', 'X2'), 'FT.DC.DA');
  assert.equal(k('Hipótese Dupla', '12'), 'FT.DC.HA');
  assert.equal(k('Ambas as Equipas Marcam', 'Sim'), 'FT.BTTS.Y');
  assert.equal(k('Ambas as Equipas Marcam', 'Não'), 'FT.BTTS.N');
  assert.equal(k('Total de Golos Mais/Menos', 'Mais de 2.5'), 'FT.TOTAL.goals.O.2.5');
  assert.equal(k('Total de Golos Mais/Menos', 'Menos de 2.5'), 'FT.TOTAL.goals.U.2.5');
  assert.equal(k('Total de Golos Mais/Menos', 'Mais de 4.5'), 'FT.TOTAL.goals.O.4.5');
  assert.equal(k('Empate Anula Aposta', 'RC Lens'), 'FT.DNB.H');
  assert.equal(k('Empate Anula Aposta', 'Toulouse FC'), 'FT.DNB.A');
  assert.equal(k('Intervalo/Final', '1/2'), 'HTFT.HA');
  assert.equal(k('Resultado da 1ª Parte', 'X'), '1H.1X2.D');
  assert.equal(k('1ª Parte - Hipótese Dupla', '1X'), '1H.DC.HD');
  assert.equal(k('1ª Parte - Ambas as Equipas Marcam', 'Sim'), '1H.BTTS.Y');
  assert.equal(k('Resultado da 2ª Parte', '2'), '2H.1X2.A');
  assert.equal(k('2ª Parte - Hipótese Dupla', '12'), '2H.DC.HA');
  assert.equal(k('2ª Parte - Ambas as Equipas Marcam', 'Não'), '2H.BTTS.N');
});

test('football: prices are integer ÷ 10000, a suspended outcome (status 2) is flagged, lines come from the specifiers', () => {
  const { markets } = mapEventMarketsResponse(load('event-football.json'))!;
  assert.equal(find(markets, 'Resultado Final', '1').odds, 2.04);
  assert.equal(find(markets, 'Resultado Final', 'X').odds, 3.6);
  assert.equal(find(markets, 'Resultado Final', 'X').suspended, false);
  const over = find(markets, 'Total de Golos Mais/Menos', 'Mais de 2.5');
  assert.equal(over.odds, 1.6);
  assert.equal(over.line, 2.5);
  const lowest = markets.filter((m) => m.marketLabel === 'Total de Golos Mais/Menos' && m.selectionLabel === 'Mais de 0.5');
  assert.equal(lowest.length, 1);
  assert.equal(lowest[0]!.suspended, true);
  assert.ok(markets.every((m) => m.odds > 1 && Number.isFinite(m.odds)));
});

test('football: totals and handicaps keep half lines only; whole and quarter lines are not given a key-able label', () => {
  const body = load('event-football.json');
  const total = body.events[0].markets.find((m: { marketId: number }) => m.marketId === 1682);
  total.outcomes.push({ id: 90, outcomeId: 4090, odds: 20000, specifiers: [{ id: 2, value: '3' }], status: 1 });
  total.outcomes.push({ id: 91, outcomeId: 4090, odds: 20000, specifiers: [{ id: 2, value: '2.25' }], status: 1 });
  const { markets } = mapEventMarketsResponse(body)!;
  const labels = markets.filter((m) => m.marketLabel === 'Total de Golos Mais/Menos').map((m) => m.selectionLabel);
  assert.ok(labels.includes('Mais de 2.5'));
  assert.ok(!labels.includes('Mais de 3') && !labels.includes('Mais de 2.25'));
  const hcp = markets.filter((m) => m.marketLabel === 'Handicap');
  assert.ok(hcp.length > 0);
  assert.ok(hcp.every((m) => m.line !== null && Math.abs(m.line! % 1) === 0.5));
});

test('football handicap: the home outcome carries the specifier, the away outcome its negation', () => {
  const { markets } = mapEventMarketsResponse(load('event-football.json'))!;
  // 1625: Home -0.5 (4955) and Away "-0.5" (4882) = Toulouse +0.5.
  assert.equal(keyOf(markets, 'FOOTBALL', FOOTBALL, 'Handicap', 'RC Lens -0.5'), 'FT.HCP.EU.H.-0.5');
  assert.equal(keyOf(markets, 'FOOTBALL', FOOTBALL, 'Handicap', 'Toulouse FC +0.5'), 'FT.HCP.EU.A.+0.5');
  assert.equal(keyOf(markets, 'FOOTBALL', FOOTBALL, 'Handicap', 'RC Lens +1.5'), 'FT.HCP.EU.H.+1.5');
  assert.equal(keyOf(markets, 'FOOTBALL', FOOTBALL, 'Handicap', 'Toulouse FC -1.5'), 'FT.HCP.EU.A.-1.5');
});

test('football team totals: the team comes from the market template and gets a team-total key', () => {
  const { markets } = mapEventMarketsResponse(load('event-football.json'))!;
  const home = markets.filter((m) => m.marketLabel === 'Total de Golos Mais/Menos - RC Lens');
  const away = markets.filter((m) => m.marketLabel === 'Total de Golos Mais/Menos - Toulouse FC');
  assert.ok(home.length > 0 && away.length > 0);
  assert.equal(keyOf(markets, 'FOOTBALL', FOOTBALL, 'Total de Golos Mais/Menos - RC Lens', home[0]!.selectionLabel), `FT.TOTAL.goals.H.${home[0]!.selectionLabel.startsWith('Mais') ? 'O' : 'U'}.${home[0]!.line}`);
  assert.match(canonicalKey('FOOTBALL', away[0]!.marketLabel, away[0]!.selectionLabel, FOOTBALL)!, /^FT\.TOTAL\.goals\.A\.[OU]\./);
});

test('football: markets that are not translated keep a readable house label (placeholders resolved) and never get a canonical key', () => {
  const { markets } = mapEventMarketsResponse(load('event-football.json'))!;
  const translated = new Set([
    'Resultado Final', 'Hipótese Dupla', 'Ambas as Equipas Marcam', 'Total de Golos Mais/Menos', 'Empate Anula Aposta', 'Handicap', 'Intervalo/Final',
    'Resultado da 1ª Parte', '1ª Parte - Hipótese Dupla', '1ª Parte - Total de Golos Mais/Menos', '1ª Parte - Ambas as Equipas Marcam',
    'Resultado da 2ª Parte', '2ª Parte - Hipótese Dupla', '2ª Parte - Total de Golos Mais/Menos', '2ª Parte - Ambas as Equipas Marcam',
  ]);
  const raw = markets.filter((m) => !translated.has(m.marketLabel) && !/^Total de Golos Mais\/Menos - /.test(m.marketLabel));
  assert.ok(raw.length > 50, 'plenty of house-only markets are still listed');
  for (const m of raw) {
    assert.ok(!/\{\{|\}\}/.test(m.marketLabel + m.selectionLabel), `unresolved placeholder in ${m.marketLabel} / ${m.selectionLabel}`);
    assert.equal(canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, FOOTBALL), null, `${m.marketLabel} / ${m.selectionLabel} must not key`);
  }
  // Placeholders of the market and of the outcome are resolved: team names, lines, handicap signs.
  assert.ok(raw.some((m) => m.marketLabel === 'RC Lens - Golos exatos'));
  assert.ok(raw.some((m) => / & Abaixo \d+\.5$/.test(m.selectionLabel)), 'outcome line rendered');
  // Look-alike handicaps (corners, 1st half, handicap 1x2 with a score) are neither keyed nor listed.
  assert.ok(!markets.some((m) => /handicap/i.test(m.marketLabel) && m.marketLabel !== 'Handicap'));
});

test('football: a no-wrong-key sweep — every selection with a key is a translated market of the expected family', () => {
  const { markets } = mapEventMarketsResponse(load('event-football.json'))!;
  const families: [RegExp, RegExp][] = [
    [/^Resultado Final$/, /^FT\.1X2\.[HDA]$/],
    [/^Hipótese Dupla$/, /^FT\.DC\.(HD|DA|HA)$/],
    [/^Ambas as Equipas Marcam$/, /^FT\.BTTS\.[YN]$/],
    [/^Total de Golos Mais\/Menos$/, /^FT\.TOTAL\.goals\.[OU]\.\d+\.5$/],
    [/^Total de Golos Mais\/Menos - /, /^FT\.TOTAL\.goals\.[HA]\.[OU]\.\d+\.5$/],
    [/^Empate Anula Aposta$/, /^FT\.DNB\.[HA]$/],
    [/^Handicap$/, /^FT\.HCP\.EU\.[HA]\.[+-]\d+\.5$/],
    [/^Intervalo\/Final$/, /^HTFT\.[HDA]{2}$/],
    [/^Resultado da 1ª Parte$/, /^1H\.1X2\.[HDA]$/],
    [/^1ª Parte - Hipótese Dupla$/, /^1H\.DC\./],
    [/^1ª Parte - Total de Golos Mais\/Menos$/, /^1H\.TOTAL\.goals\.[OU]\./],
    [/^1ª Parte - Ambas as Equipas Marcam$/, /^1H\.BTTS\.[YN]$/],
    [/^Resultado da 2ª Parte$/, /^2H\.1X2\.[HDA]$/],
    [/^2ª Parte - Hipótese Dupla$/, /^2H\.DC\./],
    [/^2ª Parte - Total de Golos Mais\/Menos$/, /^2H\.TOTAL\.goals\.[OU]\./],
    [/^2ª Parte - Ambas as Equipas Marcam$/, /^2H\.BTTS\.[YN]$/],
  ];
  let keyed = 0;
  for (const m of markets) {
    const key = canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, FOOTBALL);
    if (key === null) continue;
    keyed++;
    const family = families.find(([label]) => label.test(m.marketLabel));
    assert.ok(family, `${m.marketLabel} / ${m.selectionLabel} got key ${key} but is not a translated market`);
    assert.match(key, family[1], `${m.marketLabel} / ${m.selectionLabel}`);
  }
  assert.ok(keyed >= 30);
});

test('safety net: an untranslated market whose raw label would key is dropped, one that cannot key stays under its own label', () => {
  const body = {
    sports: [{ id: 69 }],
    markets: [
      { id: 9001, name: 'Resultado Final', eventMarketName: 'Resultado Final', outcomes: [{ id: 1, name: '1', eventMarketOutcomeName: '1' }, { id: 2, name: '2', eventMarketOutcomeName: '2' }] },
      { id: 9002, name: 'Cantos - 1x2', eventMarketName: 'Cantos - 1x2', outcomes: [{ id: 3, name: 'A', eventMarketOutcomeName: 'Mais cantos {{E.C1.NAME}}' }] },
      { id: 9003, name: 'Total', eventMarketName: 'Total {{M.S.TOTAL}}', specifiers: [{ id: 2, displayId: 'TOTAL' }], outcomes: [{ id: 4, name: 'Sim', eventMarketOutcomeName: 'Sim' }] },
    ],
    events: [{
      id: 1, name: 'A vs. B', startsAt: '2026-11-21T19:45:00Z', competitors: [{ ordinal: 1, teamName: 'A' }, { ordinal: 2, teamName: 'B' }],
      markets: [
        { marketId: 9001, outcomes: [{ outcomeId: 1, odds: 20000, status: 1 }, { outcomeId: 2, odds: 30000, status: 1 }] },
        { marketId: 9002, outcomes: [{ outcomeId: 3, odds: 20000, status: 1 }] },
        { marketId: 9003, specifiers: [{ id: 2, value: '7' }], outcomes: [{ outcomeId: 4, odds: 20000, status: 1 }] },
      ],
    }],
  };
  const { markets } = mapEventMarketsResponse(body)!;
  assert.deepEqual(markets.map((m) => [m.marketLabel, m.selectionLabel]), [['Cantos - 1x2', 'Mais cantos A'], ['Total 7', 'Sim']]);
});

test('a template the renderer does not understand drops that market; markets absent from the dictionary and unusable prices are skipped', () => {
  const body = {
    sports: [{ id: 69 }],
    markets: [{ id: 9005, name: 'X', eventMarketName: 'X {{M.S.UNKNOWN_THING}}', outcomes: [{ id: 5, name: 'Sim', eventMarketOutcomeName: 'Sim' }] },
      { id: 9006, name: 'Ok', eventMarketName: 'Ok', outcomes: [{ id: 6, name: 'Sim', eventMarketOutcomeName: 'Sim' }, { id: 7, name: 'Não', eventMarketOutcomeName: 'Não' }, { id: 8, name: 'Talvez', eventMarketOutcomeName: 'Talvez' }] }],
    events: [{
      id: 1, startsAt: '2026-11-21T19:45:00Z', competitors: [{ ordinal: 1, teamName: 'A' }, { ordinal: 2, teamName: 'B' }],
      markets: [
        { marketId: 9005, outcomes: [{ outcomeId: 5, odds: 20000, status: 1 }] },
        { marketId: 424242, outcomes: [{ outcomeId: 5, odds: 20000, status: 1 }] },
        { marketId: 9006, outcomes: [{ outcomeId: 6, odds: 20000, status: 1 }, { outcomeId: 7, odds: 10000, status: 1 }, { outcomeId: 8, odds: 'x', status: 1 }, { outcomeId: 999, odds: 20000, status: 1 }] },
      ],
    }],
  };
  assert.deepEqual(mapEventMarketsResponse(body)!.markets.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [['Ok', 'Sim', 2]]);
});

// ─── Basketball markets ──────────────────────────────────────────────────────

test('basketball event page: moneyline, totals, handicaps, team totals and scoped markets get the expected keys', () => {
  const r = mapEventMarketsResponse(load('event-basketball.json'))!;
  assert.equal(r.sport, 'BASKETBALL');
  const k = (market: string, selection: string) => keyOf(r.markets, 'BASKETBALL', BASKET, market, selection);
  assert.equal(k('Vencedor (incl. prolongamento)', 'Pyrinto Tampere'), 'B.ML.H');
  assert.equal(k('Vencedor (incl. prolongamento)', 'Lahti Basquetebol'), 'B.ML.A');
  assert.equal(k('Total de Pontos Mais/Menos', 'Mais de 169.5'), 'B.TOTAL.O.169.5');
  assert.equal(k('Total de Pontos Mais/Menos', 'Menos de 171.5'), 'B.TOTAL.U.171.5');
  assert.equal(k('Handicap', 'Pyrinto Tampere -4.5'), 'B.HCP.H.-4.5');
  assert.equal(k('Handicap', 'Lahti Basquetebol +3.5'), 'B.HCP.A.+3.5');
  assert.equal(k('1x2 (tempo regulamentar)', 'Empate'), 'B.1X2.D');
  assert.equal(k('1ª Parte - 1x2', 'Pyrinto Tampere'), 'H1:B.1X2.H');
  assert.equal(k('2ª Parte - 1x2', 'Lahti Basquetebol'), 'H2:B.1X2.A');
  const teamTotals = r.markets.filter((m) => /^Total de Pontos Mais\/Menos - /.test(m.marketLabel));
  assert.ok(teamTotals.some((m) => m.marketLabel === 'Total de Pontos Mais/Menos - Pyrinto Tampere'));
  assert.ok(teamTotals.some((m) => m.marketLabel === 'Total de Pontos Mais/Menos - Lahti Basquetebol'));
  for (const m of teamTotals) assert.match(canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, BASKET)!, /^B\.TEAMTOTAL\.[HA]\.[OU]\./, m.marketLabel);
  // 1599 is called "Casa - ..." in the dictionary but its template names the away team: the template wins.
  const awayTotal = teamTotals.find((m) => m.marketLabel.endsWith('Lahti Basquetebol'))!;
  assert.match(canonicalKey('BASKETBALL', awayTotal.marketLabel, awayTotal.selectionLabel, BASKET)!, /^B\.TEAMTOTAL\.A\./);
});

test('basketball: halves and quarters carry their scope, taken from the market specifier for quarters', () => {
  const { markets } = mapEventMarketsResponse(load('event-basketball.json'))!;
  const keys = new Set<string>();
  for (const m of markets) {
    const key = canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, BASKET);
    if (key) keys.add(key.replace(/\d+(\.\d+)?$/, '#'));
  }
  for (const q of [1, 2, 3, 4]) {
    assert.ok([...keys].some((x) => x.startsWith(`Q${q}:B.TOTAL.`)), `quarter ${q} total`);
    assert.ok([...keys].some((x) => x.startsWith(`Q${q}:B.HCP.`)), `quarter ${q} handicap`);
  }
  assert.ok([...keys].some((x) => x.startsWith('H1:B.TOTAL.')));
  assert.ok([...keys].some((x) => x.startsWith('H2:B.TOTAL.')));
  assert.ok([...keys].some((x) => x.startsWith('H1:B.HCP.')));
  assert.ok([...keys].some((x) => x.startsWith('H2:B.HCP.')));
  assert.ok(markets.some((m) => m.marketLabel === '3º Quarto - Total de Pontos Mais/Menos'));
});

test('basketball: no-wrong-key sweep — odd/even, margins, half/team props and unknown shapes never key', () => {
  const { markets } = mapEventMarketsResponse(load('event-basketball.json'))!;
  const labels = new Set<string>();
  let keyed = 0;
  for (const m of markets) {
    assert.ok(!/\{\{|\}\}/.test(m.marketLabel + m.selectionLabel), m.marketLabel);
    const key = canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, BASKET);
    if (key === null) {
      labels.add(m.marketLabel);
      continue;
    }
    keyed++;
    assert.match(key, /^((Q[1-4]|H[12]):)?B\.(ML|1X2|TOTAL|TEAMTOTAL|HCP)\./, `${m.marketLabel} / ${m.selectionLabel} -> ${key}`);
  }
  assert.ok(keyed >= 60);
  assert.ok([...labels].some((l) => /Ímpar\/Par/.test(l)), 'odd/even markets are listed without a key');
  assert.ok([...labels].some((l) => /margem de vitória/i.test(l)));
});

// ─── Tennis markets ──────────────────────────────────────────────────────────

test('tennis event page: winner, set winner, total games, handicap of games, exact set score', () => {
  const r = mapEventMarketsResponse(load('event-tennis.json'))!;
  assert.equal(r.sport, 'TENNIS');
  const k = (market: string, selection: string) => keyOf(r.markets, 'TENNIS', TENNIS, market, selection);
  assert.equal(k('Vencedor', 'Himeno Sakatsume'), 'T.WIN.A');
  assert.equal(k('Vencedor', 'Maria Florencia Urrutia'), 'T.WIN.B');
  assert.equal(k('1º Set - Vencedor', 'Himeno Sakatsume'), 'T.SET1.WIN.A');
  assert.equal(k('2º Set - Vencedor', 'Maria Florencia Urrutia'), 'T.SET2.WIN.B');
  assert.equal(k('Total de Jogos Mais/Menos', 'Mais de 16.5'), 'T.GAMES.O.16.5');
  assert.equal(k('Total de Jogos Mais/Menos', 'Menos de 16.5'), 'T.GAMES.U.16.5');
  assert.equal(k('Handicap de Jogos', 'Himeno Sakatsume -7.5'), 'T.GAMES.HCP.A.-7.5');
  assert.equal(k('Handicap de Jogos', 'Maria Florencia Urrutia +7.5'), 'T.GAMES.HCP.B.+7.5');
  assert.equal(k('Resultado Exato em Sets', '2-1'), 'T.SETS.2-1');
  assert.equal(k('Resultado Exato em Sets', '1-2'), 'T.SETS.1-2');
  assert.equal(k('Resultado Exato em Sets', '0-2'), 'T.SETS.0-2');
  assert.equal(find(r.markets, 'Vencedor', 'Himeno Sakatsume').suspended, true);
  assert.equal(find(r.markets, 'Vencedor', 'Himeno Sakatsume').odds, 1.009);
});

test('tennis: set handicaps, set totals, odd/even and combos are not given a key', () => {
  const { markets } = mapEventMarketsResponse(load('event-tennis.json'))!;
  const unkeyed = markets.filter((m) => canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, TENNIS) === null).map((m) => m.marketLabel);
  for (const needle of ['Handicap de set', 'Set 1 - Total jogos', 'Ímpar/Par jogos', 'Vencedor & Total jogos']) {
    assert.ok(unkeyed.includes(needle), `${needle} stays house-only`);
  }
  for (const m of markets) assert.ok(!/\{\{|\}\}/.test(m.marketLabel + m.selectionLabel), m.marketLabel);
});

test('mapEventMarketsResponse: unknown shapes and sports that are not covered give null', () => {
  assert.equal(mapEventMarketsResponse(null), null);
  assert.equal(mapEventMarketsResponse({}), null);
  assert.equal(mapEventMarketsResponse({ sports: [{ id: 60 }], events: [{}] }), null, 'baseball');
  assert.equal(mapEventMarketsResponse({ sports: [{ id: 69 }, { id: 72 }], events: [{}] }), null, 'ambiguous sport');
  assert.equal(mapEventMarketsResponse({ sports: [{ id: 69 }], events: [] }), null);
});
