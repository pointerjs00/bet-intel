// apps/api/src/scheduler.ts
// Manages football data sync jobs using Bull v4.

import Bull from 'bull';
import { logger } from './utils/logger';
import { standingsSyncJob } from './jobs/standingsSyncJob';
import { injuriesSyncJob }  from './jobs/injuriesSyncJob';
import { topScorersSyncJob } from './jobs/topScorersSyncJob';
import { autoSettlementJob } from './jobs/autoSettlementJob';
import { liveScoreJob } from './jobs/liveScoreJob';
import { liveBetTrackerJob } from './jobs/liveBetTrackerJob';
import { syncRecentFixtures } from './services/apifootball/fixturesSync';

const REDIS_URL = process.env.REDIS_URL!;

/**
 * Plan #58: API-Football is retired by default (the app now uses ESPN for fixtures, live
 * tracking, settlement and previews). Set API_FOOTBALL_ENABLED=true to bring its jobs back,
 * e.g. to settle leagues ESPN doesn't cover.
 */
export const API_FOOTBALL_ENABLED = process.env.API_FOOTBALL_ENABLED === 'true';

const FOOTBALL_DATA_JOBS = [
  { name: 'standings-sync',     cron: '0 7 * * 1',   handler: standingsSyncJob, apiFootball: true },
  { name: 'injuries-sync',      cron: '0 8 * * 1',   handler: injuriesSyncJob, apiFootball: true },
  { name: 'top-scorers-sync',   cron: '0 9 * * 1',   handler: topScorersSyncJob, apiFootball: true },
  // Auto-settlement: every 5 minutes — resolves BoletinItems for finished fixtures
  { name: 'auto-settlement',    cron: '*/5 * * * *', handler: autoSettlementJob, apiFootball: true },
  // Live scores: every minute — broadcasts scores to socket clients
  { name: 'live-score',         cron: '* * * * *',   handler: liveScoreJob, apiFootball: true },
  // Live bet tracker (ESPN, free): follows matches with pending selections, notifies and settles.
  // Runs every minute and polls 3× per run (~20 s cadence).
  { name: 'live-bet-tracker',   cron: '* * * * *',   handler: liveBetTrackerJob, apiFootball: false },
  // Recent fixture sync: every 3 minutes — corrects SCHEDULED→FINISHED for today's matches
  // Uses per-league API calls only for leagues with active/recent matches (no-op off-peak)
  { name: 'recent-fixtures-sync', cron: '*/3 * * * *', handler: syncRecentFixtures, apiFootball: true },
] as const;

export async function initFootballDataScheduler(): Promise<void> {
  const defaultJobOptions = {
    removeOnComplete: 5,
    removeOnFail: 10,
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 60_000 },
  };

  for (const { name, cron, handler, apiFootball } of FOOTBALL_DATA_JOBS) {
    const queue = new Bull(name, REDIS_URL, { defaultJobOptions });

    if (apiFootball && !API_FOOTBALL_ENABLED) {
      // Repeatable jobs live in Redis across restarts: remove them so the job really stops.
      for (const job of await queue.getRepeatableJobs()) await queue.removeRepeatableByKey(job.key);
      await queue.close();
      logger.info(`[scheduler] ${name} disabled (API-Football retired)`);
      continue;
    }

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
