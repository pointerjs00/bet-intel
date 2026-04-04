/**
 * Scraping job queue — powered by Bull + Redis.
 *
 * PT-only bookmaker scrapers:
 *  - Live events: every 60 seconds
 *  - Upcoming events (24 h): every 5 minutes
 *  - Upcoming events (7 d): every 30 minutes
 *  - New events discovery: every 2 hours
 *
 * Call initScrapeJobs() once during app startup (see src/index.ts).
 */

import Bull from 'bull';
import { logger } from '../utils/logger';
import {
  registerDefaultScrapers,
  runAllScrapers,
  runScraper,
} from '../services/scraper/scraperRegistry';
import { updateEventStatuses } from '../services/odds/oddsService';
import type { ScrapeJobData } from '../services/scraper/types';

function registerAllScrapers(): void {
  registerDefaultScrapers();
}

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
  const { jobType, siteSlug } = job.data;

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
    if (siteSlug) {
      const count = await runScraper(siteSlug);
      logger.info('Scrape job completed', { jobType, siteSlug, eventsUpserted: count });
    } else {
      await runAllScrapers();
      logger.info('Scrape job completed', { jobType, siteSlug: 'all' });
    }
  } catch (err) {
    // Re-throw so Bull marks the job as failed and applies retry back-off
    logger.error('Scrape job failed', {
      jobType,
      siteSlug: siteSlug ?? 'all',
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

  // Live events — every 60 seconds
  await queue.add(
    { jobType: 'live' },
    {
      repeat: { every: 60_000 },
      jobId: 'scrape-live',
    },
  );

  // Upcoming events (next 24 h) — every 5 minutes (offset by 2 min to avoid overlap with live)
  await queue.add(
    { jobType: 'upcoming-24h' },
    {
      repeat: { cron: '2/5 * * * *' },
      jobId: 'scrape-upcoming-24h',
    },
  );

  // Upcoming events (next 7 d) — every 30 minutes (offset by 15 min)
  await queue.add(
    { jobType: 'upcoming-7d' },
    {
      repeat: { cron: '15,45 * * * *' },
      jobId: 'scrape-upcoming-7d',
    },
  );

  // New events discovery — every 2 hours
  await queue.add(
    { jobType: 'discovery' },
    {
      repeat: { cron: '0 */2 * * *' },
      jobId: 'scrape-discovery',
    },
  );

  logger.info('Scrape jobs scheduled', {
    jobs: ['live (60s)', 'upcoming-24h (5min)', 'upcoming-7d (30min)', 'discovery (2h)'],
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
  registerAllScrapers();

  const queue = createScrapeQueue();
  attachListeners(queue);

  // Concurrency=1 prevents multiple scrape jobs from running simultaneously,
  // which could exhaust the 4 GB VPS RAM with too many Puppeteer browsers.
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
