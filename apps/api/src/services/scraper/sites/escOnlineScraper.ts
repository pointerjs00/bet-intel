/**
 * ESC Online scraper — https://www.esportesonline.com
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'EscOnlineScraper',
  footballUrl: 'https://www.esportesonline.com/pt/apostas/futebol',
  waitForSelector: '.event-card, .sports-event, [data-testid="event-card"]',
  eventSelectors: [
    '.event-card',
    '.sports-event',
    '[data-testid="event-card"]',
    '.match-row',
  ],
  teamSelectors: [
    '[data-testid="team-name"]',
    '.participant__name',
    '.event-card__team-name',
    '.match-row__team-name',
  ],
  dateSelectors: [
    '[data-testid="event-time"]',
    '.event-card__date',
    '.match-row__time',
  ],
  leagueSelectors: [
    '.competition__title',
    '.event-card__competition',
    '.sports-event__competition',
  ],
  oddSelectors: [
    '[data-testid="price-button"]',
    '.selection__odd',
    '.odd-value',
    '.bet-price',
  ],
  cookieSelectors: [
    '#onetrust-accept-btn-handler',
    '[data-testid="cookie-accept"]',
    'button[class*="cookie"]',
  ],
} as const;

export class EscOnlineScraper implements IScraper {
  readonly siteSlug = 'esconline';
  readonly siteName = 'ESC Online';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}