import 'dotenv/config';

import { prisma } from '../prisma';
import { invalidateOddsCache } from '../services/odds/oddsService';
import { redis } from '../utils/redis';

interface CleanupArgs {
  canonicalId: string;
  eventDate: string;
  externalId: string;
  siteSlug: string;
}

interface ActiveOddRecord {
  eventId: string;
  id: string;
  isActive: boolean;
  market: string;
  scrapedAt: Date;
  selection: string;
  value: string;
}

function parseArgs(argv: string[]): CleanupArgs {
  const values = new Map<string, string>();

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }

    const [rawKey, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();
    if (!rawKey || !value) {
      continue;
    }

    values.set(rawKey, value);
  }

  const externalId = values.get('externalId');
  const canonicalId = values.get('canonicalId');
  const eventDate = values.get('eventDate');
  const siteSlug = values.get('siteSlug') ?? 'betclic';

  if (!externalId || !canonicalId || !eventDate) {
    throw new Error(
      'Usage: pnpm --filter api maintenance:dedupe-betclic-event -- --externalId=<id> --canonicalId=<eventId> --eventDate=<iso-date> [--siteSlug=betclic]',
    );
  }

  return { canonicalId, eventDate, externalId, siteSlug };
}

function oddKey(odd: Pick<ActiveOddRecord, 'market' | 'selection'>): string {
  return `${odd.market}__${odd.selection}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const correctedEventDate = new Date(args.eventDate);
  if (Number.isNaN(correctedEventDate.getTime())) {
    throw new Error(`Invalid eventDate: ${args.eventDate}`);
  }

  const site = await prisma.bettingSite.findUnique({
    where: { slug: args.siteSlug },
    select: { id: true, slug: true },
  });

  if (!site) {
    throw new Error(`Betting site not found for slug: ${args.siteSlug}`);
  }

  const events = await prisma.sportEvent.findMany({
    where: { externalId: args.externalId },
    include: {
      odds: {
        where: { siteId: site.id, isActive: true },
        orderBy: { scrapedAt: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (events.length === 0) {
    throw new Error(`No events found for externalId ${args.externalId}`);
  }

  const canonical = events.find((event) => event.id === args.canonicalId);
  if (!canonical) {
    throw new Error(`Canonical event ${args.canonicalId} was not found among duplicates`);
  }

  const duplicateIds = events
    .filter((event) => event.id !== args.canonicalId)
    .map((event) => event.id);

  const latestByKey = new Map<string, ActiveOddRecord>();
  for (const event of events) {
    for (const odd of event.odds) {
      const key = oddKey(odd);
      const existing = latestByKey.get(key);
      if (!existing || odd.scrapedAt.getTime() > existing.scrapedAt.getTime()) {
        latestByKey.set(key, {
          eventId: odd.eventId,
          id: odd.id,
          isActive: odd.isActive,
          market: odd.market,
          scrapedAt: odd.scrapedAt,
          selection: odd.selection,
          value: String(odd.value),
        });
      }
    }
  }

  const canonicalOddsByKey = new Map(
    canonical.odds.map((odd) => [oddKey(odd), odd] as const),
  );

  let movedOdds = 0;
  let updatedCanonicalOdds = 0;

  await prisma.$transaction(async (transaction) => {
    for (const [key, sourceOdd] of latestByKey.entries()) {
      const canonicalOdd = canonicalOddsByKey.get(key);

      if (canonicalOdd) {
        if (
          canonicalOdd.id !== sourceOdd.id
          && (canonicalOdd.scrapedAt.getTime() !== sourceOdd.scrapedAt.getTime()
            || String(canonicalOdd.value) !== String(sourceOdd.value))
        ) {
          await transaction.odd.update({
            where: { id: canonicalOdd.id },
            data: {
              isActive: true,
              scrapedAt: sourceOdd.scrapedAt,
              value: sourceOdd.value,
            },
          });
          updatedCanonicalOdds += 1;
        }

        continue;
      }

      await transaction.odd.update({
        where: { id: sourceOdd.id },
        data: {
          eventId: args.canonicalId,
          isActive: true,
        },
      });
      movedOdds += 1;
    }

    if (duplicateIds.length > 0) {
      await transaction.odd.updateMany({
        where: {
          eventId: { in: duplicateIds },
          isActive: true,
          siteId: site.id,
        },
        data: { isActive: false },
      });
    }

    await transaction.sportEvent.update({
      where: { id: args.canonicalId },
      data: {
        eventDate: correctedEventDate,
      },
    });
  });

  await invalidateOddsCache();

  console.log(JSON.stringify({
    canonicalId: args.canonicalId,
    duplicateIds,
    eventDate: correctedEventDate.toISOString(),
    movedOdds,
    updatedCanonicalOdds,
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