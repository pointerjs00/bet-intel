import { Request, Response } from 'express';
import {
  createBoletinItemSchema,
  createBoletinSchema,
  shareBoletinSchema,
  updateBoletinItemsSchema,
  updateBoletinSchema,
} from '@betintel/shared';
import {
  addBoletinItem,
  createBoletin,
  deleteBoletin,
  deleteBoletinItem,
  getBoletinDetail,
  listSharedBoletins,
  listUserBoletins,
  shareBoletin,
  updateBoletin,
  updateBoletinItems,
} from '../services/boletins/boletinService';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T, meta?: unknown): void {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error('Boletin controller error', { error: err.message, stack: err.stack });
    }
    res.status(statusCode).json({ success: false, error: err.message });
    return;
  }

  logger.error('Unknown boletin controller error', { error: err });
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
  }
  return userId;
}

/** Handles GET /api/boletins. */
export async function listBoletinsHandler(req: Request, res: Response): Promise<void> {
  try {
    const boletins = await listUserBoletins(requireUserId(req));
    ok(res, boletins);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles POST /api/boletins. */
export async function createBoletinHandler(req: Request, res: Response): Promise<void> {
  const parsed = createBoletinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Dados do boletin inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const boletin = await createBoletin(requireUserId(req), parsed.data);
    res.status(201).json({ success: true, data: boletin });
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/betintel/:id. */
export async function getBoletinHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: 'ID do boletin em falta' });
    return;
  }

  try {
    const boletin = await getBoletinDetail(requireUserId(req), id);
    if (!boletin) {
      res.status(404).json({ success: false, error: 'Boletin não encontrado' });
      return;
    }

    ok(res, boletin);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles PATCH /api/betintel/:id. */
export async function updateBoletinHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: 'ID do boletin em falta' });
    return;
  }

  const parsed = updateBoletinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Dados de atualização inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const boletin = await updateBoletin(requireUserId(req), id, parsed.data);
    ok(res, boletin);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles DELETE /api/betintel/:id. */
export async function deleteBoletinHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: 'ID do boletin em falta' });
    return;
  }

  try {
    await deleteBoletin(requireUserId(req), id);
    res.status(204).send();
  } catch (err) {
    fail(res, err);
  }
}

/** Handles PATCH /api/betintel/:id/items — update individual item results (won/lost). */
export async function updateBoletinItemsHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: 'ID do boletin em falta' });
    return;
  }

  const parsed = updateBoletinItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Dados de atualização inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const boletin = await updateBoletinItems(requireUserId(req), id, parsed.data);
    ok(res, boletin);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles POST /api/betintel/:id/items — add a selection to an existing boletin. */
export async function addBoletinItemHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: 'ID do boletin em falta' });
    return;
  }

  const parsed = createBoletinItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Dados da seleção inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const boletin = await addBoletinItem(requireUserId(req), id, parsed.data);
    ok(res, boletin);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles DELETE /api/betintel/:id/items/:itemId — remove a selection from an existing boletin. */
export async function deleteBoletinItemHandler(req: Request, res: Response): Promise<void> {
  const { id, itemId } = req.params;
  if (!id || !itemId) {
    res.status(400).json({ success: false, error: 'IDs em falta' });
    return;
  }

  try {
    const boletin = await deleteBoletinItem(requireUserId(req), id, itemId);
    ok(res, boletin);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles POST /api/betintel/:id/share. */
export async function shareBoletinHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: 'ID do boletin em falta' });
    return;
  }

  const parsed = shareBoletinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Dados de partilha inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const shares = await shareBoletin(requireUserId(req), id, parsed.data);
    ok(res, shares);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/betintel/shared. */
export async function listSharedBoletinsHandler(req: Request, res: Response): Promise<void> {
  try {
    const shared = await listSharedBoletins(requireUserId(req));
    ok(res, shared);
  } catch (err) {
    fail(res, err);
  }
}