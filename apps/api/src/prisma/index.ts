import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient instance.
 *
 * In development, the module hot-reload cycle (ts-node-dev) would create a new
 * PrismaClient on every reload and exhaust the connection pool. Attaching the
 * instance to `globalThis` prevents that while still being tree-shaken away in
 * production builds (where hot-reload never runs).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
