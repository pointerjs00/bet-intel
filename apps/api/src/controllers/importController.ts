import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createBoletinSchema } from '@betintel/shared';
import { parseBetclicPdf, type ParsedBetclicBoletin } from '../services/betclicPdfParser';
import { fetchBetclicBets } from '../services/betclicApiService';
import { parseImageWithGemini } from '../services/geminiVisionParser';
import { parseImageWithOpenAI } from '../services/openaiVisionParser';
import { createBoletin, listUserBoletins } from '../services/boletins/boletinService';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
  }
  return userId;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const parsePdfSchema = z.object({
  pdfBase64: z.string().min(1, 'Ficheiro PDF em falta'),
  source: z.enum(['betclic']),
});

const bulkImportItemSchema = z.object({
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  competition: z.string().min(1),
  sport: z.string().min(1),
  market: z.string().min(1),
  selection: z.string().min(1),
  oddValue: z.number().min(1.01).max(1000),
  /** Per-item result from the AI parse — used to set individual selection outcomes. */
  result: z.enum(['WON', 'LOST', 'VOID', 'PENDING']).optional(),
});

const bulkImportBoletinSchema = z.object({
  reference: z.string().optional(),
  betDate: z.string().optional(),
  stake: z.number().positive(),
  totalOdds: z.number().positive(),
  status: z.string(),
  items: z.array(bulkImportItemSchema).min(1),
});

const KNOWN_SITE_SLUGS = ['betclic', 'placard', 'bet365', 'esconline', 'moosh', 'solverde', 'betway', '888sport', 'betano', 'bwin', 'lebull', 'outros'] as const;

const bulkImportSchema = z.object({
  boletins: z.array(bulkImportBoletinSchema).min(1, 'Nenhuma aposta selecionada'),
  source: z.enum(KNOWN_SITE_SLUGS).default('betclic'),
});

// Maximum PDF size: 10 MB in base64 (base64 is ~4/3 of original, so ~13.3 MB)
const MAX_BASE64_LENGTH = 14 * 1024 * 1024;

// ─── Handlers ────────────────────────────────────────────────────────────────

/** POST /api/boletins/import/pdf — parses a Betclic PDF and returns structured bet data. */
export async function parsePdfHandler(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);

    const parsed = parsePdfSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { pdfBase64, source } = parsed.data;

    if (pdfBase64.length > MAX_BASE64_LENGTH) {
      res.status(413).json({
        success: false,
        error: 'O ficheiro é demasiado grande (máx. 10MB)',
      });
      return;
    }

    if (source !== 'betclic') {
      res.status(400).json({
        success: false,
        error: 'Fonte não suportada. Apenas "betclic" é suportado.',
      });
      return;
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    const result = await parseBetclicPdf(buffer);

    logger.info('PDF parsed successfully', {
      totalFound: result.totalFound,
      errorCount: result.errorCount,
    });

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    if (err instanceof Error) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      if (statusCode >= 500) {
        logger.error('PDF parse error', { error: err.message, stack: err.stack });
      }
      res.status(statusCode).json({ success: false, error: err.message });
      return;
    }
    logger.error('Unknown PDF parse error', { error: err });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}

// ─── Betclic API import schema ───────────────────────────────────────────────

const betclicApiSchema = z.object({
  authToken: z.string().min(1, 'Token de sessão Betclic em falta'),
  maxBets: z.number().int().positive().max(10_000).optional(),
});

/** POST /api/boletins/import/betclic-api — fetches bet history directly from the Betclic API. */
export async function betclicApiHandler(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);

    const parsed = betclicApiSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { authToken, maxBets } = parsed.data;
    const result = await fetchBetclicBets({ authToken, maxBets });

    logger.info('Betclic API import fetched', {
      totalFound: result.totalFound,
      errorCount: result.errorCount,
    });

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    if (err instanceof Error) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      // Betclic API 401/403 → pass through as 401
      const isAuthError = err.message.includes('401') || err.message.includes('403');
      const code = isAuthError ? 401 : statusCode;
      if (code >= 500) {
        logger.error('Betclic API import error', { error: err.message, stack: err.stack });
      }
      res.status(code).json({
        success: false,
        error: isAuthError
          ? 'Sessão Betclic expirada ou inválida. Faz login no betclic.pt e tenta novamente.'
          : err.message,
      });
      return;
    }
    logger.error('Unknown Betclic API import error', { error: err });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}

