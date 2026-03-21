import { BoletinStatus, ItemResult, Prisma, Sport } from '@prisma/client';
import type {
  PersonalStats,
  StatsByMarketRow,
  StatsByOddsRangeRow,
  StatsBySiteRow,
  StatsBySportRow,
  StatsBreakdownRow,
  StatsPeriod,
  StatsSummary,
  StatsTimelinePoint,
  StatsTopBoletin,
} from '@betintel/shared';
import { prisma } from '../../prisma';

const STATS_BOLETIN_INCLUDE = {
  items: {
    include: {
      event: {
        select: {
          id: true,
          sport: true,
          homeTeam: true,
          awayTeam: true,
        },
      },
      site: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
        },
      },
    },
    orderBy: { id: 'asc' },
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

/** Returns the full statistics bundle for the authenticated user. */
export async function getPersonalStats(userId: string, period: StatsPeriod): Promise<PersonalStats> {
  const boletins = await getBoletinsForPeriod(userId, period);
  return buildStatsBundle(boletins, period);
}

/** Returns the summary-only stats payload. */
export async function getStatsSummary(userId: string, period: StatsPeriod): Promise<StatsSummary> {
  const stats = await getPersonalStats(userId, period);
  return stats.summary;
}

/** Returns the sport breakdown rows for the authenticated user. */
export async function getStatsBySport(userId: string, period: StatsPeriod): Promise<StatsBySportRow[]> {
  const stats = await getPersonalStats(userId, period);
  return stats.bySport;
}

/** Returns the betting-site breakdown rows for the authenticated user. */
export async function getStatsBySite(userId: string, period: StatsPeriod): Promise<StatsBySiteRow[]> {
  const stats = await getPersonalStats(userId, period);
  return stats.bySite;
}

/** Returns the market breakdown rows for the authenticated user. */
export async function getStatsByMarket(userId: string, period: StatsPeriod): Promise<StatsByMarketRow[]> {
  const stats = await getPersonalStats(userId, period);
  return stats.byMarket;
}

/** Returns the odds-range breakdown rows for the authenticated user. */
export async function getStatsByOddsRange(userId: string, period: StatsPeriod): Promise<StatsByOddsRangeRow[]> {
  const stats = await getPersonalStats(userId, period);
  return stats.byOddsRange;
}

/** Returns the timeline rows for the authenticated user. */
export async function getStatsTimeline(userId: string, period: StatsPeriod): Promise<StatsTimelinePoint[]> {
  const stats = await getPersonalStats(userId, period);
  return stats.timeline;
}

