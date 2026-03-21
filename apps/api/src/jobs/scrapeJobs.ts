/**
 * Scraping job queue — powered by Bull + Redis.
 *
 * Schedule from AGENTS.md §6:
 *  - Live events:            every 60 seconds
 *  - Upcoming events (24 h): every 5 minutes
 *  - Upcoming events (7 d):  every 30 minutes
 *  - New events discovery:   every 2 hours
 *
 * All four jobs call runAllScrapers() (or a targeted runScraper() if
 * `siteSlug` is set on the job data). Errors inside processors are caught
 * and logged — Bull's retry / back-off handles the rest.
 *
 * Call initScrapeJobs() once during app startup (see src/index.ts).
 */

import Bull from 'bull';
import { logger } from '../utils/logger';
import {
  registerDefaultScrapers,
  runScraper,
  runAllScrapers,
} from '../services/scraper/scraperRegistry';
import type { ScrapeJobData } from '../services/scraper/types';

// ─── Scraper registration ─────────────────────────────────────────────────────

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

  logger.info(`Scrape job started`, { jobType, siteSlug: siteSlug ?? 'all' });

  try {
    if (siteSlug) {
      await runScraper(siteSlug);
    } else {
      await runAllScrapers();
    }
  } catch (err) {
    // Re-throw so Bull marks the job as failed and applies retry back-off
    logger.error(`Scrape job failed`, {
      jobType,
      siteSlug: siteSlug ?? 'all',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  logger.info(`Scrape job completed`, { jobType, siteSlug: siteSlug ?? 'all' });
}

// ─── Repeating job registration ───────────────────────────────────────────────

/**
 * Adds the four repeating jobs to the queue.
 * Safe to call multiple times — Bull deduplicates by job name + repeat key.
 */
async function scheduleJobs(queue: Bull.Queue<ScrapeJobData>): Promise<void> {
  // Live events — every 60 seconds (Bull supports ms-based interval)
  await queue.add(
    { jobType: 'live' },
    {
      repeat: { every: 60_000 },
      jobId: 'scrape-live',
    },
  );

  // Upcoming events (next 24 h) — every 5 minutes
  await queue.add(
    { jobType: 'upcoming-24h' },
    {
      repeat: { cron: '*/5 * * * *' },
      jobId: 'scrape-upcoming-24h',
    },
  );

  // Upcoming events (next 7 d) — every 30 minutes
  await queue.add(
    { jobType: 'upcoming-7d' },
    {
      repeat: { cron: '*/30 * * * *' },
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
