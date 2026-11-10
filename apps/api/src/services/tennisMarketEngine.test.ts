import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTennisLive, resolveTennisMarket, type TennisResult } from './tennisMarketEngine';

// Medvedev (A) v Sinner (B): 4-6 7-6 3-6 → Sinner wins 2-1, 32 games.
const R: TennisResult = { status: 'FINISHED', winner: 'B', sets: [{ a: 4, b: 6 }, { a: 7, b: 6 }, { a: 3, b: 6 }] };
const CTX = { playerA: ['Daniil Medvedev'], playerB: ['Jannik Sinner'] };
const r = (market: string, selection: string, res: TennisResult = R) => resolveTennisMarket(market, selection, res, CTX);

test('match winner (real Betclic wording)', () => {
  assert.equal(r('Vencedor do encontro', 'Jannik Sinner'), 'WON');
  assert.equal(r('Vencedor do encontro', 'Daniil Medvedev'), 'LOST');
  assert.equal(r('Vencedor do encontro', 'Sinner'), 'WON');
  assert.equal(r('Vencedor do encontro', 'Carlos Alcaraz'), null);
});

test('set score', () => {
  assert.equal(r('Resultado Correto do Encontro', 'Jannik Sinner vence 2-0'), 'LOST');
  assert.equal(r('Resultado Correto do Encontro', 'Jannik Sinner vence 2-1'), 'WON');
  assert.equal(r('Resultado Correto do Encontro', 'Daniil Medvedev vence 2-1'), 'LOST');
});

test('set winner and totals', () => {
  assert.equal(r('1.º Set - Vencedor', 'Jannik Sinner'), 'WON');
  assert.equal(r('Vencedor do 2.º set', 'Jannik Sinner'), 'LOST');
  assert.equal(r('Total de jogos', 'Mais de 30,5'), 'WON');
  assert.equal(r('Total de jogos', 'Menos de 30,5'), 'LOST');
  assert.equal(r('Total de sets', 'Mais de 2,5'), 'WON');
  assert.equal(r('Total de jogos - Jogador', 'Jannik Sinner Mais de 17,5'), 'WON');
});

test('retirement and walkover go to review, cancellation is void', () => {
  assert.equal(r('Vencedor do encontro', 'Jannik Sinner', { ...R, status: 'RETIRED' }), null);
  assert.equal(r('Vencedor do encontro', 'Jannik Sinner', { ...R, status: 'WALKOVER' }), null);
  assert.equal(r('Vencedor do encontro', 'Jannik Sinner', { ...R, status: 'CANCELLED' }), 'VOID');
  assert.equal(r('Handicap de jogos', 'Jannik Sinner -3,5', { ...R, status: 'RETIRED' }), null);
});

// 32 games (Medvedev 14, Sinner 18); tie-break in set 2.
test('tie-break, game/set handicap, wins at least one set', () => {
  assert.equal(r('Haverá tie-break no encontro?', 'Sim'), 'WON');
  assert.equal(r('Tie-break no 1.º set', 'Sim'), 'LOST');
  assert.equal(r('Tie-break no 2.º set', 'Sim'), 'WON');
  assert.equal(r('Handicap de jogos', 'Jannik Sinner (-3.5)'), 'WON'); // +4
  assert.equal(r('Handicap de jogos', 'Daniil Medvedev (+3,5)'), 'LOST');
  assert.equal(r('Handicap de jogos', 'Sinner -4'), 'VOID');
  assert.equal(r('Handicap de sets', 'Medvedev +1.5'), 'WON');
  assert.equal(r('Vence pelo menos um set', 'Daniil Medvedev'), 'WON');
  assert.equal(r('Total de aces', 'Mais de 10,5'), null); // no free source
});

test('live tennis: finished sets, tie-break played, games over passed', () => {
  // After two sets (4-6, 7-6), third set at 1-2.
  const sets = [{ a: 4, b: 6 }, { a: 7, b: 6 }, { a: 1, b: 2 }];
  const a = (m: string, s: string) => assessTennisLive(m, s, sets, false, CTX);
  assert.equal(a('1.º Set - Vencedor', 'Jannik Sinner').decided, 'WON');
  assert.equal(a('Vencedor do 3.º set', 'Jannik Sinner').decided, null);
  assert.equal(a('Haverá tie-break no encontro?', 'Sim').decided, 'WON');
  assert.equal(a('Vence pelo menos um set', 'Daniil Medvedev').decided, 'WON');
  assert.equal(a('Total de jogos', 'Mais de 25,5').decided, 'WON'); // 26 so far
  assert.equal(a('Total de jogos', 'Mais de 35,5').decided, null);
  assert.equal(a('Vencedor do encontro', 'Jannik Sinner').decided, null);
});
