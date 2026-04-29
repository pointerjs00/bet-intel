import { BoletinStatus, ItemResult, Prisma, Sport } from '@prisma/client';
import type {
  PersonalStats,
  RollingWindowStats,
  SiteMonthlyROI,
  StatsByCompetitionRow,
  StatsByHourRow,
  StatsByLegCountRow,
  StatsByMarketRow,
  StatsByOddsRangeRow,
  StatsBySiteRow,
  StatsBySportMarketCell,
  StatsBySportRow,
  StatsByStakeBracketRow,
  StatsByTeamRow,
  StatsByWeekdayRow,
  StatsBreakdownRow,
  StatsCalibrationPoint,
  StatsFreebetSummary,
  StatsInsight,
  StatsLegKillRow,
  StatsPeriod,
  StatsROITrendPoint,
  StatsStreaks,
  StatsSummary,
  StatsTimelinePoint,
  StatsTopBoletin,
} from '@betintel/shared';
import { prisma } from '../../prisma';
import { redis } from '../../utils/redis';

const STATS_CACHE_TTL = 120; // 2 minutes

const STATS_BOLETIN_INCLUDE = {
  items: {
    orderBy: { id: 'asc' as const },
  },
} as const;

type StatsBoletinRecord = Prisma.BoletinGetPayload<{
  include: typeof STATS_BOLETIN_INCLUDE;
}>;

type BreakdownAccumulator = StatsBreakdownRow;

interface TimelineAccumulator extends StatsTimelinePoint {
  settledStake: number;
}

interface OddsRangeDefinition {
  key: string;
  label: string;
  minOdds: number | null;
  maxOdds: number | null;
}

const ODDS_RANGE_DEFINITIONS: OddsRangeDefinition[] = [
  { key: 'lt-1.5', label: '<1.5', minOdds: null, maxOdds: 1.5 },
  { key: '1.5-2.0', label: '1.5-2.0', minOdds: 1.5, maxOdds: 2.0 },
  { key: '2.0-3.0', label: '2.0-3.0', minOdds: 2.0, maxOdds: 3.0 },
  { key: '3.0-5.0', label: '3.0-5.0', minOdds: 3.0, maxOdds: 5.0 },
  { key: 'gte-5.0', label: '5.0+', minOdds: 5.0, maxOdds: null },
];

export interface StatsOptions {
  period: StatsPeriod;
  /** Single site slug (legacy). If provided alongside siteSlugs, both are applied. */
  siteSlug?: string;
  /** Array of site slugs for multi-site filtering. */
  siteSlugs?: string[];
  /** Custom range start — ISO date string e.g. "2026-03-01". Overrides period range when both from+to are set. */
  dateFrom?: string;
  /** Custom range end — ISO date string e.g. "2026-03-31". */
  dateTo?: string;
  /** Timeline bucket size — overrides the period-default (week→daily, month→weekly, year/all→monthly). */
  granularity?: 'daily' | 'weekly' | 'monthly';
}

