import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceMarket } from '../../types';
import { eventUrlKey, findComponent, mapCompetitionEvents, mapEventPage, parseCompetitions, SPORT_ID, SPORT_PAGE } from './map';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'goldenpark');
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

type Ctx = { home: string; away: string };
const FOOTBALL: Ctx = { home: 'Marítimo', away: 'Nacional da Madeira' };
const BASKET: Ctx = { home: 'Utah Jazz', away: 'Phoenix Suns' };
const TENNIS: Ctx = { home: 'Omar Jasika', away: 'Philip Sekulic' };

function find(markets: SourceMarket[], market: string, selection: string): SourceMarket {
  const m = markets.find((x) => x.marketLabel === market && x.selectionLabel === selection);
  assert.ok(m, `missing ${market} / ${selection}`);
  return m;
}
const keyOf = (markets: SourceMarket[], sport: OddsSport, ctx: Ctx, market: string, selection: string) => {
  const m = find(markets, market, selection);
  return canonicalKey(sport, m.marketLabel, m.selectionLabel, ctx);
};

// ─── Sport page: competitions ────────────────────────────────────────────────

test('sport constants: ids and page paths of the three sports', () => {
  assert.deepEqual(SPORT_ID, { FOOTBALL: 13, BASKETBALL: 4, TENNIS: 21 });
  assert.equal(SPORT_PAGE.FOOTBALL, '/desporte/13-futebol');
  assert.equal(SPORT_PAGE.BASKETBALL, '/desporte/4-basquetebol');
  assert.equal(SPORT_PAGE.TENNIS, '/desporte/21-tenis');
});

test('parseCompetitions: A-Z links with events, most events first, pinned breaking ties; bad urls and empty ones dropped', () => {
  const comps = parseCompetitions(load('sport-football.json'));
  assert.ok(comps.length >= 5);
  assert.ok(comps.every((c) => /^\/competicao\/\d+-[a-z0-9-]+$/.test(c.url) && c.events > 0));
  assert.deepEqual(comps.map((c) => c.events), [...comps.map((c) => c.events)].sort((a, b) => b - a));
  const pl = comps.find((c) => c.id === 154);
  assert.deepEqual(pl && { url: pl.url, label: pl.label }, { url: '/competicao/154-primeira-liga', label: 'Primeira Liga' });
  const synthetic = {
    tree: { components: [{ tree_compo_key: 'x', components: [{ tree_compo_key: 'sport_page_all', data: { a_z: { categories: [
      { name: 'A', links: [
        { id: 1, url: '/competicao/1-a', label: 'A', nb_events: 3, identifier: 'competition', is_pinned: false },
        { id: 2, url: '/competicao/2-b', label: 'B', nb_events: 3, identifier: 'competition', is_pinned: true },
        { id: 3, url: '/competicao/3-c', label: 'C', nb_events: 0, identifier: 'competition', is_pinned: true },
        { id: 4, url: 'https://evil.example/x', label: 'D', nb_events: 9, identifier: 'competition', is_pinned: true },
        { id: 5, url: '/categoria/5-x', label: 'E', nb_events: 9, identifier: 'category', is_pinned: true },
      ] },
    ] } } }] }] },
  };
  assert.deepEqual(parseCompetitions(synthetic).map((c) => c.id), [2, 1]);
  assert.deepEqual(parseCompetitions({}), []);
  assert.deepEqual(parseCompetitions({ tree: { components: [] } }), []);
});

test('findComponent walks the tree by tree_compo_key and returns null when absent', () => {
  const body = load('competition-football.json');
  assert.ok(findComponent(body, 'prematch_event_list'));
  assert.equal(findComponent(body, 'nope'), null);
  assert.equal(findComponent(null, 'x'), null);
});

// ─── Calendar ────────────────────────────────────────────────────────────────

test('football competition → events with UTC time, country, market count, event page and the plain 1X2 as main market; no BetRadar id', () => {
  const events = mapCompetitionEvents(load('competition-football.json'), 'FOOTBALL');
  assert.equal(events.length, 3);
  const ev = events[0]!;
  assert.equal(ev.house, 'goldenpark');
  assert.equal(ev.houseEventId, '12394593');
  assert.equal(ev.home, 'Marítimo');
  assert.equal(ev.away, 'Nacional da Madeira');
  assert.equal(ev.startsAt, '2026-11-27T20:15:00.000Z');
  assert.equal(ev.competition, 'Primeira Liga');
  assert.equal(ev.countryCode, 'PT');
  assert.equal(ev.marketCount, 108);
  assert.equal(ev.live, false);
  assert.equal(ev.pageUrl, '/evento/12394593-maritimo-nacional-da-madeira');
  assert.equal(ev.extraIds, undefined, 'the internal id is not BetRadar');
  const main = ev.mainMarkets!;
  assert.deepEqual(main.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [
    ['Resultado Final', '1', 2.07],
    ['Resultado Final', 'X', 3.2],
    ['Resultado Final', '2', 3.2],
  ]);
  assert.deepEqual(main.map((m) => canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, FOOTBALL)), ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A']);
});

