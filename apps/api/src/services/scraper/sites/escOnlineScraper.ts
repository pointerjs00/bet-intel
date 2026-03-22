/**
 * ESC Online Portugal scraper
 *
 * NOTE: The original URL esportesonline.com is a Brazilian B2B solutions company,
 * NOT the Portuguese betting site. The correct domain is esconline.pt.
 * TODO: Verify selectors against esconline.pt when URL is confirmed.
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'EscOnlineScraper',
  // esconline.pt redirects to estorilsolcasinos.pt — use PT path directly to sports betting
  footballUrl: 'https://www.estorilsolcasinos.pt/pt/apostas-desportivas/futebol',
  spaExtraWaitMs: 3000,
  waitForSelector: '.event-card, .sports-event, [data-testid="event-card"], .match-event, [class*="EventRow"], [class*="event-row"]',
  eventSelectors: [
    '.event-card',
    '.sports-event',
    '[data-testid="event-card"]',
    '.match-row',
    '.match-event',
    '[class*="EventRow"]',
    '[class*="event-row"]',
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
    // Didomi consent framework used by estorilsolcasinos.pt
    '#didomi-accept-btn-handler',
    '.didomi-components-radio__option--agree',
    'button[id*="didomi-accept"]',
    '#onetrust-accept-btn-handler',
    '[data-testid="cookie-accept"]',
  ],
} as const;

export class EscOnlineScraper implements IScraper {
  readonly siteSlug = 'esconline';
  readonly siteName = 'ESC Online';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}