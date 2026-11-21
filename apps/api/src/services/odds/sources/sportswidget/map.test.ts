import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceMarket } from '../../types';
import { tablesFromRows } from './memory';
import { countryCodeOf, mapEvent, mapMarkets, teamName } from './map';
import { SportsRepo } from './repo';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'sportswidget');
const load = (name: string) => {
  const repo = new SportsRepo();
  repo.apply(tablesFromRows(JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8')).tables), 'authoritative');
  return repo;
};
const placard = load('placard-events.json');

const LIVERPOOL = 34319247;
const NBA = 35022132;
const ALCARAZ = 35073000;

function markets(id: number) {
  const ev = mapEvent(placard, placard.event(id)!, 'placard')!;
  return { ev, ctx: { home: ev.home, away: ev.away }, markets: mapMarkets(placard, id) };
}
function find(ms: SourceMarket[], market: string, selection: string): SourceMarket {
  const m = ms.find((x) => x.marketLabel === market && x.selectionLabel === selection);
  assert.ok(m, `missing ${market} / ${selection}`);
  return m;
}
function key(sport: OddsSport, ms: SourceMarket[], ctx: { home: string; away: string }, market: string, selection: string): [string | null, number] {
  const m = find(ms, market, selection);
  return [canonicalKey(sport, m.marketLabel, m.selectionLabel, ctx), m.odds];
}

// ─── Events ──────────────────────────────────────────────────────────────────

test('football event: names, UTC start, competition, country, market count and the 1X2 as main market; no BetRadar id', () => {
  const ev = mapEvent(placard, placard.event(LIVERPOOL)!, 'placard')!;
  assert.equal(ev.house, 'placard');
  assert.equal(ev.houseEventId, '34319247');
  assert.equal(ev.sport, 'FOOTBALL');
  assert.equal(ev.home, 'Liverpool');
  assert.equal(ev.away, 'Manchester United');
  assert.equal(ev.startsAt, '2026-11-22T16:30:00.000Z');
  assert.equal(ev.competition, 'Premier League');
  assert.equal(ev.countryCode, 'GB-ENG', 'COUNTRY_ID "EN|England"');
  assert.equal(ev.live, false);
  assert.equal(ev.marketCount, 129);
  assert.equal(ev.extraIds, undefined, 'the Statscore id is not a BetRadar id');
  assert.deepEqual(
    ev.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds, m.suspended]),
    [['Resultado Final', '1', 1.62, false], ['Resultado Final', 'X', 4, false], ['Resultado Final', '2', 4.45, false]],
  );
  assert.deepEqual(ev.mainMarkets!.map((m) => canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, { home: ev.home, away: ev.away })), ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A']);
});

test('basketball main market is the moneyline (H2HT), tennis the match winner (HTOH), both by name', () => {
  const nba = mapEvent(placard, placard.event(NBA)!, 'placard')!;
  assert.equal(nba.sport, 'BASKETBALL');
  assert.equal(nba.competition, 'NBA');
  assert.equal(nba.countryCode, 'US');
  assert.deepEqual(nba.mainMarkets!.map((m) => [m.marketLabel, m.selectionLabel, m.odds]), [
    ['Vencedor (incl. prolongamento)', 'Philadelphia 76ers', 1.12],
    ['Vencedor (incl. prolongamento)', 'Milwaukee Bucks', 5.1],
  ]);
  assert.deepEqual(nba.mainMarkets!.map((m) => canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, { home: nba.home, away: nba.away })), ['B.ML.H', 'B.ML.A']);
  const ten = mapEvent(placard, placard.event(ALCARAZ)!, 'placard')!;
  assert.equal(ten.sport, 'TENNIS');
  assert.equal(ten.competition, 'ATP Finais Turim - Individual');
  assert.equal(ten.countryCode, undefined, 'no country for tennis tours');
  assert.deepEqual(ten.mainMarkets!.map((m) => [m.selectionLabel, m.odds, canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, { home: ten.home, away: ten.away })]), [
    ['Carlos Alcaraz', 1.22, 'T.WIN.A'],
    ['Ben Shelton', 3.8, 'T.WIN.B'],
  ]);
});

