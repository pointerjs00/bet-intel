import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tennisKey, basketballKey, canonicalKey } from './canonical';

// REAL labels (docs/analise-2026-11/odds/samples): Lebull tennis "Result" and "Total Games"
// (+ stakeName Over/Under), Betano tennis "Vencedor" and "Vencedor do Set (Set 1)", Lebull NBA
// "Result" and "Handicap" ("Handicap 1"/"Handicap 2"). Cases marked (plausible) were not seen
// verbatim in a sample: either the selection text a future adapter would build, or Portuguese
// wording of markets we only know exist.
const tn = { playerA: 'Ilya Ivashka', playerB: 'Toby Samuel' };
const tb = { playerA: 'Filippo Moroni', playerB: 'Eliakim Coulibaly' };
const nba = { home: 'Los Angeles Lakers', away: 'Phoenix Suns' };

test('tennis: match winner (Lebull "Result", Betano "Vencedor")', () => {
  assert.equal(tennisKey('Result', 'Ilya Ivashka', tn), 'T.WIN.A');
  assert.equal(tennisKey('Result', 'Toby Samuel', tn), 'T.WIN.B');
  assert.equal(tennisKey('Vencedor', 'Filippo Moroni', tb), 'T.WIN.A');
  assert.equal(tennisKey('Vencedor', 'Eliakim Coulibaly', tb), 'T.WIN.B');
  assert.equal(tennisKey('Vencedor do encontro', 'Samuel', tn), 'T.WIN.B'); // (plausible) surname only
});

test('tennis: set winner (Betano "Vencedor do Set (Set 1)")', () => {
  assert.equal(tennisKey('Vencedor do Set (Set 1)', 'Filippo Moroni', tb), 'T.SET1.WIN.A');
  assert.equal(tennisKey('Vencedor do Set (Set 1)', 'Eliakim Coulibaly', tb), 'T.SET1.WIN.B');
  assert.equal(tennisKey('1.º Set - Vencedor', 'Toby Samuel', tn), 'T.SET1.WIN.B'); // (plausible)
  assert.equal(tennisKey('Winner of 2nd set', 'Ilya Ivashka', tn), 'T.SET2.WIN.A'); // (plausible)
});

test('tennis: total games (Lebull "Total Games")', () => {
  assert.equal(tennisKey('Total Games', 'Over 21.5', tn), 'T.GAMES.O.21.5');
  assert.equal(tennisKey('Total Games', 'Under 21.5', tn), 'T.GAMES.U.21.5');
  assert.equal(tennisKey('Total de jogos', 'Mais de 21,5', tn), 'T.GAMES.O.21.5'); // (plausible)
  assert.equal(tennisKey('Total de Jogos Mais/Menos', 'Menos 22.5', tn), 'T.GAMES.U.22.5'); // (plausible)
});

test('tennis: handicap of games, correct score in sets, total sets', () => {
  assert.equal(tennisKey('Handicap de jogos', 'Ilya Ivashka (-3.5)', tn), 'T.GAMES.HCP.A.-3.5');
  assert.equal(tennisKey('Handicap de jogos', 'Toby Samuel +3,5', tn), 'T.GAMES.HCP.B.+3.5');
  assert.equal(tennisKey('Resultado Correto do Encontro', 'Ilya Ivashka vence 2-0', tn), 'T.SETS.2-0');
  assert.equal(tennisKey('Resultado Correto do Encontro', 'Toby Samuel vence 2-1', tn), 'T.SETS.1-2');
  assert.equal(tennisKey('Resultado exacto', '2-0', tn), 'T.SETS.2-0');
  assert.equal(tennisKey('Total de sets', 'Mais de 2,5', tn), 'T.SETSTOTAL.O.2.5');
});

test('tennis: unrecognised or ambiguous labels are null', () => {
  assert.equal(tennisKey('Vencedor', 'Novak Djokovic', tn), null);
  assert.equal(tennisKey('Vencedor', 'Ilya Ivashka vence 2-0', tn), null);
  assert.equal(tennisKey('Total de jogos - Jogador', 'Ilya Ivashka Mais de 10.5', tn), null);
  assert.equal(tennisKey('Total de jogos', 'Ilya Ivashka Mais de 10.5', tn), null);
  assert.equal(tennisKey('Total de jogos do 1.º set', 'Mais de 9.5', tn), null);
  assert.equal(tennisKey('Handicap de sets', 'Ilya Ivashka (-1.5)', tn), null);
  assert.equal(tennisKey('Handicap', 'Ilya Ivashka (-1.5)', tn), null); // games or sets: ambiguous
  assert.equal(tennisKey('Resultado do 1.º set', '6-4', tn), null);
  assert.equal(tennisKey('Tie-break no encontro', 'Sim', tn), null);
  assert.equal(tennisKey('Número de aces', 'Mais de 10.5', tn), null);
  assert.equal(tennisKey('Vencedor do set', 'Ilya Ivashka', tn), null); // set number unknown
  assert.equal(tennisKey('', 'Ilya Ivashka', tn), null);
});

