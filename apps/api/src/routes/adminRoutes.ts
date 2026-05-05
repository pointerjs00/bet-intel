import { Router, Request, Response } from 'express';
import { requireInternalKey } from '../middleware/requireInternalKey';
import { runHistoricalBackfill } from '../services/apifootball/historicalBackfill';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

export const adminRouter = Router();

adminRouter.use(requireInternalKey);

// POST /api/admin/backfill-fixtures
// Triggers a full historical fixture import for all leagues × seasons.
// Fire-and-forget — returns immediately while the job runs in background.
// Protected by x-internal-key header.
adminRouter.post('/backfill-fixtures', (_req: Request, res: Response) => {
  runHistoricalBackfill().catch((err: Error) => {
    logger.error('[admin] Historical backfill failed', { error: err.message });
  });

  res.json({
    success: true,
    message: 'Historical backfill started in background — monitor server logs for progress',
  });
});

// DELETE /api/admin/fixtures-cache
// Flushes all Redis fixture cache keys so the next request re-runs dedup logic.
adminRouter.delete('/fixtures-cache', async (_req: Request, res: Response) => {
  try {
    const keys = await redis.keys('fixtures:*');
    if (keys.length > 0) await redis.del(...keys);
    logger.info(`[admin] Flushed ${keys.length} fixture cache keys`);
    res.json({ success: true, flushed: keys.length });
  } catch (err: any) {
    logger.error('[admin] Cache flush failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
