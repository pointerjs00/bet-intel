// apps/api/src/scheduler.ts
// Manages weekly football data sync jobs using Bull v4 (matching existing job pattern).

import Bull from 'bull';
import { logger } from './utils/logger';
import { standingsSyncJob }              from './jobs/standingsSyncJob';
import { currentSeasonMatchStatSyncJob } from './jobs/currentSeasonMatchStatSyncJob';
import { injuriesSyncJob }               from './jobs/injuriesSyncJob';
import { topScorersSyncJob }             from './jobs/topScorersSyncJob';

const REDIS_URL = process.env.REDIS_URL!;

const FOOTBALL_DATA_JOBS = [
  { name: 'standings-sync',          cron: '0 7 * * 1',  handler: standingsSyncJob },
  { name: 'current-season-csv-sync', cron: '30 7 * * 1', handler: currentSeasonMatchStatSyncJob },
  { name: 'injuries-sync',           cron: '0 8 * * 1',  handler: injuriesSyncJob },
  { name: 'top-scorers-sync',        cron: '0 9 * * 1',  handler: topScorersSyncJob },
] as const;

export async function initFootballDataScheduler(): Promise<void> {
  const defaultJobOptions = {
    removeOnComplete: 5,
    removeOnFail: 10,
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 60_000 },
  };

  for (const { name, cron, handler } of FOOTBALL_DATA_JOBS) {
    const queue = new Bull(name, REDIS_URL, { defaultJobOptions });

    queue.process(async () => {
      logger.info(`[scheduler] Starting: ${name}`);
      await handler();
      logger.info(`[scheduler] Completed: ${name}`);
    });

    queue.on('failed', (_job, err) => {
      logger.error(`[scheduler] ${name} failed`, { error: err.message });
    });

    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await queue.removeRepeatableByKey(job.key);
    }
    await queue.add({}, { repeat: { cron }, jobId: `${name}-weekly` });

    logger.info(`[scheduler] ${name} registered (cron: ${cron})`);
  }
}