test('live comes from NodesInPlayDetail; women teams get a "Feminino" marker the matcher reads; tennis doubles are left out', () => {
  assert.equal(mapEvent(placard, placard.event(34240057)!, 'placard')!.live, true);
  const w = mapEvent(placard, placard.event(34828100)!, 'placard')!;
  assert.deepEqual([w.home, w.away], ['Sydney FC Feminino', 'Canberra United Feminino']);
  assert.deepEqual(w.mainMarkets!.map((m) => canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, { home: w.home, away: w.away })), ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A']);
  assert.equal(mapEvent(placard, placard.event(35073159)!, 'placard'), null, 'Krawietz K / Puetz T v ... (doubles)');
  assert.equal(teamName('Liverpool (W)'), 'Liverpool Feminino');
  assert.equal(teamName('BCC Derthona Women'), 'BCC Derthona Feminino', 'Placard sometimes writes Women, Solverde (F)');
  assert.equal(teamName('Womens United'), 'Womens United');
  assert.equal(teamName('  Benfica  '), 'Benfica');
});

test('a hidden event, one without names, or one without its main market', () => {
  const repo = load('placard-events.json');
  const ev = repo.event(LIVERPOOL)!;
  assert.equal(mapEvent(repo, { ...ev, displayed: false }, 'placard'), null);
  assert.equal(mapEvent(repo, { ...ev, home: 999999999 }, 'placard'), null);
  assert.equal(mapEvent(repo, { ...ev, away: ev.home }, 'placard'), null, 'same name twice');
  const noMarkets = mapEvent(repo, { ...ev, id: 1 }, 'placard')!;
  assert.equal(noMarkets.mainMarkets, undefined);
  assert.equal(noMarkets.marketCount, undefined);
});

test('Solverde: same event id and mapping, its own odds, house id solverde', () => {
  const sv = load('solverde-event.json');
  const ev = mapEvent(sv, sv.event(LIVERPOOL)!, 'solverde')!;
  assert.equal(ev.house, 'solverde');
  assert.equal(ev.houseEventId, '34319247');
  assert.deepEqual(ev.mainMarkets!.map((m) => m.selectionLabel), ['1', 'X', '2']);
  assert.ok(ev.mainMarkets!.every((m) => m.odds > 1));
});

test('countryCodeOf: ISO-2 codes pass, England becomes GB-ENG, unknown shapes give nothing', () => {
  assert.equal(countryCodeOf('PT|Portugal'), 'PT');
  assert.equal(countryCodeOf('EN|England'), 'GB-ENG');
  assert.equal(countryCodeOf('WA|WA'), undefined);
  assert.equal(countryCodeOf('Portugal'), undefined);
  assert.equal(countryCodeOf(undefined), undefined);
});

// ─── Football markets ────────────────────────────────────────────────────────

