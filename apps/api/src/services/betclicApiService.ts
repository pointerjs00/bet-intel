/**
 * Betclic API Service — fetches bet history from the authenticated Betclic API.
 *
 * Uses the private `betting.begmedia.pt` endpoint which returns detailed bet data
 * including individual selection odds, proper market labels, competition names,
 * sport codes, and per-selection results.
 *
 * Requires the user's Betclic session token (extracted from browser cookies/headers).
 */

import { logger } from '../utils/logger';
import type { ParsedBetclicBoletin, ParsedBetclicItem, BetclicPdfResult } from './betclicPdfParser';

// ─── Betclic API response types ──────────────────────────────────────────────

interface BetclicApiBetSelection {
  id: number;
  odds: number;
  selection_label: string;
  market_label: string;
  match_label: string;
  match_id: number;
  match_status: string;
  match_date_utc: string;
  sport_label: string;
  sport_id: number;
  sport_code: string;
  competition_label: string;
  competition_id: number;
  competition_season_label: string;
  result: string;
  market_id: number;
  contestant1: string;
  contestant2: string;
  selection_type: string;
  is_boosted_odd: boolean;
  is_outright: boolean;
  has_live_streaming: boolean;
  is_mbb_eligible: boolean;
  contestants: unknown[];
}

interface BetclicApiWinningDetail {
  type: string;
  amount: number;
  unit: string;
}

interface BetclicApiBet {
  id: number;
  bet_reference: string;
  bet_type: string;
  placed_date_utc: string;
  result: string;
  odds: number;
  stake: number;
  is_freebet: boolean;
  bet_selections: BetclicApiBetSelection[];
  is_awaiting_payment: boolean;
  winning_details: BetclicApiWinningDetail[];
  closed_date_utc: string;
  winnings: number;
  mbb_amount?: number;
  mbb_freebet_amount?: number;
  metagame?: unknown;
}

interface BetclicApiResponse {
  bets: BetclicApiBet[];
}

// ─── Sport code mapping ──────────────────────────────────────────────────────

const SPORT_CODE_MAP: Record<string, string> = {
  football: 'FOOTBALL',
  basketball: 'BASKETBALL',
  tennis: 'TENNIS',
  handball: 'HANDBALL',
  volleyball: 'VOLLEYBALL',
  ice_hockey: 'HOCKEY',
  hockey: 'HOCKEY',
  rugby: 'RUGBY',
  american_football: 'AMERICAN_FOOTBALL',
  baseball: 'BASEBALL',
};

function mapSportCode(code: string): string {
  return SPORT_CODE_MAP[code.toLowerCase()] ?? 'OTHER';
}

// ─── Result mapping ──────────────────────────────────────────────────────────

function mapBetResult(result: string): string {
  switch (result) {
    case 'Win':
      return 'WON';
    case 'Lose':
      return 'LOST';
    case 'Void':
    case 'Cancelled':
      return 'VOID';
    default:
      return 'PENDING';
  }
}

// ─── API fetch ───────────────────────────────────────────────────────────────

const BETCLIC_API_BASE = 'https://betting.begmedia.pt/api/v2/me/bets';
// Betclic's API silently caps responses when limit is large — use 10 to match browser behaviour
const PAGE_SIZE = 10;

interface FetchOptions {
  /** The user's Betclic auth token or cookie string. */
  authToken: string;
  /** Maximum number of bets to fetch. Defaults to all available. */
  maxBets?: number;
  /** Fetch only 'ended' bets (default) or 'opened'. */
  status?: 'ended' | 'opened';
}

async function fetchBetclicBetsPage(
  offset: number,
  limit: number,
  status: string,
  authToken: string,
): Promise<BetclicApiResponse> {
  const cacheBurst = Date.now();
  const url = `${BETCLIC_API_BASE}/${status}?cache-burst=${cacheBurst}&limit=${limit}&offset=${offset}&embed=Metagame`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Betclic API returned ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  return response.json() as Promise<BetclicApiResponse>;
}

// ─── Transform ───────────────────────────────────────────────────────────────

function transformBet(bet: BetclicApiBet): ParsedBetclicBoletin {
  const items: ParsedBetclicItem[] = bet.bet_selections.map((sel) => ({
    homeTeam: sel.contestant1 || sel.match_label.split(' - ')[0]?.trim() || 'Desconhecido',
    awayTeam: sel.contestant2 || sel.match_label.split(' - ')[1]?.trim() || 'Desconhecido',
    competition: sel.competition_label || 'Desconhecida',
    sport: mapSportCode(sel.sport_code),
    market: sel.market_label,
    selection: sel.selection_label,
    oddValue: sel.odds,
  }));

  const totalOdds = bet.odds;
  const potentialReturn = Math.round(bet.stake * totalOdds * 100) / 100;

  // For won bets, use actual winnings from winning_details
  const netWin = bet.winning_details.find((w) => w.type === 'TOTAL');
  const actualReturn = netWin ? netWin.amount : undefined;

  return {
    reference: bet.bet_reference,
    betDate: bet.placed_date_utc,
    stake: bet.stake,
    totalOdds,
    potentialReturn: actualReturn ?? potentialReturn,
    status: mapBetResult(bet.result),
    items,
    parseError: false,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetches all ended bets from the Betclic API using the user's session token.
 * Returns data in the same format as `parseBetclicPdf()` so the existing
 * import flow (review UI + bulk import) works unchanged.
 */
export async function fetchBetclicBets(options: FetchOptions): Promise<BetclicPdfResult> {
  const { authToken, maxBets, status = 'ended' } = options;

  const allBets: BetclicApiBet[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const limit = maxBets
      ? Math.min(PAGE_SIZE, maxBets - allBets.length)
      : PAGE_SIZE;

    if (limit <= 0) break;

    logger.info('[BetclicAPI] Fetching page', { offset, limit, status });
    const page = await fetchBetclicBetsPage(offset, limit, status, authToken);

    if (!page.bets || page.bets.length === 0) {
      hasMore = false;
      break;
    }

    allBets.push(...page.bets);
    offset += page.bets.length;

    // If we got fewer than requested, no more pages
    if (page.bets.length < limit) {
      hasMore = false;
    }

    // Safety cap to avoid runaway pagination
    if (allBets.length >= 10_000) {
      logger.warn('[BetclicAPI] Hit safety cap of 10,000 bets');
      hasMore = false;
    }
  }

  logger.info('[BetclicAPI] Fetched total bets', { count: allBets.length });

  const boletins = allBets.map(transformBet);
  const errorCount = boletins.filter((b) => b.parseError).length;

  return {
    boletins,
    totalFound: boletins.length,
    errorCount,
  };
}
