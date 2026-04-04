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
  search?: string;
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
  liveClock: string | null;
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
const CACHE_VERSION_KEY = 'odds:__version__';

/** Monotonically increasing version counter — included in cache keys so that
 *  incrementing it instantly makes all old keys unreachable (they'll expire via
 *  TTL naturally). This is O(1) instead of the O(n) SCAN + DEL approach. */
let _cacheVersion: number | null = null;

async function getCacheVersion(): Promise<number> {
  if (_cacheVersion !== null) return _cacheVersion;
  try {
    const raw = await redis.get(CACHE_VERSION_KEY);
    _cacheVersion = raw ? parseInt(raw, 10) : 0;
  } catch {
    _cacheVersion = 0;
  }
  return _cacheVersion;
}

function cacheKey(namespace: string, params: unknown): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 16); // 16 hex chars is plenty for a namespace-scoped key
  const v = _cacheVersion ?? 0;
  return `${CACHE_PREFIX}v${v}:${namespace}:${hash}`;
}

async function withCache<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  // Ensure version is loaded at least once
  if (_cacheVersion === null) await getCacheVersion();

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

/** Invalidates all odds cache entries by bumping the version counter.
 *  Old keys naturally expire via TTL — no SCAN/DEL needed. O(1) operation. */
export async function invalidateOddsCache(): Promise<void> {
  try {
    const newVersion = await redis.incr(CACHE_VERSION_KEY);
    _cacheVersion = newVersion;
  } catch (err) {
    // Fallback: just bump in-memory version so this process uses new keys
    _cacheVersion = (_cacheVersion ?? 0) + 1;
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
  liveClock: true,
  odds: {
    where: {
      isActive: true,
      site: { isActive: true },
    },
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
    site: { isActive: true },
  };

  if (params.sport) {
    // The shared Sport enum values match Prisma's Sport enum values exactly
    where.sport = params.sport as unknown as Prisma.EnumSportFilter['equals'];
  }

  if (params.league) {
    where.league = { equals: params.league, mode: 'insensitive' };
  }

  if (params.search) {
    const term = params.search.trim();
    if (term.length > 0) {
      where.OR = [
        { homeTeam: { contains: term, mode: 'insensitive' } },
        { awayTeam: { contains: term, mode: 'insensitive' } },
      ];
    }
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
    || (homeTeam.length > 0 && normalised.toLowerCase().includes(homeTeam.toLowerCase()))
    || (awayTeam.length > 0 && normalised.toLowerCase().includes(awayTeam.toLowerCase()));

  if (suspicious) return 'Futebol';

  // Strip trailing round/group details and bullet-separated phase suffixes:
  //   "Áustria - Bundesliga - Grupo Relegation Round, Jornada 24" → "Áustria - Bundesliga"
  //   "Liga Portugal - Jornada 30"  → "Liga Portugal"
  //   "Dinamarca - 1.ª Divisão • Grupo Promotion Round" → "Dinamarca - 1.ª Divisão"
  normalised = normalised
    .replace(/\s*[•·]\s*.*/i, '')  // strip bullet-separated suffixes (Kambi group/phase)
    .replace(/\s*[-–]\s*(?:Grupo|Group|Round|Ronda|Jornada|Giornata|Matchday|Spieltag|Journée|Fase|Phase|Playoff|Play-off|Relegation|Qualification|Qualificação)\b.*/i, '')
    .replace(/\s*,\s*(?:Jornada|Round|Matchday|Spieltag|Giornata|Journée)\b.*/i, '')
    .replace(/\s+\d+['+]*$/, '')
    .trim();

  return normaliseLeagueToCanonical(normalised) || 'Futebol';
}

/**
 * Maps well-known league name variants to a single canonical display name.
 * Handles differences between Betano, Kambi (Placard/Solverde), and Betclic scrapers.
 */
function normaliseLeagueToCanonical(league: string): string {
  const l = league.toLowerCase();

  // ── Portugal ──────────────────────────────────────────────────────
  if (
    (/\bprimeira\s*liga\b/.test(l) || /\bliga\s*portugal\b/.test(l) || l === 'liga nos' || l === 'liga portuguesa') &&
    !/\bsegunda\b/.test(l) && !/\b2[.°º]?\b/.test(l) && !/\bii\b/.test(l)
  ) return 'Portugal - Primeira Liga';

  if (
    /\bsegunda\s*liga\b/.test(l) ||
    (/\bliga\s*portugal\b/.test(l) && (/\b2[.°º]?\b/.test(l) || /\bsegunda\b/.test(l)))
  ) return 'Portugal - Segunda Liga';

  // ── UEFA ──────────────────────────────────────────────────────────
  if (/champions\s*league/.test(l) || /liga\s*dos\s*campe/.test(l))
    return 'UEFA Champions League';

  if (/conference\s*league/.test(l) || /liga\s*confer/.test(l))
    return 'UEFA Conference League';

  if (/\beuropa\s*league\b/.test(l) || (l.includes('liga europa') && !l.includes('conference') && !l.includes('champions')))
    return 'UEFA Europa League';

  if (/nations\s*league/.test(l) || /liga\s*das\s*na/.test(l))
    return 'UEFA Nations League';

  // ── Spain ─────────────────────────────────────────────────────────
  if (/la\s*liga\s*2/.test(l) || /segunda\s*divis/.test(l))
    return 'Espanha - La Liga 2';

  // Primera Federación (3rd tier, formerly "Primera División RFEF") — must come before La Liga
  // Require Spanish context for the abbreviation form ("primera f.") to avoid
  // matching Mexican "Primera División" leagues.
  if (
    /primera\s*feder|rfef/.test(l) ||
    (/\bprimera\s*f\.?\b/.test(l) && (l.includes('espanha') || l.includes('espa\u00f1a')))
  )
    return 'Espanha - Primera Federación';

  // La Liga: explicit "la liga", or "primera división" only if no RFEF/Federación suffix
  if ((/\bla\s*liga\b/.test(l) || (/primera\s*divis/.test(l) && !/rfef|feder/.test(l))) && !/la\s*liga\s*2/.test(l))
    return 'Espanha - La Liga';

  // ── England ───────────────────────────────────────────────────────
  // Require explicit English context. Bare "Premier League" stays unmapped so
  // that chooseBetterLeague can pick the correct country from another scraper
  // (e.g. Kambi sends "Bahrain - Premier League" which would override later).
  if (
    /\bpremier\s*league\b/.test(l) &&
    !/premier\s*league\s*2/.test(l) &&
    (l.includes('england') || l.includes('inglat') || l.includes('reino unido'))
  )
    return 'Inglaterra - Premier League';

  if (/\bchampionship\b/.test(l) && (l.includes('england') || l.includes('inglat') || !l.includes(' - ')))
    return 'Inglaterra - Championship';

  // ── Germany ───────────────────────────────────────────────────────
  if (/3\.?\s*liga/.test(l) && (/alemanha|germany/.test(l) || !l.includes(' - ')))
    return 'Alemanha - 3. Liga';

  if (/2\.?\s*bundesliga|bundesliga\s*2/.test(l))
    return 'Alemanha - 2. Bundesliga';

  if (/\bbundesliga\b/.test(l) && !l.includes('áustria') && !l.includes('austria') && !l.includes('suíça') && !l.includes('schweiz'))
    return 'Alemanha - Bundesliga';

  // ── France ────────────────────────────────────────────────────────
  if (/\bligue\s*1\b/.test(l)) return 'França - Ligue 1';
  if (/\bligue\s*2\b/.test(l)) return 'França - Ligue 2';

  // ── Italy ─────────────────────────────────────────────────────────
  // Require Italian context or no country prefix — exclude Ecuador "Liga Pro Serie A",
  // Brazilian "Série A", and women's "Serie A - Feminino".
  if (
    /\bs[eé]rie\s*a\b/.test(l) &&
    !l.includes('brasil') && !l.includes('brazil') &&
    !l.includes('equador') && !l.includes('ecuador') &&
    !l.includes('liga pro') &&
    !/feminin|women|\(f\)/.test(l) &&
    (l.includes('itália') || l.includes('italia') || !l.includes(' - '))
  )
    return 'Itália - Serie A';

  if (
    /\bs[eé]rie\s*b\b/.test(l) &&
    !l.includes('brasil') && !l.includes('brazil') &&
    !l.includes('equador') && !l.includes('ecuador') &&
    !l.includes('liga pro') &&
    (l.includes('itália') || l.includes('italia') || !l.includes(' - '))
  )
    return 'Itália - Serie B';

  // ── Netherlands ───────────────────────────────────────────────────
  if (/\beredivisie\b/.test(l)) return 'Holanda - Eredivisie';

  // ── Brazil ────────────────────────────────────────────────────────
  if (/campeonato\s*brasileiro/.test(l)) return 'Brasil - Série A';

  // ── Wales ─────────────────────────────────────────────────────────
  if (/pa[ií]s\s*de\s*gales/.test(l) && (/\bpremier\b/.test(l) || /\bcymru\b/.test(l)))
    return 'País de Gales - Cymru Premier';

  // ── Croatia ───────────────────────────────────────────────────────
  if (/cro[aá]cia/.test(l) && (/\bhnl\b/.test(l) || /\b1\.\s*nl\b/.test(l)))
    return 'Croácia - HNL';

  // ── Serbia ────────────────────────────────────────────────────────
  if (/s[eé]rvia/.test(l) && /super\s*liga/.test(l))
    return 'Sérvia - SuperLiga';

  // ── Bulgaria ──────────────────────────────────────────────────────
  if (/bulg[aá]ria/.test(l) && /parva\s*liga|liga\s*parva/.test(l))
    return 'Bulgária - Parva Liga';

  // ── Bosnia ────────────────────────────────────────────────────────
  if (/b[oó]snia/.test(l) && /premij?er\s*liga/.test(l))
    return 'Bósnia-Herzegovina - Premijer Liga';

  // ── Saudi Arabia ──────────────────────────────────────────────────
  if (/ar[aá]bia\s*saudita/.test(l) && (/pro\s*league/.test(l) || /liga\s*profissional/.test(l)))
    return 'Arábia Saudita - Liga Profissional';

  // ── Georgia ───────────────────────────────────────────────────────
  if (/ge[oó]rgia/.test(l) && /erovnuli/.test(l))
    return 'Geórgia - Erovnuli Liga';

  // ── Switzerland ───────────────────────────────────────────────────
  if (/su[ií][çc]a/.test(l) && (/challenge\s*league/.test(l) || /liga\s*challenge/.test(l)))
    return 'Suíça - Challenge League';

  // ── Qatar ─────────────────────────────────────────────────────────
  if (/catar/.test(l) && (/stars?\s*league/.test(l) || /liga\s*das\s*estrelas/.test(l)))
    return 'Catar - Stars League';

  // ── Belgium ───────────────────────────────────────────────────────
  if (/b[eé]lgica/.test(l) && (/1a?\s*pro\s*league/.test(l) || /primeira\s*divis[ãa]o\s*a\b/.test(l)))
    return 'Bélgica - Primeira Divisão A';

  // ── Denmark ───────────────────────────────────────────────────────
  if (/dinamarca/.test(l) && /1[.ªº]?\s*divis/.test(l))
    return 'Dinamarca - 1ª Divisão';

  // ── Country spelling normalisation (PT-BR → PT-PT) ────────────────
  if (/rom[êe]nia/.test(l) && !l.startsWith('roménia'))
    return league.replace(/Rom[êe]nia/, 'Roménia');
  if (/eslov[êe]nia/.test(l) && !l.startsWith('eslovénia'))
    return league.replace(/Eslov[êe]nia/, 'Eslovénia');
  if (/maced[ôo]nia/.test(l) && l.includes('ô'))
    return league.replace(/Macedônia/, 'Macedónia');

  return league;
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
 * Safety-net cleanup for stale event statuses.
 *
 * Status transitions (UPCOMING → LIVE, LIVE → FINISHED with scores) are owned
 * by the sports-data status service (eventStatusService.ts) which polls
 * API-Football for authoritative real-time match state.
 *
 * This function is the last line of defence: it marks events FINISHED purely
 * by elapsed time, in case the sports-data service missed them (e.g. unknown
 * event IDs, API rate limits, network issues).
 *
 * Rules are sport-aware to account for different maximum match durations:
 *  • FOOTBALL  — LIVE→FINISHED after 3 h, UPCOMING→FINISHED after 2 h
 *                (90 min play + halftime + max 30 min extra time ≈ 2h 20m)
 *  • BASKETBALL — LIVE→FINISHED after 5 h, UPCOMING→FINISHED after 5 h
 *                (NBA: 48 min play + timeouts + breaks ≈ 2.5–3h real time;
 *                 can exceed 3 h with overtime; use 5 h as generous safety net)
 *  • TENNIS    — LIVE→FINISHED after 6 h, UPCOMING→FINISHED after 6 h
 *                (Grand Slams can last 5+ hours)
 *  • OTHER     — LIVE→FINISHED after 5 h, UPCOMING→FINISHED after 5 h
 */
export async function updateEventStatuses(): Promise<{ toLive: number; toFinished: number }> {
  const now = new Date();
  const recentOddsCutoff   = new Date(now.getTime() - 10 * 60 * 1000); // 10 min
  const futureKickoffGuard = new Date(now.getTime() + 5 * 60 * 1000);  // 5 min ahead

  // Sport-specific cutoffs (in hours): [liveFinishH, upcomingFinishH]
  const SPORT_CUTOFFS: Record<string, [number, number]> = {
    FOOTBALL:        [3, 2],
    BASKETBALL:      [5, 5],
    TENNIS:          [6, 6],
    HANDBALL:        [3, 2],
    VOLLEYBALL:      [4, 4],
    HOCKEY:          [4, 4],
    RUGBY:           [3, 2],
    AMERICAN_FOOTBALL: [5, 5],
    BASEBALL:        [6, 6],
    OTHER:           [5, 5],
  };

  // Safety valve: LIVE events whose kick-off is still ≥ 5 minutes in the future
  // should never be live — demote them back to UPCOMING immediately.
  // This corrects any spurious LIVE promotion caused by a prior incorrect date
  // stored in the DB or a misidentified API-Football fixture match.
  await prisma.sportEvent.updateMany({
    where: {
      status: 'LIVE' as unknown as Prisma.EnumEventStatusFilter['equals'],
      eventDate: { gt: futureKickoffGuard },
    },
    data: {
      status: 'UPCOMING' as never,
      liveClock: null,
    },
  });

  // Apply sport-specific expired-LIVE cleanup
  let liveExpiredCount = 0;
  for (const [sport, [liveH]] of Object.entries(SPORT_CUTOFFS)) {
    const cutoff = new Date(now.getTime() - liveH * 60 * 60 * 1000);
    const r = await prisma.sportEvent.updateMany({
      where: {
        sport: sport as never,
        status: 'LIVE' as unknown as Prisma.EnumEventStatusFilter['equals'],
        eventDate: { lte: cutoff },
      },
      data: { status: 'FINISHED' as never, liveClock: null },
    });
    liveExpiredCount += r.count;
  }
  const liveExpiredResult = { count: liveExpiredCount };

  // LIVE events with NO active odds → mark FINISHED immediately.
  // The scraper registry deactivates odds for LIVE events it no longer sees
  // (scraperRegistry.ts global cleanup). Once all odds are deactivated the
  // event was a ghost / has wrong data and should not stay LIVE indefinitely.
  // Guard: only apply this to FOOTBALL (API-Football covers it authoritatively).
  // For non-football sports (basketball, tennis, etc.) the scrapers are the
  // only live-data source — a temporary scraping failure (e.g. 403 WAF block)
  // would incorrectly kill active live events. Instead, rely on the time-based
  // cutoffs above which are generous enough for each sport.
  const liveNoOddsResult = await prisma.sportEvent.updateMany({
    where: {
      sport: 'FOOTBALL' as never,
      status: 'LIVE' as unknown as Prisma.EnumEventStatusFilter['equals'],
      odds: { none: { isActive: true } },
    },
    data: {
      status: 'FINISHED' as never,
      liveClock: null,
    },
  });

  // Apply sport-specific expired-UPCOMING cleanup
  let upcomingExpiredCount = 0;
  for (const [sport, [, upcomingH]] of Object.entries(SPORT_CUTOFFS)) {
    const cutoff = new Date(now.getTime() - upcomingH * 60 * 60 * 1000);
    const r = await prisma.sportEvent.updateMany({
      where: {
        sport: sport as never,
        status: 'UPCOMING' as unknown as Prisma.EnumEventStatusFilter['equals'],
        eventDate: { lte: cutoff },
      },
      data: { status: 'FINISHED' as never, liveClock: null },
    });
    upcomingExpiredCount += r.count;
  }
  const upcomingExpiredResult = { count: upcomingExpiredCount };

  // UPCOMING → LIVE safety net: kick-off has passed but within the sport-specific
  // window, AND the event has at least one active odd updated within the last 10 minutes.
  // The odds recency guard prevents events with stale or wrong kick-off dates
  // from being ghost-promoted to LIVE when no scraper is actively seeing them.
  // Use the most generous upcoming cutoff (6 h) to cover all sports.
  const upcomingFinishCutoffMax = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const livePromotionCandidates = await prisma.sportEvent.findMany({
    where: {
      status: 'UPCOMING' as unknown as Prisma.EnumEventStatusFilter['equals'],
      eventDate: { lte: now, gte: upcomingFinishCutoffMax },
      odds: {
        some: {
          isActive: true,
          updatedAt: { gte: recentOddsCutoff },
        },
      },
    },
    select: { id: true },
  });

  let toLive = 0;
  if (livePromotionCandidates.length > 0) {
    const promotionResult = await prisma.sportEvent.updateMany({
      where: { id: { in: livePromotionCandidates.map((e) => e.id) } },
      data: { status: 'LIVE' as never },
    });
    toLive = promotionResult.count;
  }

  await prisma.sportEvent.updateMany({
    where: {
      status: {
        not: 'LIVE' as unknown as Prisma.EnumEventStatusFilter['equals'],
      },
      liveClock: { not: null },
    },
    data: { liveClock: null },
  });

  const toFinished = liveExpiredResult.count + liveNoOddsResult.count + upcomingExpiredResult.count;

  if (toFinished > 0) {
    await invalidateOddsCache();
  }

  return { toLive, toFinished };
}
