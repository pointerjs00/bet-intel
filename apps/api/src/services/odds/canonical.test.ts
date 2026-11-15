import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footballKey, legKey } from './canonical';

// Labels below are the real ones: Betclic ("Resultado (Tempo Regulamentar)", "Resultado duplo",
// "Total de golos - acima/abaixo", ...), Betano ("Resultado Final" 1/X/2, "Total de Golos Mais/Menos")
// and Lebull ("Result", "Total" + line), from docs/analise-2026-11/odds/samples.
const ctx = { home: 'Leixões', away: 'GD Chaves' };
const benfica = { home: 'SL Benfica', away: 'Famalicao' };

test('1X2: same key across Betclic, Betano and Lebull labels', () => {
  assert.equal(footballKey('Resultado (Tempo Regulamentar)', 'Leixões', ctx), 'FT.1X2.H');
  assert.equal(footballKey('Resultado (Tempo Regulamentar)', 'Empate', ctx), 'FT.1X2.D');
  assert.equal(footballKey('Resultado (Tempo Regulamentar)', 'GD Chaves', ctx), 'FT.1X2.A');
  assert.equal(footballKey('Resultado Final', '1', ctx), 'FT.1X2.H');
  assert.equal(footballKey('Resultado Final', 'X', ctx), 'FT.1X2.D');
  assert.equal(footballKey('Resultado Final', '2', ctx), 'FT.1X2.A');
  assert.equal(footballKey('Resultado (1X2)', 'SL Benfica', benfica), 'FT.1X2.H');
  assert.equal(footballKey('Resultado (1X2)', 'X', benfica), 'FT.1X2.D');
  assert.equal(footballKey('Resultado (1X2)', 'Famalicao', benfica), 'FT.1X2.A');
});

test('Lebull API label "Result" (English stakeTypeName) is not recognised by parseBet yet: null', () => {
  assert.equal(footballKey('Result', 'SL Benfica', benfica), null);
});

test('totals: goals over/under with decimal comma or point', () => {
  assert.equal(footballKey('Total de golos - acima/abaixo', 'Acima de 2,5', ctx), 'FT.TOTAL.goals.O.2.5');
  assert.equal(footballKey('Total de golos - acima/abaixo', 'Abaixo de 2,5', ctx), 'FT.TOTAL.goals.U.2.5');
  assert.equal(footballKey('Total de Golos Mais/Menos', 'Mais de 2.5', ctx), 'FT.TOTAL.goals.O.2.5');
  assert.equal(footballKey('Total', 'Over 2.5', benfica), 'FT.TOTAL.goals.O.2.5');
  assert.equal(footballKey('Total', 'Under 1.5', benfica), 'FT.TOTAL.goals.U.1.5');
});

test('team totals carry the team side', () => {
  assert.equal(footballKey('Leixões - Total de golos', 'Acima de 1,5', ctx), 'FT.TOTAL.goals.H.O.1.5');
  assert.equal(footballKey('GD Chaves - Total de golos', 'Abaixo de 0,5', ctx), 'FT.TOTAL.goals.A.U.0.5');
});

test('half-time total is never confused with full-time', () => {
  assert.equal(footballKey('Total de Golos Mais/Menos - 1ª Parte', 'Mais de 0.5', ctx), null);
});

test('both teams to score', () => {
  assert.equal(footballKey('As duas equipas marcam', 'Sim', ctx), 'FT.BTTS.Y');
  assert.equal(footballKey('As duas equipas marcam', 'Não', ctx), 'FT.BTTS.N');
  assert.equal(footballKey('Ambas Marcam', 'Sim', ctx), 'FT.BTTS.Y');
});

test('double chance', () => {
  assert.equal(footballKey('Resultado duplo', 'Leixões ou Empate', ctx), 'FT.DC.HD');
  assert.equal(footballKey('Resultado duplo', 'Leixões ou GD Chaves', ctx), 'FT.DC.HA');
  assert.equal(footballKey('Dupla Hipótese', '1X', ctx), 'FT.DC.HD');
  assert.equal(footballKey('Dupla Hipótese', 'X2', ctx), 'FT.DC.DA');
});

test('draw no bet and handicap', () => {
  assert.equal(footballKey('Empate Anula Aposta', 'Leixões', ctx), 'FT.DNB.H');
  assert.equal(footballKey('Resultado handicap', 'Leixões (-2)', ctx), 'FT.HCP.EU.H.-2');
  assert.equal(footballKey('Resultado handicap', 'GD Chaves (+2)', ctx), 'FT.HCP.EU.A.+2');
});

test('the draw leg of a 3-way handicap is not comparable (null)', () => {
  assert.equal(footballKey('Resultado handicap', 'Empate (Leixões -2)', ctx), null);
});

test('correct score and scorers', () => {
  assert.equal(footballKey('Resultado correto', '2-1', ctx), 'FT.SCORE.2-1');
  assert.equal(footballKey('Resultado exato', '0:0', ctx), 'FT.SCORE.0-0');
  assert.equal(footballKey('Marcador', 'Rafael Camacho', ctx), 'SCORER.ANY.rafael camacho');
});

test('Betclic "Resultado correcto" is not recognised by parseBet yet: null, never a wrong key', () => {
  assert.equal(footballKey('Resultado correcto', '2-1', ctx), null);
  assert.equal(footballKey('Resultado correcto', 'Leixões 2-1', ctx), null);
});