test('football competition: European cups have no country, names with a slash survive, and the 2-goal-lead 1X2 is not the main market', () => {
  const [ev] = mapCompetitionEvents(load('competition-football-ucl.json'), 'FOOTBALL');
  assert.equal(ev!.competition, 'Liga dos Campeões');
  assert.equal(ev!.countryCode, undefined);
  assert.equal(ev!.home, 'Bodø/Glimt');
  assert.equal(ev!.away, 'LASK');
  assert.ok(ev!.mainMarkets!.every((m) => m.marketLabel === 'Resultado Final'));
  assert.equal(ev!.mainMarkets!.length, 3);
  assert.deepEqual(ev!.mainMarkets!.map((m) => m.odds), [1.48, 4.7, 5.1]);
});

test('basketball competition: moneyline (overtime included) as main market, no BetRadar id from the internal match_id', () => {
  const events = mapCompetitionEvents(load('competition-basketball.json'), 'BASKETBALL');
  assert.equal(events.length, 3);
  const ev = events[0]!;
  assert.equal(ev.houseEventId, '12419841');
  assert.equal(ev.home, 'Utah Jazz');
  assert.equal(ev.away, 'Phoenix Suns');
  assert.equal(ev.competition, 'NBA');
  assert.equal(ev.countryCode, 'US');
  assert.equal(ev.startsAt, '2026-11-21T02:30:00.000Z');
  assert.equal(ev.extraIds, undefined);
  assert.deepEqual(ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [
    ['Vencedor (incl. prolongamento)', 'Utah Jazz', 2.55],
    ['Vencedor (incl. prolongamento)', 'Phoenix Suns', 1.47],
  ]);
  assert.deepEqual(ev.mainMarkets!.map((m) => canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, BASKET)), ['B.ML.H', 'B.ML.A']);
});

test('tennis competition: tour and tournament in the competition name, the match winner as main market; doubles keep the abbreviated names', () => {
  const [ev] = mapCompetitionEvents(load('competition-tennis.json'), 'TENNIS');
  assert.equal(ev!.home, 'Omar Jasika');
  assert.equal(ev!.away, 'Philip Sekulic');
  assert.equal(ev!.competition, 'ATP - Challenger - Sydney, Austrália');
  assert.equal(ev!.countryCode, undefined);
  assert.deepEqual(ev!.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [
    ['Vencedor', 'Omar Jasika', 1.65],
    ['Vencedor', 'Philip Sekulic', 1.88],
  ]);
  assert.deepEqual(ev!.mainMarkets!.map((m) => canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, TENNIS)), ['T.WIN.A', 'T.WIN.B']);
  const [pair] = mapCompetitionEvents(load('competition-tennis-doubles.json'), 'TENNIS');
  assert.equal(pair!.home, 'H.Hoeyeraal-E.Padgham');
  assert.equal(pair!.away, 'J.Jung-A.Rai');
});

test('events that are not an open pre-match game of the sport are skipped', () => {
  const body = load('competition-football.json');
  assert.equal(mapCompetitionEvents(body, 'TENNIS').length, 0, 'wrong sport');
  const list = findComponent(body, 'prematch_event_list')!.data.events as Record<string, unknown>[];
  list[0]!.is_canceled = true;
  list[1]!.state = 'live';
  list[2]!.id = 'abc';
  assert.equal(mapCompetitionEvents(body, 'FOOTBALL').length, 0);
  assert.deepEqual(mapCompetitionEvents({}, 'FOOTBALL'), []);
});

