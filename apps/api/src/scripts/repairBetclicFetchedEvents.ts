import 'dotenv/config';

import { prisma } from '../prisma';
import { invalidateOddsCache } from '../services/odds/oddsService';
import { redis } from '../utils/redis';

interface RepairArgs {
  siteSlug: string;
}

interface EventWithOdds {
  id: string;
  externalId: string | null;
  eventDate: Date;
  updatedAt: Date;
  apiFootballFixtureId: number | null;
  odds: Array<{
    id: string;
    eventId: string;
    market: string;
    selection: string;
    value: string;
    scrapedAt: Date;
    isActive: boolean;
  }>;
}

const EVENT_DATE_OVERRIDES: Readonly<Record<string, string>> = {
  '1046142394949632': '2026-03-22T12:30:00.000Z',
};

function parseArgs(argv: string[]): RepairArgs {
  const siteSlugArg = argv.find((arg) => arg.startsWith('--siteSlug='));
  return {
    siteSlug: siteSlugArg?.split('=')[1]?.trim() || 'betclic',
  };
}

function oddKey(odd: Pick<EventWithOdds['odds'][number], 'market' | 'selection'>): string {
  return `${odd.market}__${odd.selection}`;
}

function countDistinctMarkets(odds: EventWithOdds['odds']): number {
  return new Set(odds.map((odd) => odd.market)).size;
}

function chooseCanonical(events: EventWithOdds[]): EventWithOdds {
  return [...events].sort((left, right) => {
    const byFixtureId = Number(Boolean(right.apiFootballFixtureId)) - Number(Boolean(left.apiFootballFixtureId));
    if (byFixtureId !== 0) {
      return byFixtureId;
    }

    const byActiveOdds = right.odds.length - left.odds.length;
    if (byActiveOdds !== 0) {
      return byActiveOdds;
    }

    const byMarketCount = countDistinctMarkets(right.odds) - countDistinctMarkets(left.odds);
    if (byMarketCount !== 0) {
      return byMarketCount;
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  })[0] as EventWithOdds;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const site = await prisma.bettingSite.findUnique({
    where: { slug: args.siteSlug },
    select: { id: true, slug: true },
  });

  if (!site) {
    throw new Error(`Betting site not found for slug: ${args.siteSlug}`);
  }

  const duplicateGroups = await prisma.$queryRaw<Array<{ externalId: string; count: number }>>`
    SELECT se."externalId", COUNT(*)::int AS count
    FROM "SportEvent" se
    JOIN "Odd" o ON o."eventId" = se.id
    WHERE o."siteId" = ${site.id}
      AND o."isActive" = true
      AND se."externalId" IS NOT NULL
    GROUP BY se."externalId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, se."externalId" ASC
  `;

  const repaired: Array<{
    canonicalId: string;
    duplicateIds: string[];
    externalId: string;
    updatedCanonicalOdds: number;
  }> = [];

  for (const group of duplicateGroups) {
    const events = await prisma.sportEvent.findMany({
      where: { externalId: group.externalId },
      select: {
        id: true,
        externalId: true,
        eventDate: true,
        updatedAt: true,
        apiFootballFixtureId: true,
        odds: {
          where: {
            siteId: site.id,
            isActive: true,
          },
          select: {
            id: true,
            eventId: true,
            isActive: true,
            market: true,
            scrapedAt: true,
            selection: true,
            value: true,
          },
          orderBy: {
            scrapedAt: 'desc',
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const normalisedEvents: EventWithOdds[] = events.map((event) => ({
      ...event,
      odds: event.odds.map((odd) => ({
        ...odd,
        value: String(odd.value),
      })),
    }));

    if (normalisedEvents.length < 2) {
      continue;
    }

    const canonical = chooseCanonical(normalisedEvents);
    const duplicateIds = normalisedEvents.filter((event) => event.id !== canonical.id).map((event) => event.id);
    const latestByKey = new Map<string, EventWithOdds['odds'][number]>();

    for (const event of normalisedEvents) {
      for (const odd of event.odds) {
        const key = oddKey(odd);
        const existing = latestByKey.get(key);
        if (!existing || odd.scrapedAt.getTime() > existing.scrapedAt.getTime()) {
          latestByKey.set(key, odd);
        }
      }
    }

    const canonicalOddsByKey = new Map(
      canonical.odds.map((odd) => [oddKey(odd), odd] as const),
    );

    let updatedCanonicalOdds = 0;
    const overrideDateIso = group.externalId ? EVENT_DATE_OVERRIDES[group.externalId] : undefined;
    const nextEventDate = overrideDateIso ? new Date(overrideDateIso) : canonical.eventDate;

    for (const [key, latestOdd] of latestByKey.entries()) {
      const canonicalOdd = canonicalOddsByKey.get(key);
      if (!canonicalOdd) {
        await prisma.odd.update({
          where: { id: latestOdd.id },
          data: {
            eventId: canonical.id,
            isActive: true,
          },
        });
        continue;
      }

      if (
        canonicalOdd.id !== latestOdd.id
        && (canonicalOdd.scrapedAt.getTime() !== latestOdd.scrapedAt.getTime()
          || String(canonicalOdd.value) !== String(latestOdd.value))
      ) {
        await prisma.odd.update({
          where: { id: canonicalOdd.id },
          data: {
            isActive: true,
            scrapedAt: latestOdd.scrapedAt,
            value: String(latestOdd.value),
          },
        });
        updatedCanonicalOdds += 1;
      }
    }

    await prisma.odd.updateMany({
      where: {
        eventId: { in: duplicateIds },
        isActive: true,
        siteId: site.id,
      },
      data: { isActive: false },
    });

    await prisma.sportEvent.update({
      where: { id: canonical.id },
      data: { eventDate: nextEventDate },
    });

    repaired.push({
      canonicalId: canonical.id,
      duplicateIds,
      externalId: group.externalId,
      updatedCanonicalOdds,
    });
  }

  await invalidateOddsCache();

  console.log(JSON.stringify({
    groupsRepaired: repaired.length,
    repaired,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit().catch(() => undefined);
    await prisma.$disconnect();
  });