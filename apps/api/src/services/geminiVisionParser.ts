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
  /**
   * Team name strings that appear in RED on the screenshot (the losing legs).
   * More reliable than per-item icon detection — used to override item.result via text matching.
   */
  losingSelections?: string[];
  parseError: boolean;
  parseErrorReason?: string;
}

export interface AIParsedResult {
  boletins: AIParsedBoletin[];
  totalFound: number;
  errorCount: number;
}

// ─── Timezone helpers ────────────────────────────────────────────────────────

/**
 * Returns the UTC offset of Europe/Lisbon (in ms) at a given UTC instant.
 * Handles both WET (UTC+0, winter) and WEST (UTC+1, summer) automatically.
 */
function getLisbonOffsetMs(utcDate: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(utcDate).map(p => [p.type, p.value]));
  const h = parseInt(parts.hour!);
  const lisbonWallMs = Date.UTC(
    parseInt(parts.year!), parseInt(parts.month!) - 1, parseInt(parts.day!),
    h === 24 ? 0 : h, parseInt(parts.minute!), parseInt(parts.second!),
  );
  return lisbonWallMs - utcDate.getTime();
}

/**
 * Gemini reads a Lisbon wall-clock time from the screenshot and returns it as
 * if it were UTC. This re-interprets it as Lisbon local time and returns the
 * true UTC ISO string.
 */
function aiDateAsLisbonToUTC(dateStr: string | undefined | null): string {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return new Date(d.getTime() - getLisbonOffsetMs(d)).toISOString();
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
- IMPORTANT: Each item has its own "result" field. Use the coloured circle icon immediately to the LEFT of the team name on that same line: GREEN circle ✓ = WON; RED circle ✗ = LOST; grey/absent = PENDING. Also check text colour: green text = WON, red text = LOST.
- IMPORTANT: At the boletin level, add a "losingSelections" array: list the EXACT team name text strings (as written in the screenshot) for every team name that appears in RED. For example, if "SC Braga" and "FC Arouca" appear in red, output ["SC Braga", "FC Arouca"]. If no team names are red (pending bet), output []. This field is the most reliable way to identify losing legs.
- In a lost accumulator exactly ONE selection row is red; all others are green (WON). Do NOT mark a selection LOST just because the overall bet label says "Perdida".
- IMPORTANT: Return official international team names, not Portuguese translations (e.g. "VfB Stuttgart" not "Estugarda", "Inter Milan" not "Inter Milão", "Olympique Lyon" not "Lião", "Bayern Munich" not "Baviera")
- IMPORTANT: Always set competition to the correct league name (e.g. "Ligue 1", "Premier League", "La Liga", "Serie A", "Bundesliga", "Liga Portugal Betclic"). The Portuguese top-flight shown on Betclic screenshots is always "Liga Portugal Betclic" — never output "Primeira Liga" or "Liga Portugal". Infer from teams if not shown. Known league memberships (use these to override what the screenshot says if it contradicts known facts): Bundesliga (1st division) clubs include VfB Stuttgart, Bayern Munich, Borussia Dortmund, Bayer Leverkusen, RB Leipzig, Borussia Mönchengladbach, Eintracht Frankfurt, Wolfsburg, Hoffenheim, Freiburg, Union Berlin, Werder Bremen, Mainz, Augsburg, Köln — NEVER assign these teams to "2. Bundesliga" or "Bundesliga 2".

JSON schema:
{"boletins":[{"betDate":"ISO","stake":0.0,"totalOdds":0.0,"potentialReturn":0.0,"status":"PENDING","losingSelections":["team name in red"],"items":[{"homeTeam":"","awayTeam":"","competition":"","sport":"FOOTBALL","market":"","selection":"","oddValue":0.0,"eventDate":"ISO","result":"PENDING"}]}]}

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
      eventDate: item.eventDate ? aiDateAsLisbonToUTC(item.eventDate) : undefined,
      result: (['WON', 'LOST', 'VOID', 'PENDING'].includes(item.result ?? '') ? item.result : 'PENDING') as 'WON' | 'LOST' | 'VOID' | 'PENDING',
    }));

    // ── losingSelections override ──────────────────────────────────────────
    // The AI is asked to list team-name strings that appear in RED on the
    // screenshot. Text-content matching is far more reliable than spatial
    // icon-row detection. If provided and the boletin is resolved, use these
    // to derive per-item results, overriding the per-item icon guess.
    const losingSelections: string[] = ((b as unknown as { losingSelections?: string[] }).losingSelections ?? [])
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);

    if (losingSelections.length > 0 && (b.status === 'WON' || b.status === 'LOST')) {
      for (const item of items) {
        const haystack = [item.homeTeam, item.awayTeam, item.market, item.selection]
          .join(' ')
          .toLowerCase();
        const isLosing = losingSelections.some((ls) =>
          haystack.includes(ls) ||
          item.homeTeam.toLowerCase().includes(ls) ||
          item.awayTeam.toLowerCase().includes(ls) ||
          ls.includes(item.homeTeam.toLowerCase()) ||
          ls.includes(item.awayTeam.toLowerCase()),
        );
        item.result = isLosing ? 'LOST' : 'WON';
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    const hasError = items.length === 0 || b.stake <= 0;

    return {
      reference: `ai-${Date.now()}-${idx}`,
      betDate: aiDateAsLisbonToUTC(b.betDate),
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
