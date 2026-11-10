import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLivePoints, mapLiveScoreTennis } from './livescoreTennis';

// Real response recorded on 10/11/2026 (ATP Challenger Hersonissos, live in the 3rd set).
const raw = readFileSync(join(__dirname, '__fixtures__', 'livescore-tennis-live.json'), 'utf8').replace(/^﻿/, '');
const list = mapLiveScoreTennis(JSON.parse(raw));

test('LiveScore tennis: sets, game points and server', () => {
  assert.equal(list.length, 1);
  const m = list[0]!;
  assert.equal(m.playerA, 'Michael Geerts');
  assert.equal(m.playerB, 'Juan Martin');
  assert.deepEqual(m.sets, [{ a: 7, b: 6 }, { a: 1, b: 6 }, { a: 5, b: 3 }]);
  assert.equal(m.pointsA, '40');
  assert.equal(m.pointsB, '40');
  assert.equal(m.server, 'A');
});

test('LiveScore tennis: matched to ESPN names in either order', () => {
  assert.equal(findLivePoints(list, 'M. Geerts', 'J. Martin')?.server, 'A');
  const flipped = findLivePoints(list, 'Juan Martin', 'Michael Geerts');
  assert.equal(flipped?.server, 'B');
  assert.deepEqual(flipped?.sets[0], { a: 6, b: 7 });
  assert.equal(findLivePoints(list, 'Carlos Alcaraz', 'Jannik Sinner'), null);
});
