/**
 * Odds service — queries and filters odds/events from the database.
 *
 * All read endpoints apply a Redis cache with a 5-minute TTL.
 * Cache keys are deterministic SHA-256 hashes of the serialised query params
 * so that every unique filter combination gets its own cache entry.
 *
 * Cache is intentionally not applied to write paths (the scraper handles
 * cache invalidation by simply letting TTLs expire — odds staleness up to
 * 5 min is acceptable for all non-live use cases).
 * Live events (60 s scrape cadence) use a shorter 30-second TTL.
 */

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { redis } from '../../utils/redis';
import { logger } from '../../utils/logger';
import { Sport, EventStatus } from '@betintel/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OddsFilterParams {
  sites?: string[];
  sport?: Sport;
  league?: string;
  dateFrom?: string;
  dateTo?: string;
  minOdds?: number;
  maxOdds?: number;
  market?: string;
  status?: 'UPCOMING' | 'LIVE';
  page: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OddsFeedResult {
  events: EventWithOdds[];
  meta: PaginationMeta;
}

/** A SportEvent row joined with all its active Odd rows (across sites). */
export interface EventWithOdds {
  id: string;
  externalId: string | null;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  odds: OddRow[];
}

export interface OddRow {
  id: string;
  market: string;
  selection: string;
  value: string;  // Decimal serialised as string to preserve precision
  scrapedAt: Date;
  updatedAt: Date;
  site: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300;        // 5 minutes
const LIVE_CACHE_TTL_SECONDS = 30;    // 30 seconds for live events
const CACHE_PREFIX = 'odds:';

function cacheKey(namespace: string, params: unknown): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 16); // 16 hex chars is plenty for a namespace-scoped key
  return `${CACHE_PREFIX}${namespace}:${hash}`;
}

async function withCache<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    // Redis failure must not block the request — fall through to DB
    logger.warn('Redis cache read failed', { key, error: (err as Error).message });
  }

  const result = await fn();

  try {
    await redis.setex(key, ttl, JSON.stringify(result));
  } catch (err) {
    logger.warn('Redis cache write failed', { key, error: (err as Error).message });
  }

  return result;
}

// ─── Prisma select shape ──────────────────────────────────────────────────────

const EVENT_WITH_ODDS_SELECT = {
  id: true,
  externalId: true,
  sport: true,
  league: true,
  homeTeam: true,
  awayTeam: true,
  eventDate: true,
  status: true,
  homeScore: true,
  awayScore: true,
  odds: {
    where: { isActive: true },
    select: {
      id: true,
      market: true,
      selection: true,
      value: true,
      scrapedAt: true,
      updatedAt: true,
      site: {
        select: { id: true, slug: true, name: true, logoUrl: true },
      },
    },
    orderBy: [
      { market: 'asc' as const },
      { site: { slug: 'asc' as const } },
      { selection: 'asc' as const },
    ],
  },
} satisfies Prisma.SportEventSelect;

// ─── Building the WHERE clause ────────────────────────────────────────────────

function buildEventWhere(params: OddsFilterParams): Prisma.SportEventWhereInput {
  const where: Prisma.SportEventWhereInput = {};

  if (params.sport) {
    // The shared Sport enum values match Prisma's Sport enum values exactly
    where.sport = params.sport as unknown as Prisma.EnumSportFilter['equals'];
  }

  if (params.league) {
    where.league = { contains: params.league, mode: 'insensitive' };
  }

  if (params.status) {
    where.status = params.status as unknown as Prisma.EnumEventStatusFilter['equals'];
  }

  if (params.dateFrom || params.dateTo) {
    where.eventDate = {};
    if (params.dateFrom) where.eventDate.gte = new Date(params.dateFrom);
    if (params.dateTo)   where.eventDate.lte = new Date(params.dateTo);
  }

  // Filter by specific betting sites — at least one odd from those sites must exist
  if (params.sites && params.sites.length > 0) {
    where.odds = {
      some: {
        isActive: true,
        site: { slug: { in: params.sites } },
      },
    };
  }

  // filter by market — at least one active odd for that market must exist
  if (params.market) {
    const oddsCondition: Prisma.OddListRelationFilter = {
      some: {
        isActive: true,
        market: { equals: params.market, mode: 'insensitive' },
        ...(params.sites && params.sites.length > 0
          ? { site: { slug: { in: params.sites } } }
          : {}),
      },
    };
    // Merge with existing odds condition if sites filter already set
    where.odds = oddsCondition;
  }

  // Odds value range: at least one active odd within the range must exist
  if (params.minOdds !== undefined || params.maxOdds !== undefined) {
    const valueFilter: Prisma.DecimalFilter = {};
    if (params.minOdds !== undefined) valueFilter.gte = new Prisma.Decimal(params.minOdds);
    if (params.maxOdds !== undefined) valueFilter.lte = new Prisma.Decimal(params.maxOdds);

    where.odds = {
      some: {
        isActive: true,
        value: valueFilter,
        ...(params.market ? { market: { equals: params.market, mode: 'insensitive' } } : {}),
        ...(params.sites && params.sites.length > 0
          ? { site: { slug: { in: params.sites } } }
          : {}),
      },
    };
  }

  return where;
}

