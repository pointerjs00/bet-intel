// apps/api/src/jobs/autoSettlementJob.ts
//
// Settles PENDING football BoletinItems against fixtures that ended (or were cancelled,
// abandoned or postponed) in the last 48h:
//  - exact fixture-ID match, or a fuzzy team-name match with full confidence → resolve the market;
//  - uncertain matches, unknown markets and abandoned/postponed games → needsReview, no result written;
//  - cancelled games → VOID.
// Boletim status, notifications and socket events go through boletinService so the
// rules (freebets, VOID, PARTIAL) live in one place.

import { ItemResult, type BoletinItem } from '@prisma/client';
import { prisma } from '../prisma';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { resolveMarket, type Resolution } from '../services/marketResolutionEngine';
import { recomputeBoletinAfterItemChange } from '../services/boletins/boletinService';
import { logger } from '../utils/logger';

const SETTLEABLE_STATUSES = ['FINISHED', 'CANCELLED', 'ABANDONED', 'POSTPONED'];
/** Postponed games are only flagged for review once they are clearly not being played. */
const POSTPONED_REVIEW_AFTER_MS = 6 * 60 * 60 * 1000;

type FixtureRow = {
  id: string;
  apiFootballId: number | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  htHomeScore: number | null;
  htAwayScore: number | null;
};

export async function autoSettlementJob(): Promise<void> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Plan #22: start from the pending items (usually none for a single user) instead of
  // querying per finished fixture. Two queries in total, matching happens in memory.
  const pending = await prisma.boletinItem.findMany({
    where: {
      result: 'PENDING',
      sport: 'FOOTBALL',
      boletin: { status: 'PENDING' },
      OR: [{ kickoffAt: { gte: new Date(since.getTime() - 2 * 60 * 60 * 1000) } }, { eventExternalId: { not: null } }],
    },
  });
  if (!pending.length) return;

  const fixtures: FixtureRow[] = await prisma.fixture.findMany({
    where: { status: { in: SETTLEABLE_STATUSES }, kickoffAt: { gte: since } },
    select: {
      id: true, apiFootballId: true, homeTeam: true, awayTeam: true, kickoffAt: true, status: true,
      homeScore: true, awayScore: true, htHomeScore: true, htAwayScore: true,
    },
  });
  if (!fixtures.length) return;

  const stats = await prisma.fixtureStats.findMany({
    where: { fixtureId: { in: fixtures.map((f) => f.id) } },
    select: { fixtureId: true, homeCorners: true, awayCorners: true },
  });
  const cornersByFixture = new Map(stats.map((s) => [s.fixtureId, s]));

  let settled = 0;
  let flagged = 0;
  const touchedBoletins = new Set<string>();
  const handled = new Set<string>();

  for (const fixture of fixtures) {
    if (fixture.status === 'FINISHED' && (fixture.homeScore === null || fixture.awayScore === null)) continue;
    if (fixture.status === 'POSTPONED' && Date.now() - fixture.kickoffAt.getTime() < POSTPONED_REVIEW_AFTER_MS) continue;

    const matches = findMatchingItems(fixture, pending);
    for (const { item, confidence } of matches) {
      if (handled.has(item.id)) continue; // settled or flagged against another fixture in this run
      handled.add(item.id);
      if (item.needsReview && item.eventExternalId) continue; // already flagged for this fixture

      let resolution: Resolution | null = null;
      if (fixture.status === 'CANCELLED') {
        resolution = 'VOID';
      } else if (fixture.status === 'FINISHED') {
        const corners = cornersByFixture.get(fixture.id);
        resolution = resolveMarket(item.market, item.selection, {
          homeScore: fixture.homeScore!,
          awayScore: fixture.awayScore!,
          htHomeScore: fixture.htHomeScore,
          htAwayScore: fixture.htAwayScore,
          statusShort: 'FT',
          homeCorners: corners?.homeCorners ?? null,
          awayCorners: corners?.awayCorners ?? null,
        }, {
          homeNames: [item.homeTeam, fixture.homeTeam],
          awayNames: [item.awayTeam, fixture.awayTeam],
        });
      }

      const externalId = fixture.apiFootballId ? String(fixture.apiFootballId) : undefined;
      if (resolution === null || confidence < 1) {
        // Unknown market, missing data, uncertain team match, abandoned/postponed game: a human decides.
        await prisma.boletinItem.update({
          where: { id: item.id },
          data: { needsReview: true, eventExternalId: externalId },
        });
        flagged++;
        continue;
      }

      await prisma.boletinItem.update({
        where: { id: item.id },
        data: { result: resolution as ItemResult, needsReview: false, eventExternalId: externalId },
      });
      touchedBoletins.add(item.boletinId);
      settled++;
    }
  }

  for (const boletinId of touchedBoletins) {
    try {
      await recomputeBoletinAfterItemChange(boletinId);
    } catch (err) {
      logger.warn('[autoSettlement] Failed to recompute boletim', {
        boletinId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (settled > 0 || flagged > 0) {
    logger.info(`[autoSettlement] Settled ${settled} items, flagged ${flagged} for review`);
  }
}

// ─── Match fixture to pending BoletinItems ────────────────────────────────────

/** Pending items that belong to this fixture (pure; `pending` is loaded once per run). */
export function findMatchingItems(fixture: FixtureRow, pending: BoletinItem[]): Array<{ item: BoletinItem; confidence: number }> {
  // 1. Exact API-Football ID match (most reliable)
  if (fixture.apiFootballId) {
    const id = String(fixture.apiFootballId);
    const byId = pending.filter((item) => item.eventExternalId === id);
    if (byId.length) return byId.map((item) => ({ item, confidence: 1 }));
  }

  // 2. Fuzzy match by team names + kickoff ±2h
  const from = fixture.kickoffAt.getTime() - 2 * 60 * 60 * 1000;
  const to = fixture.kickoffAt.getTime() + 2 * 60 * 60 * 1000;
  const candidates = pending.filter((item) => {
    const t = item.kickoffAt?.getTime();
    return t !== undefined && t >= from && t <= to;
  });

  return candidates
    .map((item) => ({
      item,
      confidence: computeMatchConfidence(item.homeTeam, item.awayTeam, fixture.homeTeam, fixture.awayTeam),
    }))
    .filter(({ confidence }) => confidence >= 0.8);
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normaliseTeamName(a).split(' ').filter((w) => w.length >= 3));
  const tb = new Set(normaliseTeamName(b).split(' ').filter((w) => w.length >= 3));
  if (ta.size === 0) return 0;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / ta.size;
}

function computeMatchConfidence(iHome: string, iAway: string, fHome: string, fAway: string): number {
  return (tokenOverlap(iHome, fHome) + tokenOverlap(iAway, fAway)) / 2;
}
