import { Router, json } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  addBoletinItemHandler,
  createBoletinHandler,
  deleteBoletinHandler,
  deleteBoletinItemHandler,
  exportBoletinsHandler,
  getAgendaHandler,
  getLiveItemsHandler,
  getReviewItemsHandler,
  getBoletinHandler,
  listBoletinsHandler,
  listSharedBoletinsHandler,
  shareBoletinHandler,
  updateBoletinHandler,
  updateBoletinItemHandler,
  updateBoletinItemsHandler,
} from '../controllers/boletinController';
import { prisma } from '../prisma';
import { coverageOf } from '../services/marketCoverage';
import { findItemMatches } from '../services/sportsData/itemMatch';
import { settleSoon } from '../jobs/liveBetTrackerJob';
import { betclicApiHandler, bulkImportHandler, parsePdfHandler, scanAiHandler, scanFeedbackHandler } from '../controllers/importController';

const boletinCollectionRouter: Router = Router();
const betintelRouter: Router = Router();

boletinCollectionRouter.use(authenticate);
betintelRouter.use(authenticate);

boletinCollectionRouter.get('/', listBoletinsHandler);
boletinCollectionRouter.get('/agenda', getAgendaHandler);
boletinCollectionRouter.get('/live', getLiveItemsHandler);
boletinCollectionRouter.get('/review', getReviewItemsHandler);
// Which of the user's markets settle automatically and which go to review (the Betclic catalogue as seen in real slips).
boletinCollectionRouter.get('/market-coverage', async (req, res) => {
  const items = await prisma.boletinItem.findMany({
    where: { boletin: { userId: req.user!.sub } },
    select: { sport: true, market: true, selection: true, homeTeam: true, awayTeam: true },
  });
  res.json({ success: true, data: coverageOf(items.map((i) => ({ ...i, sport: String(i.sport) }))) });
});
boletinCollectionRouter.get('/export', exportBoletinsHandler);
boletinCollectionRouter.post('/', createBoletinHandler);
boletinCollectionRouter.post('/import/pdf', json({ limit: '15mb' }), parsePdfHandler);
boletinCollectionRouter.post('/import/scan-ai', json({ limit: '15mb' }), scanAiHandler);
boletinCollectionRouter.post('/import/scan-feedback', json({ limit: '15mb' }), scanFeedbackHandler);
boletinCollectionRouter.post('/import/betclic-api', betclicApiHandler);
boletinCollectionRouter.post('/import/bulk', bulkImportHandler);

betintelRouter.get('/shared', listSharedBoletinsHandler);
/** Real score of each selection's match (ESPN), for the boletim detail. */
betintelRouter.get('/:id/results', async (req, res) => {
  const boletin = await prisma.boletin.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
    select: { betDate: true, createdAt: true, items: { select: { id: true, sport: true, competition: true, homeTeam: true, awayTeam: true, kickoffAt: true, result: true } } },
  });
  if (!boletin) { res.status(404).json({ success: false, error: 'Boletim não encontrado' }); return; }
  const anchor = boletin.betDate ?? boletin.createdAt;
  const data = await findItemMatches(boletin.items.map(({ result: _r, ...i }) => ({ ...i, sport: String(i.sport), anchor })));
  // Store the kickoff we found for selections saved without one, and settle finished games now.
  let stale = false;
  for (const it of boletin.items) {
    const m = data[it.id];
    if (!m || it.result !== 'PENDING') continue;
    // Missing or wrong kickoff (more than 2 h off the real game): store the real one so the
    // tracker follows and settles this selection.
    const real = new Date(m.kickoffAt);
    if (!it.kickoffAt || (m.status !== 'SCHEDULED' && Math.abs(it.kickoffAt.getTime() - real.getTime()) >= 2 * 3600e3)) {
      await prisma.boletinItem.update({ where: { id: it.id }, data: { kickoffAt: real } }).catch(() => undefined);
    }
    if (['FINISHED', 'RETIRED', 'WALKOVER'].includes(m.status)) stale = true;
  }
  if (stale) void settleSoon();
  res.json({ success: true, data });
});
betintelRouter.get('/:id', getBoletinHandler);
betintelRouter.patch('/:id', updateBoletinHandler);
betintelRouter.patch('/:id/items', updateBoletinItemsHandler);
betintelRouter.patch('/:id/items/:itemId', updateBoletinItemHandler);
betintelRouter.post('/:id/items', addBoletinItemHandler);
betintelRouter.delete('/:id/items/:itemId', deleteBoletinItemHandler);
betintelRouter.delete('/:id', deleteBoletinHandler);
betintelRouter.post('/:id/share', shareBoletinHandler);

export { boletinCollectionRouter, betintelRouter };