import test from 'node:test';
import assert from 'node:assert/strict';
import { matchScore } from './searchRank';

test('matchScore ranks prefix > word prefix > contained', () => {
  assert.equal(matchScore('Benfica', 'ben'), 3);
  assert.equal(matchScore('SL Benfica', 'ben'), 2);
  assert.equal(matchScore('Los Angeles Lakers', 'lak'), 2);
  assert.equal(matchScore('Real Betis', 'eti'), 1);
  assert.equal(matchScore('Porto', 'ben'), 0);
  assert.equal(matchScore('Atlético Madrid', 'atle mad'), 2);
  assert.equal(matchScore('Anything', ''), 0);
});

import { resolveIndexedTeam } from './searchRank';

test('resolveIndexedTeam picks the one team a bet name denotes', () => {
  const index = [
    { id: '1', sport: 'FOOTBALL' as const, name: 'Sporting CP' },
    { id: '2', sport: 'FOOTBALL' as const, name: 'Sporting Gijón' },
    { id: '3', sport: 'FOOTBALL' as const, name: 'Sporting Kansas City' },
    { id: '4', sport: 'FOOTBALL' as const, name: 'Inglaterra' },
    { id: '5', sport: 'FOOTBALL' as const, name: 'New England Revolution' },
    { id: '6', sport: 'FOOTBALL' as const, name: 'Benfica' },
  ];
  assert.equal(resolveIndexedTeam('Sporting CP', 'FOOTBALL', index)?.id, '1');
  assert.equal(resolveIndexedTeam('Sporting', 'FOOTBALL', index)?.id, '1');
  assert.equal(resolveIndexedTeam('Inglaterra', 'FOOTBALL', index)?.id, '4');
  assert.equal(resolveIndexedTeam('England', 'FOOTBALL', index)?.id, '4');
  assert.equal(resolveIndexedTeam('SL Benfica', 'FOOTBALL', index)?.id, '6');
  assert.equal(resolveIndexedTeam('Sporting Gijon', 'FOOTBALL', index)?.id, '2');
  assert.equal(resolveIndexedTeam('Benfica', 'BASKETBALL', index), null);
});
