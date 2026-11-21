import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceMarket } from '../../types';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { parseCalendarHtml, parseEventPage, parseTabsContents, type PageMarket } from './html';
import { SPORT_DI, cursorOf, mapCalendarEvents, mapMarkets, parsePending, pendingBody } from './map';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'retabet');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');
const json = (name: string) => JSON.parse(text(name));

type Ctx = { home: string; away: string };

/** Event page + the extra tabs of a real game → the markets as the adapter maps them. */
function load(sport: OddsSport, event: string, tabs: string): { markets: SourceMarket[]; ctx: Ctx } {
  const page = parseEventPage(text(event));
  const markets: PageMarket[] = [...page.markets, ...parseTabsContents(text(tabs))];
  const ctx = { home: page.home, away: page.away };
  return { markets: mapMarkets(sport, ctx, markets), ctx };
}

function find(markets: SourceMarket[], market: string, selection: string): SourceMarket {
  const m = markets.find((x) => x.marketLabel === market && x.selectionLabel === selection);
  assert.ok(m, `missing ${market} / ${selection}`);
  return m;
}
const keyOf = (markets: SourceMarket[], sport: OddsSport, ctx: Ctx, market: string, selection: string) => {
  const m = find(markets, market, selection);
  return canonicalKey(sport, m.marketLabel, m.selectionLabel, ctx);
};

// ─── Calendar ────────────────────────────────────────────────────────────────

test('sport ids of the three sports', () => {
  assert.deepEqual(SPORT_DI, { FOOTBALL: 1, BASKETBALL: 5, TENNIS: 8 });
});

test('football calendar → events with UTC time, competition without the country prefix, country code, market count and the 1X2 as main market; no BetRadar id', () => {
  const events = mapCalendarEvents(parseCalendarHtml(text('calendar.html')), 'FOOTBALL');
  assert.deepEqual(events.map((e) => e.houseEventId), ['38939502', '38982693']);
  const ev = events[0]!;
  assert.equal(ev.house, 'retabet');
  assert.equal(ev.sport, 'FOOTBALL');
  assert.equal(ev.home, 'FC Juarez');
  assert.equal(ev.away, 'Atlas FC');
  assert.equal(ev.startsAt, '2026-11-21T03:00:00.000Z');
  assert.equal(ev.competition, 'Liga MX');
  assert.equal(ev.countryCode, 'MX');
  assert.equal(ev.marketCount, 109);
  assert.equal(ev.live, false);
  assert.equal(ev.extraIds, undefined, 'the study found no BetRadar id');
  assert.match(ev.pageUrl!, /^https:\/\/www\.retabet\.pt\/desportos\/futebol\/.+\/38939502$/);
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds, m.suspended]),
    [['Resultado Final', '1', 3.34, false], ['Resultado Final', 'X', 3.36, false], ['Resultado Final', '2', 1.8, false]],
  );
  assert.deepEqual(
    ev.mainMarkets!.map((m) => canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, { home: ev.home, away: ev.away })),
    ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A'],
  );
});

test('football calendar: the main market is found by name (not by position) and an event without a 1X2 has no mainMarkets; a country outside the table gives no code', () => {
  const [, pt] = mapCalendarEvents(parseCalendarHtml(text('calendar.html')), 'FOOTBALL');
  assert.equal(pt!.home, 'Marítimo');
  assert.equal(pt!.countryCode, 'PT');
  assert.equal(pt!.mainMarkets!.length, 3);
  const raw = parseCalendarHtml(text('calendar.html')).filter((e) => e.i === 38982693);
  raw[0]!.b = raw[0]!.b.filter((m: { md: string }) => m.md !== '1-X-2');
  assert.equal(mapCalendarEvents(raw, 'FOOTBALL')[0]!.mainMarkets, undefined);
  raw[0]!.scd = 'Internacional';
  raw[0]!.sdd = 'Internacional Amigáveis';
  const x = mapCalendarEvents(raw, 'FOOTBALL')[0]!;
  assert.equal(x.countryCode, undefined);
  assert.equal(x.competition, 'Amigáveis', 'the country/region prefix is dropped from the competition');
});

