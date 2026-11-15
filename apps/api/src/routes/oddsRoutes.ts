// Odds comparator API: GET /events, GET /events/:key, POST /multiple, GET /health.

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../utils/asyncHandler';
import { getProviderHealth } from '../services/sportsData/providerHealth';
import { getOddsService, type OddsService } from '../services/odds/service';

const listQuery = z.object({
  sport: z.enum(['FOOTBALL', 'BASKETBALL', 'TENNIS']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d))),
});
const multipleBody = z.object({
  selections: z.array(z.object({ eventKey: z.string().min(1), selectionKey: z.string().min(1) })).min(1).max(30),
});

/** Router without authentication, so tests can inject a service; production mounts oddsRouter. */
export function createOddsRouter(
  service: () => OddsService = getOddsService,
  health: () => Promise<Record<string, unknown>> = getProviderHealth,
): Router {
  const r = Router();

  r.get('/events', asyncHandler(async (req, res) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) { res.status(400).json({ success: false, error: 'Parâmetros inválidos (sport, date)' }); return; }
    res.json({ success: true, data: await service().listEvents(q.data.sport, q.data.date) });
  }));

  r.get('/events/:key', asyncHandler(async (req, res) => {
    let key: string;
    try { key = decodeURIComponent(String(req.params.key)); } catch { res.status(400).json({ success: false, error: 'Chave inválida' }); return; }
    const data = await service().getEvent(key);
    if (!data) { res.status(404).json({ success: false, error: 'Evento não encontrado' }); return; }
    res.json({ success: true, data });
  }));

  r.post('/multiple', asyncHandler(async (req, res) => {
    const b = multipleBody.safeParse(req.body);
    if (!b.success) { res.status(400).json({ success: false, error: 'Seleções inválidas' }); return; }
    res.json({ success: true, data: await service().multiple(b.data.selections) });
  }));

  r.get('/health', asyncHandler(async (_req, res) => {
    const all = await health();
    res.json({ success: true, data: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('odds-'))) });
  }));

  return r;
}

export const oddsRouter: Router = Router();
oddsRouter.use(authenticate);
oddsRouter.use(createOddsRouter());
