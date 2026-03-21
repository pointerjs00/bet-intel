import 'dotenv/config';

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

async function start(): Promise<void> {
  // Warm Redis connection (lazyConnect means it doesn't auto-connect)
  await redis.connect().catch(() => {
    // Already connected or will retry on first command — non-fatal at startup
  });

  const server = app.listen(PORT, () => {
    logger.info(`BetIntel API listening on port ${PORT}`, { env: process.env.NODE_ENV });
  });

  initializeSocketServer(server);

  // Start scraping job queue
  await initScrapeJobs();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — shutting down gracefully`);
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
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});

export { app };