test('basketball calendar: moneyline is the main market, NBA keeps its name and gets a country', () => {
  const events = mapCalendarEvents(parseCalendarHtml(text('calendar.html')), 'BASKETBALL');
  assert.equal(events.length, 1);
  const ev = events[0]!;
  assert.deepEqual([ev.home, ev.away, ev.competition, ev.countryCode], ['Utah Jazz', 'Phoenix Suns', 'NBA', 'US']);
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds]),
    [['Vencedor (incl. prolongamento)', 'Utah Jazz', ev.mainMarkets![0]!.odds], ['Vencedor (incl. prolongamento)', 'Phoenix Suns', ev.mainMarkets![1]!.odds]],
  );
  assert.deepEqual(
    ev.mainMarkets!.map((m) => canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, { home: ev.home, away: ev.away })),
    ['B.ML.H', 'B.ML.A'],
  );
});

test('tennis calendar: singles only (doubles skipped), competition keeps the tour name, the winner is the main market keyed per player', () => {
  const events = mapCalendarEvents(parseCalendarHtml(text('calendar.html')), 'TENNIS');
  assert.deepEqual(events.map((e) => e.houseEventId), ['38975468']);
  const ev = events[0]!;
  assert.deepEqual([ev.home, ev.away, ev.competition, ev.countryCode], ['James Trotter', 'Aidan Mayo', 'Challenger Drummondville', undefined]);
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel]),
    [['Vencedor', 'James Trotter'], ['Vencedor', 'Aidan Mayo']],
  );
  assert.deepEqual(
    ev.mainMarkets!.map((m) => canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, { home: ev.home, away: ev.away })),
    ['T.WIN.A', 'T.WIN.B'],
  );
});

test('other sports (ice hockey) are not listed; live is flagged; bad events are skipped', () => {
  const raw = parseCalendarHtml(text('calendar.html'));
  for (const s of ['FOOTBALL', 'BASKETBALL', 'TENNIS'] as const) {
    assert.ok(mapCalendarEvents(raw, s).every((e) => e.houseEventId !== '38985353'), s);
  }
  const live = structuredClone(raw.filter((e) => e.i === 38939502));
  live[0]!.il = true;
  assert.equal(mapCalendarEvents(live, 'FOOTBALL')[0]!.live, true);
  const bad = structuredClone(raw.filter((e) => e.i === 38939502));
  bad[0]!.du = 'not a date';
  assert.deepEqual(mapCalendarEvents(bad, 'FOOTBALL'), []);
  const same = structuredClone(raw.filter((e) => e.i === 38939502));
  same[0]!.d = 'Same - Same';
  same[0]!.p = [];
  assert.deepEqual(mapCalendarEvents(same, 'FOOTBALL'), []);
  const noP = structuredClone(raw.filter((e) => e.i === 38939502));
  noP[0]!.p = [];
  assert.equal(mapCalendarEvents(noP, 'FOOTBALL')[0]!.home, 'FC Juarez', 'the title "Home - Away" is enough');
});

test('names: the title is used when it splits in two; a hyphen inside a name falls back to the participant list', () => {
  const raw = structuredClone(parseCalendarHtml(text('calendar.html')).filter((e) => e.i === 38939502));
  raw[0]!.d = 'Saint - Étienne - Lyon';
  raw[0]!.p = [
    { i: 1, n: 'Saint - Étienne', h: true },
    { i: 2, n: 'Lyon', h: false },
  ];
  const ev = mapCalendarEvents(raw, 'FOOTBALL')[0]!;
  assert.deepEqual([ev.home, ev.away], ['Saint - Étienne', 'Lyon']);
  raw[0]!.p = [];
  assert.deepEqual(mapCalendarEvents(raw, 'FOOTBALL'), [], 'ambiguous title and no participants: skipped');
});

test('LoadPending: the cursor of the first page is its last event; pages carry the next cursor; an empty or null group ends the listing', () => {
  const raw = parseCalendarHtml(text('calendar.html'));
  const last = raw[raw.length - 1]!;
  assert.deepEqual(cursorOf(last), { lei: last.i, let: '2026-11-21T17:00:00.0000000Z' });
  assert.deepEqual(pendingBody({ lei: 38985996, let: '2026-11-21T12:30:00.0000000Z' }), { wpa: 'CentralPanel', wpo: 1, lei: 38985996, let: '2026-11-21T12:30:00.0000000Z' });

  const page = parsePending(json('loadpending.json'));
  assert.equal(page.events.length, 4);
  assert.deepEqual(page.next, { lei: 38980586, let: '2026-11-21T02:20:00.0000000Z' });

  assert.deepEqual(parsePending(json('loadpending-end.json')), { events: [], next: null });
  assert.deepEqual(parsePending({ eg: null, lei: 0, let: null, ier: false }), { events: [], next: null });
  assert.deepEqual(parsePending({ eg: { e: [] }, lei: 5, let: '2026-11-21T02:20:00.0000000Z', ier: true }), { events: [], next: null });
  assert.throws(() => parsePending('<html>Access Denied</html>'), ProviderFormatError);
  assert.throws(() => parsePending({ foo: 1 }), ProviderFormatError);
  assert.throws(() => parsePending({ eg: { e: 'x' } }), ProviderFormatError);
});