test('basketball: moneyline (Lebull NBA "Result")', () => {
  assert.equal(basketballKey('Result', 'Los Angeles Lakers', nba), 'B.ML.H');
  assert.equal(basketballKey('Result', 'Phoenix Suns', nba), 'B.ML.A');
  assert.equal(basketballKey('Vencedor (incl. prolongamento)', 'Lakers', nba), 'B.ML.H'); // (plausible)
});

test('basketball: regulation-time 1X2', () => {
  assert.equal(basketballKey('Resultado (Tempo Regulamentar)', 'Empate', nba), 'B.1X2.D');
  assert.equal(basketballKey('Resultado (Tempo Regulamentar)', 'Phoenix Suns', nba), 'B.1X2.A');
  assert.equal(basketballKey('Resultado 1X2', '1', nba), 'B.1X2.H');
  assert.equal(basketballKey('Vencedor (sem prolongamento)', 'Lakers', nba), 'B.1X2.H');
  assert.equal(basketballKey('Resultado 1X2 - 1.º Quarto', 'Empate', nba), 'Q1:B.1X2.D');
});

test('basketball: handicap (Lebull "Handicap 1/2")', () => {
  assert.equal(basketballKey('Handicap', 'Handicap 1 (-17.5)', nba), 'B.HCP.H.-17.5');
  assert.equal(basketballKey('Handicap', 'Handicap 2 +17.5', nba), 'B.HCP.A.+17.5');
  assert.equal(basketballKey('Handicap', 'Los Angeles Lakers -5.5', nba), 'B.HCP.H.-5.5');
  assert.equal(basketballKey('Handicap', 'Phoenix Suns (+5,5)', nba), 'B.HCP.A.+5.5');
});

test('basketball: totals, team totals, quarter and half scopes', () => {
  assert.equal(basketballKey('Total', 'Over 220.5', nba), 'B.TOTAL.O.220.5');
  assert.equal(basketballKey('Total de pontos', 'Menos de 220,5', nba), 'B.TOTAL.U.220.5');
  assert.equal(basketballKey('Total - Phoenix Suns', 'Over 110.5', nba), 'B.TEAMTOTAL.A.O.110.5');
  assert.equal(basketballKey('Total por equipa', 'Los Angeles Lakers Mais de 110,5', nba), 'B.TEAMTOTAL.H.O.110.5');
  assert.equal(basketballKey('Total - 1.º Quarto', 'Mais de 52,5', nba), 'Q1:B.TOTAL.O.52.5');
  assert.equal(basketballKey('Total (1st quarter)', 'Under 52.5', nba), 'Q1:B.TOTAL.U.52.5');
  assert.equal(basketballKey('Total de pontos - 1.ª parte', 'Mais de 110.5', nba), 'H1:B.TOTAL.O.110.5');
  assert.equal(basketballKey('Handicap - 2.º Quarto', 'Phoenix Suns (+1.5)', nba), 'Q2:B.HCP.A.+1.5');
});

test('basketball: props, odd/even, unknown scopes, ambiguous results are null', () => {
  assert.equal(basketballKey('Ressaltos - Giannis Antetokounmpo', 'Over 10.5', nba), null);
  assert.equal(basketballKey('Pontos', 'LeBron James Mais de 25.5', nba), null);
  assert.equal(basketballKey('Par/Ímpar', 'Par', nba), null);
  assert.equal(basketballKey('Quarto com mais pontos', '1.º', nba), null);
  assert.equal(basketballKey('Total - 5.º Quarto', 'Mais de 40.5', nba), null);
  assert.equal(basketballKey('Total (sem prolongamento)', 'Over 220.5', nba), null);
  assert.equal(basketballKey('Resultado - 1.º Quarto', 'Los Angeles Lakers', nba), null); // 2-way vs 3-way
  assert.equal(basketballKey('Result', 'Boston Celtics', nba), null);
  assert.equal(basketballKey('Result', 'Los Angeles Lakers -5.5', nba), null);
  assert.equal(basketballKey('Total', 'Over', nba), null);
  assert.equal(basketballKey('', 'Los Angeles Lakers', nba), null);
});

test('canonicalKey dispatches by sport', () => {
  assert.equal(canonicalKey('FOOTBALL', 'Resultado Final', '1', { home: 'Leixões', away: 'GD Chaves' }), 'FT.1X2.H');
  assert.equal(canonicalKey('TENNIS', 'Result', 'Ilya Ivashka', { home: 'Ilya Ivashka', away: 'Toby Samuel' }), 'T.WIN.A');
  assert.equal(canonicalKey('BASKETBALL', 'Result', 'Phoenix Suns', nba), 'B.ML.A');
  assert.equal(canonicalKey('HOCKEY', 'Result', 'Phoenix Suns', nba), null);
});
