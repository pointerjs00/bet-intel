// Settlement of team-stat, scorer, card and player markets from a recorded ESPN summary:
// Brighton & Hove Albion 2-0 Brentford (Premier League, 08/11/2026).
//   Goals: Diego Gómez 15', Pascal Gross (pen.) 42'  → half time 2-0
//   Cards: Brighton 4 yellow; Brentford 2 yellow + 1 red (Igor Thiago 23')
//   Corners 7-3, shots 20-5, offsides 1-3, fouls 11-7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessLive, findPlayer, resolveMarket, type FixtureResult, type MatchContext } from './marketResolutionEngine';
import { mapEspnSummary } from './sportsData/espnFootball';
import { minuteOf, toFixtureResult, toLiveSnapshot } from './sportsData/settlementBridge';
import type { NormalizedMatch } from './sportsData/types';

const raw = JSON.parse(readFileSync(join(__dirname, 'sportsData/__fixtures__/espn-soccer-summary.json'), 'utf8'));
const match = mapEspnSummary(raw)!;
const F = toFixtureResult(match)!;
const CTX: MatchContext = { homeNames: ['Brighton', 'Brighton & Hove Albion'], awayNames: ['Brentford'] };
const r = (market: string, selection: string, f: FixtureResult = F) => resolveMarket(market, selection, f, CTX);

test('ESPN summary → engine input: stats, halves, goals, players', () => {
  assert.equal(match.status, 'FINISHED');
  assert.deepEqual([F.homeScore, F.awayScore, F.htHomeScore, F.htAwayScore], [2, 0, 2, 0]);
  assert.deepEqual([F.homeCards, F.awayCards, F.awayRedCards], [4, 3, 1]);
  assert.deepEqual([F.homeCorners, F.awayCorners, F.homeShots, F.awayShots], [7, 3, 20, 5]);
  assert.deepEqual(F.cardsByHalf, { first: { home: 2, away: 2 }, second: { home: 2, away: 1 } });
  assert.equal(F.cornersByHalf?.first.home! + F.cornersByHalf?.second.home!, 7);
  assert.deepEqual(F.goals?.map((g) => [g.player, g.minute, g.penalty]), [['Diego Gómez', 15, false], ['Pascal Gross', 42, true]]);
  assert.ok((F.players?.length ?? 0) >= 22);
  assert.ok((F.subs?.length ?? 0) > 0);
  assert.equal(minuteOf("90'+4'"), 94);
});

test('team stat totals: cards, corners, shots, offsides; per half', () => {
  assert.equal(r('Total de cartões', 'Mais de 5,5'), 'WON'); // 7 (a red card, but far from the line)
  assert.equal(r('Total de cartões', 'Mais de 6,5'), null); // 7 with a red card, close to the line: review
  assert.equal(r('Total de cartões - 1.ª parte', 'Mais de 3,5'), 'WON'); // 4 in the first half
  assert.equal(r('Total de cantos', 'Menos de 10,5'), 'WON'); // 10
  assert.equal(r('Total de remates', 'Mais de 22,5'), 'WON'); // 25
  assert.equal(r('Remates à baliza - Brentford', 'Brentford Mais de 3,5'), r('Remates à baliza', 'Brentford Mais de 3,5'));
  assert.equal(r('Total de foras de jogo', 'Menos de 4,5'), 'WON'); // 4
});

