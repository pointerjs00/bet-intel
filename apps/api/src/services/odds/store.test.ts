import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOddsStore } from './store';
import { createFakeRedis } from './fakeRedis';
import type { SourceEvent, SourceMarket } from './types';

const ev: SourceEvent = {
  house: 'betclic',
  houseEventId: '1',
  sport: 'FOOTBALL',
  competition: 'c',
  home: 'a',
  away: 'b',
  startsAt: '2026-11-16T20:00:00Z',
  live: false,
};
const mk: SourceMarket = { marketLabel: 'm', selectionLabel: 's', odds: 2, suspended: false };

test('events round trip with 30 min TTL', async () => {
  const r = createFakeRedis();
  const s = createOddsStore(r);
  assert.equal(await s.getEvents('betclic', 'FOOTBALL'), null);
  await s.setEvents('betclic', 'FOOTBALL', [ev]);
  assert.deepEqual(await s.getEvents('betclic', 'FOOTBALL'), [ev]);
  assert.equal(r.ttlOf('odds:events:betclic:FOOTBALL'), 1800);
});

test('link round trip with 48 h TTL', async () => {
  const r = createFakeRedis();
  const s = createOddsStore(r);
  await s.setLink('betano', '9', 'K1');
  assert.equal(await s.getLink('betano', '9'), 'K1');
  assert.equal(r.ttlOf('odds:link:betano:9'), 172800);
});

test('getLinks reads many links in batched MGETs, in input order, none for an empty list', async () => {
  const r = createFakeRedis();
  let calls = 0;
  const mget = r.mget.bind(r);
  r.mget = async (keys) => { calls++; return mget(keys); };
  const s = createOddsStore(r);
  assert.deepEqual(await s.getLinks('lebull', []), []);
  assert.equal(calls, 0);
  const ids = Array.from({ length: 1001 }, (_, i) => String(i));
  for (const id of ['0', '500', '1000']) await s.setLink('lebull', id, `K${id}`);
  const got = await s.getLinks('lebull', ids);
  assert.equal(got.length, 1001);
  assert.equal(got[0], 'K0');
  assert.equal(got[1], null);
  assert.equal(got[500], 'K500');
  assert.equal(got[1000], 'K1000');
  assert.equal(calls, 3);
});

test('markets round trip with 60 s TTL', async () => {
  const r = createFakeRedis();
  const s = createOddsStore(r);
  await s.setMarkets('betclic', '1', { fetchedAt: 'now', markets: [mk] });
  assert.deepEqual(await s.getMarkets('betclic', '1'), { fetchedAt: 'now', markets: [mk] });
  assert.equal(r.ttlOf('odds:markets:betclic:1'), 60);
});

test('index hash maps house to event id with 48 h TTL', async () => {
  const r = createFakeRedis();
  const s = createOddsStore(r);
  await s.setIndex('K1', 'betclic', '1');
  await s.setIndex('K1', 'betano', '9');
  assert.deepEqual(await s.getIndex('K1'), { betclic: '1', betano: '9' });
  assert.equal(r.ttlOf('odds:index:K1'), 172800);
  assert.deepEqual(await s.getIndex('none'), {});
});

test('corrupt JSON reads as null', async () => {
  const r = createFakeRedis();
  await r.set('odds:events:betclic:TENNIS', '{bad', 'EX', 10);
  assert.equal(await createOddsStore(r).getEvents('betclic', 'TENNIS'), null);
});