test('eventUrlKey uses the calendar page when it is an event path, otherwise the bare id (the site resolves it)', () => {
  assert.equal(eventUrlKey('12394593', '/evento/12394593-maritimo-nacional-da-madeira'), '/evento/12394593-maritimo-nacional-da-madeira');
  assert.equal(eventUrlKey('12394593'), '/evento/12394593');
  assert.equal(eventUrlKey('12394593', '/pt/evento/12394593-x'), '/evento/12394593');
  assert.equal(eventUrlKey('12394593', '/evento/999-other'), '/evento/12394593', 'a page of another event is not used');
  assert.equal(eventUrlKey('12394593', 'https://evil.example/evento/12394593-x'), '/evento/12394593');
  assert.equal(eventUrlKey('abc'), null);
});

// ─── Football markets ────────────────────────────────────────────────────────

test('football event page → labels canonicalKey reads, with the expected keys', () => {
  const page = mapEventPage(load('event-football.json'))!;
  assert.equal(page.sport, 'FOOTBALL');
  const m = page.markets;
  const k = (market: string, selection: string) => keyOf(m, 'FOOTBALL', FOOTBALL, market, selection);
  assert.equal(k('Resultado Final', '1'), 'FT.1X2.H');
  assert.equal(k('Resultado Final', 'X'), 'FT.1X2.D');
  assert.equal(k('Resultado Final', '2'), 'FT.1X2.A');
  assert.equal(k('Hipótese Dupla', '1X'), 'FT.DC.HD');
  assert.equal(k('Hipótese Dupla', 'X2'), 'FT.DC.DA');
  assert.equal(k('Hipótese Dupla', '12'), 'FT.DC.HA');
  assert.equal(k('Ambas as Equipas Marcam', 'Sim'), 'FT.BTTS.Y');
  assert.equal(k('Ambas as Equipas Marcam', 'Não'), 'FT.BTTS.N');
  assert.equal(k('Total de Golos Mais/Menos', 'Mais de 2.5'), 'FT.TOTAL.goals.O.2.5');
  assert.equal(k('Total de Golos Mais/Menos', 'Menos de 1.5'), 'FT.TOTAL.goals.U.1.5');
  assert.equal(find(m, 'Total de Golos Mais/Menos', 'Mais de 2.5').line, 2.5);
  assert.equal(k('1ª Parte - Total de Golos Mais/Menos', 'Mais de 0.5'), '1H.TOTAL.goals.O.0.5');
  assert.equal(k('Total de Golos Mais/Menos - Marítimo', 'Mais de 0.5'), 'FT.TOTAL.goals.H.O.0.5');
  assert.equal(k('Total de Golos Mais/Menos - Nacional da Madeira', 'Menos de 0.5'), 'FT.TOTAL.goals.A.U.0.5');
  assert.equal(k('Resultado da 1ª Parte', '1'), '1H.1X2.H');
  assert.equal(k('1ª Parte - Hipótese Dupla', '12'), '1H.DC.HA');
  assert.equal(k('Empate Anula Aposta', 'Marítimo'), 'FT.DNB.H');
  assert.equal(k('Empate Anula Aposta', 'Nacional da Madeira'), 'FT.DNB.A');
  assert.equal(k('Intervalo/Final', '1/2'), 'HTFT.HA');
  assert.match(k('Intervalo/Final', 'X/1')!, /^HTFT\./);
  assert.equal(k('Resultado Exato', '1-0'), 'FT.SCORE.1-0');
  assert.equal(k('Handicap', 'Marítimo -1.5'), 'FT.HCP.EU.H.-1.5');
  assert.equal(k('Handicap', 'Nacional da Madeira +1.5'), 'FT.HCP.EU.A.+1.5');
  assert.equal(find(m, 'Resultado Final', '1').odds, 2.07);
});

