import 'dotenv/config';
// build trigger: 2026-04-04
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';

import { logger } from './utils/logger';
import { redis } from './utils/redis';
import { prisma } from './prisma';
import { authRouter } from './routes/authRoutes';
import { boletinCollectionRouter, betintelRouter } from './routes/boletinRoutes';
import { oddsRouter } from './routes/oddsRoutes';
import { statsRouter } from './routes/statsRoutes';
import { usersRouter } from './routes/usersRoutes';
import { friendsRouter } from './routes/friendsRoutes';
import { notificationsRouter } from './routes/notificationsRoutes';
import { defaultLimiter } from './middleware/rateLimiter';
import { initScrapeJobs, closeScrapeJobs } from './jobs/scrapeJobs';
import { initializeSocketServer } from './sockets';
import { startEventStatusPolling, stopEventStatusPolling } from './services/eventStatus/eventStatusService';
import { startBetclicLiveWatcher, stopBetclicLiveWatcher } from './services/scraper/betclicLiveWatcher';
import { fetchAndPersistOdds } from './services/odds/oddsApiService';
import { fetchKambiPrefetchEvents } from './services/scraper/sites/browserSiteScraper';
import { persistScrapedEventsForSite } from './services/scraper/scraperRegistry';

// ─── App setup ─────────────────────────────────────────────────────────────────

const app: express.Application = express();

// Security headers
app.use(helmet());

// CORS — open to all in dev; restricted to ALLOWED_ORIGINS in production
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production' ? (allowedOrigins ?? false) : true,
    credentials: true,
  }),
);

// HTTP request logging via morgan → Winston
app.use(
  morgan('combined', {
    stream: { write: (message: string) => logger.http(message.trim()) },
  }),
);

// Body parsing + compression
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ─── Global rate limiter ────────────────────────────────────────────────────────

app.use(defaultLimiter);

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.use('/api/auth', authRouter);
app.use('/api/odds', oddsRouter);
app.use('/api/boletins', boletinCollectionRouter);
app.use('/api/betintel', betintelRouter);
app.use('/api/stats', statsRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/notifications', notificationsRouter);

// ─── 404 handler ───────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// ─── Global error handler ───────────────────────────────────────────────────────

interface AppError extends Error {
  statusCode?: number;
  status?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode ?? err.status ?? 500;
  if (status >= 500) {
    logger.error('Unhandled express error', { error: err.message, stack: err.stack });
  }
  res.status(status).json({ success: false, error: err.message ?? 'Erro interno do servidor' });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000);

/**
 * Wait for PostgreSQL to accept connections before starting the app.
 * Retries up to `maxAttempts` times with exponential back-off (cap 10 s).
 * Throws if the DB is still unavailable after all attempts.
 */
async function waitForDatabase(maxAttempts = 60): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (attempt > 1) {
        logger.info('Database is ready', { attempt });
      }
      return;
    } catch {
      const delayMs = Math.min(1_000 * attempt, 10_000); // 1 s, 2 s … 10 s
      logger.warn('Database not ready — retrying', { attempt, maxAttempts, retryInMs: delayMs });
      await new Promise<void>((resolve) => { setTimeout(resolve, delayMs); });
    }
  }
  throw new Error(`Database did not become ready after ${maxAttempts} attempts`);
}

async function warmInitialOddsIfEmpty(): Promise<void> {
  const activeOddsCount = await prisma.odd.count({
    where: { isActive: true },
  });

  if (activeOddsCount > 0) {
    logger.info('Skipping startup odds bootstrap because active odds already exist', {
      activeOddsCount,
    });
    return;
  }

  logger.info('No active odds found at startup — running initial odds bootstrap (API-only)');

  try {
    // The Odds API — Betclic, Betano, Solverde
    const oddsApiCount = await fetchAndPersistOdds();
    logger.info('Initial The Odds API bootstrap done', { events: oddsApiCount });

    // Kambi CDN — Placard + Solverde supplement
    const kambiUrls = {
      placard: 'https://sportswidget-cdn.placard.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP',
      solverde: 'https://sportswidget-cdn.solverde.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP',
    };
    for (const [site, url] of Object.entries(kambiUrls)) {
      const events = await fetchKambiPrefetchEvents(`${site}:bootstrap`, url);
      if (events.length > 0) {
        const siteName = site === 'placard' ? 'Placard' : 'Solverde';
        await persistScrapedEventsForSite(site, siteName, events);
        logger.info(`Initial Kambi CDN bootstrap done`, { site, events: events.length });
      }
    }

    const refreshedOddsCount = await prisma.odd.count({ where: { isActive: true } });
    logger.info('Initial odds bootstrap completed', { activeOddsCount: refreshedOddsCount });
  } catch (err) {
    logger.warn('Initial odds bootstrap failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function start(): Promise<void> {
  // Wait for PostgreSQL to finish recovery before any queries run.
  await waitForDatabase();

  // Warm Redis connection (lazyConnect means it doesn't auto-connect)
  await redis.connect().catch(() => {
    // Already connected or will retry on first command — non-fatal at startup
  });

  const server = app.listen(PORT, () => {
    logger.info(`BetIntel API listening on port ${PORT}`, { env: process.env.NODE_ENV });
  });

  initializeSocketServer(server);

  // Start authoritative match status polling (API-Football)
  // Must be started after Socket.io is initialised so it can emit status changes.
  startEventStatusPolling();

  // Start the long-lived Betclic live watcher for incremental odds persistence.
  // Non-fatal: a missing/broken browser should not prevent the API from starting.
  await startBetclicLiveWatcher().catch((err: unknown) => {
    logger.warn('Betclic live watcher failed to start — live odds will rely on Bull queue scraping only', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Start scraping job queue
  await initScrapeJobs();

  // Fresh databases otherwise remain empty until the first 6-hour cron window.
  void warmInitialOddsIfEmpty();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    stopEventStatusPolling();
    await stopBetclicLiveWatcher();
    await closeScrapeJobs();
    server.close(async () => {
      await prisma.$disconnect();
      await redis.quit();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err: unknown) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});

export { app };
