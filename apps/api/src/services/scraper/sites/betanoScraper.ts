/**
 * Betano Portugal scraper — https://www.betano.pt
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'BetanoScraper',
  // /desporto/futebol/ returns 404 — Betano PT routes use /sport/:sport/ pattern
  footballUrl: 'https://www.betano.pt/sport/futebol/',
  spaExtraWaitMs: 4000,
  waitForSelector: '[data-testid="event-card"], .events-list__item, .tw-event, [class*="event-row"], [class*="EventRow"]',
  eventSelectors: [
    '[data-testid="event-card"]',
    '.events-list__item',
    '.tw-event',
    '.live-event-card',
    '[class*="EventRow"]',
    '[class*="event-row"]',
  ],
  teamSelectors: [
    '[data-testid="team-name"]',
    '.tw-team-name',
    '.participants__participant-name',
    '.event-card__team-name',
    '[class*="ParticipantName"]',
    '[class*="participant-name"]',
  ],
  dateSelectors: [
    '[data-testid="event-time"]',
    '.event-card__date',
    '.tw-event-date',
  ],
  leagueSelectors: [
    '.event-path__league',
    '.tw-league-name',
    '.competition__title',
  ],
  oddSelectors: [
    '[data-testid="selection-button"]',
    '.selection__odd',
    '.tw-odds-button',
    '.odds',
  ],
  cookieSelectors: [
    '#onetrust-accept-btn-handler',
    '[data-testid="cookie-accept"]',
    'button[class*="cookie"]',
  ],
  // Betano is a Kaizen Gaming SPA that loads events via internal API calls
  apiInterceptPatterns: [
    'api/sport',
    '/offering/',
    'events',
    'getForSport',
    'matches',
    'blockId',
  ],
} as const;

export class BetanoScraper implements IScraper {
  readonly siteSlug = 'betano';
  readonly siteName = 'Betano';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}