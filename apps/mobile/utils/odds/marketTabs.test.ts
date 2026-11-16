import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByTab, isTop, tabLabel, tabOf } from './marketTabs';
import type { ComparedSelection } from './types';

const r = (key: string | null, market = 'm'): ComparedSelection => ({ key, label: key ?? 'x', market, prices: { betclic: { odds: 2, suspended: false } }, best: 'betclic', labels: { betclic: { market, selection: 'x' } } });
test('tabOf maps key prefixes', () => {
  assert.equal(tabOf('FT.1X2.H'), 'resultado'); assert.equal(tabOf('HT.DC.HD'), 'resultado'); assert.equal(tabOf('FT.DNB.A'), 'resultado'); assert.equal(tabOf('HTFT.HD'), 'resultado'); assert.equal(tabOf('B.ML.H'), 'resultado');
  assert.equal(tabOf('FT.TOTAL.GOALS.O.2.5'), 'golos'); assert.equal(tabOf('Q1:B.TOTAL.O.50.5'), 'golos'); assert.equal(tabOf('T.GAMES.O.22.5'), 'golos');
  assert.equal(tabOf('FT.BTTS.Y'), 'btts'); assert.equal(tabOf('FT.HCP.EU.H.-1'), 'handicap');
  assert.equal(tabOf('SCORER.ANY.KANE'), 'marcadores'); assert.equal(tabOf('FT.FIRSTGOAL.H'), 'marcadores');
  assert.equal(tabOf('FT.SCORE.2-1'), 'exato'); assert.equal(tabOf('T.SETS.2-0'), 'exato');
  assert.equal(tabOf(null), 'outros'); assert.equal(tabOf('FT.PARITY.EVEN'), 'outros');
});
test('groupByTab: top first, only non-empty tabs, cards by market', () => {
  const rows = [r('FT.1X2.H', 'Resultado Final'), r('FT.1X2.D', 'Resultado Final'), r('FT.TOTAL.GOALS.O.2.5', 'Total'), r(null, '+2 Golos')];
  const tabs = groupByTab(rows, 'FOOTBALL');
  assert.deepEqual(tabs.map((t) => t.tab), ['top', 'resultado', 'golos', 'outros']);
  assert.deepEqual(tabs[1]!.cards.map((c) => [c.title, c.rows.length]), [['Resultado Final', 2]]);
});
test('isTop: 1X2/ML, DC, BTTS and the 2.5 goals line (football)', () => {
  assert.ok(isTop(r('FT.1X2.H'), 'FOOTBALL')); assert.ok(isTop(r('FT.TOTAL.GOALS.U.2.5'), 'FOOTBALL'));
  assert.ok(!isTop(r('FT.TOTAL.GOALS.O.3.5'), 'FOOTBALL')); assert.ok(!isTop(r('HT.1X2.H'), 'FOOTBALL'));
  assert.ok(isTop(r('B.ML.H'), 'BASKETBALL')); assert.ok(isTop(r('T.WIN.A'), 'TENNIS'));
});
test('tabLabel renames golos per sport', () => {
  assert.equal(tabLabel('golos', 'BASKETBALL'), 'Pontos'); assert.equal(tabLabel('golos', 'TENNIS'), 'Jogos'); assert.equal(tabLabel('golos', 'FOOTBALL'), 'Golos');
});
test('combos, ANY and ET keys go to outros and never Top', () => {
  for (const k of ['FT.1X2.H+FT.BTTS.Y', 'ANY(FT.1X2.H+FT.BTTS.Y)', 'ET:FT.1X2.H']) {
    assert.equal(tabOf(k), 'outros'); assert.ok(!isTop(r(k), 'FOOTBALL'));
  }
});
