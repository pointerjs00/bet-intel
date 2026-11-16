import test from 'node:test';
import assert from 'node:assert/strict';
import { chosenHouse, isSelectable, legOdd, orderColumns, parseStake, shownOddsFor } from './multiple';
import type { OddsEventView } from './types';

const perHouse = {
  betclic: { total: 4, missing: 0 },
  betano: { total: null, missing: 1 },
  placard: { total: 5, missing: 0 },
};

test('orderColumns puts best first, rest by HOUSE_ORDER', () => {
  assert.deepEqual(orderColumns(perHouse, 'placard'), ['placard', 'betclic', 'betano']);
  assert.deepEqual(orderColumns(perHouse, null), ['betclic', 'betano', 'placard']);
});

test('isSelectable / chosenHouse', () => {
  assert.equal(isSelectable(perHouse, 'betano'), false);
  assert.equal(chosenHouse(perHouse, 'placard', 'betclic'), 'betclic');
  assert.equal(chosenHouse(perHouse, 'placard', 'betano'), 'placard');
  assert.equal(chosenHouse({ betano: { total: null, missing: 1 } }, null, null), null);
});

const view = {
  rows: [{ key: 'k', prices: { betclic: { odds: 2, suspended: false }, placard: { odds: 3, suspended: true } } }],
} as unknown as OddsEventView;

test('legOdd and shownOddsFor', () => {
  assert.equal(legOdd(view, 'k', 'betclic'), 2);
  assert.equal(legOdd(view, 'k', 'placard'), null);
  const leg = { eventKey: 'e', selectionKey: 'k' } as never;
  assert.deepEqual(shownOddsFor([leg], 'betclic', new Map([['e', view]])), { 'e|k|betclic': 2 });
});

test('parseStake', () => {
  assert.equal(parseStake('2,5'), 2.5);
  assert.equal(parseStake(''), 0);
  assert.equal(parseStake('10'), 10);
  assert.equal(parseStake('2,'), 2);
});
