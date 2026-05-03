// apps/api/src/scripts/runPatchFixturesFromCsv.ts
// Usage: npx ts-node -r tsconfig-paths/register src/scripts/runPatchFixturesFromCsv.ts

import { runPatchFixturesFromCsv } from '../scripts/patchFixturesFromCSV';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

async function main() {
  logger.info('[runPatchFixturesFromCsv] Starting');
  try {
    await runPatchFixturesFromCsv();
    logger.info('[runPatchFixturesFromCsv] Done');
  } catch (err) {
    logger.error('[runPatchFixturesFromCsv] Failed', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();