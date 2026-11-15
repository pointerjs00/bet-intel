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

// ─── Combinations: every leg is read, or the bet goes to review (Task 12) ───

test('combo named by the market with a "Sim" selection keeps every leg; "Não" goes to review', () => {
  const winBtts = [{ kind: 'RESULT', period: 'FT', outcomes: ['H'] }, { kind: 'BTTS', period: 'FT', yes: true }];
  assert.deepEqual(legsOf('Leixões vence e ambas marcam', 'Sim'), winBtts);
  assert.deepEqual(legsOf('Leixões vence e ambas as equipas marcam', 'Sim'), winBtts);
  assert.deepEqual(legsOf('Ambas marcam e Leixões vence', 'Sim'), [winBtts[1], winBtts[0]]);
  assert.deepEqual(legsOf('Leixões vence e mais de 2,5 golos', 'Sim'), [
    { kind: 'RESULT', period: 'FT', outcomes: ['H'] }, { kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 2.5 },
  ]);
  assert.equal(lx('Leixões vence e ambas marcam', 'Sim'), 'WON'); // 2-1
  assert.equal(lx('GD Chaves vence e ambas marcam', 'Sim'), 'LOST'); // BTTS yes, but GD Chaves lost
  // The negation of a combination is not a combination of negations.
  for (const [m, s] of [
    ['Leixões vence e ambas marcam', 'Não'], ['Ambas Equipas Marcam e Acima de 2,5 golos', 'Não'],
    ['Resultado e ambas marcam', 'Sim'], ['Leixões vence e ambas marcam - 1ª Parte', 'Sim'],
  ] as const) assert.equal(legsOf(m, s), null, `${m} / ${s}`);
});

test('"<equipa> marca" / Sim|Não is that team over/under 0.5 goals, never a scorer named "sim"', () => {
  const tt = (team: 'H' | 'A', over: boolean, period = 'FT') => [{ kind: 'TOTAL', period, stat: 'goals', over, line: 0.5, team }];
  assert.deepEqual(legsOf('Leixões marca', 'Sim'), tt('H', true));
  assert.deepEqual(legsOf('Leixões marca', 'Não'), tt('H', false));
  assert.deepEqual(legsOf('GD Chaves marca', 'Sim'), tt('A', true));
  assert.deepEqual(legsOf('Leixões - Marca', 'Sim'), tt('H', true));
  assert.deepEqual(legsOf('Equipa da casa marca', 'Sim'), tt('H', true));
  assert.deepEqual(legsOf('Equipa visitante marca', 'Não'), tt('A', false));
  assert.deepEqual(legsOf('Leixões marca - 1ª Parte', 'Sim'), tt('H', true, '1H'));
  assert.equal(lx('GD Chaves marca', 'Não'), 'LOST');
  assert.equal(lx('Leixões marca - 1ª Parte', 'Sim'), 'LOST'); // 0-1 at HT
  // Not a known team (or not one team): review.
  for (const m of ['Equipa X marca', 'Fulano marca', 'Leixões marca em ambas as partes']) {
    assert.equal(legsOf(m, 'Sim'), null, m);
  }
});

test('combos with different periods read each leg\'s own period, or go to review when the scope is ambiguous', () => {
  const R = (period: string, side = 'H') => ({ kind: 'RESULT', period, outcomes: [side] });
  const T = (period: string, line: number) => ({ kind: 'TOTAL', period, stat: 'goals', over: true, line });
  assert.deepEqual(legsOf('Resultado ao Intervalo & Total de golos', 'Leixões & Mais de 1,5'), [R('1H'), T('FT', 1.5)]);
  assert.deepEqual(legsOf('Resultado 1ª Parte e Resultado Final', 'GD Chaves e Leixões'), [R('1H', 'A'), R('FT')]);
  assert.deepEqual(legsOf('Total de golos 1ª parte e Resultado', 'Mais de 0,5 e Leixões'), [T('1H', 0.5), R('FT')]);
  assert.deepEqual(legsOf('Resultado ao intervalo e ambas marcam', 'X e Sim'), [R('1H', 'D'), { kind: 'BTTS', period: 'FT', yes: true }]);
  assert.deepEqual(legsOf('Criar Aposta', 'Leixões vence - 1ª Parte & Mais de 2,5 - Jogo'), [R('1H'), T('FT', 2.5)]);
  assert.equal(lx('Resultado ao Intervalo & Total de golos', 'GD Chaves & Mais de 2,5'), 'WON'); // 0-1 at HT, 3 goals
  // One market for the whole combo: its period applies to every leg (unchanged).
  assert.deepEqual(legsOf('Resultado - 1ª Parte', 'Leixões e Mais de 0,5'), [R('1H'), T('1H', 0.5)]);
  // A period written only at the end (or start) could scope the whole combo: review.
  for (const [m, s] of [
    ['Criar Aposta', 'Leixões vence & Mais de 2,5 - 1ª Parte'], ['Resultado e Total de golos - 1ª Parte', 'Leixões e Mais de 0,5'],
    ['Criar Aposta', 'Leixões vence - 1ª Parte & Mais de 2,5'],
  ] as const) assert.equal(legsOf(m, s), null, `${m} / ${s}`);
  // A single selection with its own period is read with it.
  assert.deepEqual(legsOf('Criar Aposta', 'Leixões vence - 1ª Parte'), [R('1H')]);
  assert.equal(legsOf('Resultado - 1ª Parte', 'Leixões vence - 2ª Parte'), null); // contradicts the market
});