// ─── Serialise Prisma result ──────────────────────────────────────────────────

// Prisma Decimal → string so JSON.stringify round-trips cleanly through the cache
type PrismaEventRow = Prisma.SportEventGetPayload<{ select: typeof EVENT_WITH_ODDS_SELECT }>;

function serialiseEvent(ev: PrismaEventRow): EventWithOdds {
  return {
    ...ev,
    sport: ev.sport as unknown as string,
    status: ev.status as unknown as string,
    odds: ev.odds.map((o) => ({
      ...o,
      value: o.value.toString(),
    })),
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Returns a paginated odds feed with optional filters.
 * Results are cached in Redis for 5 minutes.
 */
export async function getOddsFeed(params: OddsFilterParams): Promise<OddsFeedResult> {
  const key = cacheKey('feed', params);
  const ttl = params.status === 'LIVE' ? LIVE_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;

  return withCache(key, ttl, async () => {
    const where = buildEventWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [events, total] = await prisma.$transaction([
      prisma.sportEvent.findMany({
        where,
        select: EVENT_WITH_ODDS_SELECT,
        orderBy: { eventDate: 'asc' },
        skip,
        take: params.limit,
      }),
      prisma.sportEvent.count({ where }),
    ]);

    return {
      events: events.map(serialiseEvent),
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  });
}

/**
 * Returns a single event with all active odds across all sites.
 */
export async function getEventWithOdds(eventId: string): Promise<EventWithOdds | null> {
  const key = cacheKey('event', { eventId });

  return withCache(key, CACHE_TTL_SECONDS, async () => {
    const ev = await prisma.sportEvent.findUnique({
      where: { id: eventId },
      select: EVENT_WITH_ODDS_SELECT,
    });
    return ev ? serialiseEvent(ev) : null;
  });
}

/**
 * Returns all currently LIVE events with their active odds.
 */
export async function getLiveEvents(): Promise<EventWithOdds[]> {
  const key = cacheKey('live', {});

  return withCache(key, LIVE_CACHE_TTL_SECONDS, async () => {
    const events = await prisma.sportEvent.findMany({
      where: { status: 'LIVE' as unknown as Prisma.EnumEventStatusFilter['equals'] },
      select: EVENT_WITH_ODDS_SELECT,
      orderBy: { eventDate: 'asc' },
    });
    return events.map(serialiseEvent);
  });
}

/**
 * Returns all active betting sites.
 */
export async function getActiveSites() {
  const key = cacheKey('sites', {});

  return withCache(key, CACHE_TTL_SECONDS, async () => {
    return prisma.bettingSite.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        baseUrl: true,
        lastScraped: true,
      },
      orderBy: { name: 'asc' },
    });
  });
}

/**
 * Returns all distinct sports that have at least one active event.
 */
export async function getAvailableSports(): Promise<string[]> {
  const key = cacheKey('sports', {});

  return withCache(key, CACHE_TTL_SECONDS, async () => {
    const rows = await prisma.sportEvent.findMany({
      where: { status: { not: 'CANCELLED' as unknown as Prisma.EnumEventStatusFilter['equals'] } },
      select: { sport: true },
      distinct: ['sport'],
      orderBy: { sport: 'asc' },
    });
    return rows.map((r) => r.sport as unknown as string);
  });
}

/**
 * Returns all distinct leagues for a given sport (optional).
 * If `sport` is omitted, returns leagues across all sports.
 */
export async function getLeagues(sport?: Sport): Promise<{ sport: string; league: string }[]> {
  const key = cacheKey('leagues', { sport });

  return withCache(key, CACHE_TTL_SECONDS, async () => {
    const where: Prisma.SportEventWhereInput = {
      status: { not: 'CANCELLED' as unknown as Prisma.EnumEventStatusFilter['equals'] },
    };
    if (sport) {
      where.sport = sport as unknown as Prisma.EnumSportFilter['equals'];
    }

    const rows = await prisma.sportEvent.findMany({
      where,
      select: { sport: true, league: true },
      distinct: ['sport', 'league'],
      orderBy: [{ sport: 'asc' }, { league: 'asc' }],
    });

    return rows.map((r) => ({
      sport: r.sport as unknown as string,
      league: r.league,
    }));
  });
}
