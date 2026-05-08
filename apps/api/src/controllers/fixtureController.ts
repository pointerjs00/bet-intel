import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import type { LiveScorePayload } from '../jobs/liveScoreJob';

const LIVE_SHORT   = new Set(['1H','2H','HT','ET','BT','P','LIVE','INT','SUSP']);
const FINISH_SHORT = new Set(['FT','AET','PEN','ABD','AWD','WO','CANC']);

/**
 * For every fixture that has an apiFootballId, fetch the live:score:{id} key
 * from Redis (written by liveScoreJob every minute) and overlay scores/status.
 * This ensures the REST response always reflects the latest live data even when
 * the DB hasn't been updated yet.
 */
async function overlayLiveScores(fixtures: any[]): Promise<void> {
  const withId = fixtures.filter((f) => f.apiFootballId != null);
  if (!withId.length) return;
  const keys = withId.map((f) => `live:score:${f.apiFootballId}`);
  const values = await redis.mget(...keys).catch(() => [] as (string | null)[]);
  for (let i = 0; i < withId.length; i++) {
    const raw = values[i];
    if (!raw) continue;
    try {
      const live: LiveScorePayload = JSON.parse(raw);
      const f = withId[i];
      f.homeScore      = live.homeGoals;
      f.awayScore      = live.awayGoals;
      f.elapsedMinutes = live.elapsed;
      f.status = FINISH_SHORT.has(live.statusShort) ? 'FINISHED'
               : LIVE_SHORT.has(live.statusShort)   ? 'LIVE'
               : f.status;
    } catch { /* malformed cache — skip */ }
  }
}

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

// Strip ≤2-char tokens (fc, ac, sc, gd, cd, de, …) and return the remaining words.
// "gil vicente fc" → ["gil","vicente"]   "gd estoril praia" → ["estoril","praia"]
function teamTokens(normKey: string): string[] {
  return normKey.split(' ').filter(w => w.length > 2);
}

// True when both names refer to the same club despite abbreviation differences.
// Uses a subset check: if the shorter token-set is fully contained in the longer one
// the names are considered equivalent.
// "sc braga" tokens=["braga"] ⊆ "sporting clube de braga" tokens=["sporting","clube","braga"] ✓
function teamsMatch(normA: string, normB: string): boolean {
  if (normA === normB) return true;
  const tokA = teamTokens(normA);
  const tokB = teamTokens(normB);
  if (tokA.length === 0 || tokB.length === 0) return false;
  const [smaller, larger] = tokA.length <= tokB.length
    ? [tokA, new Set(tokB)]
    : [tokB, new Set(tokA)];
  return smaller.every(w => (larger as Set<string>).has(w));
}