test('football markets: the comparable families get the expected keys (real Liverpool - Manchester United)', () => {
  const { markets: ms, ctx } = markets(LIVERPOOL);
  const k = (m: string, s: string) => key('FOOTBALL', ms, ctx, m, s);
  assert.deepEqual(k('Resultado Final', '1'), ['FT.1X2.H', 1.62]);
  assert.deepEqual(k('Total de Golos Mais/Menos', 'Mais de 2.5'), ['FT.TOTAL.goals.O.2.5', 1.42]);
  assert.deepEqual(k('Total de Golos Mais/Menos', 'Menos de 5.5'), ['FT.TOTAL.goals.U.5.5', 1.05]);
  assert.deepEqual(k('Ambas as Equipas Marcam', 'Sim'), ['FT.BTTS.Y', 1.42]);
  assert.deepEqual(k('Ambas as Equipas Marcam', 'Não'), ['FT.BTTS.N', 2.25]);
  assert.deepEqual(k('Hipótese Dupla', '1X'), ['FT.DC.HD', 1.14]);
  assert.deepEqual(k('Hipótese Dupla', 'X2'), ['FT.DC.DA', 2.05]);
  assert.deepEqual(k('Hipótese Dupla', '12'), ['FT.DC.HA', 1.13]);
  assert.deepEqual(k('Resultado handicap', 'Liverpool (-1)'), ['FT.HCP.EU.H.-1', 2.38]);
  assert.deepEqual(k('Resultado handicap', 'Manchester United (+1)'), ['FT.HCP.EU.A.+1', 2.05]);
  assert.deepEqual(k('Resultado Exato', '1-0'), ['FT.SCORE.1-0', 8.5]);
  assert.deepEqual(k('Intervalo/Final', 'X/1'), ['HTFT.DH', 3.8]);
  assert.deepEqual(k('Resultado da 1ª Parte', '1'), ['1H.1X2.H', 2.2]);
  assert.equal(k('1ª Parte - Ambas as Equipas Marcam', 'Sim')[0], '1H.BTTS.Y');
  assert.equal(k('2ª Parte - Ambas as Equipas Marcam', 'Não')[0], '2H.BTTS.N');
});

test('football: no-wrong-key sweep — every keyed selection is a translated family, and labels are readable', () => {
  const { markets: ms, ctx } = markets(LIVERPOOL);
  const families: [RegExp, RegExp][] = [
    [/^Resultado Final$/, /^FT\.1X2\.[HDA]$/],
    [/^Hipótese Dupla$/, /^FT\.DC\.(HD|DA|HA)$/],
    [/^Ambas as Equipas Marcam$/, /^FT\.BTTS\.[YN]$/],
    [/^Total de Golos Mais\/Menos$/, /^FT\.TOTAL\.goals\.[OU]\.\d+\.5$/],
    [/^Total de Golos Mais\/Menos - (Liverpool|Manchester United)$/, /^FT\.TOTAL\.goals\.[HA]\.[OU]\.\d+\.5$/],
    [/^Empate Anula Aposta$/, /^FT\.DNB\.[HA]$/],
    [/^Resultado handicap$/, /^FT\.HCP\.EU\.[HA]\.[+-]\d+$/],
    [/^Intervalo\/Final$/, /^HTFT\.[HDA]{2}$/],
    [/^Resultado Exato$/, /^FT\.SCORE\.\d+-\d+$/],
    [/^Resultado da [12]ª Parte$/, /^[12]H\.1X2\.[HDA]$/],
    [/^[12]ª Parte - Hipótese Dupla$/, /^[12]H\.DC\./],
    [/^[12]ª Parte - Total de Golos Mais\/Menos$/, /^[12]H\.TOTAL\.goals\.[OU]\.\d+\.5$/],
    [/^[12]ª Parte - Ambas as Equipas Marcam$/, /^[12]H\.BTTS\.[YN]$/],
  ];
  let keyed = 0;
  for (const m of ms) {
    assert.ok(!/undefined|NaN|\{\d\}|\|/.test(m.marketLabel + m.selectionLabel), `${m.marketLabel} / ${m.selectionLabel}`);
    assert.ok(m.odds > 1, `${m.marketLabel} / ${m.selectionLabel} ${m.odds}`);
    const k = canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx);
    if (k === null) continue;
    keyed++;
    const family = families.find(([label]) => label.test(m.marketLabel));
    assert.ok(family, `${m.marketLabel} / ${m.selectionLabel} got key ${k} but is not a translated market`);
    assert.match(k, family[1], `${m.marketLabel} / ${m.selectionLabel}`);
  }
  assert.ok(keyed >= 80, `only ${keyed} keyed selections`);
});

