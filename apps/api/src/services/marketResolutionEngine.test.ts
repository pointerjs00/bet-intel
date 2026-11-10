import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMarket, type FixtureResult, type MatchContext } from './marketResolutionEngine';

// Benfica 2-1 Porto, 1-0 at half time (2nd half 1-1). 3 goals, both teams scored.
const FT: FixtureResult = { homeScore: 2, awayScore: 1, htHomeScore: 1, htAwayScore: 0, statusShort: 'FT' };
const CTX: MatchContext = { homeNames: ['SL Benfica', 'Benfica'], awayNames: ['FC Porto', 'Porto'] };
const r = (market: string, selection: string, f: FixtureResult = FT, ctx: MatchContext = CTX) => resolveMarket(market, selection, f, ctx);

test('match result: codes, words and team names (Betclic "Resultado (Tempo Regulamentar)")', () => {
  assert.equal(r('Resultado Final (1X2)', '1'), 'WON');
  assert.equal(r('Resultado Final (1X2)', 'X'), 'LOST');
  assert.equal(r('1X2', '2'), 'LOST');
  assert.equal(r('Resultado (Tempo Regulamentar)', 'SL Benfica'), 'WON');
  assert.equal(r('Resultado (Tempo Regulamentar)', 'FC Porto'), 'LOST');
  assert.equal(r('Resultado (Tempo Regulamentar)', 'Empate'), 'LOST');
  assert.equal(r('Resultado - Primeira Parte', 'Benfica'), 'WON');
  assert.equal(r('Resultado ao Intervalo', 'X'), 'LOST');
});

test('unknown team name in selection is never guessed', () => {
  assert.equal(r('Resultado (Tempo Regulamentar)', 'Estugarda'), null);
  assert.equal(resolveMarket('Resultado (Tempo Regulamentar)', 'SL Benfica', FT), null);
});

test('double chance in all formats', () => {
  assert.equal(r('Dupla Chance', '1X'), 'WON');
  assert.equal(r('Hipótese Dupla', 'X2'), 'LOST');
  assert.equal(r('Dupla Hipótese', '12'), 'WON');
  assert.equal(r('Resultado duplo', 'FC Porto ou empate'), 'LOST');
  assert.equal(r('Resultado duplo', 'Benfica ou empate'), 'WON');
});

test('goal totals: full time, first half, second half, selection-only lines', () => {
  assert.equal(r('Golos - Mais de 2.5', 'Over 2.5'), 'WON');
  assert.equal(r('Golos - Mais de 3.5', 'Under 3.5'), 'WON');
  assert.equal(r('Total de golos - acima/abaixo', 'Acima de 2,5'), 'WON');
  assert.equal(r('Total de golos - acima/abaixo', 'Abaixo de 2,5'), 'LOST');
  assert.equal(r('Mais/Menos 2.5', 'Mais'), 'WON');
  assert.equal(r('Total de golos - Primeira Parte', 'Abaixo de 1,5'), 'WON');
  assert.equal(r('Golos ao Intervalo - Mais de 0.5', 'Over 0.5'), 'WON');
  assert.equal(r('Golos ao Intervalo - Mais de 1.5', 'Over 1.5'), 'LOST');
  assert.equal(r('Total de golos - Segunda Parte', 'Acima de 1,5'), 'WON');
});

test('regression #1: corners and cards are not settled from goals', () => {
  assert.equal(r('Cantos - Mais de 7.5', 'Over 7.5'), null);
  assert.equal(r('Cantos - Mais de 1.5', 'Over 1.5'), null);
  assert.equal(r('Cartões - Mais de 3.5', 'Over 3.5'), null);
  const withCorners = { ...FT, homeCorners: 6, awayCorners: 5 };
  assert.equal(r('Cantos - Mais de 9.5', 'Over 9.5', withCorners), 'WON');
  assert.equal(r('Acima de 9,5 cantos (prolongamento incluído)', 'Acima de 9,5 cantos', withCorners), 'WON');
});

