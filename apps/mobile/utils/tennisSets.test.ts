import test from 'node:test';
import assert from 'node:assert/strict';
import { setsWon, parseSetLine } from './tennisSets';

test('set in play does not count as won', () => {
  assert.deepEqual(setsWon(parseSetLine('2-6 1-0')), { home: 0, away: 1 });
  assert.deepEqual(setsWon(parseSetLine('6-4 3-6 7-6')), { home: 2, away: 1 });
  assert.deepEqual(setsWon(parseSetLine('7-5 6-5')), { home: 1, away: 0 });
});