test('football: untranslated markets keep the house label with the team names filled in and never key; the draw of a 3-way handicap is dropped', () => {
  const { markets: ms, ctx } = markets(LIVERPOOL);
  assert.ok(ms.some((m) => m.marketLabel === 'Manchester United Total de cantos' && m.selectionLabel === '0-4'));
  assert.ok(ms.some((m) => m.marketLabel === 'Liverpool Para marcar 2+ Golos' && m.selectionLabel === 'Sim'));
  assert.ok(!ms.some((m) => /^PB[A-Z]{2}:/.test(m.marketLabel)), 'bet-builder bundles are not kept');
  assert.ok(!ms.some((m) => m.marketLabel === 'Resultado handicap' && /Empate/.test(m.selectionLabel)));
  const raw = ms.filter((m) => !/^(Resultado|Hipótese|Ambas|Total de Golos|Empate Anula|Intervalo\/Final|[12]ª Parte -)/.test(m.marketLabel));
  assert.ok(raw.length > 100);
  for (const m of raw) assert.equal(canonicalKey('FOOTBALL', m.marketLabel, m.selectionLabel, ctx), null, `${m.marketLabel} / ${m.selectionLabel}`);
});

test('football: whole and quarter (asian) lines are not given a translated label', () => {
  const { markets: ms } = markets(LIVERPOOL);
  assert.ok(!ms.some((m) => /^Total de Golos/.test(m.marketLabel) && !/ \d+\.5$/.test(m.selectionLabel)));
  assert.ok(!ms.some((m) => m.marketLabel === 'Resultado handicap' && /\./.test(m.selectionLabel)));
});

// ─── Basketball and tennis markets ───────────────────────────────────────────

test('basketball markets: moneyline, regulation 1X2, handicaps, totals and team totals (real 76ers - Bucks)', () => {
  const { markets: ms, ctx } = markets(NBA);
  const k = (m: string, s: string) => key('BASKETBALL', ms, ctx, m, s);
  assert.deepEqual(k('Vencedor (incl. prolongamento)', 'Milwaukee Bucks'), ['B.ML.A', 5.1]);
  assert.deepEqual(k('Resultado Final (tempo regulamentar)', 'Empate'), ['B.1X2.D', 10]);
  assert.deepEqual(k('Resultado Final (tempo regulamentar)', 'Philadelphia 76ers'), ['B.1X2.H', 1.13]);
  assert.deepEqual(k('Handicap', 'Philadelphia 76ers -12.5'), ['B.HCP.H.-12.5', 1.81]);
  assert.deepEqual(k('Handicap', 'Milwaukee Bucks +11'), ['B.HCP.A.+11', 1.87]);
  assert.deepEqual(k('Total de Pontos Mais/Menos', 'Mais de 228'), ['B.TOTAL.O.228', 1.67]);
  assert.deepEqual(k('Total de Pontos Mais/Menos - Milwaukee Bucks', 'Mais de 106.5'), ['B.TEAMTOTAL.A.O.106.5', 1.5]);
  assert.deepEqual(k('Total de Pontos Mais/Menos - Philadelphia 76ers', 'Menos de 119.5'), ['B.TEAMTOTAL.H.U.119.5', 1.87]);
});

test('basketball: no-wrong-key sweep', () => {
  const { markets: ms, ctx } = markets(NBA);
  let keyed = 0;
  for (const m of ms) {
    assert.ok(!/undefined|NaN|\{\d\}|\|/.test(m.marketLabel + m.selectionLabel), `${m.marketLabel} / ${m.selectionLabel}`);
    const k = canonicalKey('BASKETBALL', m.marketLabel, m.selectionLabel, ctx);
    if (k === null) continue;
    keyed++;
    assert.match(k, /^((Q[1-4]|H[12]):)?B\.(ML|1X2|TOTAL|TEAMTOTAL|HCP)\./, `${m.marketLabel} / ${m.selectionLabel} -> ${k}`);
    assert.ok(/^(Vencedor|Resultado Final|Handicap|Total de Pontos|[1-4]º Quarto - |[12]ª Parte - )/.test(m.marketLabel), `${m.marketLabel} keyed ${k} untranslated`);
  }
  assert.ok(keyed >= 60, `only ${keyed}`);
});

