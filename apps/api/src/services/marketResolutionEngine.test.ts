import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLive, parseBet, resolveMarket, type FixtureResult, type MatchContext } from './marketResolutionEngine';

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

test('bet-builder shorthand "X vence & +1.5 Golos" (2-1, 3 goals)', () => {
  assert.equal(r('SL Benfica vence & +1.5 Golos', 'SL Benfica vence & +1.5 Golos'), 'WON');
  assert.equal(r('SL Benfica vence & +3.5 Golos', 'SL Benfica vence & +3.5 Golos'), 'LOST');
  assert.equal(r('FC Porto vence & +1.5 Golos', 'FC Porto vence & +1.5 Golos'), 'LOST');
  assert.equal(r('Golos', '-3.5 Golos'), 'WON');
  // A handicap line without "golos" must not become a total
  assert.equal(r('Handicap Europeu', '+4'), null);
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

test('unsupported markets, or player markets without events, go to review', () => {
  // FT has no goal list or line-ups: scorer markets can't be settled from it.
  assert.equal(r('Jogador marca e Equipa vence', 'Pavlidis marca e SL Benfica vence'), null);
  assert.equal(r('Marcador ou o seu substituto', 'Pavlidis'), null);
  assert.equal(r('Próximo marcador - Golo 4', 'Pavlidis'), null);
  assert.equal(r('Vencedor da eliminatória', 'SL Benfica'), null);
  assert.equal(r('Mercado inventado', 'qualquer coisa'), null);
});

test('handicap: European (handicap draw is its own outcome) and Asian (whole line pushes)', () => {
  // Benfica 2-1 Porto
  assert.equal(r('Resultado handicap', 'FC Porto (+1)'), 'LOST'); // 2-2 after handicap: the "draw" outcome wins
  assert.equal(r('Resultado handicap', 'FC Porto (+2)'), 'WON');
  assert.equal(r('Handicap', 'SL Benfica -1'), 'LOST');
  assert.equal(r('Handicap asiático', 'SL Benfica -1'), 'VOID');
  assert.equal(r('Handicap asiático', 'SL Benfica -0.5'), 'WON');
  assert.equal(r('Handicap asiático', 'SL Benfica -0.75'), null); // quarter line
});

test('match status: cancelled is void, abandoned/postponed need review, extra time needs 90-minute score', () => {
  assert.equal(r('1X2', '1', { ...FT, statusShort: 'CANC' }), 'VOID');
  assert.equal(r('1X2', '1', { ...FT, statusShort: 'ABD' }), null);
  assert.equal(r('1X2', '1', { ...FT, statusShort: 'PST' }), null);
  const aet = { ...FT, statusShort: 'AET', homeScore: 2, awayScore: 1 };
  assert.equal(r('1X2', 'X', aet), null);
  assert.equal(r('1X2', 'X', { ...aet, regularHomeScore: 1, regularAwayScore: 1 }), 'WON');
});

// ─── Half-restricted and qualified markets (real labels, Leixões v GD Chaves) ───
// Leixões 2-1 GD Chaves, 0-1 at half time (2nd half 2-0): the 1H, 2H and FT readings all differ.
const LX: FixtureResult = { homeScore: 2, awayScore: 1, htHomeScore: 0, htAwayScore: 1, statusShort: 'FT' };
const LX_CTX: MatchContext = { homeNames: ['Leixões'], awayNames: ['GD Chaves'] };
const lx = (market: string, selection: string, f: FixtureResult = LX) => resolveMarket(market, selection, f, LX_CTX);
const legsOf = (market: string, selection: string, ctx: MatchContext = LX_CTX) => parseBet(market, selection, ctx)?.legs ?? null;

test('halves written with ordinals (1ª/2ª Parte, 1º/2º Tempo, 1.ª parte) are read as halves', () => {
  assert.deepEqual(legsOf('Total de golos - 1ª Parte', 'Mais de 0,5'), [{ kind: 'TOTAL', period: '1H', stat: 'goals', over: true, line: 0.5 }]);
  assert.deepEqual(legsOf('Total de Golos Mais/Menos - 2ª Parte', 'Mais de 1,5'), [{ kind: 'TOTAL', period: '2H', stat: 'goals', over: true, line: 1.5 }]);
  assert.deepEqual(legsOf('Resultado - 1º Tempo', 'Leixões'), [{ kind: 'RESULT', period: '1H', outcomes: ['H'] }]);
  assert.deepEqual(legsOf('Resultado - 2.º tempo', 'X'), [{ kind: 'RESULT', period: '2H', outcomes: ['D'] }]);
  assert.deepEqual(legsOf('Resultado - Primeiro Tempo', 'X'), [{ kind: 'RESULT', period: '1H', outcomes: ['D'] }]);
  assert.deepEqual(legsOf('Ambas Marcam - 2ª Parte', 'Sim'), [{ kind: 'BTTS', period: '2H', yes: true }]);
  assert.deepEqual(legsOf('Cantos - 1ª Parte', 'Mais de 4,5'), [{ kind: 'TOTAL', period: '1H', stat: 'corners', over: true, line: 4.5 }]);
  assert.equal(lx('Total de golos - 1ª Parte', 'Mais de 1,5'), 'LOST'); // 1 goal at HT (3 at FT)
  assert.equal(lx('Total de Golos Mais/Menos - 2ª Parte', 'Menos de 2,5'), 'WON'); // 2 in the 2nd half (3 at FT)
  assert.equal(lx('Resultado - 1º Tempo', 'Leixões'), 'LOST'); // 0-1 at HT (Leixões won the match)
  assert.equal(lx('Resultado - 1ª Parte', 'GD Chaves'), 'WON');
  assert.equal(lx('Handicap asiático - 1ª Parte', 'Leixões +0.5'), 'LOST'); // 0-1 at HT
  // "Intervalo/Final" stays HT/FT; "Intervalo" alone is the first half.
  assert.deepEqual(legsOf('Intervalo/Final', 'GD Chaves/Leixões'), [{ kind: 'HTFT', ht: 'A', ft: 'H' }]);
  assert.equal(lx('Total de golos - Intervalo', 'Mais de 0.5'), 'WON');
});

test('half-restricted markets the engine cannot settle by half go to review (null), never full time', () => {
  for (const [m, s] of [
    ['Resultado correto - 1ª Parte', '1-0'], ['Resultado exato - 2ª Parte', '2-0'], ['Empate Anula Aposta - 1ª Parte', 'Leixões'],
    ['Primeira equipa a marcar - 1ª Parte', 'Leixões'], ['Marcador - 1ª Parte', 'Fulano'], ['Remates do jogador - 1ª Parte', 'Fulano Mais de 1,5'],
  ] as const) {
    assert.equal(legsOf(m, s), null, `${m} / ${s}`);
    assert.equal(lx(m, s), null, `${m} / ${s}`);
  }
});

test('qualified result markets (corners, cards, minutes, rest of match, margins) are not the match 1X2', () => {
  for (const [m, s] of [
    ['Cantos 1X2', '1'], ['Cantos - Resultado', 'Leixões'], ['Cartões - Resultado', '1'],
    ['Resultado nos primeiros 10 minutos', '1'], ['1X2 - 15 minutos', 'X'], ['Resultado do resto do jogo', '1'],
    ['Equipa tem 2 golos de vantagem ou vence (tempo reg.)', 'Leixões'], ['Resultado', 'Leixões vence por 2 golos de diferença'],
    ['Vence sem sofrer golos', 'Leixões'], ['Vence ambas as partes', 'Leixões'],
  ] as const) {
    assert.equal(legsOf(m, s), null, `${m} / ${s}`);
    assert.equal(lx(m, s), null, `${m} / ${s}`);
  }
  // Plain results are unchanged.
  assert.equal(lx('Vencedor (Tempo Regulamentar)', 'Leixões'), 'WON');
  assert.equal(lx('Resultado (Tempo Regulamentar)', 'Leixões'), 'WON');
});

test('team totals named by the market ("Equipa da Casa", "<equipa> - Total de golos") are team totals', () => {
  assert.deepEqual(legsOf('Total de Golos da Equipa da Casa', 'Mais de 1,5'), [{ kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 1.5, team: 'H' }]);
  assert.equal(lx('Total de Golos da Equipa da Casa', 'Menos de 2,5'), 'WON'); // Leixões 2 (match total 3)
  assert.equal(lx('Total de golos - Equipa visitante', 'Mais de 1,5'), 'LOST'); // GD Chaves 1
  assert.equal(lx('Leixões - Total de golos', 'Menos de 2,5'), 'WON');
  assert.equal(lx('GD Chaves - Total de golos', 'Mais de 1,5'), 'LOST');
  assert.equal(lx('Total de golos do GD Chaves', 'Mais de 0,5'), 'WON');
  const casaPia: MatchContext = { homeNames: ['Benfica'], awayNames: ['Casa Pia'] };
  assert.deepEqual(legsOf('Total de golos da Casa Pia', 'Mais de 1.5', casaPia), [{ kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 1.5, team: 'A' }]);
  assert.deepEqual(legsOf('Casa Pia - Total de golos', 'Mais de 1.5', casaPia), [{ kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 1.5, team: 'A' }]);
  // A team qualifier that cannot be resolved is never read as the match total.
  for (const m of ['Total de golos - Equipa X', 'Qualquer Coisa - Total de golos', 'Leixões e GD Chaves - Total de golos']) {
    assert.equal(legsOf(m, 'Acima de 1,5'), null, m);
  }
  // Match totals are unchanged.
  assert.equal(lx('Total de golos - acima/abaixo', 'Acima de 2,5'), 'WON');
  assert.equal(lx('Golos - Mais de 2.5', 'Over 2.5'), 'WON');
  assert.equal(lx('Cantos - Mais de 7.5', 'Over 7.5', { ...LX, homeCorners: 5, awayCorners: 4 }), 'WON');
});

test('Asian quarter lines and the draw leg of a 3-way handicap go to review', () => {
  assert.equal(legsOf('Total de Golos Asiático', 'Mais de 2.25'), null);
  assert.equal(legsOf('Total de golos', 'Mais de 2.75'), null);
  assert.equal(lx('Total de Golos Asiático', 'Mais de 2.5'), 'WON'); // half line: same as a normal total
  assert.equal(lx('Total de Golos Asiático', 'Mais de 3.0'), null); // whole line on the number: push, review
  assert.equal(legsOf('Resultado handicap', 'Empate (Leixões -2)'), null);
  assert.equal(lx('Resultado handicap', 'Leixões (-1)'), 'LOST'); // 2-1 → 1-1: the handicap draw wins, not Leixões
});

test('live: a first-half market is decided at half time, from the half-time score', () => {
  const ht = { ...LX, homeScore: 0, awayScore: 1 };
  assert.equal(assessLive('Total de golos - 1ª Parte', 'Mais de 1,5', ht, 'HALFTIME', LX_CTX).decided, 'LOST');
  assert.equal(assessLive('Resultado - 1º Tempo', 'GD Chaves', ht, 'HALFTIME', LX_CTX).decided, 'WON');
});
