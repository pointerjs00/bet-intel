// apps/api/src/scripts/runBackfillHistoricalKickoffs.ts
// Usage: npx ts-node -r tsconfig-paths/register src/scripts/runBackfillHistoricalKickoffs.ts
// Or compiled: node dist/scripts/runBackfillHistoricalKickoffs.js

import { runBackfillHistoricalKickoffs } from './backfillHistoricalKickoffsService';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

async function main() {
  logger.info('[runBackfillHistoricalKickoffs] Starting');
  try {
    await runBackfillHistoricalKickoffs();
    logger.info('[runBackfillHistoricalKickoffs] Done');
  } catch (err) {
    logger.error('[runBackfillHistoricalKickoffs] Failed', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();