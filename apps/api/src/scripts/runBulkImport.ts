// apps/api/src/scripts/runBulkImport.ts
// Usage: npx ts-node -r tsconfig-paths/register src/scripts/runBulkImport.ts

import { runBulkHistoricalImport } from '../services/bulkHistoricalImportService';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

async function main() {
  logger.info('[runBulkImport] Starting — expect 30–60 minutes for full historical import');
  try {
    await runBulkHistoricalImport();
    logger.info('[runBulkImport] Done');
  } catch (err) {
    logger.error('[runBulkImport] Failed', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