// ─── Football markets ────────────────────────────────────────────────────────

test('football event page + tabs → labels canonicalKey reads, with the expected keys', () => {
  const { markets, ctx } = load('FOOTBALL', 'event-football.html', 'tabs-football.html');
  const k = (market: string, selection: string) => keyOf(markets, 'FOOTBALL', ctx, market, selection);
  assert.equal(ctx.home, 'Newcastle');
  assert.equal(k('Resultado Final', '1'), 'FT.1X2.H');
  assert.equal(k('Resultado Final', 'X'), 'FT.1X2.D');
  assert.equal(k('Resultado Final', '2'), 'FT.1X2.A');
  assert.equal(find(markets, 'Resultado Final', '1').odds, 5.2);
  assert.equal(k('Hipótese Dupla', '1X'), 'FT.DC.HD');
  assert.equal(k('Hipótese Dupla', 'X2'), 'FT.DC.DA');
  assert.equal(k('Hipótese Dupla', '12'), 'FT.DC.HA');
  assert.equal(k('Ambas as Equipas Marcam', 'Sim'), 'FT.BTTS.Y');
  assert.equal(k('Ambas as Equipas Marcam', 'Não'), 'FT.BTTS.N');
  assert.equal(k('Total de Golos Mais/Menos', 'Mais de 2.5'), 'FT.TOTAL.goals.O.2.5');
  assert.equal(k('Total de Golos Mais/Menos', 'Menos de 0.5'), 'FT.TOTAL.goals.U.0.5');
  assert.equal(k('Total de Golos Mais/Menos - Newcastle', 'Mais de 1.5'), 'FT.TOTAL.goals.H.O.1.5');
  assert.equal(k('Total de Golos Mais/Menos - Arsenal', 'Menos de 2.5'), 'FT.TOTAL.goals.A.U.2.5');
  assert.equal(k('Empate Anula Aposta', 'Newcastle'), 'FT.DNB.H');
  assert.equal(k('Empate Anula Aposta', 'Arsenal'), 'FT.DNB.A');
  assert.equal(k('Handicap', 'Newcastle +0.5'), 'FT.HCP.EU.H.+0.5');
  assert.equal(k('Handicap', 'Arsenal -1.5'), 'FT.HCP.EU.A.-1.5');
  assert.equal(k('Intervalo/Final', '1/1'), 'HTFT.HH');
  assert.equal(k('Intervalo/Final', 'X/2'), 'HTFT.DA');
  assert.equal(k('Resultado da 1ª Parte', '1'), '1H.1X2.H');
  assert.equal(k('Resultado da 1ª Parte', 'X'), '1H.1X2.D');
  assert.equal(k('Resultado da 2ª Parte', '2'), '2H.1X2.A');
  assert.equal(k('1ª Parte - Total de Golos Mais/Menos', 'Mais de 0.5'), '1H.TOTAL.goals.O.0.5');
  assert.equal(k('2ª Parte - Total de Golos Mais/Menos', 'Menos de 1.5'), '2H.TOTAL.goals.U.1.5');
  assert.equal(k('1ª Parte - Hipótese Dupla', '1X'), '1H.DC.HD');
  assert.equal(k('2ª Parte - Hipótese Dupla', '12'), '2H.DC.HA');
  assert.equal(k('1ª Parte - Ambas as Equipas Marcam', 'Sim'), '1H.BTTS.Y');
  assert.equal(k('2ª Parte - Ambas as Equipas Marcam', 'Não'), '2H.BTTS.N');
  assert.equal(k('Resultado Exato', '2-1'), 'FT.SCORE.2-1');
  assert.ok(!markets.some((m) => m.marketLabel === 'Resultado Exato' && m.selectionLabel === 'Outro'), '"Outro" has no score to key');
});

