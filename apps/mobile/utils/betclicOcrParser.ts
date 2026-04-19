import { resolveTeamAlias, inferCompetition } from './teamAliases';

/**
 * Parser for Betclic bet slip text extracted via OCR.
 *
 * Betclic screenshot OCR quirk: the odds column on the right side of each
 * selection is read as a separate block, so all individual odds appear
 * grouped at the BOTTOM of the OCR text, in the same order as the
 * selections. Footer labels ("Cota", "Montante", "Ganhos") can also appear
 * interleaved with body text rather than at the bottom.
 *
 * Strategy:
 *  1. Extract numeric tail from bottom → individual odds, total cota, stake, winnings
 *  2. Extract header → bet type, expected selection count
 *  3. Extract overall status from keywords
 *  4. TWO-PASS extraction:
 *     Pass A) Pre-scan ALL lines for "Team A - Team B" match lines + adjacent dates
 *     Pass B) Walk lines in order to find (selection, market) pairs
 *     Match each pair to the nearest match context by line index
 *  5. Build items from matched data
 *
 * This two-pass approach handles any ordering of match line relative to
 * market/selection (before OR after), which varies by Betclic version.
 */

import type { ParsedBetclicBoletin, ParsedBetclicItem } from '../services/importService';

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const BET_TYPE_RE = /M[uú]ltipla\s*\(\s*(\d+)\s*\)|Simples/i;
const DATE_TIME_RE = /\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}/;
/** "Hoje 18:15", "Amanhã 21:00" — relative day + time shown inside match cards */
const RELATIVE_DATE_TIME_RE = /^(hoje|amanhã|amanha)\s+\d{1,2}:\d{2}$/i;
const SCORE_RE = /^\d+\s*-\s*\d+/;
const DECIMAL_RE = /^(\d{1,3}[,.]\d{1,2})$/;
const MONEY_RE = /^(\d+(?:[,.]\d+)?)\s*€$/;
const FOOTER_LABEL_RE = /^(Cota|Montante|Ganhos)$/i;

