/**
 * Fixture Refresh Job
 *
 * Re-fetches all openfootball league files, upserts fixture records, and
 * marks completed matches as FINISHED when score data becomes available.
 *
 * Schedule: every Monday at 06:00 UTC (matches the ATP/WTA ranking jobs).
 * Can also be triggered manually via POST /api/fixtures/refresh.
 */

import Bull from 'bull';
import { logger } from '../utils/logger';
import { ingestFixtures } from '../services/fixtureService';

// ─── Queue ────────────────────────────────────────────────────────────────────

export const fixtureRefreshQueue = new Bull('fixture-refresh', process.env.REDIS_URL!, {
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  },
});

fixtureRefreshQueue.on('error', (err) => {
  logger.error('[FixtureRefresh] Queue error', { error: err.message });
});

// ─── Processor ───────────────────────────────────────────────────────────────

fixtureRefreshQueue.process(async (_job) => {
  return ingestFixtures();
});

fixtureRefreshQueue.on('completed', (_job, result) => {
  logger.info('[FixtureRefresh] Job completed', result);
});

fixtureRefreshQueue.on('failed', (_job, err) => {
  logger.error('[FixtureRefresh] Job failed', { error: err.message });
});

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Registers the weekly repeatable job.
 * Removes any existing repeatable jobs first to avoid duplicates on restart.
 */
export async function scheduleFixtureRefreshJob(): Promise<void> {
  const repeatableJobs = await fixtureRefreshQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await fixtureRefreshQueue.removeRepeatableByKey(job.key);
  }

  // Every Monday at 06:00 UTC
  await fixtureRefreshQueue.add(
    {},
    { repeat: { cron: '0 6 * * 1' }, jobId: 'fixture-refresh-weekly' },
  );

  logger.info('[FixtureRefresh] Weekly job scheduled (Mondays 06:00 UTC)');
}

/**
 * Manually enqueues an immediate fixture refresh (used by admin endpoint).
 */
export async function triggerFixtureRefresh(): Promise<Bull.Job> {
  return fixtureRefreshQueue.add({}, { jobId: `fixture-refresh-manual-${Date.now()}` });
}
