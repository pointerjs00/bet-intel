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
