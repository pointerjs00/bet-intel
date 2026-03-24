/**
 * Odds job queue — powered by Bull + Redis.
 *
 * Replaces the old Puppeteer scraper jobs with The Odds API polling.
 *
 * Free-tier schedule (The Odds API: 500 req/month ≈ 16/day):
 *  - odds-poll: every 6 hours = 4 calls/day × 4 sports = 16 req/day ✓
 *
 * Scale up: set ODDS_POLL_INTERVAL_MINUTES env var to a lower value and
 * upgrade to a paid Odds API plan — no code changes needed.
 *
 * Call initScrapeJobs() once during app startup (see src/index.ts).
 */

import Bull from 'bull';
import { logger } from '../utils/logger';
import { updateEventStatuses } from '../services/odds/oddsService';
import { fetchAndPersistOdds } from '../services/odds/oddsApiService';
import type { ScrapeJobData } from '../services/scraper/types';

// ─── Queue setup ──────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Single Bull queue for all scrape jobs.
 * Concurrency is kept at 1 to avoid hammering sites simultaneously.
 */
function createScrapeQueue(): Bull.Queue<ScrapeJobData> {
  const queue = new Bull<ScrapeJobData>('scraping', REDIS_URL, {
    settings: {
      // Scrapers can take 15-30 min (200+ events × API enrichment calls).
      // Extend the lock so Bull doesn't mark long-running jobs as stalled.
      lockDuration: 1_800_000,    // 30 minutes
      stalledInterval: 60_000,    // check for stalls every 60 s (default 30 s)
      maxStalledCount: 0,         // never auto-retry on stall — let the job finish
    },
    defaultJobOptions: {
      removeOnComplete: 50,  // keep only last 50 completed jobs in Redis
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30_000, // 30 s initial delay, doubles each retry
      },
    },
  });

  return queue;
}

// ─── Job processor ────────────────────────────────────────────────────────────

async function processJob(job: Bull.Job<ScrapeJobData>): Promise<void> {
  const { jobType } = job.data;

  logger.info('Odds poll job started', { jobType });

  // Update event statuses (UPCOMING→LIVE, LIVE→FINISHED) on every job run
  try {
    const statusChanges = await updateEventStatuses();
    if (statusChanges.toLive > 0 || statusChanges.toFinished > 0) {
      logger.info('Event statuses updated', statusChanges);
    }
  } catch (err) {
    logger.warn('Event status update failed', { error: (err as Error).message });
  }

  try {
    const count = await fetchAndPersistOdds();
    logger.info('Odds poll job completed', { jobType, eventsUpserted: count });
  } catch (err) {
    // Re-throw so Bull marks the job as failed and applies retry back-off
    logger.error('Odds poll job failed', {
      jobType,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─── Repeating job registration ───────────────────────────────────────────────

/**
 * Adds the four repeating jobs to the queue.
 * Existing repeatable jobs are cleared first so interval changes take effect
 * immediately without leaving stale Bull repeat records in Redis.
 */
async function scheduleJobs(queue: Bull.Queue<ScrapeJobData>): Promise<void> {
  // Remove all existing repeatable jobs — avoids duplicate executions when
  // the repeat interval changes between deployments (e.g. 60s → 30s).
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Determine poll interval from env — default 6 h (free tier: 4/day × 4 sports = 16 req/day).
  // Set ODDS_POLL_INTERVAL_MINUTES to a lower value when on a paid Odds API plan.
  const intervalMinutes = parseInt(
    process.env.ODDS_POLL_INTERVAL_MINUTES ?? '360',
    10,
  );
  const cronExpr =
    intervalMinutes >= 60
      ? `0 */${Math.max(1, Math.floor(intervalMinutes / 60))} * * *`
      : `*/${intervalMinutes} * * * *`;

  // Primary odds poll — all sports and bookmakers in one pass
  await queue.add(
    { jobType: 'live' },
    {
      repeat: { cron: cronExpr },
      jobId: 'odds-poll',
    },
  );

  logger.info('Odds poll job scheduled', {
    intervalMinutes,
    cron: cronExpr,
  });
}

// ─── Queue event listeners ────────────────────────────────────────────────────

function attachListeners(queue: Bull.Queue<ScrapeJobData>): void {
  queue.on('failed', (job, err) => {
    logger.warn(`Scrape job failed (attempt ${job.attemptsMade}/${job.opts.attempts ?? 1})`, {
      jobType: job.data.jobType,
      error: err.message,
    });
  });

  queue.on('stalled', (job) => {
    logger.warn(`Scrape job stalled`, { jobType: job.data.jobType });
  });

  queue.on('error', (err) => {
    logger.error('Scrape queue error', { error: err.message });
  });
}

// ─── Public init ──────────────────────────────────────────────────────────────

let _queue: Bull.Queue<ScrapeJobData> | null = null;

/**
 * Initialises the scrape job queue. Should be called once at app startup.
 * Returns the queue instance for graceful shutdown.
 */
export async function initScrapeJobs(): Promise<Bull.Queue<ScrapeJobData>> {
  const queue = createScrapeQueue();
  attachListeners(queue);

  // Register processor (concurrency=1 — one scrape session at a time)
  queue.process(1, processJob);

  await scheduleJobs(queue);

  _queue = queue;
  logger.info('Scrape job queue initialised');
  return queue;
}

/**
 * Gracefully closes the Bull queue. Call during SIGTERM/SIGINT shutdown.
 */
export async function closeScrapeJobs(): Promise<void> {
  if (_queue) {
    await _queue.close();
    logger.info('Scrape job queue closed');
  }
}

/** Returns the live queue instance (null before initScrapeJobs() is called). */
export function getScrapeQueue(): Bull.Queue<ScrapeJobData> | null {
  return _queue;
}
