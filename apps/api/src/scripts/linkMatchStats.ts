// apps/api/src/scripts/linkMatchStats.ts
// Fuzzy-matches MatchStat rows to Fixture rows by normalised team names ± 1 day.
// Aim for >95% linked. Add unmatched names to TEAM_ALIASES and re-run.
// Usage: npx ts-node -r tsconfig-paths/register src/scripts/linkMatchStats.ts

import { prisma } from '../prisma';
import { resolveAlias } from '../utils/teamAliases';
import { logger } from '../utils/logger';

const DAY_MS = 86_400_000;

async function main() {
  const unlinked = await prisma.matchStat.findMany({
    where: { fixtureId: null },
    select: { id: true, homeTeamNormKey: true, awayTeamNormKey: true, date: true, competition: true },
  });
  logger.info(`[linkMatchStats] ${unlinked.length} unlinked rows`);

  let linked = 0, failed = 0;

  for (const stat of unlinked) {
    const homeKey     = resolveAlias(stat.homeTeamNormKey);
    const awayKey     = resolveAlias(stat.awayTeamNormKey);
    const windowStart = new Date(stat.date.getTime() - DAY_MS);
    const windowEnd   = new Date(stat.date.getTime() + DAY_MS);

    const fixture = await prisma.fixture.findFirst({
      where: {
        homeTeamNormKey: homeKey,
        awayTeamNormKey: awayKey,
        kickoffAt: { gte: windowStart, lte: windowEnd },
      },
    });

    if (fixture) {
      await prisma.matchStat.update({ where: { id: stat.id }, data: { fixtureId: fixture.id } });
      linked++;
    } else {
      failed++;
      logger.warn(`[linkMatchStats] No match: ${stat.homeTeamNormKey} v ${stat.awayTeamNormKey} on ${stat.date.toISOString().slice(0, 10)} (${stat.competition})`);
    }
  }

  const total = linked + failed;
  logger.info(`[linkMatchStats] Linked: ${linked} / Failed: ${failed} (${total > 0 ? Math.round(linked / total * 100) : 0}%)`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
