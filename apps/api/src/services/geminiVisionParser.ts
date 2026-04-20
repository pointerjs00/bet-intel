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

const SYSTEM_PROMPT = `You are an expert at extracting structured data from Portuguese betting site screenshots — specifically Betclic Portugal (betclic.pt).

Given a screenshot image of a bet slip or bet result, extract ALL the following information and return it as valid JSON.

IMPORTANT RULES:
- The screenshot is from Betclic Portugal. All text is in Portuguese.
- A bet slip ("boletim") can be a single ("Simples") or accumulator ("Múltipla").
- Each bet contains one or more selections/picks ("seleções").
- Extract EVERY selection/pick in the bet slip.
- Team names should be their full official names (e.g., "SL Benfica", "FC Porto", "Sporting CP", "SC Braga").
- If the screenshot shows a celebration/result screen, look for the result status (won/lost).
- Odds are in European decimal format (e.g., 1.50, 2.10).
- Monetary values use Euro (€) with comma as decimal separator in Portuguese (e.g., "1,50 €").
- Dates are in DD/MM/YYYY format.

For each selection, determine:
- homeTeam: The home team (first team listed, or the team playing at home)
- awayTeam: The away team (second team listed, or the visiting team)
- competition: The league/competition name (e.g., "Liga Portugal", "Champions League", "Premier League", "Ligue 1")
- sport: One of: FOOTBALL, BASKETBALL, TENNIS, HANDBALL, VOLLEYBALL, HOCKEY, RUGBY, AMERICAN_FOOTBALL, BASEBALL, OTHER
- market: The bet market type in Portuguese (e.g., "Resultado (Tempo Regulamentar)" for 1X2, "Resultado Duplo" for double chance, "Golos Acima/Abaixo" for over/under, "Ambas Marcam" for BTTS, "Resultado Intervalo/Final" for HT/FT)
- selection: The actual selection made (e.g., "SL Benfica vence", "Empate", "Acima de 2,5 golos", "SL Benfica / SL Benfica" for HT/FT)
- oddValue: The decimal odds for this selection (e.g., 1.50)
- eventDate: The date of the event in ISO 8601 format if visible (e.g., "2026-04-15T20:00:00.000Z")

For the overall bet slip:
- stake: The amount wagered in euros (e.g., 1.50)
- totalOdds: The combined/total odds (product of all individual odds for accumulators)
- potentialReturn: The potential payout (stake × totalOdds)
- status: "WON" if the bet was won, "LOST" if lost, "PENDING" if still awaiting results
- betDate: The date the bet was placed in ISO 8601 format

RESPOND WITH ONLY valid JSON in this exact format (no markdown, no code blocks, no explanation):
{
  "boletins": [
    {
      "betDate": "2026-04-15T18:30:00.000Z",
      "stake": 1.50,
      "totalOdds": 5.25,
      "potentialReturn": 7.88,
      "status": "WON",
      "items": [
        {
          "homeTeam": "SL Benfica",
          "awayTeam": "FC Porto",
          "competition": "Liga Portugal",
          "sport": "FOOTBALL",
          "market": "Resultado (Tempo Regulamentar)",
          "selection": "SL Benfica vence",
          "oddValue": 1.75,
          "eventDate": "2026-04-15T20:00:00.000Z"
        }
      ]
    }
  ]
}

If you cannot parse any selections, return:
{
  "boletins": [],
  "error": "Description of what went wrong"
}`;

// ─── Parse function ──────────────────────────────────────────────────────────

export async function parseImageWithGemini(imageBase64: string, mimeType: string): Promise<AIParsedResult> {
  const ai = getGenAI();

  const model = ai.getGenerativeModel({
    model: 'gemini-1.5-flash-latest',
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
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

  // Post-process: add references, validate fields
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
