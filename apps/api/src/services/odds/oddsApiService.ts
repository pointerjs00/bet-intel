/**
 * The Odds API integration — replaces Puppeteer scrapers.
 *
 * Fetches bookmaker odds from https://the-odds-api.com (v4) for a configurable
 * set of sports and bookmakers, then persists them using exactly the same
 * persistScrapedEventsForSite() pipeline as the old scrapers.
 *
 * Free tier budget: 500 requests / month (~16/day).
 * Default schedule (from scrapeJobs.ts): every 6 hours = 4 calls/day per sport.
 * With 4 sports configured: 16 calls/day — exactly fits the free tier.
 *
 * Scale-up: set more sports in ODDS_API_SPORTS or upgrade to a paid plan and
 * lower ODDS_POLL_INTERVAL_MINUTES. No other changes needed.
 *
 * Configuration env vars:
 *   ODDS_API_KEY              — required; get free key at the-odds-api.com
 *   ODDS_API_SPORTS           — comma-separated sport keys (defaults below)
 *   ODDS_API_BOOKMAKERS       — comma-separated bookmaker keys (defaults below)
 *   ODDS_API_MARKETS          — comma-separated market keys (defaults: h2h,totals,btts)
 *   ODDS_API_MIN_REQUESTS_REMAINING — stop fetching when quota drops below this (default: 20)
 */

import https from 'https';
import { Sport } from '@betintel/shared';
import { logger } from '../../utils/logger';
import { persistScrapedEventsForSite } from '../scraper/scraperRegistry';
import type { ScrapedEvent, ScrapedMarket } from '../scraper/types';

// ─── Default configuration ───────────────────────────────────────────────────

/**
 * Sport keys to poll by default.
 * Keep this list short on the free tier (each entry = 1 API request per poll cycle).
 * Add more when upgrading to a paid plan.
 */
const DEFAULT_SPORTS = [
  'soccer_portugal_primeira_liga',
  'soccer_uefa_champs_league',
  'soccer_spain_la_liga',
  'soccer_england_premier_league',
];

/** Bookmaker keys to request. The Odds API returns only these sites' odds. */
const DEFAULT_BOOKMAKERS = [
  'betclic',
  'bet365',
  'unibet',
  'bwin',
  'williamhill',
];

/** Market keys to request in each API call. */
const DEFAULT_MARKETS = ['h2h', 'totals', 'btts'];

// ─── The Odds API v4 response types ─────────────────────────────────────────

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsApiMarket {
  key: string;
  last_update: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsApiBookmaker[];
}

// ─── Sport key → Sport enum mapping ─────────────────────────────────────────

function mapSportKey(sportKey: string): Sport {
  if (sportKey.startsWith('soccer')) return Sport.FOOTBALL;
  if (sportKey.startsWith('basketball')) return Sport.BASKETBALL;
  if (sportKey.startsWith('tennis')) return Sport.TENNIS;
  if (sportKey.startsWith('americanfootball')) return Sport.AMERICAN_FOOTBALL;
  if (sportKey.startsWith('baseball')) return Sport.BASEBALL;
  if (sportKey.startsWith('icehockey')) return Sport.HOCKEY;
  if (sportKey.startsWith('rugby')) return Sport.RUGBY;
  if (sportKey.startsWith('volleyball')) return Sport.VOLLEYBALL;
  return Sport.OTHER;
}

/**
 * Maps a sport key like "soccer_portugal_primeira_liga" to a human-readable
 * league name like "Liga Portugal Primeira Liga".
 */
