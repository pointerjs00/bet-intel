import test from 'node:test';
import assert from 'node:assert/strict';
import { BoletinStatus, ItemResult, Prisma, Sport } from '@prisma/client';
import { __statsTesting, type StatsBoletinRecord } from './statsService';

const { buildSummary, buildStatsBundle, computeRollingWindow } = __statsTesting;
const D = (v: number) => new Prisma.Decimal(v);

let seq = 0;
interface Leg { odd: number; result: ItemResult; selection?: string; market?: string; home?: string; away?: string }

function boletin(opts: {
  stake: number;
  status: BoletinStatus;
  legs: Leg[];
  actualReturn?: number | null;
  cashout?: number;
  freebet?: boolean;
  date?: string;
}): StatsBoletinRecord {
  const id = `b${++seq}`;
  const totalOdds = opts.legs.reduce((acc, l) => acc * l.odd, 1);
  const date = new Date(opts.date ?? '2026-10-01T18:00:00Z');
  return {
    id,
    userId: 'u1',
    name: null,
    siteSlug: 'betclic',
    stake: D(opts.stake),
    totalOdds: D(totalOdds),
    potentialReturn: D(Number((opts.stake * totalOdds).toFixed(2))),
    status: opts.status,
    actualReturn: opts.actualReturn == null ? null : D(opts.actualReturn),
    cashoutAmount: opts.cashout == null ? null : D(opts.cashout),
    notes: null,
    isPublic: false,
    isFreebet: opts.freebet ?? false,
    betDate: date,
    createdAt: date,
    updatedAt: date,
    items: opts.legs.map((l, i) => ({
      id: `${id}-i${i}`,
      boletinId: id,
      homeTeam: l.home ?? 'FC Porto',
      awayTeam: l.away ?? 'SL Benfica',
      competition: 'Liga Portugal Betclic',
      sport: Sport.FOOTBALL,
      market: l.market ?? 'Resultado Final',
      selection: l.selection ?? '1',
      oddValue: D(l.odd),
      result: l.result,
      kickoffAt: date,
      eventExternalId: null,
      needsReview: false,
    })),
  };
}

test('summary: P&L, ROI and win rate only count settled money', () => {
  const rows = [
    boletin({ stake: 10, status: BoletinStatus.WON, actualReturn: 20, legs: [{ odd: 2, result: ItemResult.WON }] }),
    boletin({ stake: 10, status: BoletinStatus.LOST, actualReturn: 0, legs: [{ odd: 3, result: ItemResult.LOST }] }),
    boletin({ stake: 5, status: BoletinStatus.PENDING, legs: [{ odd: 1.5, result: ItemResult.PENDING }] }),
  ];
  const s = buildSummary(rows, 'all');
  assert.equal(s.totalBoletins, 3);
  assert.equal(s.settledBoletins, 2);
  assert.equal(s.pendingBoletins, 1);
  assert.equal(s.totalStaked, 25);
  assert.equal(s.settledStake, 20);
  assert.equal(s.totalReturned, 20);
  assert.equal(s.profitLoss, 0);
  assert.equal(s.roi, 0);
  assert.equal(s.winRate, 50);
});

test('summary: void boletins are excluded from money and averages', () => {
  const rows = [
    boletin({ stake: 10, status: BoletinStatus.WON, actualReturn: 25, legs: [{ odd: 2.5, result: ItemResult.WON }] }),
    boletin({ stake: 50, status: BoletinStatus.VOID, actualReturn: 50, legs: [{ odd: 1.8, result: ItemResult.VOID }] }),
  ];
  const s = buildSummary(rows, 'all');
  assert.equal(s.voidBoletins, 1);
  assert.equal(s.totalStaked, 10);
  assert.equal(s.profitLoss, 15);
  assert.equal(s.roi, 150);
  assert.equal(s.averageStake, 10);
});

