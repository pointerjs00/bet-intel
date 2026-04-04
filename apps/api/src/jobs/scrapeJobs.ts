/**
 * Odds polling job queue — powered by Bull + Redis.
 *
 * Zero-Puppeteer architecture:
 *  - Live (every 60s):      Kambi CDN for Placard/Solverde + Betano direct REST API
 *  - Upcoming (every 15m):  Kambi CDN full catalogues for Placard + Solverde
 *  - Pre-match (every 6h):  The Odds API for Betclic, Betano, Solverde (free tier)
 *  - Status (every 60s):    API-Football match status transitions (on every job)
 *
 * No headless browsers, no residential proxies, runs comfortably on 4 GB RAM.
 *
 * Free tier budget: 500 req/month (The Odds API).
 * Set ODDS_POLL_INTERVAL_MINUTES env to change The Odds API frequency.
 *
 * Call initScrapeJobs() once during app startup (see src/index.ts).
 */

import Bull from 'bull';
import { logger } from '../utils/logger';
import { persistScrapedEventsForSite } from '../services/scraper/scraperRegistry';
import { updateEventStatuses } from '../services/odds/oddsService';
import { fetchAndPersistOdds } from '../services/odds/oddsApiService';
import { fetchKambiPrefetchEvents, fetchBetanoSportsApi } from '../services/scraper/sites/browserSiteScraper';
import { Sport } from '@betintel/shared';
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
 * Fetches Kambi CDN endpoints for the given sites.
 * Pass a subset of KAMBI_CDN keys to avoid fetching all sports when not needed.
 */
async function fetchKambiCdnOdds(sites: (keyof typeof KAMBI_CDN)[] = ['placard', 'solverde']): Promise<void> {
  for (const site of sites) {
    const allEvents = [];
    for (const [sport, url] of Object.entries(KAMBI_CDN[site])) {
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

// ─── Betano live API (pure HTTP, no browser) ─────────────────────────────────

/**
 * Betano live-event REST API endpoints (Kaizen Gaming / SAGE platform).
 * These are the internal JSON APIs Betano's own frontend calls.
 * Tried in order — stops at first success per sport.
 */
const BETANO_LIVE_URLS = {
  football:   [
    'https://www.betano.pt/api/sports/live/events/?sport=SOCCER',
    'https://www.betano.pt/api/sports/live/events/?sport=FOOTBALL',
    'https://www.betano.pt/api/sports/live/?sport=SOCCER',
  ],
  basketball: [
    'https://www.betano.pt/api/sports/live/events/?sport=BASKETBALL',
    'https://www.betano.pt/api/sports/live/?sport=BASKETBALL',
  ],
  tennis: [
    'https://www.betano.pt/api/sports/live/events/?sport=TENNIS',
    'https://www.betano.pt/api/sports/live/?sport=TENNIS',
  ],
} as const;

/**
 * Fetches Betano live odds via their internal REST API (no Puppeteer, no proxy).
 * Returns the number of events persisted; silently returns 0 if all URLs fail
 * (Betano WAF blocking is non-fatal — pre-match data already cached from The Odds API).
 */
async function fetchBetanoLiveOdds(): Promise<number> {
  const allEvents = [];

  for (const [sportKey, urls] of Object.entries(BETANO_LIVE_URLS)) {
    const sport = sportKey === 'football' ? Sport.FOOTBALL
      : sportKey === 'basketball' ? Sport.BASKETBALL
      : Sport.TENNIS;

    const events = await fetchBetanoSportsApi(`Betano:live:${sportKey}`, urls as readonly string[], sport);
    allEvents.push(...events);
  }

  if (allEvents.length === 0) return 0;

  try {
    const persisted = await persistScrapedEventsForSite('betano', 'Betano', allEvents);
    logger.info('Betano live API: persisted events', { events: persisted });
    return persisted;
  } catch (err) {
    logger.error('Betano live API: persist failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
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
    if (jobType === 'live') {
      // Live events — every 60 seconds:
      // Kambi CDN includes live events and refreshes in real-time for Placard/Solverde.
      // Betano's live REST API returns only currently live events (lightweight).
      await Promise.allSettled([
        fetchKambiCdnOdds(['placard', 'solverde']),
        fetchBetanoLiveOdds(),
      ]);
      logger.info('Live poll completed');

    } else if (jobType === 'kambi-cdn') {
      // Kambi CDN full upcoming catalogues — every 15 minutes
      await fetchKambiCdnOdds(['placard', 'solverde']);
      logger.info('Kambi CDN upcoming poll completed');

    } else if (jobType === 'odds-api') {
      // The Odds API — pre-match odds for all bookmakers including Betclic
      const count = await fetchAndPersistOdds();
      logger.info('The Odds API poll completed', { eventsUpserted: count });

    } else if (jobType === 'status-check') {
      // Status-only check — event status already updated above, nothing else to do
      logger.info('Status check completed');

    } else {
      // Legacy / fallback — run everything
      const [,, count] = await Promise.allSettled([
        fetchKambiCdnOdds(['placard', 'solverde']),
        fetchBetanoLiveOdds(),
        fetchAndPersistOdds(),
      ]);
      logger.info('Combined poll completed');
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

  // Live events — every 60 seconds.
  // Polls Kambi CDN (Placard/Solverde) + Betano live REST API.
  // Live odds can move every few minutes; 60s is a good balance.
  await queue.add(
    { jobType: 'live' },
    {
      repeat: { every: 60_000 },
      jobId: 'poll-live',
    },
  );

  // Kambi CDN upcoming catalogue — every 15 minutes.
  // Picks up new events for Placard and Solverde before they go live.
  await queue.add(
    { jobType: 'kambi-cdn' },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'poll-kambi-cdn-upcoming',
    },
  );

  // The Odds API poll — covers Betclic + supplements Betano/Solverde.
  // Free tier: 500 req/month — default 6h = 480 req/month across 4 sports.
  // Lower ODDS_POLL_INTERVAL_MINUTES on a paid plan for more frequent updates.
  const oddsApiIntervalMinutes = parseInt(process.env.ODDS_POLL_INTERVAL_MINUTES ?? '360', 10);
  await queue.add(
    { jobType: 'odds-api' },
    {
      repeat: { every: oddsApiIntervalMinutes * 60 * 1000 },
      jobId: 'poll-odds-api',
    },
  );

  logger.info('Odds poll jobs scheduled', {
    jobs: [
      'live (every 60s) — Kambi CDN + Betano live API',
      'kambi-cdn-upcoming (every 15min) — Placard + Solverde catalogues',
      `odds-api (every ${oddsApiIntervalMinutes}min) — The Odds API (Betclic + all pre-match)`,
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