test('tennis markets: winner, set winner, total games, game handicap and set score (real Alcaraz - Shelton)', () => {
  const { markets: ms, ctx } = markets(ALCARAZ);
  const k = (m: string, s: string) => key('TENNIS', ms, ctx, m, s);
  assert.deepEqual(k('Vencedor', 'Carlos Alcaraz'), ['T.WIN.A', 1.22]);
  assert.deepEqual(k('1º Set - Vencedor', 'Ben Shelton'), ['T.SET1.WIN.B', 2.95]);
  assert.deepEqual(k('Total de Jogos Mais/Menos', 'Mais de 22.5'), ['T.GAMES.O.22.5', 1.67]);
  assert.deepEqual(k('Total de Jogos Mais/Menos', 'Menos de 24'), ['T.GAMES.U.24', 1.55]);
  assert.deepEqual(k('Handicap de Jogos', 'Carlos Alcaraz -3.5'), ['T.GAMES.HCP.A.-3.5', 1.73]);
  assert.deepEqual(k('Handicap de Jogos', 'Ben Shelton +4'), ['T.GAMES.HCP.B.+4', 1.4]);
  assert.deepEqual(k('Resultado Exato em Sets', '2-0'), ['T.SETS.2-0', 1.65]);
  assert.deepEqual(k('Resultado Exato em Sets', '1-2'), ['T.SETS.1-2', 5.5]);
  let keyed = 0;
  for (const m of ms) {
    const kk = canonicalKey('TENNIS', m.marketLabel, m.selectionLabel, ctx);
    if (kk === null) continue;
    keyed++;
    assert.match(kk, /^T\.(WIN\.[AB]|SET[1-5]\.WIN\.[AB]|GAMES\.(O|U|HCP)\.|SETS\.\d-\d)/, `${m.marketLabel} / ${m.selectionLabel} -> ${kk}`);
  }
  assert.ok(keyed >= 20, `only ${keyed}`);
  assert.ok(ms.some((m) => m.marketLabel === 'Handicap de Sets'), 'set handicap stays under its own label');
});

// ─── Rules on synthetic markets ──────────────────────────────────────────────

/** One football event with the given markets (code, market text, selections [text, line text, odds]). */
function synthetic(list: [string, string, [string, string | null, number][], boolean?][]) {
  const dict: [number, string][] = [[1, 'Futebol'], [2, 'soccer'], [3, 'Liga'], [4, 'Benfica'], [5, 'FC Porto']];
  const types: [number, string][] = [];
  const markets: unknown[][] = [];
  const results: unknown[][] = [];
  const odds: [number, number][] = [];
  let id = 100;
  const text = (s: string) => {
    const found = dict.find(([, v]) => v === s);
    if (found) return found[0];
    dict.push([++id, s]);
    return id;
  };
  list.forEach(([code, label, sels, active = true], i) => {
    types.push([i + 1, code]);
    const mid = 5000 + i;
    markets.push([mid, 1000, i + 1, text(label), active, true]);
    sels.forEach(([s, line, o], j) => {
      odds.push([odds.length + 1, Math.round(o * 1000)]);
      results.push([mid * 10 + j, mid, text(s), line === null ? 0 : text(line), odds.length]);
    });
  });
  const repo = new SportsRepo();
  repo.apply(
    tablesFromRows({
      DictionaryEntry: { columns: ['id', 'value'], rows: dict },
      AdditionalValueKey: { columns: ['key_id', 'key'], rows: [[0, 'SPORT_ID']] },
      AdditionalValue: { columns: ['node_id', 'key_id', 'dictionary_id'], rows: [[10, 0, 2]] },
      Structure: { columns: ['node_id', 'parent_node_id', 'node_type_id', 'dictionary_id'], rows: [[10, 0, 1, 1], [11, 10, 3, 3]] },
      MarketType: { columns: ['id', 'market_type'], rows: types },
      OddMap: { columns: ['id', 'dec'], rows: odds },
      Event: {
        columns: ['node_id', 'parent_node_id', 'start_date', 'participant_home_dictionary_id', 'participant_away_dictionary_id', 'is_displayed', 'is_active'],
        rows: [[1000, 11, 1795000000, 4, 5, true, true]],
      },
      Market: { columns: ['node_id', 'parent_node_id', 'market_type_id', 'dictionary_id', 'is_active', 'is_displayed'], rows: markets },
      Result: { columns: ['node_id', 'parent_node_id', 'dictionary_id', 'handicap_dictionary_id', 'odd_map_id'], rows: results },
    }),
    'authoritative',
  );
  return mapMarkets(repo, 1000).map((m) => [m.marketLabel, m.selectionLabel, m.odds, m.suspended]);
}

