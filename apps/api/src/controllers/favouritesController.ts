import { Request, Response } from 'express';
import { z } from 'zod';
import { FavouriteType, Sport } from '@betintel/shared';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Favourites controller error', { error: err.message, stack: err.stack });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
  return userId;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const toggleFavouriteSchema = z.object({
  type: z.nativeEnum(FavouriteType),
  sport: z.nativeEnum(Sport),
  targetKey: z.string().min(1).max(200),
});

const bulkSetSchema = z.object({
  sport: z.nativeEnum(Sport),
  favourites: z.array(
    z.object({
      type: z.nativeEnum(FavouriteType),
      targetKey: z.string().min(1).max(200),
      sortOrder: z.number().int().optional(),
    }),
  ),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** GET /api/favourites — all favourites for the authenticated user, optionally filtered by sport. */
export async function listFavouritesHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const sport = req.query.sport as string | undefined;

    const favourites = await prisma.userFavourite.findMany({
      where: {
        userId,
        ...(sport ? { sport: sport as Sport } : {}),
      },
      orderBy: [{ sport: 'asc' }, { sortOrder: 'asc' }, { type: 'asc' }, { targetKey: 'asc' }],
      select: { id: true, type: true, sport: true, targetKey: true, createdAt: true },
    });

    ok(res, favourites);
  } catch (err) {
    fail(res, err);
  }
}

/** POST /api/favourites/toggle — add or remove a single favourite (idempotent toggle). */
export async function toggleFavouriteHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const parsed = toggleFavouriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
      return;
    }

    const { type, sport, targetKey } = parsed.data;

    const existing = await prisma.userFavourite.findUnique({
      where: { userId_type_sport_targetKey: { userId, type, sport, targetKey } },
    });

    if (existing) {
      await prisma.userFavourite.delete({ where: { id: existing.id } });
      ok(res, { action: 'removed' as const, type, sport, targetKey });
    } else {
      const fav = await prisma.userFavourite.create({
        data: { userId, type, sport, targetKey },
        select: { id: true, type: true, sport: true, targetKey: true, createdAt: true },
      });
      ok(res, { action: 'added' as const, ...fav });
    }
  } catch (err) {
    fail(res, err);
  }
}

/** PUT /api/favourites/bulk — replace all favourites for a given sport with the supplied list. */
export async function bulkSetFavouritesHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const parsed = bulkSetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
      return;
    }

    const { sport, favourites } = parsed.data;

    await prisma.$transaction([
      prisma.userFavourite.deleteMany({ where: { userId, sport } }),
      ...favourites.map((f, index) =>
        prisma.userFavourite.create({
          data: {
            userId,
            type: f.type,
            sport,
            targetKey: f.targetKey,
            sortOrder: f.sortOrder ?? index,  // <-- persist position
          },
        }),
      ),
    ]);

    const result = await prisma.userFavourite.findMany({
      where: { userId, sport },
      orderBy: [{ sortOrder: 'asc' }, { targetKey: 'asc' }],  // <-- order by sortOrder
      select: { id: true, type: true, sport: true, targetKey: true, sortOrder: true, createdAt: true },
    });

    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}