// ─── AI Vision scan schema ───────────────────────────────────────────────────

const scanAiSchema = z.object({
  imageBase64: z.string().min(1, 'Imagem em falta'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
});

// Maximum image size: 10 MB in base64
const MAX_IMAGE_BASE64_LENGTH = 14 * 1024 * 1024;

/** POST /api/boletins/import/scan-ai — parses a bet slip screenshot using AI vision (Gemini or OpenAI). */
export async function scanAiHandler(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);

    const parsed = scanAiSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { imageBase64, mimeType } = parsed.data;

    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      res.status(413).json({
        success: false,
        error: 'A imagem é demasiado grande (máx. 10MB)',
      });
      return;
    }

    // AI_PARSER env var selects the backend: 'openai' | 'gemini' (default)
    const parser = process.env.AI_PARSER ?? 'gemini';
    const result = parser === 'openai'
      ? await parseImageWithOpenAI(imageBase64, mimeType)
      : await parseImageWithGemini(imageBase64, mimeType);

    logger.info('AI vision scan completed', {
      parser,
      totalFound: result.totalFound,
      errorCount: result.errorCount,
    });

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    if (err instanceof Error) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      if (statusCode >= 500) {
        logger.error('AI vision scan error', { error: err.message, stack: err.stack });
      }
      res.status(statusCode).json({ success: false, error: err.message });
      return;
    }
    logger.error('Unknown AI vision scan error', { error: err });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}

