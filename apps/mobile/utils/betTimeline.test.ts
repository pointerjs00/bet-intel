import test from 'node:test';
import assert from 'node:assert/strict';
import { explainBet, parseMinute } from './betTimeline';

const goals = [
  { minute: 38, side: 'away' as const, label: 'Borja Sainz' },
  { minute: 77, side: 'home' as const, label: 'Alan' },
  { minute: 86, side: 'away' as const, label: 'Martim Fernandes' },
];

test('parseMinute handles added time', () => {
  assert.equal(parseMinute("38'"), 38);
  assert.equal(parseMinute("90'+7'"), 97);
});

test('result market: Vitória 1–2 Porto, bet on FC Porto', () => {
  const e = explainBet('Resultado (Tempo Regulamentar)', 'FC Porto', 'Vitória de Guimaraes', 'FC Porto', goals, { home: 1, away: 2 }, 97);
  assert.equal(e.needed, 'FC Porto ganhar');
  assert.deepEqual(e.segments?.map((s) => [s.from, s.to, s.winning]), [[0, 38, false], [38, 77, true], [77, 86, false], [86, 97, true]]);
  assert.deepEqual(e.moments.map((m) => [m.minute, m.winningAfter, m.score]), [[38, true, '0–1'], [77, false, '1–1'], [86, true, '1–2']]);
});

test('over goals and both teams to score', () => {
  const over = explainBet('Total de golos', 'Mais de 2,5', 'A', 'B', goals, { home: 1, away: 2 }, 97);
  assert.deepEqual(over.moments.map((m) => m.minute), [86]);
  const btts = explainBet('Ambas as equipas marcam', 'Sim', 'A', 'B', goals, { home: 1, away: 2 }, 97);
  assert.deepEqual(btts.moments.map((m) => m.minute), [77]);
});

test('unknown market has no timeline', () => {
  const e = explainBet('Marcador', 'Alan', 'A', 'B', goals, { home: 1, away: 2 }, 97);
  assert.equal(e.segments, null);
});
