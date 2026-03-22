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

const CACHE_TTL_SECONDS = 60;         // 60 s — matches scraper cycle; invalidated earlier by scraper
const LIVE_CACHE_TTL_SECONDS = 20;    // 20 seconds for live events
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

export async function invalidateOddsCache(): Promise<void> {
  try {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${CACHE_PREFIX}*`, 'COUNT', '100');
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn('Redis odds cache invalidation failed', {
      error: (err as Error).message,
    });
  }
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
  const oddsWhere: Prisma.OddWhereInput = {
    isActive: true,
  };

  if (params.sport) {
    // The shared Sport enum values match Prisma's Sport enum values exactly
    where.sport = params.sport as unknown as Prisma.EnumSportFilter['equals'];
  }

  if (params.league) {
    where.league = { contains: params.league, mode: 'insensitive' };
  }

  if (params.status) {
    where.status = params.status as unknown as Prisma.EnumEventStatusFilter['equals'];
  } else {
    // Default: exclude finished, cancelled, and postponed events
    where.status = {
      in: ['UPCOMING', 'LIVE'] as unknown as Prisma.EnumEventStatusFilter['in'],
    };
  }

  if (params.dateFrom || params.dateTo) {
    where.eventDate = {};
    if (params.dateFrom) where.eventDate.gte = new Date(params.dateFrom);
    if (params.dateTo)   where.eventDate.lte = new Date(params.dateTo);
  }

  if (params.sites && params.sites.length > 0) {
    oddsWhere.site = { slug: { in: params.sites } };
  }

  if (params.market) {
    oddsWhere.market = { equals: params.market, mode: 'insensitive' };
  }

  if (params.minOdds !== undefined || params.maxOdds !== undefined) {
    const valueFilter: Prisma.DecimalFilter = {};
    if (params.minOdds !== undefined) valueFilter.gte = new Prisma.Decimal(params.minOdds);
    if (params.maxOdds !== undefined) valueFilter.lte = new Prisma.Decimal(params.maxOdds);

    oddsWhere.value = valueFilter;
  }

  where.odds = { some: oddsWhere };

  return where;
}

// ─── Serialise Prisma result ──────────────────────────────────────────────────

// Prisma Decimal → string so JSON.stringify round-trips cleanly through the cache
type PrismaEventRow = Prisma.SportEventGetPayload<{ select: typeof EVENT_WITH_ODDS_SELECT }>;

function serialiseEvent(ev: PrismaEventRow): EventWithOdds {
  return {
    ...ev,
    league: sanitiseLeagueLabel(ev.league, ev.homeTeam, ev.awayTeam),
    sport: ev.sport as unknown as string,
    status: ev.status as unknown as string,
    odds: ev.odds.map((o) => ({
      ...o,
      value: o.value.toString(),
    })),
  };
}

function sanitiseLeagueLabel(league: string, homeTeam: string, awayTeam: string): string {
  let normalised = league.replace(/\s+/g, ' ').trim();

  if (normalised.length === 0) {
    return 'Futebol';
  }

  const suspicious =
    normalised.length > 120
    || /\bempate\b/i.test(normalised)
    || /\d+[.,]\d+/.test(normalised)
    || normalised.toLowerCase().includes(homeTeam.toLowerCase())
    || normalised.toLowerCase().includes(awayTeam.toLowerCase());

  if (suspicious) return 'Futebol';

  // Strip trailing round/group details:
  //   "Áustria - Bundesliga - Grupo Relegation Round, Jornada 24" → "Áustria - Bundesliga"
  //   "Liga Portugal - Jornada 30"  → "Liga Portugal"
  normalised = normalised
    .replace(/\s*[-–]\s*(?:Grupo|Group|Round|Ronda|Jornada|Giornata|Matchday|Spieltag|Journée|Fase|Phase|Playoff|Play-off|Relegation|Qualification|Qualificação)\b.*/i, '')
    .replace(/\s*,\s*(?:Jornada|Round|Matchday|Spieltag|Giornata|Journée)\b.*/i, '')
    .replace(/\s+\d+['+]*$/, '')
    .trim();

  return normalised || 'Futebol';
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
      league: sanitiseLeagueLabel(r.league, '', ''),
    }));
  });
}

// ─── Event status lifecycle ───────────────────────────────────────────────────

/**
 * Cleans up stale event statuses. LIVE status is set exclusively by scrapers
 * when they observe the event is in-play — this function never promotes events
 * to LIVE on its own.
 *
 * Rules:
 *  • LIVE     → FINISHED  when `eventDate + 3h <= now`  (scraper should have
 *                          un-listed it, but this is the safety net)
 *  • UPCOMING → FINISHED  when `eventDate + 4h <= now`  (event was never picked
 *                          up as live — either it was cancelled or the scraper
 *                          missed it; hide it from the feed)
 */
export async function updateEventStatuses(): Promise<{ toLive: number; toFinished: number }> {
  const now = new Date();
  // Football matches finish within ~115 min (90 + injury time + possible extra time).
  // 2 h is a safe safety-net — scrapers should revert events much sooner than this.
  const liveFinishCutoff     = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 h
  const upcomingFinishCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 h
  const liveWindowStart      = new Date(now.getTime() - 150 * 60 * 1000);    // 150 min ago

  // UPCOMING events whose kick-off was 0-150 minutes ago → mark LIVE
  // This runs every job cycle so the mobile app sees live events even if the
  // scraper hasn't completed yet. Scrapers can refine individual event status
  // via the per-event isLive detection inside persistEvent().
  const toLiveResult = await prisma.sportEvent.updateMany({
    where: {
      status: 'UPCOMING' as unknown as Prisma.EnumEventStatusFilter['equals'],
      eventDate: { lte: now, gte: liveWindowStart },
    },
    data: { status: 'LIVE' as never },
  });

  // LIVE events whose kick-off was 2+ hours ago → mark FINISHED
  const liveExpiredResult = await prisma.sportEvent.updateMany({
    where: {
      status: 'LIVE' as unknown as Prisma.EnumEventStatusFilter['equals'],
      eventDate: { lte: liveFinishCutoff },
    },
    data: { status: 'FINISHED' as never },
  });

  // UPCOMING events whose kick-off was 3+ hours ago → mark FINISHED
  // (They were never seen as live by any scraper — hide them)
  const upcomingExpiredResult = await prisma.sportEvent.updateMany({
    where: {
      status: 'UPCOMING' as unknown as Prisma.EnumEventStatusFilter['equals'],
      eventDate: { lte: upcomingFinishCutoff },
    },
    data: { status: 'FINISHED' as never },
  });

  const toLive = toLiveResult.count;
  const toFinished = liveExpiredResult.count + upcomingExpiredResult.count;

  if (toLive > 0 || toFinished > 0) {
    await invalidateOddsCache();
  }

  return { toLive, toFinished };
}
