import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURED_MAX, FEATURED_MIN, pickFeatured } from './featured';
import type { OddsEventListItem } from './types';

const it = (key: string, popularity: number, startsAt = '2026-11-16T20:00:00Z', live = false): OddsEventListItem => ({
  eventKey: key, sport: 'FOOTBALL', houses: ['betclic'], houseCount: 1, main: [], popularity,
  event: { home: `H${key}`, away: `A${key}`, startsAt, competition: 'c', live },
});

test('pickFeatured: most popular first, at most FEATURED_MAX, only above FEATURED_MIN', () => {
  const items = [it('a', 50), it('b', 400), it('c', FEATURED_MIN), it('d', 300), ...Array.from({ length: 10 }, (_, i) => it(`x${i}`, 200 + i))];
  const out = pickFeatured(items, Date.parse('2026-11-16T12:00:00Z'));
  assert.equal(out.length, FEATURED_MAX);
  assert.deepEqual(out.slice(0, 2).map((i) => i.eventKey), ['b', 'd']);
  assert.ok(out.every((i) => (i.popularity ?? 0) >= FEATURED_MIN));
  assert.ok(!out.some((i) => i.eventKey === 'a'));
});

test('pickFeatured skips games that already started unless live, and lists without popularity', () => {
  const now = Date.parse('2026-11-16T21:00:00Z');
  assert.deepEqual(pickFeatured([it('old', 500, '2026-11-16T18:00:00Z'), it('live', 450, '2026-11-16T20:30:00Z', true)], now).map((i) => i.eventKey), ['live']);
  assert.deepEqual(pickFeatured([{ ...it('n', 0), popularity: undefined }], now), []);
});