// When both a CSV-sourced record (no apiFootballId) and an API-Football record
// exist for the same match, keep only the API-Football one.
function deduplicateFixtures(fixtures: any[]): any[] {
  // Group by (competition, UTC date) so comparisons stay scoped
  const groups = new Map<string, any[]>();
  for (const f of fixtures) {
    const dateStr = (f.kickoffAt as Date).toISOString().slice(0, 10);
    const groupKey = `${f.competition}|${dateStr}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(f);
  }

  const toRemove = new Set<string>();

  for (const group of groups.values()) {
    const withApiId    = group.filter(f => f.apiFootballId != null);
    const withoutApiId = group.filter(f => f.apiFootballId == null);
    if (withApiId.length === 0 || withoutApiId.length === 0) continue;

    for (const apiF of withApiId) {
      const homeNorm = (apiF.homeTeamNormKey ?? apiF.homeTeam.toLowerCase()) as string;
      const awayNorm = (apiF.awayTeamNormKey ?? apiF.awayTeam.toLowerCase()) as string;
      for (const csvF of withoutApiId) {
        if (toRemove.has(csvF.id)) continue;
        const csvHome = (csvF.homeTeamNormKey ?? csvF.homeTeam.toLowerCase()) as string;
        const csvAway = (csvF.awayTeamNormKey ?? csvF.awayTeam.toLowerCase()) as string;
        if (teamsMatch(homeNorm, csvHome) && teamsMatch(awayNorm, csvAway)) {
          toRemove.add(csvF.id);
        }
      }
    }
  }

  return toRemove.size > 0 ? fixtures.filter(f => !toRemove.has(f.id)) : fixtures;
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Fixture controller error', { error: err.message, stack: err.stack });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

/**
 * Normalise season strings so both API-Football format ("2025") and the
 * legacy OpenFootball format ("2025-26") resolve to the same DB rows.
 * DB rows from API-Football are stored with season = "2025".
 */
function normaliseSeason(season: string | undefined): string | undefined {
  if (!season) return undefined;
  return season.includes('-') ? season.split('-')[0] : season;
}

// ─── GET /api/fixtures ────────────────────────────────────────────────────────

/**
 * Paginated fixture list with optional filters.
 * Used by the boletim builder and search flows — NOT by the fixtures screen
 * (which uses /upcoming and /recent instead).
 */
export async function listFixturesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const {
      competition,
      from,
      to,
      team,
      sport,
      season,
      status,
    } = req.query as Record<string, string | undefined>;

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to
      ? new Date(to)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Parse status filter — accepts comma-separated list e.g. "FINISHED,LIVE"
    const statusFilter = status
      ? status.split(',').map((s) => s.trim().toUpperCase())
      : undefined;

    const fixtures = await prisma.fixture.findMany({
      where: {
        sport: sport ?? 'FOOTBALL',
        // Only filter by season if explicitly provided — normalise format
        ...(season ? { season: normaliseSeason(season) } : {}),
        kickoffAt: { gte: fromDate, lte: toDate },
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        ...(competition
          ? { competition: { contains: competition, mode: 'insensitive' } }
          : {}),
        ...(team
          ? {
              OR: [
                { homeTeam: { contains: team, mode: 'insensitive' } },
                { awayTeam: { contains: team, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5000,
    });

    ok(res, deduplicateFixtures(fixtures));
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/fixtures/upcoming ───────────────────────────────────────────────

/**
 * Upcoming SCHEDULED fixtures for the next N days.
 * Redis-cached for 1 hour per (days, team) combo.
 * Called by useUpcomingFixtures(14) from the fixtures screen.
 */
export async function upcomingFixturesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawDays = parseInt((req.query.days as string) ?? '14', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 14;
    const team = req.query.team as string | undefined;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: { in: ['SCHEDULED', 'LIVE'] },
        kickoffAt: { gte: startOfToday, lte: until },
        ...(team
          ? {
              OR: [
                { homeTeam: { contains: team, mode: 'insensitive' } },
                { awayTeam: { contains: team, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5000,
    });

    const deduped = deduplicateFixtures(fixtures);
    await overlayLiveScores(deduped);
    ok(res, deduped);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/fixtures/recent ─────────────────────────────────────────────────

/**
 * Recent fixtures for the past N days: FINISHED, LIVE, and past-due SCHEDULED
 * (weekly sync means matches often stay SCHEDULED after they end).
 * Redis-cached for 15 minutes. Called by useRecentFixtures(3) from fixtures screen.
 */
export async function recentFixturesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawDays = parseInt((req.query.days as string) ?? '3', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 30) : 3;
    const team = req.query.team as string | undefined;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const now = new Date();

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: { in: ['FINISHED', 'LIVE', 'SCHEDULED'] },
        kickoffAt: { gte: since, lte: now },
        ...(team
          ? {
              OR: [
                { homeTeam: { contains: team, mode: 'insensitive' } },
                { awayTeam: { contains: team, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { kickoffAt: 'desc' },
      take: 500,
    });

    const deduped = deduplicateFixtures(fixtures);
    await overlayLiveScores(deduped);
    ok(res, deduped);
  } catch (err) {
    fail(res, err);
  }
}