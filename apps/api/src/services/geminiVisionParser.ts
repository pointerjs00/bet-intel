import { GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel } from '@google/genai';
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
  /** Fields the model could not read with confidence (to highlight in the review). */
  uncertain?: string[];
}

export interface AIParsedBoletin {
  reference: string;
  betDate: string;
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  status: string;
  /** Betting site read from the screenshot (branding), or null. */
  site?: string | null;
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

// ─── Gemini client ───────────────────────────────────────────────────────────

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error('GEMINI_API_KEY não configurada no servidor'), { statusCode: 500 });
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

/** JSON schema the model must follow (enforced by the API, so no more half-formed JSON). */
const RESULT_ENUM = ['WON', 'LOST', 'VOID', 'PENDING'];
const SPORT_ENUM = ['FOOTBALL', 'BASKETBALL', 'TENNIS', 'HANDBALL', 'VOLLEYBALL', 'HOCKEY', 'RUGBY', 'AMERICAN_FOOTBALL', 'BASEBALL', 'OTHER'];
const SITE_ENUM = ['betclic', 'placard', 'bet365', 'esconline', 'moosh', 'solverde', 'betano', 'betway', '888sport', 'bwin', 'lebull', 'unknown'];
const UNCERTAIN_ENUM = ['homeTeam', 'awayTeam', 'competition', 'market', 'selection', 'oddValue', 'eventDate', 'result'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    boletins: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          betDate: { type: 'string' },
          stake: { type: 'number' },
          totalOdds: { type: 'number' },
          potentialReturn: { type: 'number' },
          status: { type: 'string', enum: ['WON', 'LOST', 'PENDING'] },
          site: { type: 'string', enum: SITE_ENUM },
          losingSelections: { type: 'array', items: { type: 'string' } },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                homeTeam: { type: 'string' },
                awayTeam: { type: 'string' },
                competition: { type: 'string' },
                sport: { type: 'string', enum: SPORT_ENUM },
                market: { type: 'string' },
                selection: { type: 'string' },
                oddValue: { type: 'number' },
                eventDate: { type: 'string' },
                result: { type: 'string', enum: RESULT_ENUM },
                uncertain: { type: 'array', items: { type: 'string', enum: UNCERTAIN_ENUM } },
              },
              required: ['homeTeam', 'awayTeam', 'competition', 'sport', 'market', 'selection', 'oddValue', 'result'],
            },
          },
        },
        required: ['stake', 'totalOdds', 'status', 'items'],
      },
    },
    error: { type: 'string' },
  },
  required: ['boletins'],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Prompt ──────────────────────────────────────────────────────────────────

