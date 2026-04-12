// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }> = require('pdf-parse');
import { logger } from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedBetclicItem {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  sport: string;
  market: string;
  selection: string;
  oddValue: number;
}

export interface ParsedBetclicBoletin {
  reference: string;
  betDate: string;          // ISO 8601
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  status: string;           // mapped to BoletinStatus enum
  items: ParsedBetclicItem[];
  parseError: boolean;
  parseErrorReason?: string;
}

export interface BetclicPdfResult {
  boletins: ParsedBetclicBoletin[];
  totalFound: number;
  errorCount: number;
}

// ─── Mappings ────────────────────────────────────────────────────────────────

const SPORT_MAP: Record<string, string> = {
  'football': 'FOOTBALL',
  'futebol': 'FOOTBALL',
  'soccer': 'FOOTBALL',
  'basketball': 'BASKETBALL',
  'basquetebol': 'BASKETBALL',
  'basket': 'BASKETBALL',
  'tennis': 'TENNIS',
  'ténis': 'TENNIS',
  'tenis': 'TENNIS',
  'handball': 'HANDBALL',
  'andebol': 'HANDBALL',
  'volleyball': 'VOLLEYBALL',
  'voleibol': 'VOLLEYBALL',
  'hockey': 'HOCKEY',
  'hóquei': 'HOCKEY',
  'hoquei': 'HOCKEY',
  'rugby': 'RUGBY',
  'american football': 'AMERICAN_FOOTBALL',
  'futebol americano': 'AMERICAN_FOOTBALL',
  'baseball': 'BASEBALL',
  'basebol': 'BASEBALL',
};

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parses a Betclic PDF bet history export into structured bet data.
 *
 * Betclic PDF exports typically contain a table with columns:
 * Date | Reference | Event | Market | Selection | Odds | Stake | Status
 *
 * Accumulator bets appear as multiple rows sharing the same reference number.
 */