test('safety net: an untranslated market whose raw label would key is dropped; one that cannot key stays', () => {
  const out = synthetic([
    ['ZZZZ', 'Resultado Final', [['{0}||1|1|', null, 2], ['Empate||X|2|', null, 3], ['{1}||2|3|', null, 4]]],
    ['YYYY', 'Total de cantos', [['Mais de|+|O|0|', '9.5', 1.8]]],
    ['XXXX', 'Cantos 1x2', [['{0}||1|0|', null, 2.2]]],
  ]);
  assert.ok(!out.some((m) => m[0] === 'Resultado Final'), 'would key as a 1X2');
  assert.deepEqual(out.find((m) => m[0] === 'Cantos 1x2'), ['Cantos 1x2', 'Benfica', 2.2, false]);
});

test('prices of 1 or less, missing prices, empty labels and unknown codes are skipped; an inactive market is suspended; duplicates count once', () => {
  const out = synthetic([
    ['MRES', 'Resultado Final', [['{0}||1|1|', null, 1], ['Empate||X|2|', null, 3.1], ['{1}||2|3|', null, 4], ['{1}||2|4|', null, 4.2], ['Outro||Q|5|', null, 9]], false],
    ['WXYZ', 'Especial', [['||unknown-0|0|', null, 2]]],
  ]);
  assert.deepEqual(out, [
    ['Resultado Final', 'X', 3.1, true],
    ['Resultado Final', '2', 4, true],
  ]);
});

test('a 3-way handicap only takes whole lines and drops the draw; totals only take half lines', () => {
  const out = synthetic([
    ['HCMR', 'Handicap', [['{0}||1|0|', '-1', 2.4], ['Empate||X|1|', '-1', 3.3], ['{1}||2|2|', '+1', 2.1], ['{0}||1|0|', '-1.5', 1.9]]],
    ['HCTG', 'Total de golos', [['Mais de|+|O|0|', '2.5', 1.9], ['Mais de|+|O|0|', '3', 2.6], ['Menos de|-|U|1|', '2.5 / 3', 1.7]]],
    ['DNOB', 'Empate anula aposta', [['{1}||2|1|', null, 2.9], ['{0}||1|0|', null, 1.4]]],
  ]);
  assert.deepEqual(out.map((m) => [m[0], m[1]]), [
    ['Resultado handicap', 'Benfica (-1)'],
    ['Resultado handicap', 'FC Porto (+1)'],
    ['Total de Golos Mais/Menos', 'Mais de 2.5'],
    ['Empate Anula Aposta', 'FC Porto'],
    ['Empate Anula Aposta', 'Benfica'],
  ]);
});
