import { Request, Response } from 'express';
import {
  compareTennisCompetitions,
  compareTennisCountries,
  getTennisCountryPrestige,
  getTennisTournamentCountry,
  getTennisTournamentPoints,
  isTennisTournament,
  Sport,
} from '@betintel/shared';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { triggerATPRankingsUpdate } from '../jobs/atpRankingsJob';
import { redis } from '../utils/redis';

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Reference data controller error', { error: err.message, stack: err.stack });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

/** GET /api/reference/competitions — returns all active competitions. */
export async function listCompetitionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const sport = req.query.sport as string | undefined;
    const competitions = await prisma.competition.findMany({
      where: {
        isActive: true,
        ...(sport ? { sport: sport as never } : {}),
      },
      orderBy: [{ sport: 'asc' }, { country: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, country: true, sport: true, tier: true },
    });

    const normalizedCompetitions = competitions.map((competition) => {
      if (competition.sport !== Sport.TENNIS || !isTennisTournament(competition.name)) {
        return competition;
      }

      const country = getTennisTournamentCountry(competition.name, competition.country);
      return {
        ...competition,
        country,
        points: getTennisTournamentPoints(competition.name),
        countryPrestige: getTennisCountryPrestige(country),
      };
    });

    const tennisCountryPoints = new Map<string, number>();
    for (const competition of normalizedCompetitions) {
      if (competition.sport !== Sport.TENNIS) {
        continue;
      }

      const points = 'points' in competition && typeof competition.points === 'number'
        ? competition.points
        : getTennisTournamentPoints(competition.name);
      tennisCountryPoints.set(
        competition.country,
        (tennisCountryPoints.get(competition.country) ?? 0) + points,
      );
    }

    const sortedCompetitions = [...normalizedCompetitions].sort((left, right) => {
      if (left.sport === Sport.TENNIS && right.sport === Sport.TENNIS) {
        const countryComparison = compareTennisCountries(left.country, right.country, tennisCountryPoints);
        if (countryComparison !== 0) {
          return countryComparison;
        }

        return compareTennisCompetitions(left, right);
      }

      return left.sport.localeCompare(right.sport)
        || left.country.localeCompare(right.country, 'pt-PT')
        || left.tier - right.tier
        || left.name.localeCompare(right.name, 'pt-PT');
    }).map((competition) => ({
      ...competition,
      countryPoints: competition.sport === Sport.TENNIS ? (tennisCountryPoints.get(competition.country) ?? 0) : undefined,
      countryOrder: competition.sport === Sport.TENNIS ? getTennisCountryPrestige(competition.country) : undefined,
    }));

    ok(res, sortedCompetitions);
  } catch (err) {
    fail(res, err);
  }
}

/** GET /api/reference/teams — returns teams, optionally filtered by sport or competition. */
export async function listTeamsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { sport, competition, search } = req.query;
    const teams = await prisma.team.findMany({
      where: {
        ...(sport ? { sport: sport as never } : {}),
        ...(competition
          ? { competitions: { some: { competition: { name: competition as string } } } }
          : {}),
        ...(search
          ? { name: { contains: search as string, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, sport: true, country: true },
    });

    if (!teams.some((team) => team.sport === Sport.TENNIS)) {
      ok(res, teams);
      return;
    }

    const photoKeys = teams.map((team) => `atp:photo:${team.name}`);
    const displayNameKeys = teams.map((team) => `atp:display-name:${team.name}`);
    const photoUrls = photoKeys.length > 0 ? await redis.mget(...photoKeys) : [];
    const displayNames = displayNameKeys.length > 0 ? await redis.mget(...displayNameKeys) : [];
    ok(res, teams.map((team, index) => ({
      ...team,
      displayName: displayNames[index] ?? null,
      imageUrl: photoUrls[index] ?? null,
    })));
  } catch (err) {
    fail(res, err);
  }
}

/** GET /api/reference/markets — returns all markets, optionally filtered by sport. */
export async function listMarketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const sport = req.query.sport as string | undefined;
    const markets = await prisma.market.findMany({
      where: {
        OR: [
          ...(sport ? [{ sport: sport as never }] : []),
          { sport: null },
        ],
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, sport: true },
    });
    ok(res, markets);
  } catch (err) {
    fail(res, err);
  }
}

/** POST /api/reference/atp-rankings/refresh — enqueues an immediate ATP rankings update. */
export async function refreshATPRankingsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const job = await triggerATPRankingsUpdate();
    ok(res, { jobId: job.id, message: 'ATP rankings update enqueued' });
  } catch (err) {
    fail(res, err);
  }
}
