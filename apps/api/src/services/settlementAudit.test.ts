import test from 'node:test';
import assert from 'node:assert/strict';
import { isSuspect, reauditItem, type AuditFixture, type AuditItem } from './settlementAudit';

// Leixões 2-1 GD Chaves, 0-1 at half time.
const FX: AuditFixture = { homeTeam: 'Leixões SC', awayTeam: 'GD Chaves', status: 'FINISHED', homeScore: 2, awayScore: 1, htHomeScore: 0, htAwayScore: 1 };
const item = (market: string, selection: string, result: string): AuditItem => ({ market, selection, result, homeTeam: 'Leixões', awayTeam: 'GD Chaves' });

test('suspect patterns: misread labels yes, plain labels no', () => {
  for (const [m, s] of [
    ['Total de golos - 1ª Parte', 'Mais de 0,5'], ['Resultado - 1º Tempo', 'Leixões'], ['Cantos 1X2', '1'],
    ['Resultado nos primeiros 10 minutos', '1'], ['Total de Golos da Equipa da Casa', 'Mais de 1,5'],
    ['Leixões - Total de golos', 'Acima de 1,5'], ['Total de Golos Asiático', 'Mais de 2,25'], ['Resultado handicap', 'Empate (Leixões -2)'],
  ]) assert.equal(isSuspect(m!, s!), true, `${m} / ${s}`);
  for (const [m, s] of [
    ['Resultado (Tempo Regulamentar)', 'Leixões'], ['Total de golos - acima/abaixo', 'Acima de 2,5'],
    ['Intervalo/Final (HT/FT)', 'Leixões vence ao intervalo e no final'], ['As duas equipas marcam', 'Sim'],
  ]) assert.equal(isSuspect(m!, s!), false, `${m} / ${s}`);
});

test('a first-half total settled on the full-time score is reported with its new result', () => {
  // Old reading: FT 3 goals > 1.5 → WON. Correct: 1 goal at half time → LOST.
  assert.deepEqual(reauditItem(item('Total de golos - 1ª Parte', 'Mais de 1,5', 'WON'), FX), { kind: 'CHANGED', now: 'LOST' });
  assert.deepEqual(reauditItem(item('Resultado - 1º Tempo', 'GD Chaves', 'LOST'), FX), { kind: 'CHANGED', now: 'WON' });
  // A stored result that was already right stays.
  assert.deepEqual(reauditItem(item('Total de golos - 1ª Parte', 'Mais de 1,5', 'LOST'), FX), { kind: 'SAME' });
});

test('unsupported markets and missing data are reported as going to review, not as a new result', () => {
  assert.equal(reauditItem(item('Cantos 1X2', '1', 'WON'), FX).kind, 'REVIEW');
  assert.equal(reauditItem(item('Total de golos - 1ª Parte', 'Mais de 1,5', 'WON'), null).kind, 'REVIEW');
  assert.equal(reauditItem(item('Total de golos - 1ª Parte', 'Mais de 1,5', 'WON'), { ...FX, htHomeScore: null, htAwayScore: null }).kind, 'REVIEW');
  assert.equal(reauditItem(item('Total de golos - 1ª Parte', 'Mais de 1,5', 'WON'), { ...FX, status: 'LIVE' }).kind, 'REVIEW');
});

test('suspect patterns: 3-way handicap draw "X (…)", margins "por N", and combos misread before Task 12', () => {
  for (const [m, s] of [
    ['Resultado handicap', 'X (Leixões -1)'], ['Resultado', 'Leixões por 2'],
    ['Leixões vence e ambas marcam', 'Sim'], ['Leixões marca', 'Não'], ['As duas equipas marcam/Total de golos', 'Sim'],
    ['Resultado/Ambas marcam', 'Leixões / Sim'], ['Leixões marca em ambas as partes', 'Sim'],
  ]) assert.equal(isSuspect(m!, s!), true, `${m} / ${s}`);
  // Checked on the selection only: a market that merely contains "x (" or "por 2" is not flagged by these.
  for (const [m, s] of [['Ambas Equipas Marcam', 'Sim'], ['Resultado (Tempo Regulamentar)', 'Empate']]) {
    assert.equal(isSuspect(m!, s!), false, `${m} / ${s}`);
  }
});

test('a "<team> vence e ambas marcam" item settled on BTTS alone is reported with its new result', () => {
  // Old reading: BTTS only → WON. Correct: GD Chaves lost 2-1 → LOST.
  assert.deepEqual(reauditItem(item('GD Chaves vence e ambas marcam', 'Sim', 'WON'), FX), { kind: 'CHANGED', now: 'LOST' });
  assert.deepEqual(reauditItem(item('GD Chaves marca', 'Sim', 'WON'), FX), { kind: 'SAME' });
});

test('review round 1: a negated team-scoring combo is re-audited with the negation', () => {
  // 2-1: GD Chaves scored, so "Leixões vence e GD Chaves não marca" is LOST.
  assert.deepEqual(reauditItem(item('Leixões vence e GD Chaves não marca', 'Sim', 'WON'), FX), { kind: 'CHANGED', now: 'LOST' });
  assert.equal(reauditItem(item('Apenas Leixões marca', 'Sim', 'WON'), FX).kind, 'REVIEW');
});