test('scorers: anytime, first, last, Nth goal, 2+, with team result', () => {
  assert.equal(r('Marcador (a qualquer momento)', 'Diego Gómez'), 'WON');
  assert.equal(r('Marcador (a qualquer momento)', 'Gómez'), 'WON');
  assert.equal(r('Marcador (a qualquer momento)', 'Kevin Schade'), 'LOST');
  assert.equal(r('Primeiro marcador', 'Diego Gómez'), 'WON');
  assert.equal(r('Primeiro marcador', 'Pascal Gross'), 'LOST');
  assert.equal(r('Último marcador', 'Pascal Gross'), 'WON');
  assert.equal(r('Próximo marcador - Golo 2', 'Pascal Gross'), 'WON');
  assert.equal(r('Próximo marcador - Golo 3', 'Nenhum golo'), 'WON');
  assert.equal(r('Marca 2 ou mais golos', 'Diego Gómez'), 'LOST');
  assert.equal(r('Jogador marca e Equipa vence', 'Diego Gómez marca e Brighton vence'), 'WON');
  assert.equal(r('Jogador marca e Equipa vence', 'Diego Gómez marca e Brentford vence'), 'LOST');
  assert.equal(r('Marcador (a qualquer momento)', 'Jogador Inventado'), null); // not in either squad
});

test('players: did not play → void; cards; shots', () => {
  const bench = F.players!.find((p) => !p.started && !p.subbedIn);
  if (bench) assert.equal(r('Marcador (a qualquer momento)', bench.name), 'VOID');
  assert.equal(r('Jogador a ver cartão', 'Igor Thiago'), 'WON');
  assert.equal(r('Jogador a ver cartão', 'Diego Gómez'), 'LOST');
  const shooter = F.players!.filter((p) => p.started).sort((a, b) => b.shots - a.shots)[0]!;
  assert.equal(r('Remates do jogador', `${shooter.name} Mais de ${shooter.shots - 0.5}`), 'WON');
  assert.equal(r('Remates do jogador', `${shooter.name} Mais de ${shooter.shots + 0.5}`), 'LOST');
});

test('first team to score, odd/even, team to score', () => {
  assert.equal(r('Primeira equipa a marcar', 'Brighton'), 'WON');
  assert.equal(r('Primeira equipa a marcar', 'Nenhuma'), 'LOST');
  assert.equal(r('Total de golos Par/Ímpar', 'Par'), 'WON');
  assert.equal(r('Equipa marca', 'Brentford marca'), 'LOST');
});

test('player names: initials, partial names, ambiguity', () => {
  const ps = [{ name: 'Luis Suárez' }, { name: 'Luis Díaz' }, { name: 'Vangelis Pavlidis' }];
  assert.equal(findPlayer('Pavlidis', ps), ps[2]);
  assert.equal(findPlayer('L. Suárez', ps), ps[0]);
  assert.equal(findPlayer('Luis', ps), 'AMBIGUOUS');
  assert.equal(findPlayer('Gyökeres', ps), null);
});

test('live: decided early vs. still open', () => {
  // The same match at minute 30: 1-0 (Gómez), 4 cards so far, red already shown.
  const at30: NormalizedMatch = {
    ...match,
    status: 'LIVE',
    statusDetail: "30'",
    score: { home: 1, away: 0 },
    halfTime: { home: 1, away: 0 },
    regularTime: { home: 1, away: 0 },
    incidents: match.incidents.filter((i) => (i.clockSeconds ?? 0) <= 30 * 60),
  };
  const live = toLiveSnapshot(at30)!;
  assert.equal(live.phase, 'FIRST_HALF');
  const a = (m: string, s: string) => assessLive(m, s, live.fixture, live.phase, CTX);
  assert.deepEqual(a('Marcador (a qualquer momento)', 'Diego Gómez'), { ifEndedNow: 'WON', decided: 'WON' });
  assert.deepEqual(a('Total de golos', 'Mais de 2,5'), { ifEndedNow: 'LOST', decided: null });
  assert.deepEqual(a('Total de golos', 'Menos de 0,5'), { ifEndedNow: 'LOST', decided: 'LOST' });
  assert.deepEqual(a('Ambas as equipas marcam', 'Não'), { ifEndedNow: 'WON', decided: null });
  assert.equal(a('Primeiro marcador', 'Pascal Gross').decided, 'LOST');
  assert.equal(a('Resultado Final', 'Brighton').decided, null);
  assert.equal(a('Resultado exato', '0-0').decided, 'LOST');
});
