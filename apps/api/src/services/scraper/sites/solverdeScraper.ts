/**
 * Solverde Portugal scraper — https://www.solverde.pt
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'SolverdeScraper',
  footballUrl: 'https://www.solverde.pt/apostas-desportivas/futebol',
  waitForSelector: '.event-card, .match-row, [data-testid="event-card"]',
  // Solverde shows a fullscreen intro splash on first load — dismiss then wait
  // for the Playtech SPA to hydrate and render events
  spaExtraWaitMs: 5000,
  preDismissSelectors: [
    '[class*="splash"] button',
    '[class*="intro"] button',
    '[class*="intro"] a',
    '[data-action="enter"]',
    'a[href*="apostas"]',
    'button[class*="enter"]',
    'a[class*="enter"]',
  ],
  preWaitMs: 8000,
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
  apiInterceptPatterns: [
    '/api/',
    'events',
    'matches',
    'offering',
    'sports',
  ],
} as const;

export class SolverdeScraper implements IScraper {
  readonly siteSlug = 'solverde';
  readonly siteName = 'Solverde';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}