test('football: whole and quarter handicap lines, 3-way handicaps and combos are not turned into a handicap key', () => {
  const page = mapEventPage(load('event-football.json'))!;
  assert.ok(page.markets.filter((x) => x.marketLabel === 'Handicap').every((x) => Math.abs(x.line! % 1) === 0.5));
  const labels = new Set(page.markets.map((x) => x.marketLabel));
  assert.ok(labels.has('Handicap (0:3) - Resultado do Jogo'), 'the 3-way handicap stays under the house label');
  for (const x of page.markets.filter((y) => /^(1ª Parte - )?Handicap \(/.test(y.marketLabel))) {
    assert.equal(canonicalKey('FOOTBALL', x.marketLabel, x.selectionLabel, FOOTBALL), null, `${x.marketLabel} / ${x.selectionLabel}`);
  }
});

test('football: the 2-goal-lead 1X2 and other look-alikes never get a 1X2 key', () => {
  const page = mapEventPage(load('event-football.json'))!;
  const two = page.markets.filter((x) => /2 golos de vantagem/.test(x.marketLabel));
  assert.ok(two.length > 0, 'kept for the house itself');
  for (const x of two) assert.equal(canonicalKey('FOOTBALL', x.marketLabel, x.selectionLabel, FOOTBALL), null);
  const cantos = page.markets.filter((x) => /cantos/i.test(x.marketLabel));
  for (const x of cantos) assert.equal(canonicalKey('FOOTBALL', x.marketLabel, x.selectionLabel, FOOTBALL), null);
});

test('football: a market the translator does not know never gets a canonical key (house label kept, or dropped)', () => {
  const page = mapEventPage(load('event-football.json'))!;
  const labels = new Set(page.markets.map((x) => x.marketLabel));
  // "Marítimo marca" would read as "team scores" with the raw label: it must not be offered under a guessed key.
  assert.ok(!labels.has('Marítimo marca'));
  assert.ok(!labels.has('Primeira equipa a marcar'));
  assert.ok(!labels.has('Total de golos - Ímpar/par'));
  assert.ok(labels.has('Parte com mais golos'), 'unknown but harmless markets stay (own house only)');
  assert.ok(!labels.has('Marcadores'), 'scorer markets are not translated and their raw label would be keyed: dropped');
});

test('football: every selection that gets a canonical key belongs to a translated market with the expected family, none is a wrong 1X2', () => {
  const page = mapEventPage(load('event-football.json'))!;
  const allowedMarket = new Set([
    'Resultado Final', 'Hipótese Dupla', 'Ambas as Equipas Marcam', 'Total de Golos Mais/Menos', 'Empate Anula Aposta', 'Intervalo/Final',
    'Resultado Exato', 'Handicap', 'Resultado da 1ª Parte', '1ª Parte - Hipótese Dupla', '1ª Parte - Total de Golos Mais/Menos',
  ]);
  let keyed = 0;
  for (const x of page.markets) {
    const key = canonicalKey('FOOTBALL', x.marketLabel, x.selectionLabel, FOOTBALL);
    if (key === null) continue;
    keyed++;
    const base = x.marketLabel.replace(/ - (Marítimo|Nacional da Madeira)$/, '');
    assert.ok(allowedMarket.has(base), `${x.marketLabel} / ${x.selectionLabel} → ${key} came from an untranslated market`);
    if (/^FT\.1X2\./.test(key)) assert.equal(x.marketLabel, 'Resultado Final');
  }
  assert.ok(keyed >= 40, `expected most translated markets to be keyed, got ${keyed}`);
});

test('options without a usable price (1, -1, "-") are skipped', () => {
  const page = mapEventPage(load('event-football.json'))!;
  assert.ok(page.markets.every((x) => Number.isFinite(x.odds) && x.odds > 1));
  assert.ok(!page.markets.some((x) => x.marketLabel === 'Resultado Exato' && x.selectionLabel === 'undefined-undefined'));
  assert.ok(page.markets.every((x) => x.suspended === false));
});

// ─── Basketball ──────────────────────────────────────────────────────────────

test('basketball event page: moneyline, totals, handicaps and team totals with Q/H scopes get the expected keys', () => {
  const page = mapEventPage(load('event-basketball.json'))!;
  assert.equal(page.sport, 'BASKETBALL');
  const m = page.markets;
  const k = (market: string, selection: string) => keyOf(m, 'BASKETBALL', BASKET, market, selection);
  assert.equal(k('Vencedor (incl. prolongamento)', 'Utah Jazz'), 'B.ML.H');
  assert.equal(k('Vencedor (incl. prolongamento)', 'Phoenix Suns'), 'B.ML.A');
  const total = m.find((x) => x.marketLabel === 'Total de Pontos Mais/Menos' && x.selectionLabel.startsWith('Mais'))!;
  assert.equal(canonicalKey('BASKETBALL', total.marketLabel, total.selectionLabel, BASKET), `B.TOTAL.O.${total.line}`);
  const hcp = m.find((x) => x.marketLabel === 'Handicap' && x.selectionLabel.startsWith('Utah Jazz'))!;
  assert.equal(canonicalKey('BASKETBALL', hcp.marketLabel, hcp.selectionLabel, BASKET), `B.HCP.H.${hcp.line! >= 0 ? '+' : ''}${hcp.line}`);
  assert.equal(k('1º Quarto - Total de Pontos Mais/Menos', 'Mais de 58.5'), 'Q1:B.TOTAL.O.58.5');
  assert.equal(k('1ª Parte - Total de Pontos Mais/Menos', 'Menos de 116.5'), 'H1:B.TOTAL.U.116.5');
  assert.equal(k('Total de Pontos Mais/Menos - Utah Jazz', 'Mais de 110.5'), 'B.TEAMTOTAL.H.O.110.5');
  assert.equal(k('Total de Pontos Mais/Menos - Phoenix Suns', 'Menos de 115.5'), 'B.TEAMTOTAL.A.U.115.5');
  assert.equal(k('1ª Parte - Handicap', 'Utah Jazz +2.5'), 'H1:B.HCP.H.+2.5');
  assert.equal(k('1º Quarto - Handicap', 'Phoenix Suns -1.5'), 'Q1:B.HCP.A.-1.5');
});

test('basketball: the 3-way "Resultado do jogo", player props and margins never get a canonical key', () => {
  const page = mapEventPage(load('event-basketball.json'))!;
  const raw = page.markets.filter((x) => x.marketLabel === 'Resultado do jogo' || x.marketLabel === '1ª Parte - Resultado');
  assert.ok(raw.length >= 4, 'the 3-way markets stay for the house itself');
  for (const x of page.markets) {
    const key = canonicalKey('BASKETBALL', x.marketLabel, x.selectionLabel, BASKET);
    if (key === null) continue;
    assert.match(key, /^(Q\d:|H\d:)?B\.(ML|TOTAL|TEAMTOTAL|HCP)\./, `${x.marketLabel} / ${x.selectionLabel} → ${key}`);
    if (/^B\.1X2/.test(key)) assert.fail(`${x.marketLabel} got a 1X2 key`);
  }
  assert.ok(!page.markets.some((x) => /Ace Bailey|Devin Booker/.test(x.marketLabel) && canonicalKey('BASKETBALL', x.marketLabel, x.selectionLabel, BASKET) !== null));
});

// ─── Tennis ──────────────────────────────────────────────────────────────────

test('tennis event page: winner, set winner, total games, handicap of games, exact sets', () => {
  const page = mapEventPage(load('event-tennis.json'))!;
  assert.equal(page.sport, 'TENNIS');
  const m = page.markets;
  const k = (market: string, selection: string) => keyOf(m, 'TENNIS', TENNIS, market, selection);
  assert.equal(k('Vencedor', 'Omar Jasika'), 'T.WIN.A');
  assert.equal(k('Vencedor', 'Philip Sekulic'), 'T.WIN.B');
  assert.equal(k('1º Set - Vencedor', 'Omar Jasika'), 'T.SET1.WIN.A');
  assert.equal(k('Total de Jogos Mais/Menos', 'Mais de 21.5'), 'T.GAMES.O.21.5');
  assert.equal(k('Total de Jogos Mais/Menos', 'Menos de 21.5'), 'T.GAMES.U.21.5');
  assert.equal(k('Handicap de Jogos', 'Omar Jasika -1.5'), 'T.GAMES.HCP.A.-1.5');
  assert.equal(k('Handicap de Jogos', 'Philip Sekulic +1.5'), 'T.GAMES.HCP.B.+1.5');
  assert.equal(k('Resultado Exato em Sets', '2-0'), 'T.SETS.2-0');
  assert.equal(k('Resultado Exato em Sets', '0-2'), 'T.SETS.0-2');
});

test('tennis: set handicaps, set totals of games and combos are not given a key', () => {
  const page = mapEventPage(load('event-tennis.json'))!;
  for (const x of page.markets) {
    const key = canonicalKey('TENNIS', x.marketLabel, x.selectionLabel, TENNIS);
    if (key === null) continue;
    assert.match(key, /^T\.(WIN|SET\d\.WIN|GAMES\.(O|U|HCP)|SETS)\./, `${x.marketLabel} / ${x.selectionLabel} → ${key}`);
    assert.ok(!/Sets \(|e Mais|Omar Jasika - Total/.test(x.marketLabel), `${x.marketLabel} leaked a key`);
  }
});

test('mapEventPage: unknown shapes and sports that are not covered give null', () => {
  assert.equal(mapEventPage({}), null);
  assert.equal(mapEventPage({ tree: { components: [] } }), null);
  const body = load('event-tennis.json');
  findComponent(body, 'event_market_list')!.data.event.sport.id = 9;
  assert.equal(mapEventPage(body), null);
});
