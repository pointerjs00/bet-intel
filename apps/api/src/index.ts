import 'dotenv/config';
// build trigger: 2026-04-19
import path from 'path';
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
import { referenceRouter } from './routes/referenceRoutes';
import { statsRouter } from './routes/statsRoutes';
import { usersRouter } from './routes/usersRoutes';
import { friendsRouter } from './routes/friendsRoutes';
import { notificationsRouter } from './routes/notificationsRoutes';
import { favouritesRouter } from './routes/favouritesRoutes';
import { defaultLimiter } from './middleware/rateLimiter';
import { initializeSocketServer } from './sockets';
import { ensureFreshATPRankings, scheduleATPRankingsJob } from './jobs/atpRankingsJob';
import { ensureFreshWTARankings, scheduleWTARankingsJob } from './jobs/wtaRankingsJob';
import { scheduleFixtureRefreshJob } from './jobs/fixtureRefreshJob';
import { ensureFixturesFresh } from './services/apifootball/fixturesSync';
import { fixtureRouter } from './routes/fixtureRoutes';
import { fixtureAlertRouter } from './routes/fixtureAlertRoutes';
import { footballDataRouter } from './routes/footballDataRoutes';
import { adminRouter } from './routes/adminRoutes';
import { seed as seedReferenceData } from './prisma/seed';
import { initFootballDataScheduler } from './scheduler';

// ─── App setup ─────────────────────────────────────────────────────────────────

const app: express.Application = express();

// Trust Nginx reverse proxy (needed for rate limiting and IP detection)
app.set('trust proxy', 1);

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ─── Global rate limiter ────────────────────────────────────────────────────────

app.use(defaultLimiter);

// ─── Static uploads ─────────────────────────────────────────────────────────

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads'), {
  maxAge: '7d',
  immutable: true,
}));

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.use('/api/auth', authRouter);
app.use('/api/reference', referenceRouter);
app.use('/api/boletins', boletinCollectionRouter);
app.use('/api/betintel', betintelRouter);
app.use('/api/stats', statsRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/favourites', favouritesRouter);
app.use('/api/fixtures', fixtureRouter);
app.use('/api/fixture-alerts', fixtureAlertRouter);
app.use('/api', footballDataRouter);
app.use('/api/admin', adminRouter);

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

async function start(): Promise<void> {
  // Wait for PostgreSQL to finish recovery before any queries run.
  await waitForDatabase();

  // Warm Redis connection (lazyConnect means it doesn't auto-connect)
  await redis.connect().catch(() => {
    // Already connected or will retry on first command — non-fatal at startup
  });

  // Keep reference data in sync with the code-defined catalogue on every startup.
  await seedReferenceData();

  try {
    await ensureFreshATPRankings();
  } catch (err) {
    logger.warn('ATP rankings refresh skipped during startup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await ensureFreshWTARankings();
  } catch (err) {
    logger.warn('WTA rankings refresh skipped during startup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await scheduleATPRankingsJob();
  } catch (err) {
    logger.warn('ATP rankings job scheduling skipped — Redis unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await scheduleWTARankingsJob();
  } catch (err) {
    logger.warn('WTA rankings job scheduling skipped — Redis unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await ensureFixturesFresh();
  } catch (err) {
    logger.warn('Fixture ingestion skipped during startup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await scheduleFixtureRefreshJob();
  } catch (err) {
    logger.warn('Fixture refresh job scheduling skipped — Redis unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await initFootballDataScheduler();
  } catch (err) {
    logger.warn('Football data scheduler skipped — Redis unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const server = app.listen(PORT, () => {
    logger.info(`BetIntel API listening on port ${PORT}`, { env: process.env.NODE_ENV });
  });

  initializeSocketServer(server);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — shutting down gracefully`);
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