/** Returns the full statistics bundle for the authenticated user. */
export async function getPersonalStats(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<PersonalStats> {
  const options = normaliseOpts(opts, siteSlug);

  // Try Redis cache first
  const cacheKey = `stats:${userId}:${JSON.stringify(options)}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Cache miss or Redis error — proceed to compute
  }

  const boletins = await getBoletinsForPeriod(userId, options);
  const result = buildStatsBundle(boletins, options.period, options.granularity);

  // Cache the result asynchronously — don't block the response
  redis.set(cacheKey, JSON.stringify(result), 'EX', STATS_CACHE_TTL).catch(() => {});

  return result;
}

/** Returns the summary-only stats payload. */
export async function getStatsSummary(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<StatsSummary> {
  const stats = await getPersonalStats(userId, opts, siteSlug);
  return stats.summary;
}

/** Returns the sport breakdown rows for the authenticated user. */
export async function getStatsBySport(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<StatsBySportRow[]> {
  const stats = await getPersonalStats(userId, opts, siteSlug);
  return stats.bySport;
}

/** Returns the team breakdown rows for the authenticated user. */
export async function getStatsByTeam(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<StatsByTeamRow[]> {
  const stats = await getPersonalStats(userId, opts, siteSlug);
  return stats.byTeam;
}

/** Returns the competition breakdown rows for the authenticated user. */
export async function getStatsByCompetition(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<StatsByCompetitionRow[]> {
  const stats = await getPersonalStats(userId, opts, siteSlug);
  return stats.byCompetition;
}

/** Returns the market breakdown rows for the authenticated user. */
export async function getStatsByMarket(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<StatsByMarketRow[]> {
  const stats = await getPersonalStats(userId, opts, siteSlug);
  return stats.byMarket;
}

/** Returns the odds-range breakdown rows for the authenticated user. */
export async function getStatsByOddsRange(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<StatsByOddsRangeRow[]> {
  const stats = await getPersonalStats(userId, opts, siteSlug);
  return stats.byOddsRange;
}

/** Returns the timeline rows for the authenticated user. */
export async function getStatsTimeline(userId: string, opts: StatsOptions | StatsPeriod, siteSlug?: string): Promise<StatsTimelinePoint[]> {
  const stats = await getPersonalStats(userId, opts, siteSlug);
  return stats.timeline;
}

/** Returns rolling-window stats for the last 10, 20, and 30 resolved boletins (period-independent). */
export async function getRecentForm(userId: string): Promise<RollingWindowStats[]> {
  const resolved = await prisma.boletin.findMany({
    where: { userId, status: { not: BoletinStatus.PENDING } },
    orderBy: [{ betDate: 'asc' }, { createdAt: 'asc' }],
    select: { status: true, stake: true, actualReturn: true },
  });

  return ([10, 20, 30] as const).map((n) => computeRollingWindow(resolved, n));
}

function computeRollingWindow(
  allResolved: Array<{ status: BoletinStatus; stake: Prisma.Decimal; actualReturn: Prisma.Decimal | null }>,
  n: number,
): RollingWindowStats {
  const slice = allResolved.slice(-n);
  const count = slice.length;

  if (count === 0) {
    return { window: n, count: 0, roi: 0, winRate: 0, profitLoss: 0, wonCount: 0, lostCount: 0, voidCount: 0, results: [] };
  }

  let wonCount = 0, lostCount = 0, voidCount = 0;
  let totalStake = 0, totalReturn = 0;
  const results: Array<'WON' | 'LOST' | 'VOID'> = [];

  for (const b of slice) {
    totalStake += b.stake.toNumber();
    totalReturn += b.actualReturn?.toNumber() ?? 0;
    if (b.status === BoletinStatus.WON || b.status === BoletinStatus.PARTIAL) {
      wonCount++; results.push('WON');
    } else if (b.status === BoletinStatus.LOST) {
      lostCount++; results.push('LOST');
    } else {
      voidCount++; results.push('VOID');
    }
  }

  const settledCount = wonCount + lostCount;
  return {
    window: n,
    count,
    roi: totalStake > 0 ? ((totalReturn - totalStake) / totalStake) * 100 : 0,
    winRate: settledCount > 0 ? (wonCount / settledCount) * 100 : 0,
    profitLoss: totalReturn - totalStake,
    wonCount,
    lostCount,
    voidCount,
    results,
  };
}

/** Normalises the overloaded opts parameter into a StatsOptions object. */
function normaliseOpts(opts: StatsOptions | StatsPeriod, siteSlug?: string): StatsOptions {
  if (typeof opts === 'string') {
    return { period: opts, siteSlug };
  }
  return opts;
}

async function getBoletinsForPeriod(
  userId: string,
  opts: StatsOptions,
): Promise<StatsBoletinRecord[]> {
  const { period, siteSlug, siteSlugs, dateFrom, dateTo } = opts;

  // Resolve effective date range — each bound is independent
  let range: { start: Date | null; end: Date | null } | null;
  if (dateFrom || dateTo) {
    range = {
      start: dateFrom ? new Date(dateFrom) : null,
      end: dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null,
    };
  } else {
    const periodRange = getPeriodRange(period, new Date());
    range = periodRange ? { start: periodRange.start, end: periodRange.end } : null;
  }

  // Resolve site filter: siteSlugs takes priority, then siteSlug
  const effectiveSlugs: string[] = siteSlugs && siteSlugs.length > 0
    ? siteSlugs
    : siteSlug
    ? [siteSlug]
    : [];

  return prisma.boletin.findMany({
    where: {
      userId,
      ...(effectiveSlugs.length > 0 ? { siteSlug: { in: effectiveSlugs } } : {}),
      ...(range
        ? {
            OR: [
              // Boletins with an explicit betDate — filter by that date
              {
                betDate: {
                  ...(range.start ? { gte: range.start } : {}),
                  ...(range.end ? { lte: range.end } : {}),
                },
              },
              // Boletins without a betDate — fall back to createdAt
              {
                betDate: null,
                createdAt: {
                  ...(range.start ? { gte: range.start } : {}),
                  ...(range.end ? { lte: range.end } : {}),
                },
              },
            ],
          }
        : {}),
    },
    include: STATS_BOLETIN_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

function buildStatsBundle(boletins: StatsBoletinRecord[], period: StatsPeriod, granularity?: 'daily' | 'weekly' | 'monthly'): PersonalStats {
  const summary = buildSummary(boletins, period);
  const bySportMap = new Map<string, StatsBySportRow>();
  const byTeamMap = new Map<string, StatsByTeamRow>();
  const byCompetitionMap = new Map<string, StatsByCompetitionRow>();
  const byMarketMap = new Map<string, StatsByMarketRow>();
  const byOddsRangeMap = new Map<string, StatsByOddsRangeRow>(
    ODDS_RANGE_DEFINITIONS.map((definition) => [
      definition.key,
      {
        key: definition.key,
        label: definition.label,
        minOdds: definition.minOdds,
        maxOdds: definition.maxOdds,
        totalBets: 0,
        won: 0,
        lost: 0,
        void: 0,
        pending: 0,
        settledStake: 0,
        totalStaked: 0,
        totalReturned: 0,
        profitLoss: 0,
        roi: 0,
        winRate: 0,
      },
    ]),
  );

  for (const boletin of boletins) {
    const stake = decimalToNumber(boletin.stake);
    const effectiveStake = boletin.isFreebet ? 0 : stake;
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;
    const itemCount = Math.max(boletin.items.length, 1);
    const stakeShare = effectiveStake / itemCount;
    const returnShare = effectiveReturn / itemCount;

    for (const item of boletin.items) {
      const sportKey = item.sport;
      const marketKey = item.market;
      const oddsRange = getOddsRange(decimalToNumber(item.oddValue));

      const sportRow = getOrCreateSportRow(bySportMap, sportKey as Sport);
      const marketRow = getOrCreateMarketRow(byMarketMap, marketKey);
      const oddsRangeRow = byOddsRangeMap.get(oddsRange.key);

      // Team breakdown — count both home and away teams
      const homeRow = getOrCreateTeamRow(byTeamMap, item.homeTeam);
      const awayRow = getOrCreateTeamRow(byTeamMap, item.awayTeam);

      // Competition breakdown
      const compRow = getOrCreateCompetitionRow(byCompetitionMap, item.competition);

      applyBreakdownContribution(sportRow, item.result, stakeShare, returnShare);
      applyBreakdownContribution(homeRow, item.result, stakeShare, returnShare);
      applyBreakdownContribution(awayRow, item.result, stakeShare, returnShare);
      applyBreakdownContribution(compRow, item.result, stakeShare, returnShare);
      applyBreakdownContribution(marketRow, item.result, stakeShare, returnShare);
      if (oddsRangeRow) {
        applyBreakdownContribution(oddsRangeRow, item.result, stakeShare, returnShare);
      }
    }
  }

  const timeline = buildTimeline(boletins, period, granularity);
  const settledBoletins = boletins.filter((boletin) => isSettledStatus(boletin.status));

  return {
    summary,
    bySport: finalizeRows(Array.from(bySportMap.values())),
    byTeam: finalizeRows(Array.from(byTeamMap.values())),
    byCompetition: finalizeRows(Array.from(byCompetitionMap.values())),
    byMarket: finalizeRows(Array.from(byMarketMap.values())),
    byOddsRange: finalizeRows(Array.from(byOddsRangeMap.values())),
    byWeekday: buildByWeekday(boletins),
    byLegCount: buildByLegCount(boletins),
    byStakeBracket: buildByStakeBracket(boletins),
    bySportMarket: buildBySportMarket(boletins),
    bySite: buildBySite(boletins),
    byHour: buildByHour(boletins),
    legKillDistribution: buildLegKillDistribution(boletins),
    calibration: buildCalibration(boletins),
    roiTrend: buildROITrend(boletins),
    insights: buildInsights(summary, boletins),
    timeline,
    bestBoletins: buildTopBoletins(settledBoletins, 'best'),
    worstBoletins: buildTopBoletins(settledBoletins, 'worst'),
  };
}

function buildSummary(boletins: StatsBoletinRecord[], period: StatsPeriod): StatsSummary {
  let settledBoletins = 0;
  let pendingBoletins = 0;
  let wonBoletins = 0;
  let lostBoletins = 0;
  let voidBoletins = 0;
  let partialBoletins = 0;
  let totalStaked = 0;
  let settledStake = 0;
  let totalReturned = 0;
  let totalOdds = 0;
  let wonOddsSum = 0;
  let wonOddsCount = 0;
  let lostOddsSum = 0;
  let lostOddsCount = 0;
  let wonStakeSum = 0;
  let lostStakeSum = 0;

  // Freebet tracking
  let totalFreebets = 0;
  let wonFreebets = 0;
  let lostFreebets = 0;
  let freebetReturned = 0;

  // Odds efficiency: sum of actual returns vs implied returns (stake × odds)
  let impliedReturnSum = 0;
  let actualReturnSum = 0;
  // Count of non-cancelled boletins for averages (VOID/Cancelado excluded)
  let nonVoidCount = 0;

  // Home/Away tracking (directional 1X2 bets)
  let homeStaked = 0;
  let homeReturned = 0;
  let homeSettledStake = 0;
  let homeWon = 0;
  let homeDecisive = 0;
  let homeBets = 0;
  let awayStaked = 0;
  let awayReturned = 0;
  let awaySettledStake = 0;
  let awayWon = 0;
  let awayDecisive = 0;
  let awayBets = 0;

  // Favourite / Underdog tracking (threshold: odds 2.00)
  let favStaked = 0;
  let favReturned = 0;
  let favSettledStake = 0;
  let favWon = 0;
  let favDecisive = 0;
  let favBets = 0;
  let undStaked = 0;
  let undReturned = 0;
  let undSettledStake = 0;
  let undWon = 0;
  let undDecisive = 0;
  let undBets = 0;

  // P&L per boletin for variance calculation
  const pnlValues: number[] = [];

  for (const boletin of boletins) {
    // Cancelado (VOID) boletins are excluded from all financial and performance stats.
    // They only increment voidBoletins for display purposes.
    if (boletin.status === BoletinStatus.VOID) {
      voidBoletins += 1;
      continue;
    }

    nonVoidCount += 1;
    const stake = decimalToNumber(boletin.stake);
    // Freebet stakes are not real money — exclude from financial totals so P&L and ROI
    // reflect only money the user actually put in.
    const effectiveStake = boletin.isFreebet ? 0 : stake;
    const odds = decimalToNumber(boletin.totalOdds);
    totalStaked += effectiveStake;
    totalOdds += odds;

    // Track freebets separately
    if (boletin.isFreebet && isSettledStatus(boletin.status)) {
      totalFreebets += 1;
      const fbReturn = getEffectiveReturn(boletin);
      freebetReturned += fbReturn;
      if (boletin.status === BoletinStatus.WON || boletin.status === BoletinStatus.PARTIAL) {
        wonFreebets += 1;
      } else if (boletin.status === BoletinStatus.LOST) {
        lostFreebets += 1;
      }
    }

    const settled = isSettledStatus(boletin.status);

    // Track odds efficiency for non-freebet settled boletins
    if (settled && !boletin.isFreebet) {
      impliedReturnSum += stake * odds; // what a "perfect" bettor would expect
      actualReturnSum += getEffectiveReturn(boletin);
      // Track P&L for variance calculation
      pnlValues.push(getEffectiveReturn(boletin) - stake);
    }

    // Home/Away + Favourite/Underdog item-level tracking
    if (settled && !boletin.isFreebet) {
      const itemCount = Math.max(boletin.items.length, 1);
      const itemStakeShare = stake / itemCount;
      const itemReturnShare = getEffectiveReturn(boletin) / itemCount;

      for (const item of boletin.items) {
        const itemOdds = decimalToNumber(item.oddValue);
        const isItemWon = item.result === ItemResult.WON;
        const isItemDecisive = item.result === ItemResult.WON || item.result === ItemResult.LOST;

        // Home/Away — match numeric codes, Portuguese labels, and team-name selections
        // Also matches humanised market names like "SL Benfica vence" or
        // "SL Benfica vence & +1.5 Golos" where the team name is the home/away team.
        const sel = item.selection.toLowerCase().trim();
        const homeTeamNorm = item.homeTeam.toLowerCase().trim();
        const awayTeamNorm = item.awayTeam.toLowerCase().trim();
        const isHome =
          sel === '1' ||
          sel === 'casa' ||
          sel === '1x' ||
          sel === '12' ||
          sel === homeTeamNorm ||
          sel.startsWith('casa vence') ||
          (homeTeamNorm.length > 0 && sel.startsWith(`${homeTeamNorm} vence`));
        const isAway =
          sel === '2' ||
          sel === 'fora' ||
          sel === 'x2' ||
          sel === awayTeamNorm ||
          sel.startsWith('fora vence') ||
          (awayTeamNorm.length > 0 && sel.startsWith(`${awayTeamNorm} vence`));

        if (isHome) {
          homeBets += 1;
          homeStaked += itemStakeShare;
          homeSettledStake += itemStakeShare;
          homeReturned += itemReturnShare;
          if (isItemDecisive) homeDecisive += 1;
          if (isItemWon) homeWon += 1;
        } else if (isAway) {
          awayBets += 1;
          awayStaked += itemStakeShare;
          awaySettledStake += itemStakeShare;
          awayReturned += itemReturnShare;
          if (isItemDecisive) awayDecisive += 1;
          if (isItemWon) awayWon += 1;
        }

        // Favourite / Underdog (threshold: 2.00)
        if (isItemDecisive) {
          if (itemOdds < 2.0) {
            favBets += 1;
            favStaked += itemStakeShare;
            favSettledStake += itemStakeShare;
            favReturned += itemReturnShare;
            favDecisive += 1;
            if (isItemWon) favWon += 1;
          } else {
            undBets += 1;
            undStaked += itemStakeShare;
            undSettledStake += itemStakeShare;
            undReturned += itemReturnShare;
            undDecisive += 1;
            if (isItemWon) undWon += 1;
          }
        }
      }
    }

    switch (boletin.status) {
      case BoletinStatus.WON:
        settledBoletins += 1;
        wonBoletins += 1;
        settledStake += effectiveStake;
        totalReturned += getEffectiveReturn(boletin);
        wonOddsSum += odds;
        wonOddsCount += 1;
        wonStakeSum += effectiveStake;
        break;
      case BoletinStatus.LOST:
        settledBoletins += 1;
        lostBoletins += 1;
        settledStake += effectiveStake;
        totalReturned += getEffectiveReturn(boletin);
        lostOddsSum += odds;
        lostOddsCount += 1;
        lostStakeSum += effectiveStake;
        break;
      case BoletinStatus.PARTIAL:
        settledBoletins += 1;
        partialBoletins += 1;
        settledStake += effectiveStake;
        totalReturned += getEffectiveReturn(boletin);
        wonOddsSum += odds;
        wonOddsCount += 1;
        wonStakeSum += effectiveStake;
        break;
      case BoletinStatus.CASHOUT:
        settledBoletins += 1;
        settledStake += effectiveStake;
        totalReturned += getEffectiveReturn(boletin);
        break;
      case BoletinStatus.PENDING:
      default:
        pendingBoletins += 1;
        break;
    }
  }

  const profitLoss = totalReturned - settledStake;
  const decisiveBoletins = wonBoletins + lostBoletins + partialBoletins;

  // Streak computation — sort settled boletins by betDate (or createdAt) chronologically
  const streaks = buildStreaks(boletins);

  // Freebet summary
  const freebetSummary: StatsFreebetSummary = {
    totalFreebets,
    wonFreebets,
    lostFreebets,
    totalReturned: round(freebetReturned),
    profitLoss: round(freebetReturned), // freebets cost nothing so profit = returned
  };

  return {
    period,
    totalBoletins: boletins.length,
    settledBoletins,
    pendingBoletins,
    wonBoletins,
    lostBoletins,
    voidBoletins,
    partialBoletins,
    totalStaked: round(totalStaked),
    settledStake: round(settledStake),
    totalReturned: round(totalReturned),
    profitLoss: round(profitLoss),
    roi: settledStake > 0 ? round((profitLoss / settledStake) * 100) : 0,
    winRate: decisiveBoletins > 0 ? round(((wonBoletins + partialBoletins) / decisiveBoletins) * 100) : 0,
    averageOdds: nonVoidCount > 0 ? round(totalOdds / nonVoidCount, 2) : 0,
    averageWonOdds: wonOddsCount > 0 ? round(wonOddsSum / wonOddsCount, 2) : 0,
    averageLostOdds: lostOddsCount > 0 ? round(lostOddsSum / lostOddsCount, 2) : 0,
    averageStake: nonVoidCount > 0 ? round(totalStaked / nonVoidCount) : 0,
    averageReturn: settledBoletins > 0 ? round(totalReturned / settledBoletins) : 0,
    averageWonStake: wonBoletins + partialBoletins > 0 ? round(wonStakeSum / (wonBoletins + partialBoletins)) : 0,
    averageLostStake: lostBoletins > 0 ? round(lostStakeSum / lostBoletins) : 0,
    oddsEfficiency: impliedReturnSum > 0 ? round((actualReturnSum / impliedReturnSum) * 100) : 0,
    streaks,
    freebetSummary,
    variance: computeVariance(pnlValues),
    stdDev: round(Math.sqrt(computeVariance(pnlValues))),
    homeROI: homeSettledStake > 0 ? round(((homeReturned - homeSettledStake) / homeSettledStake) * 100) : 0,
    homeWinRate: homeDecisive > 0 ? round((homeWon / homeDecisive) * 100) : 0,
    homeBets,
    awayROI: awaySettledStake > 0 ? round(((awayReturned - awaySettledStake) / awaySettledStake) * 100) : 0,
    awayWinRate: awayDecisive > 0 ? round((awayWon / awayDecisive) * 100) : 0,
    awayBets,
    favouriteROI: favSettledStake > 0 ? round(((favReturned - favSettledStake) / favSettledStake) * 100) : 0,
    favouriteWinRate: favDecisive > 0 ? round((favWon / favDecisive) * 100) : 0,
    favouriteBets: favBets,
    underdogROI: undSettledStake > 0 ? round(((undReturned - undSettledStake) / undSettledStake) * 100) : 0,
    underdogWinRate: undDecisive > 0 ? round((undWon / undDecisive) * 100) : 0,
    underdogBets: undBets,
  };
}

function buildStreaks(boletins: StatsBoletinRecord[]): StatsStreaks {
  // Only consider decisive boletins (WON/LOST/PARTIAL) sorted by bet date
  const decisive = boletins
    .filter((b) =>
      b.status === BoletinStatus.WON ||
      b.status === BoletinStatus.LOST ||
      b.status === BoletinStatus.PARTIAL,
    )
    .sort((a, b) => {
      const dateA = a.betDate ?? a.createdAt;
      const dateB = b.betDate ?? b.createdAt;
      return dateA.getTime() - dateB.getTime();
    });

  let currentType: 'WON' | 'LOST' | null = null;
  let currentCount = 0;
  let longestWin = 0;
  let longestLoss = 0;
  let runType: 'WON' | 'LOST' | null = null;
  let runCount = 0;

  for (const boletin of decisive) {
    const isWin = boletin.status === BoletinStatus.WON || boletin.status === BoletinStatus.PARTIAL;
    const type: 'WON' | 'LOST' = isWin ? 'WON' : 'LOST';

    if (type === runType) {
      runCount += 1;
    } else {
      // Flush previous run
      if (runType === 'WON' && runCount > longestWin) longestWin = runCount;
      if (runType === 'LOST' && runCount > longestLoss) longestLoss = runCount;
      runType = type;
      runCount = 1;
    }
  }

  // Flush final run
  if (runType === 'WON' && runCount > longestWin) longestWin = runCount;
  if (runType === 'LOST' && runCount > longestLoss) longestLoss = runCount;

  currentType = runType;
  currentCount = runCount;

  return { currentType, currentCount, longestWin, longestLoss };
}

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function buildByWeekday(boletins: StatsBoletinRecord[]): StatsByWeekdayRow[] {
  const map = new Map<number, StatsByWeekdayRow>();

  // Pre-initialise all 7 days
  for (let d = 0; d < 7; d++) {
    map.set(d, {
      weekday: d,
      key: String(d),
      label: WEEKDAY_LABELS[d]!,
      totalBets: 0,
      won: 0,
      lost: 0,
      void: 0,
      pending: 0,
      settledStake: 0,
      totalStaked: 0,
      totalReturned: 0,
      profitLoss: 0,
      roi: 0,
      winRate: 0,
    });
  }

  for (const boletin of boletins) {
    const date = boletin.betDate ?? boletin.createdAt;
    const weekday = date.getUTCDay();
    const row = map.get(weekday)!;
    const stake = boletin.isFreebet ? 0 : decimalToNumber(boletin.stake);
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;

    row.totalBets += 1;
    row.totalStaked += stake;

    if (settled) {
      row.settledStake += stake;
      row.totalReturned += effectiveReturn;
    }

    switch (boletin.status) {
      case BoletinStatus.WON:
      case BoletinStatus.PARTIAL:
        row.won += 1;
        break;
      case BoletinStatus.LOST:
        row.lost += 1;
        break;
      case BoletinStatus.VOID:
        row.void += 1;
        break;
      case BoletinStatus.CASHOUT:
        // Cashout counts as settled but doesn't affect won/lost
        break;
      case BoletinStatus.PENDING:
      default:
        row.pending += 1;
        break;
    }
  }

  // Reorder to start on Monday: 1,2,3,4,5,6,0
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
  const rows = mondayFirst.map((d) => map.get(d)!);
  return computeRowMetrics(rows);
}

function buildByLegCount(boletins: StatsBoletinRecord[]): StatsByLegCountRow[] {
  const map = new Map<number, StatsByLegCountRow>();

  for (const boletin of boletins) {
    const legCount = boletin.items.length;
    if (legCount === 0) continue;

    let row = map.get(legCount);
    if (!row) {
      row = {
        legCount,
        key: String(legCount),
        label: legCount === 1 ? 'Simples' : `${legCount} seleções`,
        totalBets: 0,
        won: 0,
        lost: 0,
        void: 0,
        pending: 0,
        settledStake: 0,
        totalStaked: 0,
        totalReturned: 0,
        profitLoss: 0,
        roi: 0,
        winRate: 0,
      };
      map.set(legCount, row);
    }

    const stake = boletin.isFreebet ? 0 : decimalToNumber(boletin.stake);
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;

    row.totalBets += 1;
    row.totalStaked += stake;

    if (settled) {
      row.settledStake += stake;
      row.totalReturned += effectiveReturn;
    }

    switch (boletin.status) {
      case BoletinStatus.WON:
      case BoletinStatus.PARTIAL:
        row.won += 1;
        break;
      case BoletinStatus.LOST:
        row.lost += 1;
        break;
      case BoletinStatus.VOID:
        row.void += 1;
        break;
      case BoletinStatus.CASHOUT:
        break;
      case BoletinStatus.PENDING:
      default:
        row.pending += 1;
        break;
    }
  }

  // Sort by leg count ascending
  const rows = Array.from(map.values()).sort((a, b) => a.legCount - b.legCount);
  return computeRowMetrics(rows);
}

interface StakeBracketDef {
  key: string;
  label: string;
  minStake: number;
  maxStake: number | null;
}

const STAKE_BRACKET_DEFS: StakeBracketDef[] = [
  { key: '0-5', label: '€0–5', minStake: 0, maxStake: 5 },
  { key: '5-10', label: '€5–10', minStake: 5, maxStake: 10 },
  { key: '10-25', label: '€10–25', minStake: 10, maxStake: 25 },
  { key: '25-50', label: '€25–50', minStake: 25, maxStake: 50 },
  { key: '50+', label: '€50+', minStake: 50, maxStake: null },
];

function buildByStakeBracket(boletins: StatsBoletinRecord[]): StatsByStakeBracketRow[] {
  const map = new Map<string, StatsByStakeBracketRow>(
    STAKE_BRACKET_DEFS.map((def) => [
      def.key,
      {
        key: def.key,
        label: def.label,
        minStake: def.minStake,
        maxStake: def.maxStake,
        totalBets: 0,
        won: 0,
        lost: 0,
        void: 0,
        pending: 0,
        settledStake: 0,
        totalStaked: 0,
        totalReturned: 0,
        profitLoss: 0,
        roi: 0,
        winRate: 0,
      },
    ]),
  );

  for (const boletin of boletins) {
    const stake = decimalToNumber(boletin.stake);
    const bracket = STAKE_BRACKET_DEFS.find(
      (def) => stake >= def.minStake && (def.maxStake === null || stake < def.maxStake),
    ) ?? STAKE_BRACKET_DEFS[STAKE_BRACKET_DEFS.length - 1];
    const row = map.get(bracket.key)!;
    const effectiveStake = boletin.isFreebet ? 0 : stake;
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;

    row.totalBets += 1;
    row.totalStaked += effectiveStake;

    if (settled) {
      row.settledStake += effectiveStake;
      row.totalReturned += effectiveReturn;
    }

    switch (boletin.status) {
      case BoletinStatus.WON:
      case BoletinStatus.PARTIAL:
        row.won += 1;
        break;
      case BoletinStatus.LOST:
        row.lost += 1;
        break;
      case BoletinStatus.VOID:
        row.void += 1;
        break;
      case BoletinStatus.CASHOUT:
        break;
      case BoletinStatus.PENDING:
      default:
        row.pending += 1;
        break;
    }
  }

  // Preserve bracket order
  const rows = STAKE_BRACKET_DEFS.map((def) => map.get(def.key)!);
  return computeRowMetrics(rows);
}

function buildBySportMarket(boletins: StatsBoletinRecord[]): StatsBySportMarketCell[] {
  const map = new Map<string, { sport: string; market: string; totalBets: number; won: number; lost: number; staked: number; returned: number }>();

  for (const boletin of boletins) {
    const stake = boletin.isFreebet ? 0 : decimalToNumber(boletin.stake);
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;
    const itemCount = Math.max(boletin.items.length, 1);
    const stakeShare = stake / itemCount;
    const returnShare = effectiveReturn / itemCount;

    for (const item of boletin.items) {
      const key = `${item.sport}::${item.market}`;
      let cell = map.get(key);
      if (!cell) {
        cell = { sport: item.sport, market: item.market, totalBets: 0, won: 0, lost: 0, staked: 0, returned: 0 };
        map.set(key, cell);
      }
      cell.totalBets += 1;
      cell.staked += stakeShare;
      cell.returned += returnShare;

      if (item.result === ItemResult.WON) cell.won += 1;
      else if (item.result === ItemResult.LOST) cell.lost += 1;
    }
  }

  return Array.from(map.values()).map((cell) => {
    const profitLoss = cell.returned - cell.staked;
    const decisive = cell.won + cell.lost;
    return {
      sport: cell.sport,
      market: cell.market,
      totalBets: cell.totalBets,
      won: cell.won,
      lost: cell.lost,
      roi: cell.staked > 0 ? round((profitLoss / cell.staked) * 100) : 0,
      winRate: decisive > 0 ? round((cell.won / decisive) * 100) : 0,
    };
  });
}

function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildBySite(boletins: StatsBoletinRecord[]): StatsBySiteRow[] {
  const map = new Map<string, {
    siteSlug: string;
    totalBets: number;
    won: number;
    lost: number;
    void: number;
    pending: number;
    settledStake: number;
    totalStaked: number;
    totalReturned: number;
    oddsSum: number;
    oddsCount: number;
    monthly: Map<string, { staked: number; returned: number }>;
  }>();

  for (const boletin of boletins) {
    const slug = boletin.siteSlug ?? 'unknown';
    let row = map.get(slug);
    if (!row) {
      row = {
        siteSlug: slug,
        totalBets: 0,
        won: 0,
        lost: 0,
        void: 0,
        pending: 0,
        settledStake: 0,
        totalStaked: 0,
        totalReturned: 0,
        oddsSum: 0,
        oddsCount: 0,
        monthly: new Map(),
      };
      map.set(slug, row);
    }

    const stake = boletin.isFreebet ? 0 : decimalToNumber(boletin.stake);
    const odds = decimalToNumber(boletin.totalOdds);
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;

    row.totalBets += 1;
    row.totalStaked += stake;
    row.oddsSum += odds;
    row.oddsCount += 1;

    if (settled) {
      row.settledStake += stake;
      row.totalReturned += effectiveReturn;

      // Monthly bucket
      const monthKey = getMonthKey(boletin.betDate ?? boletin.createdAt);
      let monthly = row.monthly.get(monthKey);
      if (!monthly) {
        monthly = { staked: 0, returned: 0 };
        row.monthly.set(monthKey, monthly);
      }
      monthly.staked += stake;
      monthly.returned += effectiveReturn;
    }

    switch (boletin.status) {
      case BoletinStatus.WON:
      case BoletinStatus.PARTIAL:
        row.won += 1;
        break;
      case BoletinStatus.LOST:
        row.lost += 1;
        break;
      case BoletinStatus.VOID:
        row.void += 1;
        break;
      case BoletinStatus.CASHOUT:
        break;
      case BoletinStatus.PENDING:
      default:
        row.pending += 1;
        break;
    }
  }

  return Array.from(map.values())
    .map((row): StatsBySiteRow => {
      const profitLoss = row.totalReturned - row.settledStake;
      const decisive = row.won + row.lost;

      // Build monthly ROI series sorted chronologically
      const monthlySeries: SiteMonthlyROI[] = Array.from(row.monthly.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]): SiteMonthlyROI => ({
          month,
          roi: data.staked > 0 ? round((data.returned - data.staked) / data.staked * 100) : 0,
        }));

      return {
        key: row.siteSlug,
        label: row.siteSlug,
        siteSlug: row.siteSlug,
        averageOdds: row.oddsCount > 0 ? round(row.oddsSum / row.oddsCount, 2) : 0,
        totalBets: row.totalBets,
        won: row.won,
        lost: row.lost,
        void: row.void,
        pending: row.pending,
        settledStake: round(row.settledStake),
        totalStaked: round(row.totalStaked),
        totalReturned: round(row.totalReturned),
        profitLoss: round(profitLoss),
        roi: row.settledStake > 0 ? round((profitLoss / row.settledStake) * 100) : 0,
        winRate: decisive > 0 ? round((row.won / decisive) * 100) : 0,
        monthlySeries,
      };
    })
    .sort((a, b) => b.totalStaked - a.totalStaked);
}

function periodToDefaultGranularity(period: StatsPeriod): 'daily' | 'weekly' | 'monthly' {
  if (period === 'week') return 'daily';
  if (period === 'month') return 'weekly';
  return 'monthly';
}

// ─── New breakdown builders ───────────────────────────────────────────────────

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);

function buildByHour(boletins: StatsBoletinRecord[]): StatsByHourRow[] {
  const map = new Map<number, StatsByHourRow>();

  for (let h = 0; h < 24; h++) {
    map.set(h, {
      hour: h,
      key: String(h),
      label: HOUR_LABELS[h]!,
      totalBets: 0,
      won: 0,
      lost: 0,
      void: 0,
      pending: 0,
      settledStake: 0,
      totalStaked: 0,
      totalReturned: 0,
      profitLoss: 0,
      roi: 0,
      winRate: 0,
    });
  }

  for (const boletin of boletins) {
    const date = boletin.betDate ?? boletin.createdAt;
    const hour = date.getUTCHours();
    const row = map.get(hour)!;
    const stake = boletin.isFreebet ? 0 : decimalToNumber(boletin.stake);
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;

    row.totalBets += 1;
    row.totalStaked += stake;

    if (settled) {
      row.settledStake += stake;
      row.totalReturned += effectiveReturn;
    }

    switch (boletin.status) {
      case BoletinStatus.WON:
      case BoletinStatus.PARTIAL:
        row.won += 1;
        break;
      case BoletinStatus.LOST:
        row.lost += 1;
        break;
      case BoletinStatus.VOID:
        row.void += 1;
        break;
      case BoletinStatus.CASHOUT:
        break;
      case BoletinStatus.PENDING:
      default:
        row.pending += 1;
        break;
    }
  }

  const rows = Array.from({ length: 24 }, (_, i) => map.get(i)!);
  return computeRowMetrics(rows);
}

function buildLegKillDistribution(boletins: StatsBoletinRecord[]): StatsLegKillRow[] {
  const killCounts = new Map<number, number>();
  let totalLostParlays = 0;

  for (const boletin of boletins) {
    if (boletin.status !== BoletinStatus.LOST) continue;
    if (boletin.items.length < 2) continue; // only parlays

    totalLostParlays += 1;

    for (let i = 0; i < boletin.items.length; i++) {
      if (boletin.items[i]!.result === ItemResult.LOST) {
        const pos = i + 1;
        killCounts.set(pos, (killCounts.get(pos) ?? 0) + 1);
      }
    }
  }

  if (totalLostParlays === 0) return [];

  return Array.from(killCounts.entries())
    .sort(([a], [b]) => a - b)
    .map(([pos, count]): StatsLegKillRow => ({
      legPosition: pos,
      label: `Seleção ${pos}`,
      killCount: count,
      killRate: round((count / totalLostParlays) * 100),
    }));
}

function buildCalibration(boletins: StatsBoletinRecord[]): StatsCalibrationPoint[] {
  // Group item-level bets by implied probability bucket (10% bands)
  const BUCKET_COUNT = 10;
  const buckets: Array<{ won: number; total: number }> = Array.from({ length: BUCKET_COUNT }, () => ({ won: 0, total: 0 }));

  for (const boletin of boletins) {
    if (!isSettledStatus(boletin.status) || boletin.status === BoletinStatus.VOID) continue;

    for (const item of boletin.items) {
      if (item.result === ItemResult.VOID || item.result === ItemResult.PENDING) continue;
      const odds = decimalToNumber(item.oddValue);
      if (odds <= 1) continue;
      const impliedProb = 1 / odds; // 0-1
      const bucketIdx = Math.min(Math.floor(impliedProb * BUCKET_COUNT), BUCKET_COUNT - 1);
      buckets[bucketIdx]!.total += 1;
      if (item.result === ItemResult.WON) buckets[bucketIdx]!.won += 1;
    }
  }

  return buckets
    .map((bucket, i): StatsCalibrationPoint => ({
      label: `${i * 10}-${(i + 1) * 10}%`,
      impliedProbability: (i * 10 + 5) / 100, // centre of bucket
      actualWinRate: bucket.total > 0 ? round(bucket.won / bucket.total, 3) : 0,
      sampleSize: bucket.total,
    }))
    .filter((point) => point.sampleSize > 0);
}

function buildROITrend(boletins: StatsBoletinRecord[]): StatsROITrendPoint[] {
  const WINDOW_SIZE = 5;

  const settled = boletins
    .filter((b) => isSettledStatus(b.status) && b.status !== BoletinStatus.VOID && !b.isFreebet)
    .sort((a, b) => {
      const dateA = a.betDate ?? a.createdAt;
      const dateB = b.betDate ?? b.createdAt;
      return dateA.getTime() - dateB.getTime();
    });

  if (settled.length < WINDOW_SIZE) return [];

  const points: StatsROITrendPoint[] = [];

  for (let i = WINDOW_SIZE - 1; i < settled.length; i++) {
    let windowStaked = 0;
    let windowReturned = 0;

    for (let j = i - WINDOW_SIZE + 1; j <= i; j++) {
      const b = settled[j]!;
      windowStaked += decimalToNumber(b.stake);
      windowReturned += getEffectiveReturn(b);
    }

    const windowPnL = windowReturned - windowStaked;
    points.push({
      betIndex: i,
      roi: windowStaked > 0 ? round((windowPnL / windowStaked) * 100) : 0,
    });
  }

  return points;
}

function buildInsights(summary: StatsSummary, boletins: StatsBoletinRecord[]): StatsInsight[] {
  const insights: StatsInsight[] = [];
  let id = 0;

  // 1. Parlay warning — compare singles vs multi-leg ROI
  const singles = boletins.filter((b) => b.items.length === 1 && isSettledStatus(b.status) && !b.isFreebet);
  const parlays = boletins.filter((b) => b.items.length >= 3 && isSettledStatus(b.status) && !b.isFreebet);
  if (singles.length >= 3 && parlays.length >= 3) {
    const singlesStaked = singles.reduce((sum, b) => sum + decimalToNumber(b.stake), 0);
    const singlesReturned = singles.reduce((sum, b) => sum + getEffectiveReturn(b), 0);
    const singlesROI = singlesStaked > 0 ? ((singlesReturned - singlesStaked) / singlesStaked) * 100 : 0;
    const parlaysStaked = parlays.reduce((sum, b) => sum + decimalToNumber(b.stake), 0);
    const parlaysReturned = parlays.reduce((sum, b) => sum + getEffectiveReturn(b), 0);
    const parlaysROI = parlaysStaked > 0 ? ((parlaysReturned - parlaysStaked) / parlaysStaked) * 100 : 0;
    if (parlaysROI < singlesROI - 10) {
      insights.push({
        id: String(++id),
        icon: 'warning-outline',
        sentiment: 'negative',
        title: 'Acumuladas a prejudicar-te',
        body: `O teu ROI em apostas simples é ${round(singlesROI)}% mas em acumuladas de 3+ seleções é apenas ${round(parlaysROI)}%. Considera reduzir o número de seleções.`,
      });
    }
  }

  // 2. Average stake on losses vs wins
  if (summary.averageLostStake > 0 && summary.averageWonStake > 0 && summary.averageLostStake > summary.averageWonStake * 1.3) {
    insights.push({
      id: String(++id),
      icon: 'trending-down-outline',
      sentiment: 'negative',
      title: 'Stakes mais altas nas perdas',
      body: `A tua stake média em apostas perdidas (€${round(summary.averageLostStake)}) é significativamente maior do que nas ganhas (€${round(summary.averageWonStake)}). Isto pode indicar "tilt" ou excesso de confiança.`,
    });
  }

  // 3. Weekday P&L warning
  const byWeekday = buildByWeekday(boletins);
  const worstDay = byWeekday.reduce((worst, row) => (row.profitLoss < worst.profitLoss ? row : worst), byWeekday[0]!);
  if (worstDay && worstDay.profitLoss < -10 && worstDay.totalBets >= 3) {
    insights.push({
      id: String(++id),
      icon: 'calendar-outline',
      sentiment: 'negative',
      title: `${worstDay.label} é o teu pior dia`,
      body: `Tens um prejuízo de €${round(Math.abs(worstDay.profitLoss))} às ${worstDay.label.toLowerCase()}s com ${worstDay.totalBets} apostas. Considera evitar apostar nesse dia.`,
    });
  }

  // 4. Hot streak
  if (summary.streaks.currentType === 'WON' && summary.streaks.currentCount >= 5) {
    insights.push({
      id: String(++id),
      icon: 'flame-outline',
      sentiment: 'positive',
      title: `Série de ${summary.streaks.currentCount} vitórias!`,
      body: 'Estás num ótimo momento. Mantém a disciplina e não aumentes as stakes por excesso de confiança.',
    });
  }

  // 5. Losing streak
  if (summary.streaks.currentType === 'LOST' && summary.streaks.currentCount >= 4) {
    insights.push({
      id: String(++id),
      icon: 'snow-outline',
      sentiment: 'negative',
      title: `Série de ${summary.streaks.currentCount} derrotas`,
      body: 'Considera fazer uma pausa. Séries negativas são normais mas apostar em "tilt" agrava a situação.',
    });
  }

  // 6. Positive ROI celebration
  if (summary.roi > 5 && summary.settledBoletins >= 10) {
    insights.push({
      id: String(++id),
      icon: 'trophy-outline',
      sentiment: 'positive',
      title: `ROI positivo de ${round(summary.roi)}%`,
      body: `Com ${summary.settledBoletins} apostas resolvidas, estás a superar a expectativa. Continua com a mesma estratégia.`,
    });
  }

  // 7. Favourite / underdog imbalance
  if (summary.favouriteBets >= 5 && summary.underdogBets >= 5) {
    if (summary.favouriteROI < summary.underdogROI - 15) {
      insights.push({
        id: String(++id),
        icon: 'swap-horizontal-outline',
        sentiment: 'neutral',
        title: 'Mais lucro nos underdogs',
        body: `O teu ROI em favoritos (odds < 2.00) é ${round(summary.favouriteROI)}% mas em underdogs é ${round(summary.underdogROI)}%. Podes ter mais edge em apostas de valor.`,
      });
    }
  }

  // 8. Odds efficiency
  if (summary.oddsEfficiency > 0 && summary.oddsEfficiency < 85 && summary.settledBoletins >= 8) {
    insights.push({
      id: String(++id),
      icon: 'speedometer-outline',
      sentiment: 'negative',
      title: 'Eficiência de odds baixa',
      body: `A tua eficiência de odds é ${round(summary.oddsEfficiency)}% — estás a retornar significativamente menos do que o esperado pelas odds. Revê a tua seleção de apostas.`,
    });
  }

  return insights;
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return round(squaredDiffs / values.length);
}

function buildTimeline(boletins: StatsBoletinRecord[], period: StatsPeriod, granularity?: 'daily' | 'weekly' | 'monthly'): StatsTimelinePoint[] {
  const range = getTimelineRange(period, boletins, new Date());
  const effectiveGranularity = granularity ?? periodToDefaultGranularity(period);
  const buckets = createTimelineBuckets(effectiveGranularity, range.start, range.end);
  const bucketMap = new Map<string, TimelineAccumulator>(
    buckets.map((bucket) => [bucket.key, { ...bucket, settledStake: 0 }]),
  );

  for (const boletin of boletins) {
    const bucketKey = getTimelineBucketKey(effectiveGranularity, boletin.betDate ?? boletin.createdAt);
    const bucket = bucketMap.get(bucketKey);

    if (!bucket) {
      continue;
    }

    const stake = decimalToNumber(boletin.stake);
    const effectiveStake = boletin.isFreebet ? 0 : stake;
    bucket.totalStaked += effectiveStake;

    if (isSettledStatus(boletin.status)) {
      bucket.settledStake += effectiveStake;
      bucket.settledBoletins += 1;
      bucket.totalReturned += getEffectiveReturn(boletin);
    } else {
      bucket.pendingBoletins += 1;
    }
  }

  return Array.from(bucketMap.values()).map((bucket) => {
    const profitLoss = bucket.totalReturned - bucket.settledStake;
    return {
      key: bucket.key,
      label: bucket.label,
      bucketStart: bucket.bucketStart,
      bucketEnd: bucket.bucketEnd,
      totalStaked: round(bucket.totalStaked),
      totalReturned: round(bucket.totalReturned),
      profitLoss: round(profitLoss),
      roi: bucket.settledStake > 0 ? round((profitLoss / bucket.settledStake) * 100) : 0,
      settledBoletins: bucket.settledBoletins,
      pendingBoletins: bucket.pendingBoletins,
    };
  });
}

function buildTopBoletins(boletins: StatsBoletinRecord[], mode: 'best' | 'worst'): StatsTopBoletin[] {
  const sorted = [...boletins].sort((left, right) => {
    const delta = getBoletinProfitLoss(right) - getBoletinProfitLoss(left);
    return mode === 'best' ? delta : -delta;
  });

  return sorted.slice(0, 3).map((boletin) => ({
    id: boletin.id,
    name: boletin.name,
    status: boletin.status as unknown as StatsTopBoletin['status'],
    createdAt: boletin.createdAt.toISOString(),
    stake: round(decimalToNumber(boletin.stake)),
    totalOdds: round(decimalToNumber(boletin.totalOdds), 4),
    potentialReturn: round(decimalToNumber(boletin.potentialReturn)),
    actualReturn: isSettledStatus(boletin.status) ? round(getEffectiveReturn(boletin)) : null,
    profitLoss: round(getBoletinProfitLoss(boletin)),
    items: boletin.items.slice(0, 3).map((item) => ({
      id: item.id,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      market: item.market,
      selection: item.selection,
    })),
  }));
}

function getOrCreateSportRow(map: Map<string, StatsBySportRow>, sport: Sport): StatsBySportRow {
  const existing = map.get(sport);
  if (existing) {
    return existing;
  }

  const created: StatsBySportRow = {
    sport: sport as unknown as StatsBySportRow['sport'],
    key: sport,
    label: formatSportLabel(sport),
    totalBets: 0,
    won: 0,
    lost: 0,
    void: 0,
    pending: 0,
    settledStake: 0,
    totalStaked: 0,
    totalReturned: 0,
    profitLoss: 0,
    roi: 0,
    winRate: 0,
  };
  map.set(sport, created);
  return created;
}

function getOrCreateTeamRow(map: Map<string, StatsByTeamRow>, team: string): StatsByTeamRow {
  const existing = map.get(team);
  if (existing) {
    return existing;
  }

  const created: StatsByTeamRow = {
    team,
    key: team,
    label: team,
    totalBets: 0,
    won: 0,
    lost: 0,
    void: 0,
    pending: 0,
    settledStake: 0,
    totalStaked: 0,
    totalReturned: 0,
    profitLoss: 0,
    roi: 0,
    winRate: 0,
  };
  map.set(team, created);
  return created;
}

function getOrCreateCompetitionRow(map: Map<string, StatsByCompetitionRow>, competition: string): StatsByCompetitionRow {
  const existing = map.get(competition);
  if (existing) {
    return existing;
  }

  const created: StatsByCompetitionRow = {
    competition,
    key: competition,
    label: competition,
    totalBets: 0,
    won: 0,
    lost: 0,
    void: 0,
    pending: 0,
    settledStake: 0,
    totalStaked: 0,
    totalReturned: 0,
    profitLoss: 0,
    roi: 0,
    winRate: 0,
  };
  map.set(competition, created);
  return created;
}

function getOrCreateMarketRow(map: Map<string, StatsByMarketRow>, market: string): StatsByMarketRow {
  const existing = map.get(market);
  if (existing) {
    return existing;
  }

  const created: StatsByMarketRow = {
    market,
    key: market,
    label: market,
    totalBets: 0,
    won: 0,
    lost: 0,
    void: 0,
    pending: 0,
    settledStake: 0,
    totalStaked: 0,
    totalReturned: 0,
    profitLoss: 0,
    roi: 0,
    winRate: 0,
  };
  map.set(market, created);
  return created;
}

function applyBreakdownContribution(
  row: BreakdownAccumulator,
  result: ItemResult,
  stakeShare: number,
  returnShare: number,
): void {
  row.totalBets += 1;
  row.totalStaked += stakeShare;

  switch (result) {
    case ItemResult.WON:
      row.won += 1;
      row.settledStake += stakeShare;
      row.totalReturned += returnShare;
      break;
    case ItemResult.LOST:
      row.lost += 1;
      row.settledStake += stakeShare;
      row.totalReturned += returnShare;
      break;
    case ItemResult.VOID:
      row.void += 1;
      row.settledStake += stakeShare;
      row.totalReturned += returnShare;
      break;
    case ItemResult.PENDING:
    default:
      row.pending += 1;
      break;
  }
}

function finalizeRows<T extends BreakdownAccumulator>(rows: T[]): T[] {
  return computeRowMetrics(rows).sort((left, right) => right.totalStaked - left.totalStaked);
}

function computeRowMetrics<T extends BreakdownAccumulator>(rows: T[]): T[] {
  return rows.map((row) => {
    const profitLoss = row.totalReturned - row.settledStake;
    const decisive = row.won + row.lost;

    return {
      ...row,
      settledStake: round(row.settledStake),
      totalStaked: round(row.totalStaked),
      totalReturned: round(row.totalReturned),
      profitLoss: round(profitLoss),
      roi: row.settledStake > 0 ? round((profitLoss / row.settledStake) * 100) : 0,
      winRate: decisive > 0 ? round((row.won / decisive) * 100) : 0,
    };
  });
}

function getEffectiveReturn(boletin: StatsBoletinRecord): number {
  if (boletin.actualReturn) {
    return decimalToNumber(boletin.actualReturn);
  }

  switch (boletin.status) {
    case BoletinStatus.WON:
      return decimalToNumber(boletin.potentialReturn);
    case BoletinStatus.LOST:
      return 0;
    case BoletinStatus.VOID:
      return decimalToNumber(boletin.stake);
    case BoletinStatus.PARTIAL:
      return decimalToNumber(boletin.stake);
    case BoletinStatus.CASHOUT:
      return decimalToNumber(boletin.cashoutAmount) || decimalToNumber(boletin.stake);
    case BoletinStatus.PENDING:
    default:
      return 0;
  }
}

function getBoletinProfitLoss(boletin: StatsBoletinRecord): number {
  return getEffectiveReturn(boletin) - decimalToNumber(boletin.stake);
}

function isSettledStatus(status: BoletinStatus): boolean {
  return status !== BoletinStatus.PENDING;
}

function decimalToNumber(value: Prisma.Decimal | null): number {
  return value ? Number(value.toString()) : 0;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function formatSportLabel(sport: Sport): string {
  switch (sport) {
    case Sport.FOOTBALL:
      return 'Futebol';
    case Sport.BASKETBALL:
      return 'Basquetebol';
    case Sport.TENNIS:
      return 'Ténis';
    case Sport.HANDBALL:
      return 'Andebol';
    case Sport.VOLLEYBALL:
      return 'Voleibol';
    case Sport.HOCKEY:
      return 'Hóquei';
    case Sport.RUGBY:
      return 'Râguebi';
    case Sport.AMERICAN_FOOTBALL:
      return 'Futebol Americano';
    case Sport.BASEBALL:
      return 'Basebol';
    case Sport.OTHER:
    default:
      return 'Outro';
  }
}

function getOddsRange(oddValue: number): OddsRangeDefinition {
  return (
    ODDS_RANGE_DEFINITIONS.find((range) => {
      const aboveMin = range.minOdds === null ? oddValue < (range.maxOdds ?? Number.POSITIVE_INFINITY) : oddValue >= range.minOdds;
      const belowMax = range.maxOdds === null ? true : oddValue < range.maxOdds;
      return aboveMin && belowMax;
    }) ?? ODDS_RANGE_DEFINITIONS[ODDS_RANGE_DEFINITIONS.length - 1]
  );
}

function getPeriodRange(period: StatsPeriod, now: Date): { start: Date; end: Date } | null {
  const end = new Date(now);

  switch (period) {
    case 'week': {
      const start = startOfDay(addDays(now, -6));
      return { start, end };
    }
    case 'month':
      return { start: startOfMonth(now), end };
    case 'year':
      return { start: startOfYear(now), end };
    case 'all':
    default:
      return null;
  }
}

function getTimelineRange(
  period: StatsPeriod,
  boletins: StatsBoletinRecord[],
  now: Date,
): { start: Date; end: Date } {
  const explicitRange = getPeriodRange(period, now);
  if (explicitRange) {
    return explicitRange;
  }

  // Use the earliest effective date (betDate if set, otherwise createdAt) so that
  // manually back-dated boletins expand the chart range correctly.
  const earliest = boletins.reduce<Date | null>((min, b) => {
    const d = b.betDate ?? b.createdAt;
    return min === null || d < min ? d : min;
  }, null);
  if (!earliest) {
    return { start: startOfMonth(now), end: now };
  }

  return { start: startOfMonth(earliest), end: now };
}

function createTimelineBuckets(granularity: 'daily' | 'weekly' | 'monthly', start: Date, end: Date): TimelineAccumulator[] {
  const buckets: TimelineAccumulator[] = [];

  if (granularity === 'daily') {
    let cursor = startOfDay(start);
    while (cursor <= end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = endOfDay(cursor);
      buckets.push({
        key: getTimelineBucketKey(granularity, bucketStart),
        label: formatDayMonth(bucketStart),
        bucketStart: bucketStart.toISOString(),
        bucketEnd: bucketEnd.toISOString(),
        totalStaked: 0,
        totalReturned: 0,
        profitLoss: 0,
        roi: 0,
        settledBoletins: 0,
        pendingBoletins: 0,
        settledStake: 0,
      });
      cursor = addDays(cursor, 1);
    }
    return buckets;
  }

  if (granularity === 'weekly') {
    let cursor = startOfWeek(start);
    while (cursor <= end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = endOfWeek(cursor);
      buckets.push({
        key: getTimelineBucketKey(granularity, bucketStart),
        label: formatDayMonth(bucketStart),
        bucketStart: bucketStart.toISOString(),
        bucketEnd: bucketEnd.toISOString(),
        totalStaked: 0,
        totalReturned: 0,
        profitLoss: 0,
        roi: 0,
        settledBoletins: 0,
        pendingBoletins: 0,
        settledStake: 0,
      });
      cursor = addDays(cursor, 7);
    }
    return buckets;
  }

  // monthly
  let cursor = startOfMonth(start);
  while (cursor <= end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = endOfMonth(cursor);
    buckets.push({
      key: getTimelineBucketKey(granularity, bucketStart),
      label: formatMonthLabel(bucketStart, true),
      bucketStart: bucketStart.toISOString(),
      bucketEnd: bucketEnd.toISOString(),
      totalStaked: 0,
      totalReturned: 0,
      profitLoss: 0,
      roi: 0,
      settledBoletins: 0,
      pendingBoletins: 0,
      settledStake: 0,
    });
    cursor = addMonths(cursor, 1);
  }

  return buckets;
}

function getTimelineBucketKey(granularity: 'daily' | 'weekly' | 'monthly', date: Date): string {
  if (granularity === 'daily') {
    return startOfDay(date).toISOString().slice(0, 10);
  }

  if (granularity === 'weekly') {
    return startOfWeek(date).toISOString().slice(0, 10);
  }

  const monthStart = startOfMonth(date);
  return `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, diff));
}

function endOfWeek(date: Date): Date {
  return endOfDay(addDays(startOfWeek(date), 6));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
}

function formatMonthLabel(date: Date, includeYear: boolean): string {
  return new Intl.DateTimeFormat('pt-PT', {
    month: 'short',
    ...(includeYear ? { year: '2-digit' as const } : {}),
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '');
}