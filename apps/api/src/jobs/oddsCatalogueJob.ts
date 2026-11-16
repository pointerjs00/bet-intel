// Refreshes the odds-comparator catalogue (next 48 h of each enabled house) every 10 minutes.
import Bull from 'bull';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { getSources } from '../services/odds/registry';
import { getOddsService } from '../services/odds/service';
import { runOddsCatalogue } from '../services/odds/catalogueRunner';
import { DayCache } from '../services/sportsData/itemMatch';

const LOCK_TTL_MS = 540_000;
const lockKey = (house: string) => `odds:lock:${house}`;
const runId = `${process.pid}:${Math.random().toString(36).slice(2)}`;

// Created on first schedule, so an install without ODDS_SOURCES opens no Redis connection for it.
let queue: Bull.Queue | null = null;

function getQueue(): Bull.Queue {
  if (queue) return queue;
  queue = new Bull('odds-catalogue', process.env.REDIS_URL!, {
    defaultJobOptions: { removeOnComplete: 10, removeOnFail: 20 },
  });
  // Without a listener, a Redis error is an unhandled 'error' event: uncaughtException → exit → crash loop.
  queue.on('error', (err) => logger.error('[oddsCatalogue] Queue error', { error: err.message }));
  queue.on('failed', (_job, err) => logger.error('[oddsCatalogue] job failed', { error: err.message }));
  queue.process(async () => oddsCatalogueJob());
  return queue;
}

/** Runs one catalogue pass over the enabled sources. */
export async function oddsCatalogueJob(): Promise<void> {
  const sources = getSources();
  if (sources.length === 0) return;
  const service = getOddsService();
  const token = `${runId}:${Date.now()}`;
  await runOddsCatalogue({
    sources,
    refresh: (s, sport, cache) => service.refreshCatalogue(s, sport, cache),
    acquire: async (house) => (await redis.set(lockKey(house), token, 'PX', LOCK_TTL_MS, 'NX').catch(() => null)) === 'OK',
    release: async (house) => {
      await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1, lockKey(house), token,
      );
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    newCache: () => new DayCache(),
    log: logger,
  });
}

/**
 * Schedules the repeatable job (every 10 minutes). Call once at startup. With ODDS_SOURCES empty it does
 * nothing and creates no queue: a repeatable job left in Redis by an earlier config is not processed by
 * anyone (no worker), and oddsCatalogueJob returns at once with no sources anyway, so it is harmless.
 */
export async function scheduleOddsCatalogueJob(): Promise<void> {
  if (getSources().length === 0) return;
  const q = getQueue();
  for (const job of await q.getRepeatableJobs()) {
    await q.removeRepeatableByKey(job.key);
  }
  await q.add({}, { repeat: { cron: '*/10 * * * *' }, jobId: 'odds-catalogue' });
  logger.info('[oddsCatalogue] scheduled every 10 minutes');
}