async function getBoletinsForPeriod(userId: string, period: StatsPeriod): Promise<StatsBoletinRecord[]> {
  const range = getPeriodRange(period, new Date());

  return prisma.boletin.findMany({
    where: {
      userId,
      ...(range
        ? {
            createdAt: {
              gte: range.start,
              lte: range.end,
            },
          }
        : {}),
    },
    include: STATS_BOLETIN_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

function buildStatsBundle(boletins: StatsBoletinRecord[], period: StatsPeriod): PersonalStats {
  const summary = buildSummary(boletins, period);
  const bySportMap = new Map<string, StatsBySportRow>();
  const bySiteMap = new Map<string, StatsBySiteRow>();
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
    const settled = isSettledStatus(boletin.status);
    const effectiveReturn = settled ? getEffectiveReturn(boletin) : 0;
    const itemCount = Math.max(boletin.items.length, 1);
    const stakeShare = stake / itemCount;
    const returnShare = effectiveReturn / itemCount;

    for (const item of boletin.items) {
      const sportKey = item.event.sport;
      const siteKey = item.site.id;
      const marketKey = item.market;
      const oddsRange = getOddsRange(decimalToNumber(item.oddValue));

      const sportRow = getOrCreateSportRow(bySportMap, sportKey);
      const siteRow = getOrCreateSiteRow(bySiteMap, item.site.id, item.site.slug, item.site.name, item.site.logoUrl);
      const marketRow = getOrCreateMarketRow(byMarketMap, marketKey);
      const oddsRangeRow = byOddsRangeMap.get(oddsRange.key);

      applyBreakdownContribution(sportRow, item.result, stakeShare, returnShare);
      applyBreakdownContribution(siteRow, item.result, stakeShare, returnShare);
      applyBreakdownContribution(marketRow, item.result, stakeShare, returnShare);
      if (oddsRangeRow) {
        applyBreakdownContribution(oddsRangeRow, item.result, stakeShare, returnShare);
      }
    }
  }

  const timeline = buildTimeline(boletins, period);
  const settledBoletins = boletins.filter((boletin) => isSettledStatus(boletin.status));

  return {
    summary,
    bySport: finalizeRows(Array.from(bySportMap.values())),
    bySite: finalizeRows(Array.from(bySiteMap.values())),
    byMarket: finalizeRows(Array.from(byMarketMap.values())),
    byOddsRange: finalizeRows(Array.from(byOddsRangeMap.values())),
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

  for (const boletin of boletins) {
    const stake = decimalToNumber(boletin.stake);
    totalStaked += stake;
    totalOdds += decimalToNumber(boletin.totalOdds);

    switch (boletin.status) {
      case BoletinStatus.WON:
        settledBoletins += 1;
        wonBoletins += 1;
        settledStake += stake;
        totalReturned += getEffectiveReturn(boletin);
        break;
      case BoletinStatus.LOST:
        settledBoletins += 1;
        lostBoletins += 1;
        settledStake += stake;
        totalReturned += getEffectiveReturn(boletin);
        break;
      case BoletinStatus.VOID:
        settledBoletins += 1;
        voidBoletins += 1;
        settledStake += stake;
        totalReturned += getEffectiveReturn(boletin);
        break;
      case BoletinStatus.PARTIAL:
        settledBoletins += 1;
        partialBoletins += 1;
        settledStake += stake;
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
    averageOdds: boletins.length > 0 ? round(totalOdds / boletins.length, 2) : 0,
    averageStake: boletins.length > 0 ? round(totalStaked / boletins.length) : 0,
    averageReturn: settledBoletins > 0 ? round(totalReturned / settledBoletins) : 0,
  };
}

function buildTimeline(boletins: StatsBoletinRecord[], period: StatsPeriod): StatsTimelinePoint[] {
  const range = getTimelineRange(period, boletins, new Date());
  const buckets = createTimelineBuckets(period, range.start, range.end);
  const bucketMap = new Map<string, TimelineAccumulator>(
    buckets.map((bucket) => [bucket.key, { ...bucket, settledStake: 0 }]),
  );

  for (const boletin of boletins) {
    const bucketKey = getTimelineBucketKey(period, boletin.createdAt);
    const bucket = bucketMap.get(bucketKey);

    if (!bucket) {
      continue;
    }

    const stake = decimalToNumber(boletin.stake);
    bucket.totalStaked += stake;

    if (isSettledStatus(boletin.status)) {
      bucket.settledStake += stake;
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
      homeTeam: item.event.homeTeam,
      awayTeam: item.event.awayTeam,
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

function getOrCreateSiteRow(
  map: Map<string, StatsBySiteRow>,
  siteId: string,
  slug: string,
  name: string,
  logoUrl: string | null,
): StatsBySiteRow {
  const existing = map.get(siteId);
  if (existing) {
    return existing;
  }

  const created: StatsBySiteRow = {
    siteId,
    slug,
    logoUrl,
    key: siteId,
    label: name,
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
  map.set(siteId, created);
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
  return rows
    .map((row) => {
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
    })
    .sort((left, right) => right.totalStaked - left.totalStaked);
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

  const firstBoletin = boletins[0]?.createdAt;
  if (!firstBoletin) {
    return { start: startOfMonth(now), end: now };
  }

  return { start: startOfMonth(firstBoletin), end: now };
}

function createTimelineBuckets(period: StatsPeriod, start: Date, end: Date): TimelineAccumulator[] {
  const buckets: TimelineAccumulator[] = [];

  if (period === 'week') {
    let cursor = startOfDay(start);
    while (cursor <= end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = endOfDay(cursor);
      buckets.push({
        key: getTimelineBucketKey(period, bucketStart),
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

  if (period === 'month') {
    let cursor = startOfWeek(start);
    while (cursor <= end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = endOfWeek(cursor);
      buckets.push({
        key: getTimelineBucketKey(period, bucketStart),
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

  let cursor = startOfMonth(start);
  while (cursor <= end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = endOfMonth(cursor);
    buckets.push({
      key: getTimelineBucketKey(period, bucketStart),
      label: formatMonthLabel(bucketStart, period === 'all'),
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

function getTimelineBucketKey(period: StatsPeriod, date: Date): string {
  if (period === 'week') {
    return startOfDay(date).toISOString().slice(0, 10);
  }

  if (period === 'month') {
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