test('safety guards: parseBet leniency must not leak into keys', () => {
  assert.equal(footballKey('Double Chance', 'Leixões or X', ctx), null);
  assert.equal(footballKey('Marcador', 'Leixões Fulano', ctx), null);
});

test('half-time/full-time and parity', () => {
  assert.equal(footballKey('Intervalo/Final', 'Leixões/Leixões', ctx), 'HTFT.HH');
  assert.equal(footballKey('Par/Ímpar', 'Par', ctx), 'FT.PARITY.EVEN');
});

test('unrecognised or unsafe labels give null', () => {
  assert.equal(footballKey('Foo bar', 'baz', ctx), null);
  assert.equal(footballKey('Equipa tem 2 golos de vantagem ou vence (tempo reg.)', 'Leixões', ctx), null);
});

test('legKey: periods, team totals, scorer variants, uncomparable legs', () => {
  assert.equal(legKey({ kind: 'RESULT', period: '1H', outcomes: ['H'] }), '1H.1X2.H');
  assert.equal(legKey({ kind: 'RESULT', period: 'FT', outcomes: ['D', 'A'] }), 'FT.DC.DA');
  assert.equal(legKey({ kind: 'TOTAL', period: '2H', stat: 'corners', over: false, line: 4.5, team: 'A' }), '2H.TOTAL.corners.A.U.4.5');
  assert.equal(legKey({ kind: 'TOTAL', period: 'FT', stat: 'cards', over: true, line: 3 }), 'FT.TOTAL.cards.O.3');
  assert.equal(legKey({ kind: 'HANDICAP', side: 'H', line: -1.5, asian: true, period: 'FT' }), 'FT.HCP.AS.H.-1.5');
  assert.equal(legKey({ kind: 'HANDICAP', side: 'A', line: 0.5, asian: false, period: '1H' }), '1H.HCP.EU.A.+0.5');
  assert.equal(legKey({ kind: 'SCORER', mode: 'ANY', player: null }), 'SCORER.ANY.NONE');
  assert.equal(legKey({ kind: 'SCORER', mode: 'FIRST', player: 'x y', orAssist: true }), 'SCORER.FIRST.x y.OA');
  assert.equal(legKey({ kind: 'SCORER', mode: 'NTH', player: 'x', n: 2, orSub: true }), 'SCORER.NTH.2.x.OS');
  assert.equal(legKey({ kind: 'FIRST_GOAL', side: null }), 'FT.FIRSTGOAL.NONE');
  assert.equal(legKey({ kind: 'FIRST_GOAL', side: 'A' }), 'FT.FIRSTGOAL.A');
  assert.equal(legKey({ kind: 'PLAYER_CARD', player: 'x' }), null);
  assert.equal(legKey({ kind: 'PLAYER_STAT', player: 'x', stat: 'goals', over: true, line: 0.5 }), null);
});

test('team totals: unresolved team qualifier gives null, never a match total', () => {
  assert.equal(footballKey('Total de Golos da Equipa da Casa', 'Mais de 1.5', ctx), 'FT.TOTAL.goals.H.O.1.5');
  assert.equal(footballKey('Total de golos - Equipa visitante', 'Acima de 0,5', ctx), 'FT.TOTAL.goals.A.O.0.5');
  assert.equal(footballKey('Total de golos - Equipa X', 'Acima de 0,5', ctx), null);
  assert.equal(footballKey('Qualquer Coisa - Total de golos', 'Acima de 1,5', ctx), null);
  assert.equal(footballKey('Leixões e GD Chaves - Total de golos', 'Acima de 1,5', ctx), null);
});

test('half-restricted markets need explicit half legs', () => {
  assert.equal(footballKey('Resultado correto - 1ª Parte', '1-0', ctx), null);
  assert.equal(footballKey('Empate Anula Aposta - 1ª Parte', 'Leixões', ctx), null);
  // parseBet does not read the "ª" ordinal as a half yet, so these stay null (safe).
  assert.equal(footballKey('Resultado - 1ª Parte', 'Leixões', ctx), null);
  assert.equal(footballKey('Total de golos - 1st Half', 'Over 0.5', ctx), '1H.TOTAL.goals.O.0.5');
});

test('qualified result markets are not full-time 1X2', () => {
  for (const [m, s] of [
    ['Cantos 1X2', '1'], ['Cantos - Resultado', 'Leixões'], ['Cartões - Resultado', '1'],
    ['Resultado nos primeiros 10 minutos', '1'], ['1X2 - 15 minutos', 'X'], ['Resultado do resto do jogo', '1'],
  ] as const) assert.equal(footballKey(m, s, ctx), null, `${m} / ${s}`);
  assert.equal(footballKey('Vencedor (Tempo Regulamentar)', 'Leixões', ctx), 'FT.1X2.H');
});

test('"vence"/"golo" guard works with real word boundaries', () => {
  assert.equal(footballKey('Resultado', 'Leixões vence por 2 golos de diferença', ctx), null);
});

test('team detection is by name, not substring; combos never lose a leg', () => {
  const inter = { home: 'Inter', away: 'Milan' };
  assert.equal(footballKey('Total de golos - Intervalo', 'Mais de 0.5', inter), '1H.TOTAL.goals.O.0.5');
  assert.equal(footballKey('Leixões vence e Total de golos', 'Acima de 2,5', ctx), null);
});

test('Asian totals are not comparable in v1', () => {
  assert.equal(footballKey('Total de Golos Asiático', 'Mais de 2.0', ctx), null);
});
