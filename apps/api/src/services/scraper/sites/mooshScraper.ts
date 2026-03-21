/**
 * Moosh Portugal scraper — https://www.moosh.pt
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'MooshScraper',
  footballUrl: 'https://www.moosh.pt/desporto/futebol',
  waitForSelector: '.event-card, .match-row, [data-testid="event-card"]',
  eventSelectors: [
    '.event-card',
    '.match-row',
    '[data-testid="event-card"]',
    '.sports-event-card',
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

export class MooshScraper implements IScraper {
  readonly siteSlug = 'moosh';
  readonly siteName = 'Moosh';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}