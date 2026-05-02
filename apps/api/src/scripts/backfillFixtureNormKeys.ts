// apps/api/src/scripts/backfillFixtureNormKeys.ts
// Usage: npx ts-node -r tsconfig-paths/register src/scripts/backfillFixtureNormKeys.ts

import { prisma } from '../prisma';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { resolveAlias } from '../utils/teamAliases';
import { logger } from '../utils/logger';

async function main() {
  const fixtures = await prisma.fixture.findMany({
    where: { OR: [{ homeTeamNormKey: null }, { awayTeamNormKey: null }] },
  });

  logger.info(`[backfillFixtureNormKeys] Backfilling ${fixtures.length} fixtures`);

  let updated = 0;
  for (const f of fixtures) {
    await prisma.fixture.update({
      where: { id: f.id },
      data: {
        homeTeamNormKey: resolveAlias(normaliseTeamName(f.homeTeam)),
        awayTeamNormKey: resolveAlias(normaliseTeamName(f.awayTeam)),
      },
    });
    updated++;
  }

  logger.info(`[backfillFixtureNormKeys] Done — updated ${updated} fixtures`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
