/**
 * Placard Portugal scraper — https://www.placard.pt
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'PlacardScraper',
  footballUrl: 'https://www.placard.pt/apostas-desportivas/futebol',
  waitForSelector: '[data-testid="event-card"], .match-row, .events-list__item',
  eventSelectors: [
    '[data-testid="event-card"]',
    '.match-row',
    '.events-list__item',
    '.sports-event-card',
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
} as const;

export class PlacardScraper implements IScraper {
  readonly siteSlug = 'placard';
  readonly siteName = 'Placard';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}