import type { Sport } from '@betintel/shared';

// ─── Raw scraped data shapes ──────────────────────────────────────────────────

/** A single selection inside a market, e.g. "1" → 2.10 in a 1X2 market. */
export interface ScrapedSelection {
  /** Human-readable selection label, e.g. "1", "X", "2", "Over", "Under", "Yes", "No" */
  selection: string;
  /** Decimal odds value, e.g. 2.10 */
  value: number;
}

/**
 * A complete betting market extracted from a site, e.g. the full 1X2 market
 * with all three selections.
 */
export interface ScrapedMarket {
  /** Market identifier as stored in the DB, e.g. "1X2", "Over/Under 2.5", "BTTS" */
  market: string;
  selections: ScrapedSelection[];
}

/**
 * A single sport event as returned by a scraper, including all available markets.
 * The scraper registry is responsible for persisting these into the DB.
 */
export interface ScrapedEvent {
  /** Site-specific unique ID for this event — used to prevent duplicate inserts. */
  externalId: string;
  sport: Sport;
  /** Competition / league name, e.g. "Liga Portugal Betclic" */
  league: string;
  /** Home team name, normalised (trimmed, single spaces) by the registry */
  homeTeam: string;
  /** Away team name */
  awayTeam: string;
  /** Scheduled kick-off / start time */
  eventDate: Date;
  markets: ScrapedMarket[];
}

// ─── Scraper contract ─────────────────────────────────────────────────────────

/**
 * Every betting site scraper must implement this interface.
 * Errors must be caught internally — `scrapeEvents()` should never throw;
 * it should return an empty array on total failure and log the error.
 */
export interface IScraper {
  /** Matches the `slug` field in the `BettingSite` DB table. */
  readonly siteSlug: string;
  /** Human-readable name used in logs and the DB `name` column. */
  readonly siteName: string;
  /**
   * Fetches the current set of events (and their odds) from the betting site.
   * Returns an empty array if the site is unreachable or returns no data.
   */
  scrapeEvents(): Promise<ScrapedEvent[]>;
}

// ─── Job data shapes (used by Bull processors) ────────────────────────────────

/** Payload for a targeted scrape job that targets one site. */
export interface ScrapeJobData {
  siteSlug?: string; // omit to run all scrapers
  jobType: 'live' | 'upcoming-24h' | 'upcoming-7d' | 'discovery';
}
