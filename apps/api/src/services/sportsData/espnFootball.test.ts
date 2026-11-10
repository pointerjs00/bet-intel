import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapEspnScoreboard, mapEspnStatus, mapEspnSummary } from './espnFootball';
import { toFixtureResult } from './settlementBridge';
import { resolveMarket } from '../marketResolutionEngine';

// Real ESPN response (trimmed), Alverca 1-1 Casa Pia, Liga Portugal, 07/11/2026.
const summary = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'espn-summary-alverca-casapia.json'), 'utf8'));

test('maps a real ESPN match summary', () => {
  const m = mapEspnSummary(summary)!;
  assert.equal(m.status, 'FINISHED');
  assert.equal(m.home.name, 'Alverca');
  assert.equal(m.away.name, 'Casa Pia');
  assert.deepEqual(m.score, { home: 1, away: 1 });
  assert.deepEqual(m.halfTime, { home: 0, away: 1 });
  assert.deepEqual(m.regularTime, { home: 1, away: 1 });
  assert.equal(m.wentToExtraTime, false);
  assert.equal(m.stats?.home.corners, 9);
  assert.equal(m.stats?.away.corners, 2);
  assert.equal(m.stats?.home.yellowCards, 3);
  const goals = m.incidents.filter((i) => i.type === 'GOAL');
  assert.equal(goals.length, 2);
  assert.equal(goals[0]!.minute, "36'");
  assert.equal(goals[0]!.side, 'away');
  assert.equal(goals[0]!.assist, 'Henrique Araújo');
  assert.ok(m.incidents.some((i) => i.type === 'YELLOW' && i.side === 'home'));
});

test('ESPN data settles bets through the engine, including corners', () => {
  const m = mapEspnSummary(summary)!;
  const fixture = toFixtureResult(m)!;
  const ctx = { homeNames: [m.home.name], awayNames: [m.away.name] };
  assert.equal(resolveMarket('Resultado (Tempo Regulamentar)', 'Empate', fixture, ctx), 'WON');
  assert.equal(resolveMarket('Resultado - Primeira Parte', 'Casa Pia', fixture, ctx), 'WON');
  assert.equal(resolveMarket('Cantos - Mais de 9.5', 'Over 9.5', fixture, ctx), 'WON'); // 9 + 2 corners
  assert.equal(resolveMarket('Ambas as Equipas Marcam', 'Sim', fixture, ctx), 'WON');
});

test('extra time: the 90-minute score comes from the period scores', () => {
  const sb = mapEspnScoreboard({
    leagues: [{ id: '2', name: 'UEFA Champions League', slug: 'uefa.champions' }],
    events: [{
      id: '1',
      competitions: [{
        date: '2026-05-30T19:00Z',
        status: { type: { name: 'STATUS_FINAL_AET', state: 'post', completed: true, shortDetail: 'AET' } },
        competitors: [
          { homeAway: 'home', score: '3', team: { id: 'a', displayName: 'Benfica' }, linescores: [{ value: 1 }, { value: 1 }, { value: 1 }, { value: 0 }] },
          { homeAway: 'away', score: '2', team: { id: 'b', displayName: 'Porto' }, linescores: [{ value: 0 }, { value: 2 }, { value: 0 }, { value: 0 }] },
        ],
      }],
    }],
  });
  const m = sb[0]!;
  assert.equal(m.wentToExtraTime, true);
  assert.deepEqual(m.score, { home: 3, away: 2 });
  assert.deepEqual(m.regularTime, { home: 2, away: 2 });
  const fixture = toFixtureResult(m)!;
  assert.equal(resolveMarket('1X2', 'X', fixture, { homeNames: ['Benfica'], awayNames: ['Porto'] }), 'WON');
});

test('status mapping', () => {
  assert.equal(mapEspnStatus({ name: 'STATUS_SCHEDULED', state: 'pre' }), 'SCHEDULED');
  assert.equal(mapEspnStatus({ name: 'STATUS_FIRST_HALF', state: 'in' }), 'LIVE');
  assert.equal(mapEspnStatus({ name: 'STATUS_HALFTIME', state: 'in' }), 'HALFTIME');
  assert.equal(mapEspnStatus({ name: 'STATUS_POSTPONED', state: 'post' }), 'POSTPONED');
  assert.equal(mapEspnStatus({ name: 'STATUS_CANCELED', state: 'post' }), 'CANCELLED');
  assert.equal(mapEspnStatus({ name: 'STATUS_FULL_TIME', state: 'post', completed: true }), 'FINISHED');
});