/** POST /api/boletins/import/bulk — creates boletins from parsed/reviewed data. */
export async function bulkImportHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);

    const parsed = bulkImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { boletins: incoming, source } = parsed.data;
    const siteSlug = source !== 'outros' ? source : undefined;

    // Fetch existing boletins for duplicate detection
    const existing = await listUserBoletins(userId);

    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [];

    // Process inside a Prisma transaction for all-or-nothing semantics
    await prisma.$transaction(async (tx) => {
      for (const bet of incoming) {
        // Duplicate detection: same site + same betDate + same stake + same first pick odds
        const isDuplicate = existing.some((eb) => {
          if (eb.siteSlug !== siteSlug) return false;
          if (!bet.betDate || !eb.betDate) return false;
          // Compare dates (same day)
          const incomingDate = new Date(bet.betDate).toISOString().slice(0, 10);
          const existingDate = new Date(eb.betDate).toISOString().slice(0, 10);
          if (incomingDate !== existingDate) return false;
          // Compare stake
          if (Math.abs(parseFloat(eb.stake) - bet.stake) > 0.01) return false;
          // Compare first pick odds
          if (eb.items.length === 0 || bet.items.length === 0) return false;
          if (Math.abs(parseFloat(eb.items[0].oddValue) - bet.items[0].oddValue) > 0.01) return false;
          return true;
        });

        if (isDuplicate) {
          duplicates++;
          continue;
        }

        try {
          // Map to CreateBoletinInput
          const input = {
            name: undefined,
            siteSlug,
            stake: bet.stake,
            items: bet.items.map((item) => ({
              homeTeam: item.homeTeam,
              awayTeam: item.awayTeam,
              competition: item.competition,
              sport: item.sport as 'FOOTBALL',
              market: item.market,
              selection: item.selection,
              oddValue: item.oddValue,
            })),
            notes: siteSlug ? `Importado do ${source}` : 'Importado via BetIntel',
            isPublic: false,
            isFreebet: false,
            betDate: (() => {
            if (!bet.betDate) return undefined;
            const d = new Date(bet.betDate);
            return isNaN(d.getTime()) ? undefined : d.toISOString();
          })(),
          };

          // Validate with the shared schema
          const validated = createBoletinSchema.safeParse(input);
          if (!validated.success) {
            errors.push(`Ref ${bet.reference ?? '?'}: ${validated.error.issues[0]?.message}`);
            continue;
          }

          const createdBoletin = await createBoletin(userId, validated.data);
          imported++;

          // createBoletin recalculates totalOdds by multiplying individual item odds, but the
          // scanner reads individual odds as rounded values from the slip image. The product of
          // rounded values often differs from the actual total shown on the slip.
          // Override with the slip's own totalOdds so the stored values are always consistent.
          const slipOdds = new Prisma.Decimal(bet.totalOdds).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
          const slipReturn = new Prisma.Decimal(bet.stake).mul(slipOdds).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          await prisma.boletin.update({
            where: { id: createdBoletin.id },
            data: { totalOdds: slipOdds, potentialReturn: slipReturn },
          });

          // Apply individual item results from the import review.
          // Run whenever any item has a user-set result, OR the boletin itself is resolved.
          // This preserves WON/LOST items the user manually set even on a PENDING boletin.
          const resolved = bet.status === 'WON' || bet.status === 'LOST' || bet.status === 'VOID';
          const hasItemResults = bet.items.some(
            (item) => item.result && item.result !== 'PENDING',
          );

          if (resolved || hasItemResults) {
            const dbItems = await prisma.boletinItem.findMany({
              where: { boletinId: createdBoletin.id },
              orderBy: { id: 'asc' },
            });

            for (let i = 0; i < dbItems.length; i++) {
              const parsedItem = bet.items[i];
              // Per-item result from user review; fall back to boletin status only for single resolved legs
              const itemResult: 'WON' | 'LOST' | 'VOID' | 'PENDING' =
                parsedItem?.result && ['WON', 'LOST', 'VOID', 'PENDING'].includes(parsedItem.result)
                  ? (parsedItem.result as 'WON' | 'LOST' | 'VOID' | 'PENDING')
                  : resolved && bet.items.length === 1
                    ? (bet.status as 'WON' | 'LOST' | 'VOID')
                    : 'PENDING';

              await prisma.boletinItem.update({
                where: { id: dbItems[i]!.id },
                data: { result: itemResult },
              });
            }

            if (resolved) {
              await prisma.boletin.update({
                where: { id: createdBoletin.id },
                data: {
                  status: bet.status as 'WON' | 'LOST' | 'VOID',
                  actualReturn: bet.status === 'WON' ? slipReturn : new Prisma.Decimal('0.00'),
                },
              });
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido';
          errors.push(`Ref ${bet.reference ?? '?'}: ${msg}`);
        }
      }
    });

    logger.info('Bulk import completed', { userId, imported, duplicates, errors: errors.length });

    res.json({
      success: true,
      data: {
        imported,
        duplicates,
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      if (statusCode >= 500) {
        logger.error('Bulk import error', { error: err.message, stack: err.stack });
      }
      res.status(statusCode).json({ success: false, error: err.message });
      return;
    }
    logger.error('Unknown bulk import error', { error: err });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}

// ─── AI scan feedback ─────────────────────────────────────────────────────────

const scanFeedbackSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  aiOutput: z.unknown(),
  correctedOutput: z.unknown(),
});

/** POST /api/boletins/import/scan-feedback — stores an AI scan result alongside user corrections for fine-tuning. */
export async function scanFeedbackHandler(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const userId = requireUserId(req);

    const parsed = scanFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: 'Dados inválidos' });
      return;
    }

    const { imageBase64, mimeType, aiOutput, correctedOutput } = parsed.data;

    // Reject oversized images (same limit as scan-ai)
    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      res.status(413).json({ success: false, error: 'Imagem demasiado grande' });
      return;
    }

    await prisma.scanFeedback.create({
      data: {
        userId,
        imageBase64,
        mimeType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiOutput: aiOutput as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        correctedOutput: correctedOutput as any,
      },
    });

    logger.info('Scan feedback stored', { userId });

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    // Log but do NOT surface detailed errors — this endpoint is fire-and-forget on the client
    if (err instanceof Error) {
      logger.error('Scan feedback storage error', { error: err.message });
    }
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}
