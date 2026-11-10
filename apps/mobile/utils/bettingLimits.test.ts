import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLimitStatus, startOfWeek, type LimitBoletin } from './bettingLimits';

// Thursday 12/11/2026 15:00 local time
const NOW = new Date(2026, 10, 12, 15, 0);
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0).toISOString();
const b = (stake: number, status: string, ret: number | null, date: string, isFreebet = false): LimitBoletin =>
  ({ stake, status, actualReturn: ret, betDate: date, createdAt: date, isFreebet });

test('week starts on Monday', () => {
  assert.equal(startOfWeek(NOW).getDate(), 9);
});

test('weekly loss and monthly stake against limits', () => {
  const s = computeLimitStatus(
    [
      b(10, 'LOST', 0, at(10)),
      b(10, 'WON', 15, at(11)),
      b(20, 'PENDING', null, at(12)),
      b(5, 'LOST', 0, at(8)), // previous week (Sunday)
      b(30, 'LOST', 0, at(2)), // this month, previous week
      b(10, 'LOST', 0, at(11), true), // freebet: no real money
    ],
    { weeklyLossLimit: 20, monthlyStakeLimit: 100 },
    NOW,
  );
  assert.equal(s.weekLoss, 5);
  assert.equal(s.weekLossRatio, 0.25);
  assert.equal(s.monthStaked, 75);
  assert.equal(s.monthStakeRatio, 0.75);
});

test('a week in profit has zero loss; no limits give null ratios', () => {
  const s = computeLimitStatus([b(10, 'WON', 30, at(11))], { weeklyLossLimit: null, monthlyStakeLimit: null }, NOW);
  assert.equal(s.weekLoss, 0);
  assert.equal(s.weekLossRatio, null);
  assert.equal(s.monthStakeRatio, null);
});

test('chasing: double stake within 24 h of a loss', () => {
  const s = computeLimitStatus(
    [
      b(10, 'WON', 20, at(1)),
      b(10, 'WON', 20, at(2)),
      b(10, 'LOST', 0, at(11, 20)),
      b(25, 'PENDING', null, at(12, 10)), // chase
      b(10, 'PENDING', null, at(12, 11)), // normal stake
    ],
    { weeklyLossLimit: null, monthlyStakeLimit: null },
    NOW,
  );
  assert.equal(s.usualStake, 10);
  assert.equal(s.chaseCount, 1);
});

test('chasing: big stake long after a loss does not count', () => {
  const s = computeLimitStatus(
    [b(10, 'LOST', 0, at(8)), b(10, 'WON', 20, at(9)), b(30, 'PENDING', null, at(11))],
    { weeklyLossLimit: null, monthlyStakeLimit: null },
    NOW,
  );
  assert.equal(s.chaseCount, 0);
});
