import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBasketballMarket, type BasketballResult } from './basketballMarketEngine';
import { mapEspnBasketballScoreboard } from './sportsData/espnBasketball';

const ctx = { home: 'Boston Celtics', away: 'Los Angeles Lakers' };
// Celtics 112 - 108 Lakers after overtime (102-102 at the end of regulation).
const ot: BasketballResult = {
  home: 112, away: 108,
  periods: [{ home: 25, away: 27 }, { home: 28, away: 24 }, { home: 24, away: 26 }, { home: 25, away: 25 }, { home: 10, away: 6 }],
};

test('winner includes overtime; 1X2 uses regulation time', () => {
  assert.equal(resolveBasketballMarket('Vencedor do jogo', 'Boston Celtics', ot, ctx), 'WON');
  assert.equal(resolveBasketballMarket('Vencedor', 'Lakers', ot, ctx), 'LOST');
  assert.equal(resolveBasketballMarket('Vencedor', '2', ot, ctx), 'LOST');
  assert.equal(resolveBasketballMarket('1X2 (Tempo Regulamentar)', 'Empate', ot, ctx), 'WON');
  assert.equal(resolveBasketballMarket('1X2 (Tempo Regulamentar)', 'Celtics', ot, ctx), 'LOST');
});

test('handicap with half and whole lines', () => {
  assert.equal(resolveBasketballMarket('Handicap', 'Boston Celtics -3.5', ot, ctx), 'WON');
  assert.equal(resolveBasketballMarket('Handicap', 'Boston Celtics (-4.5)', ot, ctx), 'LOST');
  assert.equal(resolveBasketballMarket('Handicap', 'Los Angeles Lakers +4', ot, ctx), 'VOID');
  assert.equal(resolveBasketballMarket('Handicap', 'Lakers +5.5', ot, ctx), 'WON');
});

test('totals: game, team and odd/even', () => {
  assert.equal(resolveBasketballMarket('Total de pontos', 'Mais de 215.5', ot, ctx), 'WON');
  assert.equal(resolveBasketballMarket('Total de pontos', 'Menos de 219,5', ot, ctx), 'LOST');
  assert.equal(resolveBasketballMarket('Total de pontos', 'Over 220', ot, ctx), 'VOID');
  assert.equal(resolveBasketballMarket('Total de pontos Lakers', 'Mais de 105.5', ot, ctx), 'WON');
  assert.equal(resolveBasketballMarket('Par/Ímpar (Pontos)', 'Par', ot, ctx), 'WON');
});

test('player props go to review', () => {
  assert.equal(resolveBasketballMarket('Total de pontos do Jogador', 'Tatum mais de 27.5', ot, ctx), null);
});

test('maps an ESPN NBA scoreboard (recorded shape)', () => {
  const [m] = mapEspnBasketballScoreboard({ events: [{
    id: '401', date: '2026-11-11T00:30Z',
    competitions: [{
      status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true, shortDetail: 'Final/OT' } },
      competitors: [
        { homeAway: 'home', score: '112', team: { displayName: 'Boston Celtics', abbreviation: 'BOS', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/bos.png' }, linescores: [{ value: 25 }, { value: 28 }, { value: 24 }, { value: 25 }, { value: 10 }] },
        { homeAway: 'away', score: '108', team: { displayName: 'Los Angeles Lakers', abbreviation: 'LAL' }, linescores: [{ value: 27 }, { value: 24 }, { value: 26 }, { value: 25 }, { value: 6 }] },
      ],
    }],
  }] });
  assert.equal(m?.status, 'FINISHED');
  assert.deepEqual(m?.score, { home: 112, away: 108 });
  assert.equal(m?.periods.length, 5);
  assert.equal(m?.periods[4]?.away, 6);
});