test('a result+BTTS selection written with "/" is not reduced to the result leg', () => {
  assert.equal(legsOf('Resultado/Ambas marcam', 'Leixões / Sim'), null);
});

test('"Total de golos do jogo / da partida / do encontro" is the match total', () => {
  for (const m of ['Total de golos do jogo', 'Total de golos da partida', 'Total de golos do encontro', 'Total de Golos do Jogo']) {
    assert.deepEqual(legsOf(m, 'Mais de 2,5'), [{ kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 2.5 }], m);
  }
  assert.equal(lx('Total de golos do jogo', 'Mais de 2,5'), 'WON');
});

test('a single answer to a market whose pieces name different periods, or a margin inside a "Sim" combo, goes to review', () => {
  assert.equal(legsOf('Resultado ao intervalo e Total de golos', 'Mais de 1,5'), null);
  assert.equal(legsOf('Leixões vence por 2 e ambas marcam', 'Sim'), null);
  assert.equal(legsOf('Leixões vence por 2 golos ou mais', 'Sim'), null);
  // A selection that names its own half is read with it.
  assert.deepEqual(legsOf('Resultado', 'Leixões vence ao intervalo'), [{ kind: 'RESULT', period: '1H', outcomes: ['H'] }]);
});

test('review round 1: negated or qualified "<equipa> marca" is never read as that team scoring', () => {
  const tt = (team: 'H' | 'A', over: boolean) => [{ kind: 'TOTAL', period: 'FT', stat: 'goals', over, line: 0.5, team }];
  assert.deepEqual(legsOf('Leixões não marca', 'Sim'), tt('H', false));
  assert.deepEqual(legsOf('Leixões - Não marca', 'Sim'), tt('H', false));
  assert.deepEqual(legsOf('GD Chaves não marca', 'Sim'), tt('A', false));
  assert.deepEqual(legsOf('Leixões não marca', 'Não'), tt('H', true));
  assert.equal(lx('Leixões não marca', 'Sim'), 'LOST'); // Leixões scored 2
  assert.deepEqual(legsOf('Marcador', 'Leixões não marca'), tt('H', false));
  assert.equal(legsOf('Marcador', 'Apenas Leixões marca'), null);
  for (const [m, s] of [
    ['Apenas Leixões marca', 'Sim'], ['Só o Leixões marca', 'Sim'], ['Leixões sem marcar', 'Sim'], ['Leixões em branco', 'Sim'],
    ['Leixões marca nenhum golo', 'Sim'], ['Nenhuma equipa marca', 'Sim'], ['Ambas não marcam', 'Sim'],
    ['Marcador', 'Leixões Fulano'],
  ] as const) assert.equal(legsOf(m, s), null, `${m} / ${s}`);
});

test('review round 1: combos with a negated team piece keep the negation, or go to review', () => {
  assert.deepEqual(legsOf('Leixões vence e GD Chaves não marca', 'Sim'), [
    { kind: 'RESULT', period: 'FT', outcomes: ['H'] }, { kind: 'TOTAL', period: 'FT', stat: 'goals', over: false, line: 0.5, team: 'A' },
  ]);
  assert.equal(lx('Leixões vence e GD Chaves não marca', 'Sim'), 'LOST'); // GD Chaves scored
  assert.deepEqual(legsOf('Leixões marca e GD Chaves não marca', 'Sim'), [
    { kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 0.5, team: 'H' }, { kind: 'TOTAL', period: 'FT', stat: 'goals', over: false, line: 0.5, team: 'A' },
  ]);
  assert.equal(legsOf('Apenas Leixões marca e vence', 'Sim'), null);
  assert.deepEqual(legsOf('Leixões vence e GD Chaves marca', 'Sim'), [
    { kind: 'RESULT', period: 'FT', outcomes: ['H'] }, { kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 0.5, team: 'A' },
  ]);
  // A bare "Empate" piece of a Sim-combo is the draw.
  assert.deepEqual(legsOf('Empate e ambas marcam', 'Sim'), [{ kind: 'RESULT', period: 'FT', outcomes: ['D'] }, { kind: 'BTTS', period: 'FT', yes: true }]);
});

test('review round 1: multi-part selections are never read as one team leg', () => {
  for (const [m, s] of [
    ['Resultado/Total de golos', 'Leixões / Mais de 2,5'], ['Resultado/Total de golos', 'Leixões/Mais de 2,5'],
    ['Resultado / Total de golos', 'Leixões / Mais de 2,5'], ['Marcador / Resultado', 'Fulano / Leixões'],
    ['Marcador e Resultado', 'Fulano e Leixões'], ['Resultado/Ambas marcam', 'Empate / Sim'], ['1X2/Ambas marcam', '1/Sim'],
    ['Marcador', 'Sim'],
  ] as const) assert.equal(legsOf(m, s), null, `${m} / ${s}`);
  // Unchanged: HT/FT, double chance and plain team totals.
  assert.deepEqual(legsOf('Intervalo/Final', 'Leixões/Leixões'), [{ kind: 'HTFT', ht: 'H', ft: 'H' }]);
  assert.deepEqual(legsOf('Resultado duplo/Golos - acima/abaixo', 'Leixões / Empate & Acima de 1,5')?.[0], { kind: 'RESULT', period: 'FT', outcomes: ['H', 'D'] });
  assert.deepEqual(legsOf('Total de golos', 'Leixões Mais de 1,5'), [{ kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 1.5, team: 'H' }]);
  assert.deepEqual(legsOf('Marcador a qualquer momento', 'Leixões'), [{ kind: 'TOTAL', period: 'FT', stat: 'goals', over: true, line: 0.5, team: 'H' }]);
});