function mapSportKeyToLeague(sportKey: string): string {
  const leagueNames: Record<string, string> = {
    soccer_portugal_primeira_liga: 'Liga Portugal Primeira Liga',
    soccer_portugal_segunda_liga: 'Liga Portugal Segunda Liga',
    soccer_uefa_champs_league: 'UEFA Champions League',
    soccer_uefa_europa_league: 'UEFA Europa League',
    soccer_spain_la_liga: 'La Liga',
    soccer_england_premier_league: 'Premier League',
    soccer_germany_bundesliga: 'Bundesliga',
    soccer_france_ligue_one: 'Ligue 1',
    soccer_italy_serie_a: 'Serie A',
    soccer_netherlands_eredivisie: 'Eredivisie',
    soccer_brazil_campeonato: 'Campeonato Brasileiro',
    soccer_argentina_primera_divison: 'Argentine Primera División',
  };
  return leagueNames[sportKey] ?? sportKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Market mapping ──────────────────────────────────────────────────────────

/**
 * Converts a single The Odds API market + its outcomes into our ScrapedMarket format.
 *
 * h2h     → market "1X2", selections "1" / "X" / "2" (matched by team name)
 * totals  → market "Over/Under {point}", selections "Over" / "Under"
 * btts    → market "BTTS", selections "Sim" / "Não"
 */
function mapMarket(
  apiMarket: OddsApiMarket,
  homeTeam: string,
  awayTeam: string,
): ScrapedMarket | null {
  switch (apiMarket.key) {
    case 'h2h': {
      const selections = apiMarket.outcomes
        .map((o) => {
          let selection: string;
          if (o.name === homeTeam) selection = '1';
          else if (o.name === awayTeam) selection = '2';
          else if (o.name === 'Draw') selection = 'X';
          else return null;
          return { selection, value: o.price };
        })
        .filter((s): s is { selection: string; value: number } => s !== null);

      if (selections.length === 0) return null;
      return { market: '1X2', selections };
    }

    case 'totals': {
      // Group outcomes by their point value — typically one pair (Over/Under 2.5)
      // but could include multiple lines (1.5, 2.5, 3.5)
      const byPoint = new Map<number, ScrapedMarket>();
      for (const o of apiMarket.outcomes) {
        const point = o.point ?? 2.5;
        const marketName = `Over/Under ${point}`;
        if (!byPoint.has(point)) {
          byPoint.set(point, { market: marketName, selections: [] });
        }
        const sel = o.name === 'Over' ? 'Over' : o.name === 'Under' ? 'Under' : null;
        if (sel) {
          byPoint.get(point)!.selections.push({ selection: sel, value: o.price });
        }
      }
      // Return the 2.5 line preferentially, else the first line available
      return byPoint.get(2.5) ?? byPoint.values().next().value ?? null;
    }

    case 'btts': {
      const selections = apiMarket.outcomes.map((o) => ({
        selection: o.name === 'Yes' ? 'Sim' : 'Não',
        value: o.price,
      }));
      if (selections.length === 0) return null;
      return { market: 'BTTS', selections };
    }

    default:
      return null;
  }
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

interface FetchResult {
  body: OddsApiEvent[];
  requestsRemaining: number | null;
  requestsUsed: number | null;
}

function oddsApiGet(path: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.the-odds-api.com',
        path,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 20_000,
      },
      (res) => {
        const requestsRemaining = res.headers['x-requests-remaining']
          ? parseInt(res.headers['x-requests-remaining'] as string, 10)
          : null;
        const requestsUsed = res.headers['x-requests-used']
          ? parseInt(res.headers['x-requests-used'] as string, 10)
          : null;

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as OddsApiEvent[];
            resolve({ body, requestsRemaining, requestsUsed });
          } catch (e) {
            reject(new Error(`The Odds API: JSON parse failed: ${String(e)}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('The Odds API: request timed out'));
    });

    req.end();
  });
}

// ─── Main service function ────────────────────────────────────────────────────

/**
 * Fetches odds for all configured sports from The Odds API, then persists
 * the results to the database grouped by bookmaker — exactly as the old
 * Puppeteer scrapers did.
 *
 * Called by the scrape job queue. Returns the total number of events persisted.
 */
export async function fetchAndPersistOdds(): Promise<number> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) {
    logger.warn('ODDS_API_KEY is not set — skipping odds fetch');
    return 0;
  }

  const sports = (process.env.ODDS_API_SPORTS ?? DEFAULT_SPORTS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const bookmakers = (process.env.ODDS_API_BOOKMAKERS ?? DEFAULT_BOOKMAKERS.join(',')).split(',').map((b) => b.trim()).filter(Boolean);
  const markets = (process.env.ODDS_API_MARKETS ?? DEFAULT_MARKETS.join(',')).split(',').map((m) => m.trim()).filter(Boolean);
  const minRemaining = parseInt(process.env.ODDS_API_MIN_REQUESTS_REMAINING ?? '20', 10);

  let totalPersisted = 0;

  for (const sportKey of sports) {
    const params = new URLSearchParams({
      apiKey,
      regions: 'eu',
      bookmakers: bookmakers.join(','),
      markets: markets.join(','),
      oddsFormat: 'decimal',
    });

    const path = `/v4/sports/${sportKey}/odds?${params.toString()}`;

    let result: FetchResult;
    try {
      result = await oddsApiGet(path);
    } catch (err) {
      logger.error('The Odds API: fetch failed', {
        sport: sportKey,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const { body: events, requestsRemaining, requestsUsed } = result;

    logger.info('The Odds API: fetched events', {
      sport: sportKey,
      eventCount: events.length,
      requestsUsed,
      requestsRemaining,
    });

    // Safety net — stop if quota is running low to avoid exhausting the month
    if (requestsRemaining !== null && requestsRemaining < minRemaining) {
      logger.warn('The Odds API: quota low — stopping fetch early', {
        requestsRemaining,
        minRemaining,
      });
      break;
    }

    // Group events by bookmaker so we can call persistScrapedEventsForSite
    // once per bookmaker — mirroring the old per-site scraper pattern exactly.
    const eventsByBookmaker = new Map<string, { title: string; events: ScrapedEvent[] }>();

    for (const apiEvent of events) {
      if (!Array.isArray(apiEvent.bookmakers)) continue;

      const sport = mapSportKey(apiEvent.sport_key);
      const league = mapSportKeyToLeague(apiEvent.sport_key);
      const eventDate = new Date(apiEvent.commence_time);

      for (const bookmaker of apiEvent.bookmakers) {
        if (!eventsByBookmaker.has(bookmaker.key)) {
          eventsByBookmaker.set(bookmaker.key, { title: bookmaker.title, events: [] });
        }

        const markets_: ScrapedMarket[] = bookmaker.markets
          .map((m) => mapMarket(m, apiEvent.home_team, apiEvent.away_team))
          .filter((m): m is ScrapedMarket => m !== null);

        if (markets_.length === 0) continue;

        const scrapedEvent: ScrapedEvent = {
          externalId: apiEvent.id,
          sport,
          league,
          homeTeam: apiEvent.home_team,
          awayTeam: apiEvent.away_team,
          eventDate,
          markets: markets_,
        };

        eventsByBookmaker.get(bookmaker.key)!.events.push(scrapedEvent);
      }
    }

    // Persist per bookmaker
    for (const [bookmakerKey, { title, events: bookmakerEvents }] of eventsByBookmaker) {
      if (bookmakerEvents.length === 0) continue;
      try {
        const persisted = await persistScrapedEventsForSite(bookmakerKey, title, bookmakerEvents);
        totalPersisted += persisted;
        logger.info('The Odds API: persisted events', {
          bookmaker: bookmakerKey,
          sport: sportKey,
          persisted,
        });
      } catch (err) {
        logger.error('The Odds API: persist failed', {
          bookmaker: bookmakerKey,
          sport: sportKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return totalPersisted;
}
