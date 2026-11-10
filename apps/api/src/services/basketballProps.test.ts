// NBA player props and quarter/half markets from a recorded ESPN summary:
// Atlanta Hawks 114-124 Los Angeles Lakers (09/11/2026). Quarters (Hawks-Lakers): 22-31 35-37 33-27 24-29.
//   Walker Kessler (LAL) 21 pts 10 reb 4 ast · Onyeka Okongwu (ATL) 16 pts 9 reb
//   Nickeil Alexander-Walker (ATL) 4 threes · Kevon Looney (LAL) did not play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessBasketballLive, resolveBasketballMarket, type BasketballResult } from './basketballMarketEngine';
import { mapEspnNbaSummary } from './sportsData/espnBasketball';

const game = mapEspnNbaSummary(JSON.parse(readFileSync(join(__dirname, 'sportsData/__fixtures__/espn-nba-summary.json'), 'utf8')), '401909952')!;
const R: BasketballResult = { ...game.score!, periods: game.periods, players: game.players };
const ctx = { home: game.home.name, away: game.away.name };
const r = (m: string, s: string) => resolveBasketballMarket(m, s, R, ctx);

test('ESPN NBA summary: score, quarters, box score', () => {
  assert.equal(game.status, 'FINISHED');
  assert.deepEqual(game.score, { home: 114, away: 124 });
  assert.deepEqual(game.periods[0], { home: 22, away: 31 });
  const kessler = game.players!.find((p) => p.name === 'Walker Kessler')!;
  assert.deepEqual([kessler.points, kessler.rebounds, kessler.assists, kessler.side], [21, 10, 4, 'away']);
  assert.equal(game.players!.find((p) => p.name === 'Kevon Looney')!.played, false);
});

test('player props: points, rebounds, threes, combinations, double-double, did not play', () => {
  assert.equal(r('Total de pontos do Jogador', 'Walker Kessler Acima de 20,5'), 'WON');
  assert.equal(r('Total de pontos do Jogador', 'Onyeka Okongwu marca acima de 16,5 pontos'), 'LOST');
  assert.equal(r('Ressaltos', 'Walker Kessler Acima de 9,5'), 'WON');
  assert.equal(r('Triplos', 'Nickeil Alexander-Walker Acima de 3,5'), 'WON');
  assert.equal(r('Pontos + Ressaltos + Assistências', 'Kessler Mais de 35,5'), 'LOST'); // 35
  assert.equal(r('Duplo-duplo - Walker Kessler', 'Sim'), 'WON');
  assert.equal(r('Total de pontos do Jogador', 'Kevon Looney Acima de 5,5'), 'VOID');
  assert.equal(r('Total de pontos do Jogador', 'Jogador Inventado Acima de 5,5'), null);
});

test('quarter and half markets', () => {
  assert.equal(r('1.º quarto - Vencedor', 'Los Angeles Lakers'), 'WON');
  assert.equal(r('1.ª parte - Total de pontos', 'Mais de 120,5'), 'WON'); // 125
  assert.equal(r('2.ª parte - Handicap', 'Atlanta Hawks +1.5'), 'WON'); // 57-56 in the second half
});

test('live: over passed is won, under passed is lost, finished quarter is settled', () => {
  const half: BasketballResult = { home: 57, away: 68, periods: game.periods.slice(0, 2), players: null };
  assert.equal(assessBasketballLive('Total de pontos', 'Mais de 120,5', half, 2, ctx).decided, 'WON');
  assert.equal(assessBasketballLive('Total de pontos', 'Menos de 120,5', half, 2, ctx).decided, 'LOST');
  assert.equal(assessBasketballLive('Total de pontos', 'Mais de 230,5', half, 2, ctx).decided, null);
  assert.equal(assessBasketballLive('1.º quarto - Vencedor', 'Atlanta Hawks', half, 2, ctx).decided, 'LOST');
  assert.equal(assessBasketballLive('Vencedor do jogo', 'Los Angeles Lakers', half, 2, ctx).decided, null);
});
