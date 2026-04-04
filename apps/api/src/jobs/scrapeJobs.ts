/**
 * Odds polling job queue — powered by Bull + Redis.
 *
 * Zero-Puppeteer architecture:
 *  - The Odds API: primary source for Betclic, Betano, Solverde odds (HTTP REST)
 *  - Kambi CDN:    primary source for Placard odds + Solverde supplement (HTTP)
 *  - API-Football: match status + live scores (already handled by eventStatusService)
 *
 * No headless browsers, no residential proxies, runs comfortably on 4 GB RAM.
 *
 * Schedule (free tier — 500 req/month):
 *  - The Odds API:  every 6 hours (4 sports × 4 polls/day = 480 req/month)
 *  - Kambi CDN:     every 15 minutes (free, unlimited)
 *  - Event status:  every 60 seconds (via updateEventStatuses)
 *
 * Call initScrapeJobs() once during app startup (see src/index.ts).
 */

import Bull from 'bull';
import { logger } from '../utils/logger';
import { persistScrapedEventsForSite } from '../services/scraper/scraperRegistry';
import { updateEventStatuses } from '../services/odds/oddsService';
import { fetchAndPersistOdds } from '../services/odds/oddsApiService';
import { fetchKambiPrefetchEvents } from '../services/scraper/sites/browserSiteScraper';
import type { ScrapeJobData } from '../services/scraper/types';

// ─── Queue setup ──────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Single Bull queue for all odds poll jobs.
 * HTTP-only — no Puppeteer, no proxy needed.
 */
function createScrapeQueue(): Bull.Queue<ScrapeJobData> {
  const queue = new Bull<ScrapeJobData>('scraping', REDIS_URL, {
    settings: {
      lockDuration: 300_000,      // 5 minutes (HTTP-only jobs are fast)
      stalledInterval: 60_000,
      maxStalledCount: 0,
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

// ─── Kambi CDN URLs (pure HTTP, no browser) ─────────────────────────────────

const KAMBI_CDN = {
  placard: {
    soccer:     'https://sportswidget-cdn.placard.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP',
    basketball: 'https://sportswidget-cdn.placard.pt/pre-fetch?locale=pt_PT&page=basketball&type=DESKTOP',
  },
  solverde: {
    soccer:     'https://sportswidget-cdn.solverde.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP',
    basketball: 'https://sportswidget-cdn.solverde.pt/pre-fetch?locale=pt_PT&page=basketball&type=DESKTOP',
  },
};

/**
 * Fetches Placard + Solverde odds via their Kambi CDN pre-fetch endpoints.
 * Pure HTTP — no Puppeteer, no proxy needed.
 */
async function fetchKambiCdnOdds(): Promise<void> {
  for (const [site, urls] of Object.entries(KAMBI_CDN)) {
    const allEvents = [];
    for (const [sport, url] of Object.entries(urls)) {
      try {
        const events = await fetchKambiPrefetchEvents(`${site}:${sport}:cdn`, url);
        allEvents.push(...events);
      } catch (err) {
        logger.warn(`Kambi CDN fetch failed`, {
          site,
          sport,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (allEvents.length > 0) {
      const siteName = site === 'placard' ? 'Placard' : 'Solverde';
      try {
        const persisted = await persistScrapedEventsForSite(site, siteName, allEvents);
        logger.info(`Kambi CDN: persisted events`, { site, events: persisted });
      } catch (err) {
        logger.error(`Kambi CDN: persist failed`, {
          site,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
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
    if (jobType === 'odds-api') {
      // The Odds API — Betclic, Betano, Solverde (h2h + totals)
      const count = await fetchAndPersistOdds();
      logger.info('The Odds API poll completed', { eventsUpserted: count });
    } else if (jobType === 'kambi-cdn') {
      // Kambi CDN — Placard + Solverde supplement (pure HTTP)
      await fetchKambiCdnOdds();
      logger.info('Kambi CDN poll completed');
    } else {
      // Legacy job type — run both
      const count = await fetchAndPersistOdds();
      await fetchKambiCdnOdds();
      logger.info('Combined poll completed', { oddsApiEvents: count });
    }
  } catch (err) {
    logger.error('Poll job failed', {
      jobType,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─── Repeating job registration ───────────────────────────────────────────────

/**
 * Adds the repeating jobs to the queue.
 * Existing repeatable jobs are cleared first so interval changes take effect
 * immediately without leaving stale Bull repeat records in Redis.
 */
async function scheduleJobs(queue: Bull.Queue<ScrapeJobData>): Promise<void> {
  // Remove all existing repeatable jobs — avoids duplicate executions when
  // the repeat interval changes between deployments.
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // The Odds API poll — every 6 hours (free tier: 480 req/month budget of 500)
  // Upgrade to a paid plan and lower this to every 30 min for better coverage.
  const oddsApiIntervalMinutes = parseInt(process.env.ODDS_POLL_INTERVAL_MINUTES ?? '360', 10);

  await queue.add(
    { jobType: 'odds-api' },
    {
      repeat: { every: oddsApiIntervalMinutes * 60 * 1000 },
      jobId: 'poll-odds-api',
    },
  );

  // Kambi CDN poll (Placard + Solverde) — every 15 minutes (free, unlimited)
  await queue.add(
    { jobType: 'kambi-cdn' },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'poll-kambi-cdn',
    },
  );

  // Event status check — every 60 seconds (API-Football via updateEventStatuses)
  await queue.add(
    { jobType: 'status-check' },
    {
      repeat: { every: 60_000 },
      jobId: 'event-status-check',
    },
  );

  logger.info('Odds poll jobs scheduled', {
    jobs: [
      `odds-api (every ${oddsApiIntervalMinutes}min)`,
      'kambi-cdn (every 15min)',
      'status-check (every 60s)',
    ],
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
 * Initialises the odds poll job queue. Should be called once at app startup.
 * Returns the queue instance for graceful shutdown.
 */
export async function initScrapeJobs(): Promise<Bull.Queue<ScrapeJobData>> {
  const queue = createScrapeQueue();
  attachListeners(queue);

  // Concurrency=1 — lightweight HTTP-only jobs, keeps resource usage predictable.
  queue.process(1, processJob);

  await scheduleJobs(queue);

  _queue = queue;
  logger.info('Odds poll job queue initialised (API-only mode — no Puppeteer)');
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
