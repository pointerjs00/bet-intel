import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { logger } from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIParsedItem {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  sport: string;
  market: string;
  selection: string;
  oddValue: number;
  eventDate?: string;
  /** Individual selection result — only present on resolved bets */
  result?: 'WON' | 'LOST' | 'VOID' | 'PENDING';
}

export interface AIParsedBoletin {
  reference: string;
  betDate: string;
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  status: string;
  items: AIParsedItem[];
  parseError: boolean;
  parseErrorReason?: string;
}

export interface AIParsedResult {
  boletins: AIParsedBoletin[];
  totalFound: number;
  errorCount: number;
}

// ─── Gemini client ───────────────────────────────────────────────────────────

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error('GEMINI_API_KEY não configurada no servidor'), { statusCode: 500 });
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Extract bet slip data from this Betclic Portugal screenshot. Return JSON only.

Rules:
- Text is in Portuguese. Odds are decimal (e.g. 1.50). Dates are DD/MM/YYYY.
- Boletin status: "WON", "LOST", or "PENDING"
- sport: FOOTBALL, BASKETBALL, TENNIS, HANDBALL, VOLLEYBALL, HOCKEY, RUGBY, AMERICAN_FOOTBALL, BASEBALL, or OTHER
- eventDate and betDate: ISO 8601 format
- Extract ALL selections from accumulators
- IMPORTANT: Keep market names and selection descriptions EXACTLY as they appear in the screenshot — do NOT translate them to English. Examples: keep "Resultado (Tempo Regulamentar)" not "Match Result (Regular Time)", keep "SC Braga / Empate & Acima de 1,5" not "SC Braga / Draw & Over 1.5 Goals", keep "Resultado duplo/Golos - acima/abaixo" not "Double Chance/Goals - over/under".
- IMPORTANT: Each item has its own "result" field. Use TWO independent visual signals per row and they must agree:
  SIGNAL 1 — coloured circle icon on the LEFT side of the row: GREEN circle with white checkmark (✓) = WON; RED circle with white X = LOST; grey/absent = PENDING.
  SIGNAL 2 — colour of the selection/team text in that row: GREEN text = WON; RED text = LOST; white/grey text = PENDING.
  Both signals should point to the same result. If they conflict, prefer the icon. CRITICAL: read each signal in the SAME HORIZONTAL ROW as the selection text — never assign an icon or text colour from an adjacent row. In a lost accumulator exactly ONE selection row will show red (icon + text); all other rows that show green must be marked "WON". Do NOT mark a selection LOST just because the overall bet is "Perdida".
- IMPORTANT: Return official international team names, not Portuguese translations (e.g. "VfB Stuttgart" not "Estugarda", "Inter Milan" not "Inter Milão", "Olympique Lyon" not "Lião", "Bayern Munich" not "Baviera")
- IMPORTANT: Always set competition to the correct league name (e.g. "Ligue 1", "Premier League", "La Liga", "Serie A", "Bundesliga", "Liga Portugal"). Infer from teams if not shown.

JSON schema:
{"boletins":[{"betDate":"ISO","stake":0.0,"totalOdds":0.0,"potentialReturn":0.0,"status":"PENDING","items":[{"homeTeam":"","awayTeam":"","competition":"","sport":"FOOTBALL","market":"","selection":"","oddValue":0.0,"eventDate":"ISO","result":"PENDING"}]}]}

If no bets found: {"boletins":[],"error":"reason"}`;

// ─── Parse function ──────────────────────────────────────────────────────────

/**
 * Normalises a raw JSON object returned by any vision model into a validated
 * AIParsedResult, filling in defaults and computing error flags.
 */
export function normalizeParsedResult(parsed: {
  boletins?: AIParsedBoletin[];
  error?: string;
}): AIParsedResult {
  if (!parsed.boletins || parsed.boletins.length === 0) {
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
        parseErrorReason: parsed.error ?? 'Nenhuma aposta encontrada no screenshot.',
      }],
      totalFound: 0,
      errorCount: 1,
    };
  }

  const boletins: AIParsedBoletin[] = parsed.boletins.map((b, idx) => {
    const items = (b.items ?? []).map((item) => ({
      homeTeam: item.homeTeam || 'Equipa desconhecida',
      homeTeamImageUrl: null,
      awayTeam: item.awayTeam || 'Equipa desconhecida',
      awayTeamImageUrl: null,
      competition: item.competition || 'Competição desconhecida',
      sport: item.sport || 'FOOTBALL',
      market: item.market || 'Mercado desconhecido',
      selection: item.selection || 'Seleção desconhecida',
      oddValue: typeof item.oddValue === 'number' && item.oddValue > 1 ? item.oddValue : 0,
      eventDate: item.eventDate || undefined,
      result: (['WON', 'LOST', 'VOID', 'PENDING'].includes(item.result ?? '') ? item.result : 'PENDING') as 'WON' | 'LOST' | 'VOID' | 'PENDING',
    }));

    const hasError = items.length === 0 || b.stake <= 0;

    return {
      reference: `ai-${Date.now()}-${idx}`,
      betDate: b.betDate || new Date().toISOString(),
      stake: typeof b.stake === 'number' && b.stake > 0 ? b.stake : 0,
      totalOdds: typeof b.totalOdds === 'number' && b.totalOdds > 0 ? b.totalOdds : 0,
      potentialReturn: typeof b.potentialReturn === 'number' && b.potentialReturn > 0 ? b.potentialReturn : 0,
      status: ['WON', 'LOST', 'PENDING'].includes(b.status) ? b.status : 'PENDING',
      items,
      parseError: hasError,
      parseErrorReason: hasError ? 'A IA encontrou a aposta mas alguns dados estão em falta.' : undefined,
    };
  });

  const errorCount = boletins.filter((b) => b.parseError).length;

  return {
    boletins,
    totalFound: boletins.length,
    errorCount,
  };
}

export async function parseImageWithGemini(imageBase64: string, mimeType: string): Promise<AIParsedResult> {
  const ai = getGenAI();

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      // Disable thinking for speed — simple extraction doesn't need reasoning
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinkingConfig: { thinkingBudget: 0 },
    } as any,
  });

  logger.info('Sending image to Gemini Vision for parsing', {
    mimeType,
    imageSizeKB: Math.round(imageBase64.length * 0.75 / 1024),
  });

  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    {
      inlineData: {
        mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        data: imageBase64,
      },
    },
  ]);

  const response = result.response;
  const text = response.text().trim();

  logger.info('Gemini Vision response received', {
    responseLength: text.length,
    finishReason: response.candidates?.[0]?.finishReason,
  });

  // Strip markdown code block wrappers if present
  let jsonText = text;
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let parsed: { boletins?: AIParsedBoletin[]; error?: string };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    logger.error('Failed to parse Gemini response as JSON', { rawResponse: text.slice(0, 500) });
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

  return normalizeParsedResult(parsed);
}
