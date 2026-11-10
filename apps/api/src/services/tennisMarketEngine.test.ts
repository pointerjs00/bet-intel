import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTennisMarket, type TennisResult } from './tennisMarketEngine';

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
  assert.equal(r('Handicap de jogos', 'Jannik Sinner -3,5'), null);
});