test('football: only half lines are given a key-able label (whole lines and quarter lines stay out); a market on two tabs appears once', () => {
  const { markets } = load('FOOTBALL', 'event-football.html', 'tabs-football.html');
  assert.ok(!markets.some((m) => /^(Mais|Menos) de \d+$/.test(m.selectionLabel)), 'whole totals');
  assert.ok(!markets.some((m) => /^(Newcastle|Arsenal) [+-]\d+$/.test(m.selectionLabel) && m.marketLabel === 'Handicap'), 'whole handicaps');
  assert.equal(markets.filter((m) => m.marketLabel === 'Total de Golos Mais/Menos' && m.selectionLabel === 'Mais de 2.5').length, 1);
  assert.equal(markets.filter((m) => m.marketLabel === 'Ambas as Equipas Marcam' && m.selectionLabel === 'Sim').length, 1);
});

test('football: every selection with a key belongs to a translated family (no-wrong-key sweep)', () => {
  const { markets, ctx } = load('FOOTBALL', 'event-football.html', 'tabs-football.html');
  const families: [RegExp, RegExp][] = [
    [/^Resultado Final$/, /^FT\.1X2\.[HDA]$/],
    [/^Hipótese Dupla$/, /^FT\.DC\.(HD|DA|HA)$/],
    [/^Ambas as Equipas Marcam$/, /^FT\.BTTS\.[YN]$/],
    [/^Total de Golos Mais\/Menos$/, /^FT\.TOTAL\.goals\.[OU]\.\d+\.5$/],
    [/^Total de Golos Mais\/Menos - /, /^FT\.TOTAL\.goals\.[HA]\.[OU]\.\d+\.5$/],
    [/^Empate Anula Aposta$/, /^FT\.DNB\.[HA]$/],
    [/^Handicap$/, /^FT\.HCP\.EU\.[HA]\.[+-]\d+\.5$/],
    [/^Intervalo\/Final$/, /^HTFT\.[HDA]{2}$/],
    [/^Resultado Exato$/, /^FT\.SCORE\.\d+-\d+$/],
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
    assert.ok(!/undefined|\{\{|NaN/.test(m.marketLabel + m.selectionLabel), m.marketLabel);
    const key = canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx);
    if (key === null) continue;
    keyed++;
    const family = families.find(([label]) => label.test(m.marketLabel));
    assert.ok(family, `${m.marketLabel} / ${m.selectionLabel} got key ${key} but is not a translated market`);
    assert.match(key, family[1], `${m.marketLabel} / ${m.selectionLabel}`);
  }
  assert.ok(keyed >= 60, `only ${keyed} keyed selections`);
});

test('football: untranslated markets keep a readable house label and never get a canonical key (corners, shots, combos, 3-way handicap, first goal...)', () => {
  const { markets, ctx } = load('FOOTBALL', 'event-football.html', 'tabs-football.html');
  const raw = markets.filter((m) => !/^(Resultado|Hipótese|Ambas|Total de Golos|Empate Anula|Handicap$|Intervalo|1ª Parte -|2ª Parte -)/.test(m.marketLabel));
  assert.ok(raw.length > 40);
  for (const m of raw) assert.equal(canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx), null, `${m.marketLabel} / ${m.selectionLabel}`);
  assert.ok(raw.some((m) => m.marketLabel === 'Mais/menos cantos' && m.selectionLabel === '+ de 10,5'));
  assert.ok(raw.some((m) => m.marketLabel === 'Handicap (3 opções)'));
  assert.ok(raw.some((m) => m.marketLabel === '1-X-2 e mais/menos golos 2,5'));
});

test('safety net: an untranslated market whose raw label would key is dropped, one that cannot key stays under its own label', () => {
  const opt = (id: string, label: string, odds: number) => ({ id, label, odds, suspended: false });
  const markets: PageMarket[] = [
    // not in the table, but the raw text is a plain result market: it would key as a 1X2
    { mid: '9001', tag: 1, name: 'Resultado Final', rows: [{ title: '', options: [opt('1', '1', 2), opt('2', 'X', 3), opt('3', '2', 4)] }] },
    { mid: '9002', tag: 1, name: 'Cantos 1x2', rows: [{ title: '', options: [opt('4', 'Mais cantos', 2.2)] }] },
  ];
  const out = mapMarkets('FOOTBALL', { home: 'Sporting', away: 'Porto' }, markets);
  assert.ok(!out.some((m) => m.marketLabel === 'Resultado Final'));
  assert.deepEqual(out.map((m) => [m.marketLabel, m.selectionLabel]), [['Cantos 1x2', 'Mais cantos']]);
});