/** Scorer: "R. Freuler 26", "Rafa Silva 14'", "Xeka 32 (AG)", "1. Barbero 7 (P)" */
const SCORER_TICK_RE = /\d+\s*['+]/;
const SCORER_OG_RE = /\d+\s*\(AG\)/i;
const SCORER_PENALTY_RE = /\d+\s*\(P\)/i;
const SCORER_INITIAL_RE = /^[A-ZÀ-Ÿ]\.\s+\S+.*\s+\d{1,3}$/;

const NOISE_WORDS = new Set([
  'betclic', 'que pena!', 'boom', 'boom!', 'parabéns', 'parabens',
  'muitos anos', 'partilha',
]);

const KNOWN_MARKET_PATTERNS: RegExp[] = [
  /resultado\s*\(tempo/i,
  /resultado\s*duplo/i,
  /golos\s*-\s*(acima|abaixo)/i,
  /ambas\s+marcam/i,
  /handicap/i,
  /dupla\s+hip[oó]tese/i,
  /intervalo\/final/i,
  /marcador\s+de\s+gol/i,
  /cart[oõ]es/i,
  /cantos/i,
  /boost/i,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDecimal(v: string): number {
  return parseFloat(v.replace(',', '.'));
}

function isMarketLine(line: string): boolean {
  return KNOWN_MARKET_PATTERNS.some((p) => p.test(line));
}

function isNoise(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return true;
  if (NOISE_WORDS.has(lower)) return true;
  // Multi-word noise prefixes: catches promo names like "Muitos anos a virar frangos!"
  for (const noise of NOISE_WORDS) {
    if (noise.includes(' ') && lower.startsWith(noise)) return true;
  }
  // Betclic "boost" promo text fragments: BOOM, BOO, MBOO, BOOOM, etc.
  if (/^m?b[o0]{2,}m?!?$/i.test(lower)) return true;
  if (/^[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\s🎯🏹💣🔥⚽🟢🔴🟡⚪✓✗⏳🚫]+$/.test(lower)) return true;
  return false;
}

function isScorer(line: string): boolean {
  if (SCORER_TICK_RE.test(line)) return true;
  if (SCORER_OG_RE.test(line)) return true;
  if (SCORER_PENALTY_RE.test(line)) return true;
  if (SCORER_INITIAL_RE.test(line)) return true;
  return false;
}

type LineType =
  | 'HEADER' | 'STATUS' | 'MARKET' | 'DATE' | 'SCORE' | 'SCORER'
  | 'FOOTER_LABEL' | 'NOISE' | 'ODD' | 'MONEY' | 'CANDIDATE';

function classifyLine(line: string): LineType {
  const t = line.trim();
  if (!t) return 'NOISE';
  if (BET_TYPE_RE.test(t)) return 'HEADER';
  if (/^(perdida|ganhou|ganha|pendente)$/i.test(t)) return 'STATUS';
  if (FOOTER_LABEL_RE.test(t)) return 'FOOTER_LABEL';
  if (MONEY_RE.test(t)) return 'MONEY';
  if (DECIMAL_RE.test(t)) return 'ODD';
  if (isMarketLine(t)) return 'MARKET';
  if (DATE_TIME_RE.test(t)) return 'DATE';
  if (RELATIVE_DATE_TIME_RE.test(t)) return 'DATE';
  if (SCORE_RE.test(t)) return 'SCORE';
  if (isScorer(t)) return 'SCORER';
  if (isNoise(t)) return 'NOISE';
  return 'CANDIDATE';
}

// ─── Tail Extraction (bottom-up) ─────────────────────────────────────────────

interface TailData {
  individualOdds: number[];
  totalCota: number;
  stake: number;
  winnings: number;
}

function extractTail(lines: string[]): TailData {
  const moneyValues: number[] = [];
  const decimalValues: number[] = [];

  let i = lines.length - 1;
  while (i >= 0) {
    const line = lines[i]!.trim();

    const moneyMatch = line.match(MONEY_RE);
    if (moneyMatch) {
      moneyValues.unshift(parseDecimal(moneyMatch[1]!));
      i--;
      continue;
    }

    const decMatch = line.match(DECIMAL_RE);
    if (decMatch) {
      decimalValues.unshift(parseDecimal(decMatch[1]!));
      i--;
      continue;
    }

    // Status word can sit right above the numeric tail
    if (/^(perdida|ganhou|ganha|pendente)$/i.test(line)) {
      i--;
      continue;
    }

    // Scorer lines can appear between individual odds in Betclic OCR
    // (e.g., the odds column is read separately from the scorer column).
    // Skip them so we don't lose odds that sit above scorers.
    if (isScorer(line)) {
      i--;
      continue;
    }

    break; // hit a non-tail line
  }

  // Money values: [stake, winnings] from bottom
  let stake = 0;
  let winnings = 0;
  if (moneyValues.length >= 2) {
    stake = moneyValues[0]!;
    winnings = moneyValues[1]!;
  } else if (moneyValues.length === 1) {
    stake = moneyValues[0]!;
  }

  // Decimal values: [odd1, odd2, ..., oddN, totalCota]
  let totalCota = 0;
  let individualOdds: number[] = [];

  if (decimalValues.length >= 2) {
    const candidateCota = decimalValues[decimalValues.length - 1]!;
    const candidateOdds = decimalValues.slice(0, -1);
    const product = candidateOdds.reduce((a, b) => a * b, 1);

    // Verify: product of individual odds ≈ total cota (within 1.0 tolerance)
    if (Math.abs(product - candidateCota) < 1.0) {
      totalCota = candidateCota;
      individualOdds = candidateOdds;
    } else {
      // All values are individual odds, no separate cota
      individualOdds = decimalValues;
      totalCota = Math.round(product * 100) / 100;
    }
  } else if (decimalValues.length === 1) {
    individualOdds = [decimalValues[0]!];
    totalCota = decimalValues[0]!;
  }

  return { individualOdds, totalCota, stake, winnings };
}

// ─── Selection & Opponent Extraction ─────────────────────────────────────────

/** Matches "Team A - Team B" or "Team A — Team B" (rare in OCR but handle it) */
const MATCH_SEPARATOR_RE = /^(.+?)\s*[-–—]\s*(.+)$/;

interface SelectionPair {
  lineIndex: number;  // index of the selection (CANDIDATE) line
  selection: string;
  market: string;
}

interface SelectionBlock {
  selection: string;
  market: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: string;
}

/**
 * Find selection+market pairs from classified lines.
 * A selection is a CANDIDATE near a MARKET line within ±6 lines.
 * Continuation lines (starting with lowercase) are joined to the selection.
 */
function extractSelectionPairs(
  classified: Array<{ line: string; type: LineType }>,
  expectedItems: number,
): { pairs: SelectionPair[]; consumedLines: Set<number> } {
  const pairs: SelectionPair[] = [];
  const usedMarkets = new Set<number>();
  const consumedLines = new Set<number>();

  // The selection header section ends when match detail cards begin (first DATE line).
  // Market-less candidates (fallback selections) are only valid before this boundary —
  // after it, CANDIDATE lines are team names inside the detail cards, not selections.
  const firstDateLineIdx = classified.findIndex((c) => c.type === 'DATE');
  const headerEndIdx = firstDateLineIdx === -1 ? classified.length : firstDateLineIdx;

  for (let i = 0; i < classified.length && pairs.length < expectedItems * 2; i++) {
    const entry = classified[i]!;
    if (entry.type !== 'CANDIDATE') continue;
    if (consumedLines.has(i)) continue;

    // Skip if this looks like "Team A - Team B" (rare in Betclic OCR, but guard)
    const mParts = entry.line.match(MATCH_SEPARATOR_RE);
    if (mParts) {
      const rawA = mParts[1]!.trim();
      const rawB = mParts[2]!.trim();
      const bothTeamLike =
        rawA.length >= 2 && rawB.length >= 2 &&
        !/[/&]/.test(rawA) && !/[/&]/.test(rawB) &&
        /[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/i.test(rawA) && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/i.test(rawB);
      if (bothTeamLike) continue;
    }

    // Skip if this candidate matches the team root of an already-found selection
    // (it's a home-column duplicate, not a new selection)
    const candidateLower = entry.line.toLowerCase().trim();
    const isDupOfExisting = pairs.some((existing) => {
      const rootText = extractTeamFromSelection(existing.selection);
      return candidateLower === rootText.toLowerCase();
    });
    if (isDupOfExisting) continue;

    // Join continuation lines: if the next CANDIDATE starts with lowercase,
    // it's a phrase fragment split across OCR lines (e.g., "FC Porto vence ou
    // empata e Acima" + "de 1,5 golos (tempo reg.)")
    // Also join lines starting with Portuguese articles/prepositions (O, A, Os, As, E, De…)
    // because OCR can capitalise article fragments: "O de 1,5 golos (tempo reg.)"
    const ARTICLE_CONTINUATION_RE = /^(o|a|os|as|e|de|do|da|dos|das)\s/i;
    let selText = entry.line;
    let lastJoinedIdx = i;
    for (let k = i + 1; k < classified.length; k++) {
      const next = classified[k]!;
      if (next.type !== 'CANDIDATE') break;
      const startsLower = /^[a-záàâãéêíóôõúüç]/.test(next.line);
      const startsArticle = ARTICLE_CONTINUATION_RE.test(next.line);
      if (!startsLower && !startsArticle) break;
      // Strip leading single-letter OCR artefact: "O de 1,5 golos" → "de 1,5 golos"
      // A single uppercase letter before a space is never a real word in this context.
      let fragment = next.line;
      if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ] /.test(fragment)) {
        fragment = fragment.slice(2).trim();
      }
      if (fragment) selText += ' ' + fragment;
      consumedLines.add(k);
      lastJoinedIdx = k;
    }

    // Look for a MARKET within ±6 lines of the selection range
    const lo = Math.max(0, i - 6);
    const hi = Math.min(classified.length - 1, lastJoinedIdx + 6);
    let marketLine = '';
    let marketIdx = -1;
    let bestDist = Infinity;

    for (let j = lo; j <= hi; j++) {
      if (j >= i && j <= lastJoinedIdx) continue;
      if (classified[j]!.type !== 'MARKET') continue;
      if (usedMarkets.has(j)) continue;
      const dist = Math.min(Math.abs(j - i), Math.abs(j - lastJoinedIdx));
      if (dist < bestDist) {
        bestDist = dist;
        marketLine = classified[j]!.line;
        marketIdx = j;
      }
    }

    if (marketIdx === -1) {
      // Fallback: add as a market-less selection ONLY if we're still in the header
      // section (before the first DATE line). Candidates after the first DATE are
      // team names inside match detail cards, not selections.
      if (pairs.length < expectedItems && i < headerEndIdx) {
        pairs.push({ lineIndex: i, selection: selText, market: inferMarket(selText) });
      }
      continue;
    }

    usedMarkets.add(marketIdx);
    pairs.push({ lineIndex: i, selection: selText, market: marketLine });
  }

  // De-duplicate: keep first occurrence of each unique selection text
  const seen = new Set<string>();
  const filtered = pairs.filter((p) => {
    const key = p.selection.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { pairs: filtered, consumedLines };
}

/**
 * Check if a text loosely matches a selection's team root.
 * Returns the index of the matching selection, or -1.
 */
function matchesAnySelRoot(text: string, selRootsLower: string[]): number {
  const lower = text.toLowerCase().trim();
  for (let s = 0; s < selRootsLower.length; s++) {
    const root = selRootsLower[s]!;
    if (lower === root || lower.includes(root) || root.includes(lower)) {
      return s;
    }
  }
  return -1;
}

/**
 * Extract the team name from a selection text.
 * Handles compound selections and "X vence" patterns.
 */
function extractTeamFromSelection(selection: string): string {
  // "Team / Empate & ..." → Team
  if (selection.includes('/')) {
    return selection.split('/')[0]!.trim();
  }
  // "Team vence ..." or "Team vence" → Team
  const vencem = selection.match(/^(.+?)\s+vence\b/i);
  if (vencem) return vencem[1]!.trim();
  // "Team marca ..." → Team
  const marcam = selection.match(/^(.+?)\s+marca\b/i);
  if (marcam) return marcam[1]!.trim();
  // Plain team name
  return selection;
}

/**
 * Extract opponent team names from SCORE lines.
 * Handles patterns like "2-0 CD Nacional" or "CD Nacional 2-0".
 */
function extractTeamFromScore(scoreLine: string): string | null {
  // "2-0 CD Nacional" → "CD Nacional"
  let m = scoreLine.match(/^\d+\s*[-–]\s*\d+\s+(.+)$/);
  if (m) {
    const name = m[1]!.trim();
    if (name.length >= 2 && /[A-Za-záàâãéêíóôõúüç]/i.test(name)) return name;
  }
  // "CD Nacional 2-0" → "CD Nacional"
  m = scoreLine.match(/^(.+?)\s+\d+\s*[-–]\s*\d+$/);
  if (m) {
    const name = m[1]!.trim();
    if (name.length >= 2 && /[A-Za-záàâãéêíóôõúüç]/i.test(name)) return name;
  }
  return null;
}

/**
 * Main extraction.
 *
 * Betclic OCR reads the bet slip card layout top-to-bottom:
 *   1. Selection names + markets (header area)
 *   2. Match detail cards (dates, team names, scores, scorers)
 *
 * Algorithm:
 *   1. Find selections (CANDIDATE near MARKET, joining continuation lines)
 *   2. Identify "team dups" per selection — CANDIDATE lines matching a
 *      selection's team root, tracking which selection each dup belongs to
 *   3. Collect opponent candidates — remaining CANDIDATE lines + team names
 *      embedded in SCORE lines (e.g., "2-0 CD Nacional")
 *   4. Column-split pairing: use dup positions to determine which selections
 *      are HOME (dup in header area) vs AWAY (dup in detail area / no dup).
 *      Split opponents into left-column (for AWAY selections) and right-column
 *      (for HOME selections), then pair positionally within each group.
 *   5. Home/away directly from the column assignment
 */
function extractSelectionBlocks(
  lines: string[],
  expectedItems: number,
): SelectionBlock[] {
  const classified: Array<{ line: string; type: LineType }> = lines.map((l) => ({
    line: l.trim(),
    type: classifyLine(l),
  }));

  // Betclic screenshots often have a promotional banner (e.g. "Fazes isto com
  // uma perna às costas!") rendered ABOVE the bet header ("Simples"/"Múltipla").
  // Any CANDIDATE line that appears before the first HEADER is promo/banner
  // text, not a team name — reclassify it as NOISE so it doesn't pollute the
  // opponent-extraction step.
  const firstHeaderIdx = classified.findIndex((c) => c.type === 'HEADER');
  if (firstHeaderIdx > 0) {
    for (let i = 0; i < firstHeaderIdx; i++) {
      if (classified[i]!.type === 'CANDIDATE') {
        classified[i]!.type = 'NOISE';
      }
    }
  }

  // ── DEBUG ──────────────────────────────────────────────────────────────────
  if (__DEV__) {
    console.log('[PARSER DEBUG] ── Classified lines ──');
    classified.forEach((c, idx) => {
      console.log(`  [${String(idx).padStart(3, '0')}] ${c.type.padEnd(14)} | ${c.line}`);
    });
  }

  // Step 1: find selections (with continuation joining)
  const { pairs: selectionPairs, consumedLines } = extractSelectionPairs(classified, expectedItems);
  const usedPairs = selectionPairs.slice(0, expectedItems);

  // Selection team roots (extracted from compound/vence patterns)
  const selRoots = usedPairs.map((p) => extractTeamFromSelection(p.selection));
  const selRootsLower = selRoots.map((r) => r.toLowerCase());
  const excludedLines = new Set([
    ...usedPairs.map((p) => p.lineIndex),
    ...consumedLines,
  ]);

  if (__DEV__) {
    console.log('[PARSER DEBUG] ── Selections ──');
    usedPairs.forEach((p, i) => {
      console.log(`  [${i}] line=${p.lineIndex} sel="${p.selection}" root="${selRoots[i]}" market="${p.market}"`);
    });
  }

  // Step 2: find team dups per selection (CANDIDATE lines matching a selection root)
  const dupsBySelIndex = new Map<number, number[]>();
  const allDupLines = new Set<number>();
  for (let i = 0; i < classified.length; i++) {
    if (excludedLines.has(i)) continue;
    if (classified[i]!.type !== 'CANDIDATE') continue;
    // Strip trailing score suffix before matching (e.g. "Sporting CP 1-2" → "Sporting CP")
    const lineStripped = classified[i]!.line.replace(/\s+\d{1,2}\s*-\s*\d{1,2}$/, '').trim();
    const selIdx = matchesAnySelRoot(lineStripped, selRootsLower);
    if (selIdx === -1) continue;
    if (!dupsBySelIndex.has(selIdx)) dupsBySelIndex.set(selIdx, []);
    dupsBySelIndex.get(selIdx)!.push(i);
    allDupLines.add(i);
  }

  if (__DEV__) {
    console.log('[PARSER DEBUG] ── Team dups ──');
    [...allDupLines].sort((a, b) => a - b).forEach((lineIdx) => {
      console.log(`  line=${lineIdx} "${classified[lineIdx]?.line}"`);
    });
  }

  // Step 3: collect opponents (non-selection, non-dup, non-consumed CANDIDATES + score-embedded teams)
  const opponents: Array<{ lineIndex: number; name: string }> = [];
  for (let i = 0; i < classified.length; i++) {
    const entry = classified[i]!;
    let teamName = '';

    if (entry.type === 'CANDIDATE') {
      if (excludedLines.has(i)) continue;
      if (allDupLines.has(i)) continue;
      // Strip trailing score suffix: "Sporting CP 1-2" → "Sporting CP"
      // (Betclic renders finished match team names with score on the same OCR line)
      const stripped = entry.line.replace(/\s+\d{1,2}\s*-\s*\d{1,2}$/, '').trim();
      if (matchesAnySelRoot(stripped, selRootsLower) !== -1) continue;
      // Skip candidates that are market/selection phrase fragments, not team names.
      // OCR sometimes splits compound selections (e.g. "FC Porto vence ou empata e Acima
      // de 1,5 golos (tempo reg.)") and the tail fragment ends up here as a CANDIDATE
      // — sometimes with OCR artefacts so it doesn't match the full selection text.
      const MARKET_PHRASE_RE =
        /\b(acima|abaixo|marcam|empate|empata|golos|pontos|over|under|vence|resultado|handicap)\b/i;
      if (MARKET_PHRASE_RE.test(stripped) || /tempo\s*reg/i.test(stripped) || isMarketLine(stripped)) continue;
      teamName = stripped;
    } else if (entry.type === 'SCORE') {
      const extracted = extractTeamFromScore(entry.line);
      if (extracted && matchesAnySelRoot(extracted, selRootsLower) === -1) {
        teamName = extracted;
      }
    }

    if (!teamName) continue;

    // De-dup: keep LAST occurrence of each name
    const nameLower = teamName.toLowerCase();
    const existingIdx = opponents.findIndex((o) => o.name.toLowerCase() === nameLower);
    if (existingIdx !== -1) opponents.splice(existingIdx, 1);
    opponents.push({ lineIndex: i, name: teamName });
  }
  opponents.sort((a, b) => a.lineIndex - b.lineIndex);

  if (__DEV__) {
    console.log('[PARSER DEBUG] ── Opponents (cleaned, sorted) ──');
    opponents.forEach((o, i) => {
      console.log(`  [${i}] line=${o.lineIndex} "${o.name}"`);
    });
  }

  // Step 4: Match dates (DD/MM/YYYY, 4-digit year only — excludes submission timestamp)
  const FOUR_DIGIT_DATE_RE = /\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/;
  const matchDateLines: Array<{ lineIndex: number; iso: string }> = [];
  for (let i = 0; i < classified.length; i++) {
    if (classified[i]!.type !== 'DATE') continue;
    if (!FOUR_DIGIT_DATE_RE.test(classified[i]!.line)) continue;
    matchDateLines.push({ lineIndex: i, iso: parseBetclicDate(classified[i]!.line) });
  }

  if (__DEV__) {
    console.log('[PARSER DEBUG] ── Match dates (4-digit year, sorted) ──');
    matchDateLines.forEach((d, i) => {
      console.log(`  [${i}] line=${d.lineIndex} "${classified[d.lineIndex]?.line}" → ${d.iso}`);
    });
  }

  // Step 5: Column-split pairing + home/away determination.
  //
  // Betclic OCR reads LEFT columns before RIGHT columns across match detail
  // cards. This means:
  //   - Opponents that are HOME teams (left column, when our selection is AWAY)
  //     appear FIRST in the sorted opponents list.
  //   - Opponents that are AWAY teams (right column, when our selection is HOME)
  //     appear AFTER.
  //
  // To determine which selections are home vs away, we use dup positions:
  //   - A dup appearing BEFORE the first opponent → header area → selection is HOME
  //   - A dup appearing AT or AFTER the first opponent → detail area right column
  //     → selection is AWAY
  //   - No separate dup at all → default AWAY (a HOME team always produces a
  //     left-column dup in the header area)
  //
  // Once we know the home/away split, we partition the opponents list:
  //   opponents[0..awayCount-1]  → left-column → paired with AWAY selections (in order)
  //   opponents[awayCount..N-1]  → right-column → paired with HOME selections (in order)

  const firstOppLine = opponents.length > 0 ? opponents[0]!.lineIndex : Infinity;

  const homeFlags: boolean[] = usedPairs.map((_pair, selIdx) => {
    const dups = dupsBySelIndex.get(selIdx);
    if (!dups || dups.length === 0) return true; // no separate dup → HOME (selection itself is the left-column team name)
    // If any dup appears at or after the first opponent, it's from the detail
    // area right column → selection is AWAY
    const hasLateDup = dups.some((d) => d >= firstOppLine);
    return !hasLateDup; // HOME if all dups are before the opponents
  });

  const awaySelIndices: number[] = [];
  const homeSelIndices: number[] = [];
  homeFlags.forEach((isHome, i) => {
    (isHome ? homeSelIndices : awaySelIndices).push(i);
  });

  // Split opponents into left (for away selections) and right (for home selections)
  const leftOpps = opponents.slice(0, awaySelIndices.length);
  const rightOpps = opponents.slice(awaySelIndices.length);

  // Build paired opponents array indexed by selection order
  const pairedOpponents = new Array<string>(usedPairs.length).fill('');
  const pairedIsHome = new Array<boolean>(usedPairs.length).fill(true);
  awaySelIndices.forEach((selIdx, i) => {
    pairedOpponents[selIdx] = leftOpps[i]?.name ?? '';
    pairedIsHome[selIdx] = false;
  });
  homeSelIndices.forEach((selIdx, i) => {
    pairedOpponents[selIdx] = rightOpps[i]?.name ?? '';
    pairedIsHome[selIdx] = true;
  });

  if (__DEV__) {
    console.log('[PARSER DEBUG] ── Column-split pairing ──');
    usedPairs.forEach((_p, i) => {
      const root = selRoots[i];
      const isHome = pairedIsHome[i];
      const opp = pairedOpponents[i];
      console.log(`  [${i}] "${root}" ${isHome ? '(home)' : '(away)'} → opp "${opp}"`);
    });
  }

  return usedPairs.map((pair, selIdx): SelectionBlock => {
    const opponent = pairedOpponents[selIdx] ?? '';
    const isHome = pairedIsHome[selIdx] ?? true;

    // Assign eventDate positionally: Nth match → Nth 4-digit-year DATE line.
    // Fall back to nearest 4-digit DATE if count doesn't match.
    let eventDate = '';
    if (matchDateLines[selIdx]) {
      eventDate = matchDateLines[selIdx]!.iso;
    } else if (matchDateLines.length > 0) {
      const anchorLine = pair.lineIndex;
      let bestDist = Infinity;
      for (const dl of matchDateLines) {
        const dist = Math.abs(dl.lineIndex - anchorLine);
        if (dist < bestDist) { bestDist = dist; eventDate = dl.iso; }
      }
    }

    const selTeam = extractTeamFromSelection(pair.selection);

    // For non-team selections (BTTS, Over/Under, etc.) the selection text is a
    // market phrase, not a team name. Both home and away must come from the
    // opponents list instead of from the selection root.
    const selTeamIsPhrase =
      /\b(acima|abaixo|marcam|empate|golos|pontos|over|under)\b/i.test(selTeam) ||
      selTeam.split(/\s+/).length > 3;

    let homeTeamRaw: string;
    let awayTeamRaw: string;
    if (selTeamIsPhrase) {
      homeTeamRaw = opponents[0]?.name ?? selTeam;
      awayTeamRaw = opponents[1]?.name ?? opponent;
    } else if (isHome) {
      homeTeamRaw = selTeam;
      awayTeamRaw = opponent;
    } else {
      homeTeamRaw = opponent;
      awayTeamRaw = selTeam;
    }

    return {
      selection: pair.selection,
      market: pair.market,
      homeTeam: resolveTeamAlias(homeTeamRaw),
      awayTeam: resolveTeamAlias(awayTeamRaw),
      eventDate,
    };
  });
}

// ─── Selection Text Derivation ───────────────────────────────────────────────

function deriveSelectionText(selection: string, market: string): string {
  if (selection.includes('/')) {
    // Compound: "Bolonha / Empate & Abaixo de 4,5" → keep as-is
    return selection;
  }
  // Boost markets: selection already contains the full description
  if (/boost/i.test(market)) {
    return selection;
  }
  if (/resultado\s*\(tempo/i.test(market)) {
    return `${selection} vence`;
  }
  return selection;
}

function inferMarket(selection: string): string {
  const lower = selection.toLowerCase();
  if (
    lower.includes('empate') ||
    lower.includes('acima') ||
    lower.includes('abaixo') ||
    lower.includes('golos')
  ) {
    return 'Resultado duplo/Golos - acima/abaixo';
  }
  return 'Resultado (Tempo Regulamentar)';
}

// ─── Date Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a Betclic date string "DD/MM/YYYY HH:MM" into an ISO 8601 string.
 * Returns current time as fallback.
 */
function parseBetclicDate(str: string): string {
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, day, month, yearRaw, hour, min] = m;
  const year = yearRaw!.length === 2 ? `20${yearRaw}` : yearRaw!;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}T${hour!.padStart(2, '0')}:${min!}:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ─── Sport Inference ─────────────────────────────────────────────────────────

/**
 * Infer the sport from market text + selection text.
 * Falls back to 'FOOTBALL' since Betclic PT is heavily football-oriented.
 */
function inferSport(market: string, selection: string, allLines: string[]): string {
  const combined = `${market} ${selection}`.toLowerCase();

  // Basketball hints
  if (
    /handicap\s*\(pontos\)/i.test(combined) ||
    /total\s*de\s*pontos/i.test(combined) ||
    /\bquarto\b/i.test(combined) ||          // "1º Quarto" (quarter)
    /\bnba\b/i.test(combined)
  ) return 'BASKETBALL';

  // Tennis hints
  if (
    /\bset\b/i.test(combined) ||
    /\bgame\b/i.test(combined) ||
    /\btie-?break\b/i.test(combined) ||
    /vencedor\s+do\s+encontro/i.test(combined) ||
    /total\s*de\s*sets/i.test(combined) ||
    /total\s*de\s*games/i.test(combined)
  ) return 'TENNIS';

  // Handball hints
  if (
    /\bhandball\b/i.test(combined) ||
    /\bandebol\b/i.test(combined)
  ) return 'HANDBALL';

  // Hockey hints
  if (
    /\bhóquei\b|\bhoquei\b|\bhockey\b/i.test(combined) ||
    /\bperíodo\b/i.test(combined)          // "1º Período" (period)
  ) return 'HOCKEY';

  // Volleyball hints
  if (
    /\bvolei\b|\bvoleibol\b|\bvolleyball\b/i.test(combined) ||
    /total\s*de\s*sets/i.test(combined)
  ) return 'VOLLEYBALL';

  // Rugby hints
  if (
    /\brugby\b/i.test(combined) ||
    /\bensaio\b/i.test(combined)           // "try" in Portuguese
  ) return 'RUGBY';

  // American football hints
  if (
    /\bnfl\b/i.test(combined) ||
    /\btouchdown\b/i.test(combined)
  ) return 'AMERICAN_FOOTBALL';

  // Baseball hints
  if (
    /\bmlb\b/i.test(combined) ||
    /\binning\b/i.test(combined) ||
    /\bbasebol\b|\bbaseball\b/i.test(combined)
  ) return 'BASEBALL';

  // Football is the default — also match explicit football markets
  return 'FOOTBALL';
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export interface BetclicOCRResult {
  boletins: ParsedBetclicBoletin[];
  totalFound: number;
  errorCount: number;
}

export function parseBetclicOCR(ocrText: string): BetclicOCRResult {
  const lines = ocrText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const boletin = parseSingleSlip(lines);
  return {
    boletins: boletin ? [boletin] : [],
    totalFound: boletin ? 1 : 0,
    errorCount: boletin?.parseError ? 1 : 0,
  };
}

function parseSingleSlip(lines: string[]): ParsedBetclicBoletin | null {
  // === Phase 1: Header — bet type + expected count ===
  let expectedItems = 1;
  for (const line of lines.slice(0, 10)) {
    const m = line.match(BET_TYPE_RE);
    if (m?.[1]) {
      expectedItems = parseInt(m[1], 10);
      break;
    }
  }

  // === Phase 2: Overall status ===
  //
  // Betclic status badges:
  //   WON     → "Ganhos"  (green badge — same word as the footer earnings label)
  //   LOST    → "Perdida" (red badge) — also indicated by "Que pena!" noise
  //   PENDING → "Pendente"
  //
  // Because "Ganhos" appears on ALL bets as a footer label, we detect WON
  // negatively: if no LOST indicator and no PENDING badge is found, it's WON.
  const linesLower = lines.map((l) => l.trim().toLowerCase());
  const hasLost    = linesLower.some((t) => /perdida|que pena/.test(t));
  const hasWon     = linesLower.some((t) => /\b(ganhou|ganha)\b/.test(t) && t !== 'ganhos');
  const hasPending = linesLower.some((t) => /\bpendente\b/.test(t));

  let status: string;
  if (hasLost) {
    status = 'LOST';
  } else if (hasWon) {
    status = 'WON';
  } else if (hasPending) {
    status = 'PENDING';
  } else {
    // No explicit status word found — Betclic WON bets only show "Ganhos" badge
    // (indistinguishable from footer label), so default to WON for completed bets.
    // A truly ambiguous slip (no indicators at all) is safer treated as WON than LOST.
    status = 'WON';
  }

  // === Phase 2b: Bet date — first DATE line in the OCR ===
  let betDate = new Date().toISOString();
  for (const line of lines) {
    if (DATE_TIME_RE.test(line.trim())) {
      betDate = parseBetclicDate(line.trim());
      break;
    }
  }

  // === Phase 3: Tail data (bottom-up) ===
  const tail = extractTail(lines);

  // Use tail odds count as a better hint when header didn't parse
  if (tail.individualOdds.length > 1 && expectedItems === 1) {
    expectedItems = tail.individualOdds.length;
  }

  // === Phase 4: Selection blocks (selection + market + match teams) ===
  const blocks = extractSelectionBlocks(lines, expectedItems);

  // === Phase 5: Build items ===
  const itemCount = Math.max(blocks.length, tail.individualOdds.length);
  const items: ParsedBetclicItem[] = [];

  for (let i = 0; i < itemCount; i++) {
    const block = blocks[i];
    const selName = block?.selection ?? `Seleção ${i + 1}`;
    const market = block?.market ?? inferMarket(selName);
    const odd = tail.individualOdds[i] ?? 0;

    const selectionText = deriveSelectionText(selName, market);

    const homeTeam = block?.homeTeam ?? resolveTeamAlias(extractTeamFromSelection(selName));
    const awayTeam = block?.awayTeam || '';
    const eventDate = block?.eventDate || '';

    const sport = inferSport(market, selName, lines);

    items.push({
      homeTeam,
      awayTeam,
      competition: inferCompetition(homeTeam, awayTeam),
      sport,
      market: market.replace(/\s+/g, ' ').trim(),
      selection: selectionText,
      oddValue: Math.round(odd * 100) / 100,
      eventDate: eventDate || undefined,
    });
  }

  // === Phase 6: Validation ===
  let parseError = false;
  let parseErrorReason: string | undefined;

  if (items.length === 0) {
    parseError = true;
    parseErrorReason = 'Não foi possível extrair seleções do texto OCR';
  }
  if (tail.stake === 0) {
    parseError = true;
    parseErrorReason =
      (parseErrorReason ? parseErrorReason + '; ' : '') + 'Stake não encontrada';
  }
  if (items.length > 0 && items.length !== expectedItems) {
    // Only flag as error if significantly off — minor mismatches from OCR are normal
    if (Math.abs(items.length - expectedItems) > 1) {
      parseError = true;
      parseErrorReason =
        (parseErrorReason ? parseErrorReason + '; ' : '') +
        `Esperadas ${expectedItems} seleções, encontradas ${items.length}`;
    }
  }

  const totalOdds =
    tail.totalCota ||
    (items.length > 0
      ? Math.round(items.reduce((a, item) => a * item.oddValue, 1) * 100) / 100
      : 0);

  const potentialReturn = tail.stake * totalOdds;

  return {
    reference: `ocr-${Date.now()}`,
    betDate,
    stake: tail.stake,
    totalOdds: Math.round(totalOdds * 100) / 100,
    potentialReturn: Math.round(potentialReturn * 100) / 100,
    status,
    items,
    parseError,
    parseErrorReason,
  };
}