test('both teams to score, incl. first half and combined markets', () => {
  assert.equal(r('Ambas as Equipas Marcam', 'Sim'), 'WON');
  assert.equal(r('As duas equipas marcam', 'Não'), 'LOST');
  assert.equal(r('Primeira Parte - Ambas Marcam', 'Sim'), 'LOST'); // regression: away did not score in 1st half
  assert.equal(r('As duas equipas marcam/Total de golos', 'Sim e Acima de 2,5'), 'WON');
  assert.equal(r('Ambas Marcam + Total de Golos Mais de 3.5', 'Sim'), 'LOST'); // regression: 3 goals
  assert.equal(r('Ambas equipas marcam e Acima de 2,5 golos', 'Sim'), 'WON');
  assert.equal(r('As duas equipas marcam ou Acima de 2,5 golos', 'Sim', { ...FT, awayScore: 0 }), 'LOST');
  assert.equal(r('As duas equipas marcam ou Acima de 2,5 golos', 'Sim', { ...FT, homeScore: 3, awayScore: 0 }), 'WON');
});

test('Betclic combined result + goals selections', () => {
  assert.equal(r('Resultado/Golos - acima/abaixo', 'SL Benfica vence e Acima de 2,5 golos'), 'WON');
  assert.equal(r('Resultado/Golos - acima/abaixo', 'FC Porto vence e Acima de 1,5 golos'), 'LOST');
  assert.equal(r('Resultado duplo/Golos - acima/abaixo', 'FC Porto vence ou empata e Acima de 1,5 golos (tempo reg.)'), 'LOST');
  assert.equal(r('Resultado duplo/Golos - acima/abaixo', 'SL Benfica vence ou empata e Acima de 1,5 golos (tempo reg.)'), 'WON');
  assert.equal(r('Resultado duplo/Golos - acima/abaixo', 'Benfica ou FC Porto vence e Acima de 1,5 golos (tempo reg.)'), 'WON');
  assert.equal(r('Resultado duplo/Golos - acima/abaixo', 'FC Porto / Empate & Acima de 1,5'), 'LOST');
});

test('HT/FT', () => {
  assert.equal(r('Intervalo/Final (HT/FT)', 'SL Benfica vence ao intervalo e no final'), 'WON');
  assert.equal(r('Resultado ao intervalo/final', 'Empate / FC Porto'), 'LOST');
  assert.equal(r('Resultado ao Intervalo/Final & Total de golos', 'SL Benfica vence intervalo/final e Acima de 2,5 golos'), 'WON');
});

test('correct score and draw no bet', () => {
  assert.equal(r('Resultado Exato', '2-1'), 'WON');
  assert.equal(r('Resultado Correto', '1:1'), 'LOST');
  assert.equal(r('Empate Anula Aposta', 'Benfica', { ...FT, awayScore: 2 }), 'VOID');
});

test('unsupported markets go to review', () => {
  assert.equal(r('Jogador marca e Equipa vence', 'Pavlidis marca e SL Benfica vence'), null);
  assert.equal(r('Resultado handicap', 'FC Porto (+1)'), null);
  assert.equal(r('Marcador ou o seu substituto', 'Pavlidis'), null);
  assert.equal(r('Próximo marcador - Golo 4', 'Pavlidis'), null);
  assert.equal(r('Mercado inventado', 'qualquer coisa'), null);
});

test('match status: cancelled is void, abandoned/postponed need review, extra time needs 90-minute score', () => {
  assert.equal(r('1X2', '1', { ...FT, statusShort: 'CANC' }), 'VOID');
  assert.equal(r('1X2', '1', { ...FT, statusShort: 'ABD' }), null);
  assert.equal(r('1X2', '1', { ...FT, statusShort: 'PST' }), null);
  const aet = { ...FT, statusShort: 'AET', homeScore: 2, awayScore: 1 };
  assert.equal(r('1X2', 'X', aet), null);
  assert.equal(r('1X2', 'X', { ...aet, regularHomeScore: 1, regularAwayScore: 1 }), 'WON');
});