test('options without a label or a usable price are skipped; a suspended option is flagged', () => {
  const o = (id: string, label: string, odds: number | null, suspended = false) => ({ id, label, odds, suspended });
  const markets: PageMarket[] = [
    {
      mid: '1',
      tag: 1,
      name: '1-X-2',
      rows: [{ title: '', options: [o('1', '1', 2.5, true), o('2', 'X', null), o('3', '2', 1)] }],
    },
    { mid: '2', tag: 1, name: 'Qualquer coisa', rows: [{ title: '', options: [o('4', '', 3), o('5', 'Sim', 3)] }] },
  ];
  const out = mapMarkets('FOOTBALL', { home: 'A', away: 'B' }, markets);
  assert.deepEqual(
    out.map((m) => [m.marketLabel, m.selectionLabel, m.odds, m.suspended]),
    [['Resultado Final', '1', 2.5, true], ['Qualquer coisa', 'Sim', 3, false]],
  );
});

test('names that do not match a participant drop the option (never a guess)', () => {
  const o = (id: string, label: string, odds: number) => ({ id, label, odds, suspended: false });
  const markets: PageMarket[] = [{ mid: '1', tag: 1, name: 'Empate anula aposta', rows: [{ title: '', options: [o('1', 'Newcastle United', 3.7), o('2', 'Arsenal', 1.1)] }] }];
  const out = mapMarkets('FOOTBALL', { home: 'Newcastle', away: 'Arsenal' }, markets);
  assert.deepEqual(out.map((m) => m.selectionLabel), ['Arsenal']);
});

// ─── Basketball markets ──────────────────────────────────────────────────────

test('basketball event page + tabs: moneyline, handicaps, totals, team totals, halves and quarters get the expected keys', () => {
  const { markets, ctx } = load('BASKETBALL', 'event-basketball.html', 'tabs-basketball.html');
  const k = (market: string, selection: string) => keyOf(markets, 'BASKETBALL', ctx, market, selection);
  assert.deepEqual(ctx, { home: 'Denver Nuggets', away: 'Houston Rockets' });
  assert.equal(k('Vencedor (incl. prolongamento)', 'Denver Nuggets'), 'B.ML.H');
  assert.equal(k('Vencedor (incl. prolongamento)', 'Houston Rockets'), 'B.ML.A');
  assert.equal(k('Handicap', 'Denver Nuggets +1.5'), 'B.HCP.H.+1.5');
  assert.equal(k('Handicap', 'Houston Rockets -1.5'), 'B.HCP.A.-1.5');
  assert.equal(k('Total de Pontos Mais/Menos', 'Mais de 215.5'), 'B.TOTAL.O.215.5');
  assert.equal(k('Total de Pontos Mais/Menos', 'Menos de 239.5'), 'B.TOTAL.U.239.5');
  assert.equal(k('Total de Pontos Mais/Menos - Denver Nuggets', 'Mais de 111.5'), 'B.TEAMTOTAL.H.O.111.5');
  assert.equal(k('Total de Pontos Mais/Menos - Houston Rockets', 'Menos de 116.5'), 'B.TEAMTOTAL.A.U.116.5');
  assert.equal(k('1ª Parte - Total de Pontos Mais/Menos', 'Mais de 107.5'), 'H1:B.TOTAL.O.107.5');
  assert.equal(k('1ª Parte - Handicap', 'Denver Nuggets +0.5'), 'H1:B.HCP.H.+0.5');
  assert.equal(k('1º Quarto - Handicap', 'Houston Rockets -0.5'), 'Q1:B.HCP.A.-0.5');
  assert.equal(k('2º Quarto - Handicap', 'Denver Nuggets +0.5'), 'Q2:B.HCP.H.+0.5');
  assert.equal(k('1º Quarto - Total de Pontos Mais/Menos', 'Mais de 55.5'), 'Q1:B.TOTAL.O.55.5');
  assert.equal(k('3º Quarto - Total de Pontos Mais/Menos', 'Menos de 59.5'), 'Q3:B.TOTAL.U.59.5');
});

