// apps/api/src/scripts/runPatchSecondaryLeagueFixtures.ts
// Usage: npx ts-node -r tsconfig-paths/register src/scripts/runPatchSecondaryLeagueFixtures.ts

import { runPatchSecondaryLeagueFixtures } from '../scripts/patchSecondaryLeagueFixturesService';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

async function main() {
  logger.info('[runPatchSecondaryLeagueFixtures] Starting');
  try {
    await runPatchSecondaryLeagueFixtures();
    logger.info('[runPatchSecondaryLeagueFixtures] Done');
  } catch (err) {
    logger.error('[runPatchSecondaryLeagueFixtures] Failed', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();