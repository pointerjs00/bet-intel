import { Router, Request, Response } from 'express';
import { requireInternalKey } from '../middleware/requireInternalKey';
import { runHistoricalBackfill } from '../services/apifootball/historicalBackfill';
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