export async function parseBetclicPdf(buffer: Buffer): Promise<BetclicPdfResult> {
  let pdfData: { text: string };
  try {
    pdfData = await pdfParse(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('password') || message.toLowerCase().includes('encrypt')) {
      throw Object.assign(
        new Error('O ficheiro está protegido. Remove a palavra-passe e tenta novamente'),
        { statusCode: 400 },
      );
    }
    throw Object.assign(
      new Error('Erro ao ler o ficheiro PDF'),
      { statusCode: 400 },
    );
  }

  const text = pdfData.text;
  if (!text || text.trim().length === 0) {
    throw Object.assign(
      new Error('Não encontrámos apostas neste ficheiro. Certifica-te de que exportaste o histórico correto do Betclic'),
      { statusCode: 422 },
    );
  }

  const rawBets = extractBetsFromText(text);

  if (rawBets.length === 0) {
    throw Object.assign(
      new Error('Não encontrámos apostas neste ficheiro. Certifica-te de que exportaste o histórico correto do Betclic'),
      { statusCode: 422 },
    );
  }

  // Group by reference to handle accumulators
  const grouped = groupByReference(rawBets);
  const boletins: ParsedBetclicBoletin[] = [];
  let errorCount = 0;

  for (const [reference, rows] of grouped) {
    try {
      const boletin = buildBoletin(reference, rows);
      boletins.push(boletin);
      if (boletin.parseError) errorCount++;
    } catch (err) {
      errorCount++;
      boletins.push({
        reference,
        betDate: new Date().toISOString(),
        stake: 0,
        totalOdds: 1,
        potentialReturn: 0,
        status: 'PENDING',
        items: [],
        parseError: true,
        parseErrorReason: err instanceof Error ? err.message : 'Erro desconhecido ao processar aposta',
      });
    }
  }

  return {
    boletins,
    totalFound: boletins.length,
    errorCount,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface RawBetRow {
  reference: string;
  date: string;       // DD/MM/YYYY
  betType: string;    // SIM | COM | LCOM | LIV
  stake: number;
  totalOdds: number;
  matchLabel: string; // "Team1 - Team2"
  market: string;
  selection: string;
  endDate: string;    // DD/MM/YYYY
  winTotal: number;
  sport: string;
}

interface ParsedBetLineDebug {
  reference: string;
  normalizedSegmentSample: string;
  middleSectionSample: string;
  headMatch: boolean;
  parsedDate: string;
  parsedType: string;
  parsedStake: number;
  parsedOdds: number;
  parsedMatchId: string | null;
  parsedEndDate: string;
  parsedWinTotal: number;
  parsedMatchLabel: string;
  parsedMarket: string;
  parsedSelection: string;
  suspiciousReasons: string[];
}

/**
 * Extracts bet rows from a Betclic personal-data-extraction PDF.
 *
 * The PDF export has rows identified by a 24-character hex "Bet reference".
 * After pdf-parse extraction the text may have inconsistent line breaks,
 * so we search the entire normalized text for the reference pattern.
 * Multiple fallback strategies are used when the simple regex fails.
 */
function extractBetsFromText(text: string): RawBetRow[] {
  // Log a sample so we can diagnose extraction issues
  logger.debug(`[BetclicPDF] Raw text sample (first 800): ${text.slice(0, 800).replace(/[\r\n]/g, '↵')}`);

  // Normalize: collapse all whitespace into single spaces
  const normalized = text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');

  // ── Strategy 1: full pattern (ref + date + bet type adjacent) ──────────────
  const REF_RE = /([0-9a-f]{24})\s+(\d{2}\/\d{2}\/\d{4})\s+(SIM|COM|LCOM|LIV)\b/gi;
  const allMatches = [...normalized.matchAll(REF_RE)];
  logger.debug(`[BetclicPDF] Strategy 1 (ref+date+type adjacent): ${allMatches.length} matches`);

  if (allMatches.length > 0) {
    const rows: RawBetRow[] = [];
    for (let i = 0; i < allMatches.length; i++) {
      const m = allMatches[i];
      const segEnd = i + 1 < allMatches.length ? (allMatches[i + 1].index ?? normalized.length) : normalized.length;
      const segment = normalized.slice(m.index ?? 0, segEnd).trim();
      const parsed = parseBetLine(segment);
      if (parsed) rows.push(parsed);
    }
    return rows;
  }

  // ── Strategy 2: line-by-line (ref + date + type on same line) ─────────────
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const lineRows: RawBetRow[] = [];
  for (const line of lines) {
    if (/[0-9a-f]{24}/i.test(line) && /\d{2}\/\d{2}\/\d{4}/.test(line) && /\b(SIM|COM|LCOM|LIV)\b/i.test(line)) {
      const parsed = parseBetLine(line.replace(/\s{2,}/g, ' '));
      if (parsed) lineRows.push(parsed);
    }
  }
  logger.debug(`[BetclicPDF] Strategy 2 (line-by-line): ${lineRows.length} matches`);
  if (lineRows.length > 0) return lineRows;

  // ── Strategy 3: find all ref IDs and pair with nearby dates ───────────────
  const ALL_REFS = [...normalized.matchAll(/([0-9a-f]{24})/gi)];
  const ALL_DATES = [...normalized.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)];
  const ALL_AMOUNTS = [...normalized.matchAll(/€\s*([\d]+[,.][\d]{2})/g)];
  const ALL_TYPES = [...normalized.matchAll(/\b(SIM|COM|LCOM|LIV)\b/gi)];

  logger.debug(`[BetclicPDF] Strategy 3 counts — refs:${ALL_REFS.length} dates:${ALL_DATES.length} amounts:${ALL_AMOUNTS.length} types:${ALL_TYPES.length}`);
  if (ALL_REFS.length > 0) {
    logger.debug(`[BetclicPDF] Strategy 3 first refs: ${ALL_REFS.slice(0, 5).map((match) => match[1]).join(', ')}`);
  }

  if (ALL_REFS.length > 0) {
    const rows: RawBetRow[] = [];
    const usedDates = new Set<number>();
    const usedAmts = new Set<number>();
    const usedTypes = new Set<number>();

    for (let i = 0; i < ALL_REFS.length; i++) {
      const ref = ALL_REFS[i];
      const refPos = ref.index ?? 0;
      const nextRefPos = i + 1 < ALL_REFS.length ? (ALL_REFS[i + 1].index ?? normalized.length) : normalized.length;

      // nearest date after this ref
      let betDate = '';
      for (const d of ALL_DATES) {
        const di = d.index ?? 0;
        if (di >= refPos && di < nextRefPos && !usedDates.has(di)) {
          betDate = d[1]; usedDates.add(di); break;
        }
      }
      if (!betDate) betDate = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

      let stake = 0;
      for (const a of ALL_AMOUNTS) {
        const ai = a.index ?? 0;
        if (ai >= refPos && ai < nextRefPos && !usedAmts.has(ai)) {
          stake = parseEuroStr(a[1]); usedAmts.add(ai); break;
        }
      }

      let betType = 'SIM';
      for (const t of ALL_TYPES) {
        const ti = t.index ?? 0;
        if (ti >= refPos && ti < nextRefPos && !usedTypes.has(ti)) {
          betType = t[1].toUpperCase(); usedTypes.add(ti); break;
        }
      }

      const segment = normalized.slice(refPos, nextRefPos).trim();
      const parsedSegment = parseBetLine(segment);
      if (parsedSegment) {
        rows.push(parsedSegment);
        continue;
      }

      const { matchLabel, market, selection, sport } = parseMiddleSection(segment);

      rows.push({
        reference: ref[1],
        date: betDate,
        betType,
        stake,
        totalOdds: 1,
        matchLabel,
        market,
        selection,
        endDate: betDate,
        winTotal: 0,
        sport,
      });
    }
    logger.debug(`[BetclicPDF] Strategy 3 produced ${rows.length} rows`);
    return rows;
  }

  return [];
}


/**
 * Parses a single (normalized, single-spaced) bet segment starting from the reference ID.
 *
 * Format (approximate):
 *   <refId> <DD/MM/YYYY> <TYPE> € <stake> <odds> <matchId> <matchLabel> <bet> <choice>
 *   <DD/MM/YYYY> € <winAmt> € <winBonus> € <winTotal> <VRAI|FAUX>
 */
function parseBetLine(segment: string): RawBetRow | null {
  // Normalise common token joins produced by pdf-parse.
  const normalizedSegment = segment
    .replace(/([0-9a-f]{24})(\d{2}\/\d{2}\/\d{4})/gi, '$1 $2')
    .replace(/(\d{2}\/\d{2}\/\d{4})(SIM|COM|LCOM|LIV)/gi, '$1 $2')
    .replace(/\b(SIM|COM|LCOM|LIV)(€?)(\d)/gi, '$1 $2 $3')
    .replace(/(\d)(€)/g, '$1 $2')
    .replace(/(€)(\d)/g, '$1 $2')
    .replace(/(\d{10,})([^\s\d€])/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Head columns in order: Reference | Date | Type | Amount | Odd | Match ID
  const headM = normalizedSegment.match(
    /^([0-9a-f]{24})\s*(\d{2}\/\d{2}\/\d{4})\s*(SIM|COM|LCOM|LIV)\s*(?:€\s*)?([\d]+[,.]\d{2})(?:\s*€)?\s*([\d]+(?:[,.]\d+)?)\s*(\d{10,})/i,
  );

  // 1. Reference / date / type / stake / odd
  let reference = '';
  let date = '';
  let betType = 'SIM';
  let stake = 0;
  let totalOdds = 1;

  if (headM) {
    reference = headM[1];
    date = headM[2];
    betType = headM[3].toUpperCase();
    stake = parseEuroStr(headM[4]);
    totalOdds = truncateDecimal(parseFloat(headM[5].replace(',', '.')) || 1, 2);
  } else {
    const refM = normalizedSegment.match(/^([0-9a-f]{24})/i);
    const dateM = normalizedSegment.match(/(\d{2}\/\d{2}\/\d{4})/);
    const typeM = normalizedSegment.match(/\b(SIM|COM|LCOM|LIV)\b/i);
    if (!refM || !dateM) return null;

    reference = refM[1];
    date = dateM[1];
    betType = typeM ? typeM[1].toUpperCase() : 'SIM';

    const stakeM = normalizedSegment.match(/\b(?:SIM|COM|LCOM|LIV)\b\s*(?:€\s*)?([\d]+[,.]\d{2})(?:\s*€)?/i);
    if (stakeM) {
      stake = parseEuroStr(stakeM[1]);
    }

    const oddsM = normalizedSegment.match(
      /\b(?:SIM|COM|LCOM|LIV)\b\s*(?:€\s*)?[\d]+[,.]\d{2}(?:\s*€)?\s*([\d]+(?:[,.]\d+)?)\s*\d{10,}/i,
    );
    if (oddsM) {
      const parsed = parseFloat(oddsM[1].replace(',', '.'));
      if (isFinite(parsed) && parsed >= 1) totalOdds = truncateDecimal(parsed, 2);
    }
  }

  // 6. Tail: last occurrence of: DD/MM/YYYY € X € Y € Z VRAI|FAUX
  const TAIL_RE = /(\d{2}\/\d{2}\/\d{4})\s+€\s*([\d,\.]+|-)\s+€\s*([\d,\.]+|-)\s+€\s*([\d,\.]+|-)\s+(?:VRAI|FAUX)/gi;
  const tailMatches = [...normalizedSegment.matchAll(TAIL_RE)];
  const tailM = tailMatches.length > 0 ? tailMatches[tailMatches.length - 1] : null;

  const endDate = tailM ? tailM[1] : date;
  const winTotal = tailM ? parseEuroStr(tailM[4]) : 0;

  // 7. Middle section (between match ID and tail) → match label, market, selection
  const matchIdM = normalizedSegment.match(/\b(\d{10,})\s*/);
  let midStart = -1;
  if (matchIdM) {
    midStart = (matchIdM.index ?? 0) + matchIdM[0].length;
  } else if (headM) {
    // headM captured through the match ID — use the end of its match as fallback
    midStart = (headM.index ?? 0) + headM[0].length;
  }

  let matchLabel = 'Desconhecido - Desconhecido';
  let market = 'Resultado Final';
  let selection = 'Desconhecido';
  let sport = 'OTHER';
  let middleRawForDebug = '';

  if (midStart >= 0 && tailM) {
    const tailIdx = normalizedSegment.lastIndexOf(tailM[0]);
    if (tailIdx > midStart) {
      const middleRaw = normalizedSegment.slice(midStart, tailIdx).trim();
      middleRawForDebug = middleRaw;
      const parsed = parseMiddleSection(middleRaw);
      matchLabel = parsed.matchLabel;
      market = parsed.market;
      selection = parsed.selection;
      sport = parsed.sport;
    }
  } else if (midStart >= 0) {
    // No tail found — extract what we can from after the match ID
    const middleRaw = normalizedSegment.slice(midStart).trim();
    middleRawForDebug = middleRaw;
    const parsed = parseMiddleSection(middleRaw);
    matchLabel = parsed.matchLabel;
    market = parsed.market;
    selection = parsed.selection;
    sport = parsed.sport;
  }

  const suspiciousReasons: string[] = [];
  if (!headM) suspiciousReasons.push('head-columns-no-match');
  if (!matchIdM) suspiciousReasons.push('match-id-not-found');
  if (matchLabel.includes('Desconhecido')) suspiciousReasons.push('unknown-match-label');
  if (market === 'Football') suspiciousReasons.push('sport-used-as-market');
  if (selection.startsWith('Boosted Odds')) suspiciousReasons.push('boosted-odds-stuck-in-selection');
  if (selection.startsWith('/')) suspiciousReasons.push('selection-leading-slash');


  const debugPayload: ParsedBetLineDebug = {
    reference,
    normalizedSegmentSample: normalizedSegment.slice(0, 260),
    middleSectionSample: middleRawForDebug.slice(0, 220),
    headMatch: Boolean(headM),
    parsedDate: date,
    parsedType: betType,
    parsedStake: stake,
    parsedOdds: totalOdds,
    parsedMatchId: matchIdM?.[1] ?? null,
    parsedEndDate: endDate,
    parsedWinTotal: winTotal,
    parsedMatchLabel: matchLabel,
    parsedMarket: market,
    parsedSelection: selection,
    suspiciousReasons,
  };

  if (suspiciousReasons.length > 0) {
    logger.debug('[BetclicPDF] Suspicious row parse', debugPayload);
  }
  return { reference, date, betType, stake, totalOdds, matchLabel, market, selection, endDate, winTotal, sport };
}

/** Parses "10.00", "10,00", or "-" to a float (0 for "-"). */
function parseEuroStr(raw: string): number {
  if (!raw || raw.trim() === '-') return 0;
  return parseFloat(raw.replace(',', '.')) || 0;
}

function truncateDecimal(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const SPORT_PREFIX_PATTERN = /^(American Football|Football|Basketball|Tennis|Handball|Hockey|Rugby|Baseball)$/i;

interface MarketPattern {
  regex: RegExp;
  normalizeMarket?: (market: string) => string;
}

const MARKET_PATTERNS: MarketPattern[] = [
  // ── Sport-prefixed boost / promo markets ──────────────────────────────────
  {
    regex: /^(?<away>.+?)\s+(?<sport>American Football|Football|Basketball|Tennis|Handball|Hockey|Rugby|Baseball)\s*(?:-\s*)?(?<market>Boosted Odds(?:\s*\.PT| PT)?|Boost(?:\s*\.PT| PT)?|Monster Odds(?:\s*\.PT| PT)?|Bons Plans(?:\s*\.PT| PT)?)\s+(?<selection>.+)$/i,
    normalizeMarket: normalizeBoostMarket,
  },
  // ── Composite / slash markets ─────────────────────────────────────────────
  {
    regex: /^(?<away>.+?)\s+(?<market>Half Time \/ Full Time(?:\s*-\s*Boost(?:ed)?(?:\s*\.PT| PT)?)?)\s+(?<selection>.+)$/i,
    normalizeMarket: normalizeBoostMarket,
  },
  {
    regex: /^(?<away>.+?)\s+(?<market>Both Teams to Score \/ (?:Total Goals|\d+(?:\.\d+)? Goals))\s+(?<selection>.+)$/i,
  },
  {
    regex: /^(?<away>.+?)\s+(?<market>Double Chance & (?:Over\/Under|\d+(?:\.\d+)?))\s+(?<selection>.+)$/i,
    normalizeMarket: (market) => market.includes('Over/Under') ? market : 'Double Chance & Over/Under',
  },
  // ── Dynamic player / promo markets ────────────────────────────────────────
  {
    regex: /^(?<away>.+?)\s+(?<market>Bons Plans(?:\s*\.PT| PT))\s+(?<selection>.+)$/i,
  },
  {
    regex: /^(?<away>.+?)\s+(?<market>Monster Odds(?:\s*\.PT| PT))\s+(?<selection>.+)$/i,
  },
  {
    regex: /^(?<away>.+?)\s+(?<market>(?:Player )?(?:3 PTS Made|REB|AST|Points|PTS|STL|BLK)\s+Milestones)\s+(?<selection>.+)$/i,
  },
  {
    regex: /^(?<away>.+?)\s+(?<market>Both Halves Over [\d.]+ Goals)\s+(?<selection>.+)$/i,
  },
  {
    regex: /^(?<away>.+)\s+(?<market>to win set)\s+(?<selection>.+)$/i,
  },
  {
    regex: /^(?<away>.+?)\s+(?<market>Both players to win a set)\s+(?<selection>.+)$/i,
  },
  // ── Catch-all known market keywords (order: specific → generic) ───────────
  {
    regex: /^(?<away>.+?)\s+(?<market>Match Result and Goals|Match and Goals|Match Winner|Match Result|Both Teams to Score|Away Team Over\/Under|Home Team Over\/Under|Goal Total|Over\/Under|Draw no Bet|Double Chance|Correct Score|Set Handicap|Set Betting|Anytime Touchdown Scorer|Anytime Goalscorer|Next Goalscorer|First Goalscorer|Goalscorer \(Supersub\)|Goalscorer|Handicap|Bons Plans|Flashboost|Flash|Player to Score|Player 3|Player Points|Player Total|Player REB|Player AST|Either Team to Score|Result and Goals|First half Result|First Half Result|Result|Either|Will both|1st Half|Half Time|Full Time|Home Team|Away Team|Match|Total)\s+(?<selection>.+)$/i,
  },
];

/** Detects sport keyword from a text string. */
function detectSportFromText(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, value] of Object.entries(SPORT_MAP)) {
    if (lower.includes(key)) return value;
  }
  return '';
}

function normalizeBoostMarket(market: string): string {
  return market
    .replace(/\s+/g, ' ')
    .replace(/\bBoost\b/i, 'Boosted Odds')
    .replace(/Boosted Odds\s*(?:\.PT|PT)?/i, 'Boosted Odds .PT')
    .trim();
}

function splitAwayTeamAndMarket(awayAndRest: string): {
  awayTeam: string;
  market: string;
  selection: string;
  sport: string;
} | null {
  for (const pattern of MARKET_PATTERNS) {
    const match = awayAndRest.match(pattern.regex);
    if (!match?.groups) {
      continue;
    }

    const awayTeam = match.groups.away?.trim();
    const rawMarket = match.groups.market?.trim();
    const selection = match.groups.selection?.trim();
    if (!awayTeam || !rawMarket || !selection) {
      continue;
    }

    const market = pattern.normalizeMarket ? pattern.normalizeMarket(rawMarket) : rawMarket;
    const explicitSport = match.groups.sport?.trim();
    const sport = explicitSport
      ? detectSportFromText(explicitSport)
      : detectSportFromText(`${awayTeam} ${market} ${selection}`);

    return {
      awayTeam,
      market,
      selection,
      sport: sport || 'OTHER',
    };
  }

  return null;
}

/**
 * Parses the variable middle section: "MatchLabel  Bet  Choice"
 */
function parseMiddleSection(raw: string): {
  matchLabel: string;
  market: string;
  selection: string;
  sport: string;
} {
  const normalizedRaw = raw.replace(/\s{2,}/g, ' ').trim();
  const separatorIndex = normalizedRaw.indexOf(' - ');

  let homeTeam = 'Desconhecido';
  let awayTeam = 'Desconhecido';
  let market = 'Resultado Final';
  let selection = '';
  let sport = 'OTHER';

  if (separatorIndex >= 0) {
    homeTeam = normalizedRaw.slice(0, separatorIndex).trim();

    const awayAndRest = normalizedRaw.slice(separatorIndex + 3).trim();
    const parsed = splitAwayTeamAndMarket(awayAndRest);
    if (parsed) {
      awayTeam = parsed.awayTeam;
      market = parsed.market;
      selection = parsed.selection;
      sport = parsed.sport || detectSportFromText(`${homeTeam} ${parsed.awayTeam}`) || 'OTHER';
    } else {
      awayTeam = awayAndRest.trim();
      sport = detectSportFromText(`${homeTeam} ${awayTeam}`) || 'OTHER';
    }
  } else {
    const prefixedBoost = normalizedRaw.match(/^(?<sport>American Football|Football|Basketball|Tennis|Handball|Hockey|Rugby|Baseball)\s*(?:-\s*)?(?<market>Boosted Odds(?:\s*\.PT| PT)?|Boost(?:\s*\.PT| PT)?)\s+(?<selection>.+)$/i);
    if (prefixedBoost?.groups) {
      homeTeam = normalizedRaw;
      market = normalizeBoostMarket(prefixedBoost.groups.market);
      selection = prefixedBoost.groups.selection.trim();
      sport = detectSportFromText(prefixedBoost.groups.sport) || 'OTHER';
    } else {
      homeTeam = normalizedRaw;
      const rawSport = normalizedRaw.split(/\s+/).slice(0, 2).join(' ');
      sport = SPORT_PREFIX_PATTERN.test(rawSport)
        ? detectSportFromText(rawSport)
        : detectSportFromText(normalizedRaw) || 'OTHER';
    }
  }

  const matchLabel = `${homeTeam} - ${awayTeam}`;
  return { matchLabel, market: market || 'Resultado Final', selection: selection || homeTeam, sport };
}

function groupByReference(rows: RawBetRow[]): Map<string, RawBetRow[]> {
  const map = new Map<string, RawBetRow[]>();
  for (const row of rows) {
    const ref = row.reference;
    if (!map.has(ref)) map.set(ref, []);
    map.get(ref)!.push(row);
  }
  return map;
}

function buildBoletin(reference: string, rows: RawBetRow[]): ParsedBetclicBoletin {
  const first = rows[0];
  let parseError = false;
  let parseErrorReason: string | undefined;

  // Parse date
  let betDate: string;
  try {
    betDate = parseBetclicDate(first.date);
  } catch {
    betDate = new Date().toISOString();
    parseError = true;
    parseErrorReason = 'Data não reconhecida';
  }

  const stake = first.stake;
  if (stake <= 0) {
    parseError = true;
    parseErrorReason = (parseErrorReason ? parseErrorReason + '; ' : '') + 'Stake não reconhecida';
  }

  // PDF import uses grouped references. If every row in the same reference has a
  // Win Total value, the boletim won. Otherwise treat it as lost.
  const rowOdds = rows.map((row) => truncateDecimal(row.totalOdds, 2)).filter((value) => value >= 1);
  const uniqueRowOdds = Array.from(new Set(rowOdds.map((value) => value.toFixed(2))));
  const totalOdds = rowOdds.length === 0
    ? 1
    : uniqueRowOdds.length === 1
      ? rowOdds[0]
      : truncateDecimal(rowOdds.reduce((acc, value) => acc * value, 1), 2);

  const status = rows.every((row) => row.winTotal > 0) ? 'WON' : 'LOST';
  const winningReturn = truncateDecimal(
    Math.max(0, ...rows.map((row) => row.winTotal)),
    2,
  );

  // Build items — individual selection odds are NOT available in the PDF
  // for combo bets. The PDF only provides the combined total odds.
  const isSingleBet = rows.length === 1 || first.betType === 'SIM' || first.betType === 'LIV';
  const items: ParsedBetclicItem[] = rows.map((row) => {
    const teamParts = row.matchLabel.split(/\s+-\s+/);
    const homeTeam = teamParts[0]?.trim() || 'Desconhecido';
    const awayTeam = teamParts[1]?.trim() || 'Desconhecido';

    return {
      homeTeam,
      awayTeam,
      competition: 'Desconhecida',
      sport: row.sport || 'OTHER',
      market: row.market || 'Resultado Final',
      selection: row.selection || homeTeam,
      oddValue: isSingleBet ? (truncateDecimal(row.totalOdds, 2) || 1) : 0,
    };
  });

  // potentialReturn: use actual Win Total for winners, otherwise stake × odds.
  const potentialReturn = status === 'WON'
    ? winningReturn
    : truncateDecimal(stake * totalOdds, 2);

  const suspiciousGroup = rows.some((row) =>
    row.matchLabel.includes('Desconhecido')
    || row.market === 'Football'
    || row.selection.startsWith('Boosted Odds')
    || row.selection.startsWith('/'),
  );

  if (suspiciousGroup || parseError) {
    logger.debug('[BetclicPDF] Suspicious boletim build', {
      reference,
      rowCount: rows.length,
      rowWinTotals: rows.map((row) => row.winTotal),
      rowOdds: rows.map((row) => row.totalOdds),
      rowStakeValues: rows.map((row) => row.stake),
      resolvedStatus: status,
      resolvedStake: stake,
      resolvedTotalOdds: totalOdds,
      resolvedReturn: potentialReturn,
      itemPreview: rows.slice(0, 4).map((row) => ({
        matchLabel: row.matchLabel,
        market: row.market,
        selection: row.selection,
      })),
    });
  }

  return {
    reference,
    betDate,
    stake: Math.round(stake * 100) / 100,
    totalOdds,
    potentialReturn,
    status,
    items,
    parseError,
    parseErrorReason,
  };
}

/** Parses Betclic date formats (DD/MM/YYYY HH:mm or DD/MM/YYYY) into ISO 8601. */
function parseBetclicDate(raw: string): string {
  const cleaned = raw.trim();

  // DD/MM/YYYY HH:mm or DD-MM-YYYY HH:mm
  const full = cleaned.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s+(\d{2}):(\d{2})/);
  if (full) {
    const [, dd, mm, yyyy, hh, min] = full;
    return new Date(
      parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10),
      parseInt(hh, 10), parseInt(min, 10),
    ).toISOString();
  }

  // DD/MM/YYYY only
  const dateOnly = cleaned.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (dateOnly) {
    const [, dd, mm, yyyy] = dateOnly;
    return new Date(
      parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10),
      12, 0, 0,
    ).toISOString();
  }

  throw new Error('Formato de data não reconhecido');
}

/** Parses DD/MM/YYYY into a Date (returns null on failure). */
function parseDateStrSimple(raw: string): Date | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), 23, 59, 59);
}