function getSystemPrompt(): string {
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = now.getUTCFullYear();
  return `Extract bet slip data from this Betclic Portugal screenshot. Return JSON only.

Today's date is ${dd}/${mm}/${yyyy}. When the year is not clearly visible on the screenshot, always use ${yyyy}.
All times shown on Betclic Portugal screenshots are Europe/Lisbon local time (UTC+0 Nov–Mar, UTC+1 Apr–Oct). Output all dates in UTC ISO 8601 with Z suffix.

Rules:
- Text is in Portuguese. Odds are decimal (e.g. 1.50). Dates are DD/MM/YYYY.
- Boletin status: "WON", "LOST", or "PENDING"
- sport: FOOTBALL, BASKETBALL, TENNIS, HANDBALL, VOLLEYBALL, HOCKEY, RUGBY, AMERICAN_FOOTBALL, BASEBALL, or OTHER
- eventDate and betDate: ISO 8601 format
- Extract ALL selections from accumulators
- "site": the betting site whose branding (logo, colours, layout) the screenshot shows: betclic, placard, bet365, esconline, moosh, solverde, betano, betway, 888sport, bwin, lebull — or "unknown".
- Per item, "uncertain": list the fields you could NOT read clearly or had to guess (e.g. a competition not shown on the slip, a player name abbreviated to an initial, a cut-off market). Empty array when everything was read directly.
- IMPORTANT: Keep market names and selection descriptions EXACTLY as they appear in the screenshot — do NOT translate them to English. Examples: keep "Resultado (Tempo Regulamentar)" not "Match Result (Regular Time)", keep "SC Braga / Empate & Acima de 1,5" not "SC Braga / Draw & Over 1.5 Goals", keep "Resultado duplo/Golos - acima/abaixo" not "Double Chance/Goals - over/under".
- IMPORTANT: Each item has its own "result" field. In Betclic screenshots, the status indicators are small circular icons shown horizontally near the top of the bet slip next to the "Múltipla" or "Simples" label — one icon per selection, ordered left-to-right matching the selections top-to-bottom. Interpret each icon: GREEN filled circle = "WON"; RED filled circle = "LOST"; GREY circle = "VOID"; CLOCK icon or outline circle = "PENDING". Match icon position to selection by order. Use selection text colour as a secondary confirmation: green = WON, red = LOST, grey = VOID, white/default = PENDING.
- IMPORTANT: At the boletin level, add a "losingSelections" array: list the EXACT team name text strings (as written in the screenshot) for every team name that appears in RED. For example, if "SC Braga" and "FC Arouca" appear in red, output ["SC Braga", "FC Arouca"]. If no team names are red (pending bet), output []. This field is the most reliable way to identify losing legs.
- In a lost accumulator at least one selection row is red (LOST); the others can be green (WON), grey (VOID) or still pending. Do NOT mark a selection LOST just because the overall bet label says "Perdida".
- IMPORTANT: Return official international team names, not Portuguese translations (e.g. "VfB Stuttgart" not "Estugarda", "Inter Milan" not "Inter Milão", "Olympique Lyon" not "Lião", "Bayern Munich" not "Baviera")
- IMPORTANT: Always set competition to the correct league name (e.g. "Ligue 1", "Premier League", "La Liga", "Serie A", "Bundesliga", "Liga Portugal Betclic"). The Portuguese top-flight shown on Betclic screenshots is always "Liga Portugal Betclic" — never output "Primeira Liga" or "Liga Portugal". Infer from teams if not shown. Known league memberships (use these to override what the screenshot says if it contradicts known facts): Bundesliga (1st division) clubs include VfB Stuttgart, Bayern Munich, Borussia Dortmund, Bayer Leverkusen, RB Leipzig, Borussia Mönchengladbach, Eintracht Frankfurt, Wolfsburg, Hoffenheim, Freiburg, Union Berlin, Werder Bremen, Mainz, Augsburg, Köln — NEVER assign these teams to "2. Bundesliga" or "Bundesliga 2".

JSON schema:
{"boletins":[{"betDate":"ISO","stake":0.0,"totalOdds":0.0,"potentialReturn":0.0,"status":"PENDING","losingSelections":["team name in red"],"items":[{"homeTeam":"","awayTeam":"","competition":"","sport":"FOOTBALL","market":"","selection":"","oddValue":0.0,"eventDate":"ISO","result":"PENDING"}]}]}

If no bets found: {"boletins":[],"error":"reason"}`;
}

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
      eventDate: item.eventDate ?? undefined,
      result: (['WON', 'LOST', 'VOID', 'PENDING'].includes(item.result ?? '') ? item.result : 'PENDING') as 'WON' | 'LOST' | 'VOID' | 'PENDING',
      uncertain: [
        ...((item as { uncertain?: string[] }).uncertain ?? []).filter((f) => UNCERTAIN_ENUM.includes(f)),
        // Placeholders and unreadable odds are always worth a look.
        ...(!item.competition ? ['competition'] : []),
        ...(!(typeof item.oddValue === 'number' && item.oddValue > 1) ? ['oddValue'] : []),
        ...(!item.homeTeam ? ['homeTeam'] : []),
        ...(!item.awayTeam ? ['awayTeam'] : []),
      ].filter((f, i, a) => a.indexOf(f) === i),
    }));

    // ── losingSelections override ──────────────────────────────────────────
    // The AI is asked to list team-name strings that appear in RED on the
    // screenshot. Text-content matching is far more reliable than spatial
    // icon-row detection. If provided and the boletin is resolved, use these
    // to derive per-item results, overriding the per-item icon guess.
    const losingSelections: string[] = ((b as unknown as { losingSelections?: string[] }).losingSelections ?? [])
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);

    // A won slip has no losing legs: anything the model read as LOST/PENDING is WON (VOID stays VOID).
    if (b.status === 'WON') {
      for (const item of items) {
        if (item.result === 'LOST' || item.result === 'PENDING') item.result = 'WON';
      }
    }
    // A lost slip: legs whose team names appear in red are LOST. Other legs keep the model's own
    // reading — they may be won, void or still pending, so they are never forced to WON.
    if (losingSelections.length > 0 && b.status === 'LOST') {
      const sameName = (a: string, c: string) => {
        const x = a.toLowerCase().trim();
        const y = c.toLowerCase().trim();
        return x.length >= 3 && y.length >= 3 && (x === y || x.includes(y) || y.includes(x));
      };
      for (const item of items) {
        const isLosing = losingSelections.some((ls) => sameName(ls, item.homeTeam) || sameName(ls, item.awayTeam));
        if (isLosing) item.result = 'LOST';
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    // Arithmetic check (#46): a misread odd or stake shows up as numbers that don't add up.
    // Measured on 88 corrected slips: only 1 legit mismatch above 3% (odds boost).
    const stake = typeof b.stake === 'number' ? b.stake : 0;
    const total = typeof b.totalOdds === 'number' ? b.totalOdds : 0;
    const product = items.reduce((acc, it) => acc * (it.oddValue > 1 ? it.oddValue : NaN), 1);
    const oddsMismatch = total > 1 && Number.isFinite(product) && Math.abs(product - total) / total > 0.03;
    const potential = typeof b.potentialReturn === 'number' ? b.potentialReturn : 0;
    const returnMismatch = potential > 0 && stake > 0 && total > 1
      && Math.abs(stake * total - potential) > 0.05 + 0.01 * potential;

    const hasError = items.length === 0 || b.stake <= 0 || oddsMismatch || returnMismatch;
    const errorReason = items.length === 0 || b.stake <= 0
      ? 'A IA encontrou a aposta mas alguns dados estão em falta.'
      : oddsMismatch
        ? 'Confirma as odds: o produto das seleções não bate com a odd total.'
        : returnMismatch
          ? 'Confirma a stake e a odd total: não batem com o retorno possível.'
          : undefined;

    return {
      reference: `ai-${Date.now()}-${idx}`,
      betDate: b.betDate ?? new Date().toISOString(),
      stake: typeof b.stake === 'number' && b.stake > 0 ? b.stake : 0,
      totalOdds: typeof b.totalOdds === 'number' && b.totalOdds > 0 ? b.totalOdds : 0,
      potentialReturn: typeof b.potentialReturn === 'number' && b.potentialReturn > 0 ? b.potentialReturn : 0,
      status: ['WON', 'LOST', 'PENDING'].includes(b.status) ? b.status : 'PENDING',
      site: (() => { const v = (b as { site?: string }).site; return v && v !== 'unknown' && SITE_ENUM.includes(v) ? v : null; })(),
      items,
      parseError: hasError,
      parseErrorReason: errorReason,
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

  // Benchmark (#49, 10/11/2026, 59 corrected screenshots): gemini-3.5-flash-lite with low thinking
  // matched or beat gemini-2.5-flash on every field and was faster. Override with GEMINI_SCAN_MODEL.
  const modelName = process.env.GEMINI_SCAN_MODEL ?? 'gemini-3.5-flash-lite';
  const thinkingConfig = modelName.startsWith('gemini-2.')
    ? { thinkingBudget: 0 }
    : { thinkingLevel: ThinkingLevel.LOW };

  logger.info('Sending image to Gemini Vision for parsing', {
    model: modelName,
    mimeType,
    imageSizeKB: Math.round(imageBase64.length * 0.75 / 1024),
  });

  // Free tier: 429 (rate limit) and 503 (overloaded) are common and short-lived — retry with backoff.
  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: [{
          role: 'user',
          parts: [{ text: getSystemPrompt() }, { inlineData: { mimeType, data: imageBase64 } }],
        }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0,
          thinkingConfig,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        },
      });
      break;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (attempt === 3 || (status !== 429 && status !== 503 && status !== 500)) throw err;
      logger.warn('Gemini Vision retry', { attempt, status });
      await sleep(2000 * attempt);
    }
  }

  const text = (response?.text ?? '').trim();

  logger.info('Gemini Vision response received', {
    responseLength: text.length,
    finishReason: response?.candidates?.[0]?.finishReason,
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
