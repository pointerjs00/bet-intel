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
import { triggerWTARankingsUpdate } from '../jobs/wtaRankingsJob';
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

interface CompetitionFallbackSeed {
  id: string;
  name: string;
  country: string;
  sport: string;
  tier: number;
  teams: string[];
}

// Hotfix for environments seeded before Liga 3 was added to the reference data.
const COMPETITION_FALLBACKS: CompetitionFallbackSeed[] = [
  {
    id: 'fallback:competition:football:portugal:liga-3',
    name: 'Liga 3',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'SC Covilhã',
      'Varzim SC',
      'Académica de Coimbra',
      'SC Braga B',
      'Sporting CP B',
      'Fafe',
      '1º Dezembro',
      'Amarante FC',
      'CD Anadia',
      'Caldas SC',
      'Lusitânia FC',
      'Oliveira do Hospital',
      'AD Sanjoanense',
      'CD Trofense',
      'Länk Vilaverdense',
      'Atlético CP',
      'Lusitânia Lourosa',
      'São João de Ver',
      'União de Santarém',
      'CF Os Belenenses',
    ],
  },
];

function normalizeReferenceValue(value: string): string {
  return value.trim().toLocaleLowerCase('pt-PT');
}

function createFallbackSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function mergeFallbackCompetitions(
  competitions: Array<{ id: string; name: string; country: string; sport: string; tier: number }>,
  sport?: string,
): Array<{ id: string; name: string; country: string; sport: string; tier: number }> {
  if (sport && sport !== Sport.FOOTBALL) {
    return competitions;
  }

  const existingKeys = new Set(
    competitions.map((competition) =>
      normalizeReferenceValue(`${competition.sport}::${competition.country}::${competition.name}`),
    ),
  );

  const merged = [...competitions];
  for (const fallback of COMPETITION_FALLBACKS) {
    const key = normalizeReferenceValue(`${fallback.sport}::${fallback.country}::${fallback.name}`);
    if (!existingKeys.has(key)) {
      merged.push({
        id: fallback.id,
        name: fallback.name,
        country: fallback.country,
        sport: fallback.sport,
        tier: fallback.tier,
      });
    }
  }

  return merged;
}

function mergeFallbackTeams(
  teams: Array<{ id: string; name: string; sport: string; country: string | null }>,
  sport?: string,
  competitionName?: string,
): Array<{ id: string; name: string; sport: string; country: string | null }> {
  if (!competitionName) {
    return teams;
  }

  const fallback = COMPETITION_FALLBACKS.find(
    (candidate) => normalizeReferenceValue(candidate.name) === normalizeReferenceValue(competitionName),
  );

  if (!fallback || (sport && sport !== fallback.sport)) {
    return teams;
  }

  const existingNames = new Set(teams.map((team) => normalizeReferenceValue(team.name)));
  const merged = [...teams];

  for (const teamName of fallback.teams) {
    if (existingNames.has(normalizeReferenceValue(teamName))) {
      continue;
    }

    merged.push({
      id: `fallback:team:${createFallbackSlug(fallback.name)}:${createFallbackSlug(teamName)}`,
      name: teamName,
      sport: fallback.sport,
      country: fallback.country,
    });
  }

  merged.sort((left, right) => left.name.localeCompare(right.name, 'pt-PT'));
  return merged;
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

    const mergedCompetitions = mergeFallbackCompetitions(competitions, sport);

    const normalizedCompetitions = mergedCompetitions.map((competition) => {
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

    const mergedTeams = mergeFallbackTeams(
      teams,
      typeof sport === 'string' ? (sport as Sport) : undefined,
      typeof competition === 'string' ? competition : undefined,
    );

    if (!mergedTeams.some((team) => team.sport === Sport.TENNIS)) {
      ok(res, mergedTeams);
      return;
    }

    // Determine Redis prefix: WTA Tour competition → wta:, otherwise atp:
    const isWtaQuery = typeof competition === 'string' && competition.toLowerCase().includes('wta');
    const prefix = isWtaQuery ? 'wta' : 'atp';

    // Consolidate 3 Redis mget calls into 1 for lower latency
    const allEnrichmentKeys = mergedTeams.flatMap((team) => [
      `${prefix}:photo:${team.name}`,
      `${prefix}:display-name:${team.name}`,
      `${prefix}:rank:${team.name}`,
    ]);

    const allValues = allEnrichmentKeys.length > 0
      ? await redis.mget(...allEnrichmentKeys)
      : [];

    const enriched = mergedTeams.map((team, index) => {
      let imageUrl = allValues[index * 3] ?? null;
      // Ensure photo URL is absolute — relative paths from WTA scraper are unusable on mobile
      if (imageUrl && imageUrl.startsWith('/')) {
        imageUrl = `https://www.wtatennis.com${imageUrl}`;
      }
      const normalizedImageUrl = imageUrl?.toLowerCase() ?? null;
      // Discard flag/resource paths and generic WTA branding assets that are not player faces.
      if (normalizedImageUrl && (
        normalizedImageUrl.includes('/flags/')
        || normalizedImageUrl.includes('/resources/')
        || normalizedImageUrl.endsWith('.svg')
        || normalizedImageUrl.includes('wta_web_quick-links_')
        || normalizedImageUrl.includes('home-share_')
        || normalizedImageUrl.includes('pif-rankings-logo')
        || normalizedImageUrl.includes('wta_logo')
        || normalizedImageUrl.includes('star_joint-logo')
      )) {
        imageUrl = null;
      }
      return {
        ...team,
        displayName: allValues[index * 3 + 1] ?? null,
        imageUrl,
        rank: allValues[index * 3 + 2] ? parseInt(allValues[index * 3 + 2]!, 10) : null,
      };
    });

    // Sort tennis players by ranking (nulls at the end)
    enriched.sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return a.name.localeCompare(b.name, 'pt');
    });

    ok(res, enriched);
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

/** POST /api/reference/wta-rankings/refresh — enqueues an immediate WTA rankings update. */
export async function refreshWTARankingsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const job = await triggerWTARankingsUpdate();
    ok(res, { jobId: job.id, message: 'WTA rankings update enqueued' });
  } catch (err) {
    fail(res, err);
  }
}
