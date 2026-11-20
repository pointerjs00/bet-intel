import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, matchesQuery, normalizeText } from './search';
import type { OddsEventListItem } from './types';

const item = (home: string, away: string, canonical?: { home: string; away: string }): OddsEventListItem => ({
  eventKey: `k:${home}`, sport: 'FOOTBALL', houses: ['betclic'], houseCount: 1, main: [],
  event: { home, away, startsAt: '2026-11-16T20:00:00Z', competition: 'Liga', live: false, ...(canonical ? { canonical } : {}) },
});

test('normalizeText drops accents, case and punctuation', () => {
  assert.equal(normalizeText('  Países-Baixos  F.C. '), 'paises baixos f c');
});

test('matchesQuery: word-prefix, accent-insensitive, home or away, ESPN names too', () => {
  const g = item('Grécia', 'Sérvia', { home: 'Greece', away: 'Serbia' });
  assert.ok(matchesQuery(g, 'grec'));
  assert.ok(matchesQuery(g, 'SERV'));
  assert.ok(matchesQuery(g, 'serbia'));
  assert.ok(!matchesQuery(g, 'recia')); // not a word start
  assert.ok(matchesQuery(item('SL Benfica', 'FC Porto'), 'benf'));
  assert.ok(matchesQuery(item('Jannik Sinner', 'Carlos Alcaraz'), 'alcar'));
  assert.ok(matchesQuery(item('Jannik Sinner', 'Carlos Alcaraz'), 'sinner alcaraz')); // every word must match some name
  assert.ok(!matchesQuery(item('Jannik Sinner', 'Carlos Alcaraz'), 'sinner djokovic'));
  assert.ok(!matchesQuery(item('SL Benfica', 'FC Porto'), ' '));
});

test('matchesQuery also finds the competition', () => {
  const g = { ...item('SL Benfica', 'FC Porto'), event: { ...item('SL Benfica', 'FC Porto').event, competition: 'Portugal - Liga Portugal Betclic' } };
  assert.ok(matchesQuery(g, 'liga port'));
  assert.ok(matchesQuery(g, 'benfica liga'));
  assert.ok(!matchesQuery(g, 'premier'));
});

test('applyFilters: competition, two or more houses, live; unset filters let everything through', () => {
  const a = { ...item('A', 'B'), houseCount: 2 };
  const b = { ...item('C', 'D'), event: { ...item('C', 'D').event, competition: 'Taça', live: true } };
  assert.deepEqual(applyFilters([a, b], {}).map((i) => i.event.home), ['A', 'C']);
  assert.deepEqual(applyFilters([a, b], { comparable: true }).map((i) => i.event.home), ['A']);
  assert.deepEqual(applyFilters([a, b], { live: true }).map((i) => i.event.home), ['C']);
  assert.deepEqual(applyFilters([a, b], { competition: 'Taça' }).map((i) => i.event.home), ['C']);
  assert.deepEqual(applyFilters([a, b], { competition: 'Taça', comparable: true }), []);
});
