/**
 * Betano Portugal scraper — https://www.betano.pt
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'BetanoScraper',
  footballUrl: 'https://www.betano.pt/desporto/futebol/',
  waitForSelector: '[data-testid="event-card"], .events-list__item, .tw-event',
  eventSelectors: [
    '[data-testid="event-card"]',
    '.events-list__item',
    '.tw-event',
    '.live-event-card',
  ],
  teamSelectors: [
    '[data-testid="team-name"]',
    '.tw-team-name',
    '.participants__participant-name',
    '.event-card__team-name',
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
} as const;

export class BetanoScraper implements IScraper {
  readonly siteSlug = 'betano';
  readonly siteName = 'Betano';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}