test('summary: freebet stake is not real money, its return is profit', () => {
  const rows = [
    boletin({ stake: 5, status: BoletinStatus.WON, actualReturn: 10, freebet: true, legs: [{ odd: 3, result: ItemResult.WON }] }),
    boletin({ stake: 10, status: BoletinStatus.LOST, actualReturn: 0, legs: [{ odd: 2, result: ItemResult.LOST }] }),
  ];
  const s = buildSummary(rows, 'all');
  assert.equal(s.totalStaked, 10);
  assert.equal(s.settledStake, 10);
  assert.equal(s.profitLoss, 0);
  assert.equal(s.freebetSummary.totalFreebets, 1);
  assert.equal(s.freebetSummary.profitLoss, 10);
});

test('summary: cashout uses the cashed amount when no actual return is stored', () => {
  const rows = [boletin({ stake: 10, status: BoletinStatus.CASHOUT, cashout: 14, legs: [{ odd: 3, result: ItemResult.PENDING }] })];
  const s = buildSummary(rows, 'all');
  assert.equal(s.settledBoletins, 1);
  assert.equal(s.totalReturned, 14);
  assert.equal(s.profitLoss, 4);
  assert.equal(s.roi, 40);
});

test('summary: home/away and favourite/underdog split per selection', () => {
  const rows = [
    boletin({ stake: 10, status: BoletinStatus.WON, actualReturn: 18, legs: [{ odd: 1.8, result: ItemResult.WON, selection: '1' }] }),
    boletin({ stake: 10, status: BoletinStatus.LOST, actualReturn: 0, legs: [{ odd: 3.5, result: ItemResult.LOST, selection: 'SL Benfica' }] }),
  ];
  const s = buildSummary(rows, 'all');
  assert.equal(s.homeBets, 1);
  assert.equal(s.homeROI, 80);
  assert.equal(s.awayBets, 1);
  assert.equal(s.awayROI, -100);
  assert.equal(s.favouriteBets, 1);
  assert.equal(s.favouriteWinRate, 100);
  assert.equal(s.underdogBets, 1);
  assert.equal(s.underdogWinRate, 0);
});

test('bundle: odds-range and market breakdowns split stake across legs', () => {
  const rows = [
    boletin({
      stake: 10,
      status: BoletinStatus.WON,
      actualReturn: 30,
      legs: [
        { odd: 1.4, result: ItemResult.WON, market: 'Resultado Final' },
        { odd: 2.2, result: ItemResult.WON, market: 'Ambas Marcam', selection: 'Sim' },
      ],
    }),
  ];
  const b = buildStatsBundle(rows, 'all');
  const low = b.byOddsRange.find((r) => r.key === 'lt-1.5');
  const mid = b.byOddsRange.find((r) => r.key === '2.0-3.0');
  assert.equal(low?.totalStaked, 5);
  assert.equal(mid?.totalStaked, 5);
  assert.equal(b.byMarket.length, 2);
  const totalMarketPnl = b.byMarket.reduce((acc, r) => acc + r.profitLoss, 0);
  assert.equal(Math.round(totalMarketPnl * 100) / 100, 20);
  assert.equal(b.bestBoletins.length, 1);
});

test('rolling window: last N resolved boletins', () => {
  const resolved = [
    { status: BoletinStatus.LOST, stake: D(10), actualReturn: D(0) },
    { status: BoletinStatus.WON, stake: D(10), actualReturn: D(25) },
    { status: BoletinStatus.VOID, stake: D(10), actualReturn: D(10) },
  ];
  const w = computeRollingWindow(resolved, 2);
  assert.equal(w.count, 2);
  assert.equal(w.wonCount, 1);
  assert.equal(w.voidCount, 1);
  assert.equal(w.profitLoss, 15);
  assert.equal(w.winRate, 100);
  assert.deepEqual(w.results, ['WON', 'VOID']);
  assert.equal(computeRollingWindow([], 10).count, 0);
});
