/**
 * Placard Portugal scraper — https://www.placard.pt
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'PlacardScraper',
  // Original /apostas-desportivas/futebol redirects to /apostas
  footballUrl: 'https://www.placard.pt/apostas/futebol',
  spaExtraWaitMs: 8000,
  waitForSelector: '[data-testid="event-card"], .match-row, .events-list__item, [class*="event-item"], [class*="EventItem"]',
  eventSelectors: [
    '[data-testid="event-card"]',
    '.match-row',
    '.events-list__item',
    '.sports-event-card',
    '[class*="event-item"]',
    '[class*="EventItem"]',
    '[class*="sport-event"]',
  ],
  teamSelectors: [
    '[data-testid="participant-name"]',
    '.participant__name',
    '.match-row__team-name',
    '.event-card__team-name',
  ],
  dateSelectors: [
    '[data-testid="event-time"]',
    '.event-card__date',
    '.match-row__time',
  ],
  leagueSelectors: [
    '.competition__title',
    '.event-card__competition',
    '.match-row__competition',
  ],
  oddSelectors: [
    '[data-testid="price-button"]',
    '.selection__odd',
    '.odd-value',
    '.price',
  ],
  cookieSelectors: [
    '#onetrust-accept-btn-handler',
    '[data-testid="cookie-accept"]',
    'button[class*="cookie"]',
  ],
  apiInterceptPatterns: [
    '/api/',
    'events',
    'matches',
    'offering',
    'sports',
  ],
} as const;

export class PlacardScraper implements IScraper {
  readonly siteSlug = 'placard';
  readonly siteName = 'Placard';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}