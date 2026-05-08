/**
 * Fixture Refresh Job
 *
 * Fetches upcoming and recent fixtures from API-Football and upserts them.
 *
 * Schedule: every Monday at 06:00 UTC.
 * Can also be triggered manually via POST /api/fixtures/refresh.
 */

import Bull from 'bull';
import { logger } from '../utils/logger';
import { fixturesSyncJob } from '../services/apifootball/fixturesSync';

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
  return fixturesSyncJob();
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

  // Every 2 hours — keeps scores/statuses current throughout the match day
  await fixtureRefreshQueue.add(
    {},
    { repeat: { cron: '0 */2 * * *' }, jobId: 'fixture-refresh-bihourly' },
  );

  logger.info('[FixtureRefresh] Bi-hourly job scheduled (every 2h)');
}

/**
 * Manually enqueues an immediate fixture refresh (used by admin endpoint).
 */
export async function triggerFixtureRefresh(): Promise<Bull.Job> {
  return fixtureRefreshQueue.add({}, { jobId: `fixture-refresh-manual-${Date.now()}` });
}