test('basketball: no-wrong-key sweep — regulation-time 2-way winner, 3-way and quarter winners, combos and props never key', () => {
  const { markets, ctx } = load('BASKETBALL', 'event-basketball.html', 'tabs-basketball.html');
  let keyed = 0;
  const unkeyed = new Set<string>();
  for (const m of markets) {
    assert.ok(!/undefined|\{\{|NaN/.test(m.marketLabel + m.selectionLabel), m.marketLabel);
    const key = canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, ctx);
    if (key === null) {
      unkeyed.add(m.marketLabel);
      continue;
    }
    keyed++;
    assert.match(key, /^((Q[1-4]|H[12]):)?B\.(ML|TOTAL|TEAMTOTAL|HCP)\./, `${m.marketLabel} / ${m.selectionLabel} -> ${key}`);
  }
  assert.ok(keyed >= 100, `only ${keyed}`);
  for (const l of ['1ª parte: vencedor', '1º quarto: vencedor', '1ª parte: vencedor (3 opções)']) assert.ok(unkeyed.has(l), `${l} stays visible without a key`);
  // The 2-way regulation-time winner would key as a 3-way 1X2: the safety net removes it altogether.
  assert.ok(!markets.some((m) => m.marketLabel === 'Vencedor do jogo (no tempo regulamentar)'));
});

// ─── Tennis markets ──────────────────────────────────────────────────────────

test('tennis event page + tabs: winner, set winner, total games, game handicap, exact set score, total sets', () => {
  const { markets, ctx } = load('TENNIS', 'event-tennis.html', 'tabs-tennis.html');
  const k = (market: string, selection: string) => keyOf(markets, 'TENNIS', ctx, market, selection);
  assert.deepEqual(ctx, { home: 'Soonwoo Kwon', away: 'Sascha Gueymard Wayenburg' });
  assert.equal(k('Vencedor', 'Soonwoo Kwon'), 'T.WIN.A');
  assert.equal(k('Vencedor', 'Sascha Gueymard Wayenburg'), 'T.WIN.B');
  assert.equal(find(markets, 'Vencedor', 'Soonwoo Kwon').odds, 1.63);
  assert.equal(k('1º Set - Vencedor', 'Soonwoo Kwon'), 'T.SET1.WIN.A');
  assert.equal(k('2º Set - Vencedor', 'Sascha Gueymard Wayenburg'), 'T.SET2.WIN.B');
  assert.equal(k('Total de Jogos Mais/Menos', 'Mais de 22.5'), 'T.GAMES.O.22.5');
  assert.equal(k('Total de Jogos Mais/Menos', 'Menos de 20.5'), 'T.GAMES.U.20.5');
  assert.equal(k('Handicap de Jogos', 'Soonwoo Kwon -1.5'), 'T.GAMES.HCP.A.-1.5');
  assert.equal(k('Handicap de Jogos', 'Sascha Gueymard Wayenburg +0.5'), 'T.GAMES.HCP.B.+0.5');
  assert.equal(k('Resultado Exato em Sets', '2-0'), 'T.SETS.2-0');
  assert.equal(k('Resultado Exato em Sets', '1-2'), 'T.SETS.1-2');
  assert.equal(k('Total de Sets Mais/Menos', 'Mais de 2.5'), 'T.SETSTOTAL.O.2.5');
});

test('tennis: set handicaps, set-scoped games, odd/even and winner+total combos are not given a key', () => {
  const { markets, ctx } = load('TENNIS', 'event-tennis.html', 'tabs-tennis.html');
  let keyed = 0;
  for (const m of markets) {
    const key = canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, ctx);
    if (key === null) continue;
    keyed++;
    assert.match(key, /^T\.(WIN\.[AB]|SET[1-5]\.WIN\.[AB]|GAMES\.(O|U|HCP)\.|SETS\.\d-\d|SETSTOTAL\.[OU]\.)/, `${m.marketLabel} / ${m.selectionLabel} -> ${key}`);
  }
  assert.ok(keyed >= 25, `only ${keyed}`);
  const labels = new Set(markets.map((m) => m.marketLabel));
  assert.ok(labels.has('Handicap set'));
  assert.ok(labels.has('Vencedor do encontro e mais/menos jogos'));
  assert.ok(labels.has('Total de jogos no encontro par ou ímpar'));
});
