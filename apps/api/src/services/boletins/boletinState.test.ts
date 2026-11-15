import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, BoletinStatus, ItemResult } from '@prisma/client';
import { deriveBoletinState, recalculateTotalOdds } from './boletinState';

const D = (v: number | string) => new Prisma.Decimal(v);
const item = (result: ItemResult, odd: number | string = 2) => ({ result, oddValue: D(odd) });
const base = { stake: D(10), potentialReturn: D(40), isFreebet: false };

test('a lost leg makes the boletim LOST at once, even with pending legs', () => {
  const r = deriveBoletinState({ ...base, items: [item(ItemResult.LOST), item(ItemResult.PENDING)] });
  assert.equal(r.status, BoletinStatus.LOST);
  assert.equal(r.actualReturn?.toFixed(2), '0.00');
});

test('won + pending stays PENDING', () => {
  const r = deriveBoletinState({ ...base, items: [item(ItemResult.WON), item(ItemResult.PENDING)] });
  assert.equal(r.status, BoletinStatus.PENDING);
  assert.equal(r.actualReturn, null);
});

test('no legs is PENDING', () => {
  assert.equal(deriveBoletinState({ ...base, items: [] }).status, BoletinStatus.PENDING);
});

test('all won is WON with the potential return', () => {
  const r = deriveBoletinState({ ...base, items: [item(ItemResult.WON), item(ItemResult.WON)] });
  assert.equal(r.status, BoletinStatus.WON);
  assert.equal(r.actualReturn?.toFixed(2), '40.00');
});

test('won + void is PARTIAL with stake times the won odds', () => {
  const r = deriveBoletinState({ ...base, items: [item(ItemResult.WON, 1.5), item(ItemResult.VOID, 3)] });
  assert.equal(r.status, BoletinStatus.PARTIAL);
  assert.equal(r.actualReturn?.toFixed(2), '15.00');
});

test('only void returns the stake', () => {
  const r = deriveBoletinState({ ...base, items: [item(ItemResult.VOID)] });
  assert.equal(r.status, BoletinStatus.VOID);
  assert.equal(r.actualReturn?.toFixed(2), '10.00');
});

test('only void on a freebet returns 0', () => {
  const r = deriveBoletinState({ ...base, isFreebet: true, items: [item(ItemResult.VOID)] });
  assert.equal(r.status, BoletinStatus.VOID);
  assert.equal(r.actualReturn?.toFixed(2), '0.00');
});

test('freebet 5 EUR at odd 2.00 won returns 10', () => {
  const r = deriveBoletinState({ stake: D(5), potentialReturn: D(10), isFreebet: true, items: [item(ItemResult.WON, 2)] });
  assert.equal(r.status, BoletinStatus.WON);
  assert.equal(r.actualReturn?.toFixed(2), '10.00');
});

const odds = (...v: number[]) => v.map(D);

test('recalculateTotalOdds: deleting a leg without boost gives the product of the rest', () => {
  const r = recalculateTotalOdds({ currentTotalOdds: D(12), currentLegOdds: odds(2, 2, 3), nextLegOdds: odds(2, 3) });
  assert.equal(r.toFixed(2), '6.00');
});

test('recalculateTotalOdds: deleting a leg keeps a 10% boost', () => {
  // product 12, stored 13.2 => boost 1.1; remaining product 6 => 6.6
  const r = recalculateTotalOdds({ currentTotalOdds: D(13.2), currentLegOdds: odds(2, 2, 3), nextLegOdds: odds(2, 3) });
  assert.equal(r.toFixed(2), '6.60');
});

test('recalculateTotalOdds: adding a leg multiplies the product', () => {
  const r = recalculateTotalOdds({ currentTotalOdds: D(6), currentLegOdds: odds(2, 3), nextLegOdds: odds(2, 3, 1.5) });
  assert.equal(r.toFixed(2), '9.00');
});

test('recalculateTotalOdds: a single remaining leg equals its odd', () => {
  const r = recalculateTotalOdds({ currentTotalOdds: D(6), currentLegOdds: odds(2, 3), nextLegOdds: odds(3) });
  assert.equal(r.toFixed(2), '3.00');
});

test('recalculateTotalOdds: tiny rounding drift (under 1%) is not treated as a boost', () => {
  const r = recalculateTotalOdds({ currentTotalOdds: D(6.0033), currentLegOdds: odds(2, 3), nextLegOdds: odds(3) });
  assert.equal(r.toFixed(2), '3.00');
});
