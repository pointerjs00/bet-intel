// apps/api/src/jobs/autoSettlementJob.ts
//
// Polls for finished fixtures (status=FINISHED in our DB) in the last 24h,
// finds matching PENDING BoletinItems, resolves each market, then updates
// the parent Boletin status. Emits a socket event + creates a notification
// for each settled boletin.

import { ItemResult } from '@prisma/client';
import { BoletinStatus } from '@betintel/shared';
import { prisma } from '../prisma';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { resolveMarket } from '../services/marketResolutionEngine';
import { emitBoletinResult } from '../sockets';
import { createNotification } from '../services/social/notificationService';
import { logger } from '../utils/logger';

export async function autoSettlementJob(): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const finishedFixtures = await prisma.fixture.findMany({
    where: {
      status: 'FINISHED',
      kickoffAt: { gte: since },
      homeScore: { not: null },
      awayScore: { not: null },
    },
  });

  if (!finishedFixtures.length) return;

  let settled = 0;
  let flagged = 0;

  for (const fixture of finishedFixtures) {
    const matchingItems = await findMatchingItems(fixture);
    if (!matchingItems.length) continue;

    for (const { item, confidence } of matchingItems) {
      const resolution = resolveMarket(item.market, item.selection, {
        homeScore: fixture.homeScore!,
        awayScore: fixture.awayScore!,
        htHomeScore: fixture.htHomeScore,
        htAwayScore: fixture.htAwayScore,
        statusShort: 'FT',
      });

      if (resolution === null) {
        // Unknown market — flag for manual review
        await prisma.boletinItem.update({
          where: { id: item.id },
          data: { needsReview: true },
        });
        flagged++;
        continue;
      }

      await prisma.boletinItem.update({
        where: { id: item.id },
        data: {
          result: resolution as ItemResult,
          needsReview: confidence < 1.0,
          // store the apiFootballId so future re-runs skip exact lookup
          eventExternalId: fixture.apiFootballId ? String(fixture.apiFootballId) : undefined,
        },
      });
      settled++;
    }

    // Recompute boletin status for all boletins touched
    const boletinIds = [...new Set(matchingItems.map(({ item }) => item.boletinId))];
    for (const boletinId of boletinIds) {
      await recomputeBoletinStatus(boletinId);
    }
  }

  if (settled > 0 || flagged > 0) {
    logger.info(`[autoSettlement] Settled ${settled} items, flagged ${flagged} for review`);
  }
}

// ─── Match fixture to pending BoletinItems ────────────────────────────────────

async function findMatchingItems(
  fixture: { id: string; apiFootballId: number | null; homeTeam: string; awayTeam: string; kickoffAt: Date },
): Promise<Array<{ item: any; confidence: number }>> {
  // 1. Exact API-Football ID match (most reliable)
  if (fixture.apiFootballId) {
    const byId = await prisma.boletinItem.findMany({
      where: {
        eventExternalId: String(fixture.apiFootballId),
        result: 'PENDING',
        boletin: { status: 'PENDING' },
      },
    });
    if (byId.length) return byId.map(item => ({ item, confidence: 1.0 }));
  }

  // 2. Fuzzy match by team names + kickoff date ±2h
  const from = new Date(fixture.kickoffAt.getTime() - 2 * 60 * 60 * 1000);
  const to   = new Date(fixture.kickoffAt.getTime() + 2 * 60 * 60 * 1000);

  const candidates = await prisma.boletinItem.findMany({
    where: {
      result: 'PENDING',
      boletin: { status: 'PENDING' },
      kickoffAt: { gte: from, lte: to },
    },
  });

  const homeNorm = normaliseTeamName(fixture.homeTeam);
  const awayNorm = normaliseTeamName(fixture.awayTeam);

  return candidates
    .map(item => ({
      item,
      confidence: computeMatchConfidence(item.homeTeam, item.awayTeam, homeNorm, awayNorm),
    }))
    .filter(({ confidence }) => confidence >= 0.8);
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normaliseTeamName(a).split(' ').filter(w => w.length >= 3));
  const tb = new Set(normaliseTeamName(b).split(' ').filter(w => w.length >= 3));
  if (ta.size === 0) return 0;
  const shared = [...ta].filter(t => tb.has(t)).length;
  return shared / ta.size;
}

function computeMatchConfidence(
  iHome: string, iAway: string,
  fHome: string, fAway: string,
): number {
  return (tokenOverlap(iHome, fHome) + tokenOverlap(iAway, fAway)) / 2;
}

// ─── Recompute Boletin status from item results ────────────────────────────────

async function recomputeBoletinStatus(boletinId: string): Promise<void> {
  const boletin = await prisma.boletin.findUnique({
    where: { id: boletinId },
    include: { items: true, user: { select: { id: true, expoPushToken: true } } },
  });
  if (!boletin || boletin.status !== 'PENDING') return;

  const items = boletin.items;
  const results = items.map(i => i.result);

  // Any PENDING item → not yet fully settled
  if (results.includes('PENDING')) return;

  let newStatus: BoletinStatus;
  let actualReturn: number | null = null;

  if (results.every(r => r === 'VOID')) {
    newStatus = BoletinStatus.VOID;
    actualReturn = Number(boletin.stake);
  } else if (results.includes('LOST')) {
    newStatus = BoletinStatus.LOST;
    actualReturn = 0;
  } else if (results.every(r => r === 'WON')) {
    newStatus = BoletinStatus.WON;
    actualReturn = Number(boletin.potentialReturn);
  } else {
    // Mix of WON + VOID (some selections voided — recalculate odds)
    newStatus = BoletinStatus.PARTIAL;
    const wonItems = items.filter(i => i.result === 'WON');
    const reducedOdds = wonItems.reduce((acc, i) => acc * Number(i.oddValue), 1);
    actualReturn = Number(boletin.stake) * reducedOdds;
  }

  await prisma.boletin.update({
    where: { id: boletinId },
    data: {
      status: newStatus,
      actualReturn: actualReturn !== null ? actualReturn.toFixed(2) : null,
    },
  });

  // Socket + notification
  emitBoletinResult(boletin.userId, {
    boletinId,
    status: newStatus,
    actualReturn: actualReturn !== null ? actualReturn.toFixed(2) : null,
  });

  const statusLabel: Record<BoletinStatus, string> = {
    WON: 'Ganhou',
    LOST: 'Perdeu',
    VOID: 'Anulado',
    PARTIAL: 'Parcialmente ganho',
    PENDING: 'Pendente',
    CASHOUT: 'Cashout',
  };

  await createNotification({
    userId: boletin.userId,
    type: 'BOLETIN_RESULT',
    title: `Boletim ${statusLabel[newStatus]}`,
    body: boletin.name
      ? `O teu boletim "${boletin.name}" foi ${statusLabel[newStatus].toLowerCase()}.`
      : `O teu boletim foi ${statusLabel[newStatus].toLowerCase()}.`,
    data: { boletinId, status: newStatus },
  });
}
