/**
 * Solverde Portugal scraper — https://www.solverde.pt
 *
 * Primary: Kambi WebSocket injection (full event catalogue with 1X2 odds).
 * Fallback: Kambi pre-fetch CDN (partial catalogue).
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeKambiViaWebSocket } from './kambiWsScraper';
import { fetchKambiPrefetchEvents } from './browserSiteScraper';
import { Sport } from '@betintel/shared';
import { logger } from '../../../utils/logger';

const PREFETCH_URL = 'https://sportswidget-cdn.solverde.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP';
// NOTE: Kambi CDN pre-fetch ignores the page= param and always returns soccer events,
// so basketball/tennis prefetch URLs are NOT used (they would pollute results with football).

const BASKETBALL_PREFETCH_URL = 'https://sportswidget-cdn.solverde.pt/pre-fetch?locale=pt_PT&page=basketball&type=DESKTOP';

const SOLVERDE_SOCCER_BASE = 'https://www.solverde.pt/apostas/sports/soccer/matches';
const SOLVERDE_BASKETBALL_BASE = 'https://www.solverde.pt/apostas/sports/basketball/matches';
const SOLVERDE_TENNIS_BASE = 'https://www.solverde.pt/apostas/sports/tennis/matches';

/** Build Kambi page URLs for a given sport slug: live → today → tomorrow. */
function buildSolverdePageUrls(baseUrl: string, sportSlug: string): { primary: string; extra: string[] } {
  const extra: string[] = [
    `https://www.solverde.pt/apostas/sports/${sportSlug}/live`,
    `${baseUrl}/tomorrow`,
  ];
  const now = new Date();
  for (let dayOffset = 2; dayOffset <= 13; dayOffset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    const iso = d.toISOString().slice(0, 10);
    extra.push(`${baseUrl}/${iso}`);
  }
  return { primary: `${baseUrl}/today`, extra };
}

function deduplicateEvents(events: ScrapedEvent[]): ScrapedEvent[] {
  const seen = new Map<string, ScrapedEvent>();
  for (const ev of events) {
    const key = `${ev.homeTeam.toLowerCase()}|${ev.awayTeam.toLowerCase()}|${ev.eventDate.toISOString().slice(0, 16)}`;
    const existing = seen.get(key);
    if (!existing || ev.markets.length > existing.markets.length) {
      seen.set(key, ev);
    }
  }
  return [...seen.values()];
}

const SOLVERDE_DISMISS_SELECTORS = [
  'button.splash-enter',         // age-gate / splash "Entrar"
  '.age-gate button',            // age-gate variant
  '.splash-screen button',       // splash screen variant
  'button[data-testid="enter"]', // generic test-id variant
];

export class SolverdeScraper implements IScraper {
  readonly siteSlug = 'solverde';
  readonly siteName = 'Solverde';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    const { primary: soccerPrimary, extra: soccerExtra } = buildSolverdePageUrls(SOLVERDE_SOCCER_BASE, 'soccer');
    let footballEvents = await scrapeKambiViaWebSocket({
      siteLabel: 'SolverdeScraper',
      sport: Sport.FOOTBALL,
      pageUrl: soccerPrimary,
      extraPageUrls: soccerExtra,
      preDismissSelectors: SOLVERDE_DISMISS_SELECTORS,
      preWaitMs: 2000,
      cdnPrefetchUrl: PREFETCH_URL,
    });

    // Fallback: if WS+CDN yielded very few events, try standalone pre-fetch
    if (footballEvents.length < 10) {
      logger.warn(`SolverdeScraper: WS+CDN returned only ${footballEvents.length} football events, trying standalone pre-fetch fallback`);
      const prefetchEvents = await fetchKambiPrefetchEvents('SolverdeScraper:prefetch', PREFETCH_URL);
      if (prefetchEvents.length > 0) {
        footballEvents = deduplicateEvents([...footballEvents, ...prefetchEvents]);
      }
    }

    // Basketball
    const { primary: bkPrimary, extra: bkExtra } = buildSolverdePageUrls(SOLVERDE_BASKETBALL_BASE, 'basketball');
    let basketballEvents = await scrapeKambiViaWebSocket({
      siteLabel: 'SolverdeScraper:basketball',
      sport: Sport.BASKETBALL,
      pageUrl: bkPrimary,
      extraPageUrls: bkExtra,
      preDismissSelectors: SOLVERDE_DISMISS_SELECTORS,
      preWaitMs: 2000,
    }).catch((err: unknown) => {
      logger.warn('SolverdeScraper: basketball pass failed', { error: err instanceof Error ? err.message : String(err) });
      return [] as ScrapedEvent[];
    });

    // Fallback: if WS returned 0 basketball events, try CDN pre-fetch
    if (basketballEvents.filter(e => e.markets.length > 0).length === 0) {
      logger.info('SolverdeScraper: basketball WS returned 0 events with odds, trying CDN fallback');
      const cdnEvents = await fetchKambiPrefetchEvents('SolverdeScraper:basketball:cdn', BASKETBALL_PREFETCH_URL);
      const cdnBasketball = cdnEvents.filter(e => e.sport === Sport.BASKETBALL);
      if (cdnBasketball.length > 0) {
        logger.info(`SolverdeScraper: CDN fallback found ${cdnBasketball.length} basketball events`);
        basketballEvents = deduplicateEvents([...basketballEvents, ...cdnBasketball]);
      }
    }

    // Tennis
    const { primary: tePrimary, extra: teExtra } = buildSolverdePageUrls(SOLVERDE_TENNIS_BASE, 'tennis');
    const tennisEvents = await scrapeKambiViaWebSocket({
      siteLabel: 'SolverdeScraper:tennis',
      sport: Sport.TENNIS,
      pageUrl: tePrimary,
      extraPageUrls: teExtra,
      preDismissSelectors: SOLVERDE_DISMISS_SELECTORS,
      preWaitMs: 2000,
    }).catch((err: unknown) => {
      logger.warn('SolverdeScraper: tennis pass failed', { error: err instanceof Error ? err.message : String(err) });
      return [] as ScrapedEvent[];
    });

    logger.info(`SolverdeScraper: football=${footballEvents.length} basketball=${basketballEvents.length} tennis=${tennisEvents.length}`);
    return deduplicateEvents([...footballEvents, ...basketballEvents, ...tennisEvents]);
  }
}
