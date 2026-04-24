import OpenAI from 'openai';
import { type AIParsedResult, normalizeParsedResult } from './geminiVisionParser';
import { logger } from '../utils/logger';

// ─── Client (lazy singleton) ─────────────────────────────────────────────────

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error('OPENAI_API_KEY não configurada no servidor'), { statusCode: 500 });
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ─── Parse function ──────────────────────────────────────────────────────────

/**
 * Parses a bet slip image using an OpenAI fine-tuned model.
 * Requires OPENAI_TUNED_MODEL_ID to point to a trained fine-tune
 * (e.g. ft:gpt-4o-mini-2024-07-18:betintel-parser:xxxxx).
 * Falls back to gpt-4o-mini if no tuned model is configured.
 */
export async function parseImageWithOpenAI(imageBase64: string, mimeType: string): Promise<AIParsedResult> {
  const client = getOpenAI();

  const model = process.env.OPENAI_TUNED_MODEL_ID ?? 'gpt-4o-mini';

  logger.info('Sending image to OpenAI Vision for parsing', {
    model,
    mimeType,
    imageSizeKB: Math.round(imageBase64.length * 0.75 / 1024),
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: [
          'You are a bet slip parser for a Portuguese sports betting app.',
          'Extract all data from bet slip screenshots and return structured JSON only.',
          'Return official international team names (e.g. "VfB Stuttgart" not "Estugarda", "Inter Milan" not "Inter Milão").',
          'Always set competition to the correct league. Known: VfB Stuttgart, Bayern Munich, Borussia Dortmund, Bayer Leverkusen, RB Leipzig, Eintracht Frankfurt, Wolfsburg, Werder Bremen play in "Bundesliga" (1st div) — NEVER "2. Bundesliga" or "Bundesliga 2".',
          'IMPORTANT: Keep market names and selection descriptions EXACTLY as they appear in the screenshot in Portuguese — do NOT translate them to English.',
          'Each item has its own "result" field: "WON", "LOST", "VOID", or "PENDING".',
          'Process each selection row from TOP to BOTTOM in document order.',
          'For each row, check the coloured circle icon to the LEFT of the team name and the text colour: GREEN ✓ + green text = WON; RED ✗ + red text = LOST; no icon + white/grey text = PENDING.',
          'IMPORTANT: also include a "losingSelections" array at the boletin level with the EXACT team name strings (as written) that appear in RED on the screenshot (e.g. ["SC Braga", "FC Arouca"]). Empty array if no red names.',
          'In a lost accumulator exactly ONE row is red; all others showing green must be WON. Never mark a row LOST just because the overall bet is Perdida.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: [
              'Extract all bet slip data. Return JSON only matching this schema:',
              '{"boletins":[{"betDate":"ISO","stake":0.0,"totalOdds":0.0,"potentialReturn":0.0,"status":"PENDING","losingSelections":["team name in red"],',
              '"items":[{"homeTeam":"","awayTeam":"","competition":"","sport":"FOOTBALL","market":"","selection":"","oddValue":0.0,"eventDate":"ISO","result":"PENDING"}]}]}',
              'losingSelections: list exact team name text strings shown in RED on the screenshot. This is the primary signal for identifying the losing leg.',
              'Boletin status must be "WON", "LOST", or "PENDING". Item result must be "WON", "LOST", "VOID", or "PENDING".',
              'market and selection must be in Portuguese exactly as shown — do NOT translate.',
              'sport must be one of: FOOTBALL BASKETBALL TENNIS HANDBALL VOLLEYBALL HOCKEY RUGBY AMERICAN_FOOTBALL BASEBALL OTHER.',
              'If no bets found: {"boletins":[],"error":"reason"}',
            ].join(' '),
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const text = response.choices[0]?.message?.content ?? '{"boletins":[]}';

  logger.info('OpenAI Vision response received', {
    model,
    usage: response.usage,
    finishReason: response.choices[0]?.finish_reason,
  });

  let parsed: { boletins?: unknown[]; error?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    logger.error('Failed to parse OpenAI response as JSON', { rawResponse: text.slice(0, 500) });
    return {
      boletins: [{
        reference: `ai-${Date.now()}`,
        betDate: new Date().toISOString(),
        stake: 0,
        totalOdds: 0,
        potentialReturn: 0,
        status: 'PENDING',
        items: [],
        parseError: true,
        parseErrorReason: 'A IA não conseguiu interpretar o screenshot. Tenta com outra imagem.',
      }],
      totalFound: 0,
      errorCount: 1,
    };
  }

  return normalizeParsedResult(parsed as Parameters<typeof normalizeParsedResult>[0]);
}
