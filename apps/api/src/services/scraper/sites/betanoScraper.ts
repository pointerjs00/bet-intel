/**
 * Betano Portugal scraper — https://www.betano.pt
 */

import type { IScraper, ScrapedEvent } from '../types';
import { fetchBetanoSportsApi, scrapeConfiguredFootballSite } from './browserSiteScraper';
import { Sport } from '@betintel/shared';

/**
 * Betano Kaizen Gaming API endpoints, tried in order.
 *
 * Betano's frontend blocks Puppeteer/headless-Chrome aggressively (returns a
 * near-blank page), so we call their internal REST APIs directly first — these
 * are served with lighter anti-bot protection than the HTML frontend.
 *
 * Endpoint notes (derived from network-tab analysis of betano.pt):
 *  - /api/home/top-events-v2          — confirmed in initial_state; today's featured/live events
 *  - /api/sports/live/events/         — Kaizen SAGE live events feed for all sports
 *  - /api/sports/live/?sport=SOCCER   — live football only (SOCCER / FOOTBALL variants tried)
 *  - /api/sports/live/?sport=FOOTBALL — fallback variation
 */
const BETANO_LIVE_API_URLS = [
  'https://www.betano.pt/api/sports/live/events/?sport=SOCCER',
  'https://www.betano.pt/api/sports/live/events/?sport=FOOTBALL',
  'https://www.betano.pt/api/sports/live/?sport=SOCCER',
  'https://www.betano.pt/api/sports/live/?sport=FOOTBALL',
  'https://www.betano.pt/api/home/top-events-v2',
] as const;

/**
 * For today's upcoming events, also try the scheduled events API.
 * The /sport/futebol/jogos-de-hoje/ Puppeteer path is kept as fallback.
 */
const BETANO_TODAY_API_URLS = [
  'https://www.betano.pt/api/sports/events/?sport=SOCCER&status=SCHEDULED',
  'https://www.betano.pt/api/sports/events/?sport=FOOTBALL&status=SCHEDULED',
  'https://www.betano.pt/api/sports/events/?sport=SOCCER',
  'https://www.betano.pt/api/sports/events/?sport=FOOTBALL',
  'https://www.betano.pt/api/home/top-events-v2',
] as const;

const BETANO_BASKETBALL_LIVE_API_URLS = [
  'https://www.betano.pt/api/sports/live/events/?sport=BASKETBALL',
  'https://www.betano.pt/api/sports/live/?sport=BASKETBALL',
] as const;

const BETANO_BASKETBALL_TODAY_API_URLS = [
  'https://www.betano.pt/api/sports/events/?sport=BASKETBALL&status=SCHEDULED',
  'https://www.betano.pt/api/sports/events/?sport=BASKETBALL',
] as const;

const BETANO_TENNIS_LIVE_API_URLS = [
  'https://www.betano.pt/api/sports/live/events/?sport=TENNIS',
  'https://www.betano.pt/api/sports/live/?sport=TENNIS',
] as const;

const BETANO_TENNIS_TODAY_API_URLS = [
  'https://www.betano.pt/api/sports/events/?sport=TENNIS&status=SCHEDULED',
  'https://www.betano.pt/api/sports/events/?sport=TENNIS',
] as const;

const BETANO_IN_BROWSER_TODAY_URLS = [
  '/api/sports/events/?sport=SOCCER&status=SCHEDULED',
  '/api/sports/events/?sport=FOOTBALL&status=SCHEDULED',
  '/api/sports/events/?sport=SOCCER',
  '/api/home/top-events-v2',
] as const;

const BASE_CONFIG = {
  siteLabel: 'BetanoScraper',
  // The "jogos de hoje" page renders ALL football events for today across every league
  // (international friendlies, World Cup qualifiers, domestic leagues, women's football, etc.)
  // as structured JSON in window.initial_state.data.blocks[].events[].
  // The generic /sport/futebol/ page is a league navigator with no events.
  footballUrl: 'https://www.betano.pt/sport/futebol/jogos-de-hoje/',
  spaExtraWaitMs: 4000,
  // Extract from window['initial_state'] BEFORE DOM selector wait (Betano embeds events in JS state)
  extractFromWindowState: true,
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
  /** Betano shows a "Splash Screen" age-gate/entry page when it detects a headless
   *  browser. These selectors attempt to dismiss it before looking for event cards. */
  preDismissSelectors: [
    '[data-testid="splash-screen-cta"]',
    '[data-testid="age-gate-confirm"]',
    '[data-testid="age-verification-confirm"]',
    '.splash-overlay__cta',
    '.splash-screen__button',
    '.js-over18',
    '.age-gate__confirm',
    '.entry-gate__cta',
    '[class*="SplashScreen"] button',
    '[class*="splash"] button',
    '[class*="age-gate"] button',
  ],
  preWaitMs: 1500,
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

const TODAY_CONFIG = {
  ...BASE_CONFIG,
  siteLabel: 'BetanoScraper',
  footballUrl: 'https://www.betano.pt/sport/futebol/jogos-de-hoje/',
  inBrowserApiUrls: BETANO_IN_BROWSER_TODAY_URLS,
  // After loading the today page (which clears the WAF challenge cookies), navigate
  // to additional pages in the SAME browser session so those cookies allow them to load.
  // Pages are visited in order: tomorrow → this-week → live.
  // NOTE: The live URL is /live/ (all sports), NOT /live/futebol/ which returns 404.
  supplementNavigationUrls: [
    'https://www.betano.pt/sport/futebol/jogos-de-amanha/',
    'https://www.betano.pt/sport/futebol/esta-semana/',
    'https://www.betano.pt/live/',
    'https://www.betano.pt/sport/basquetebol/',
    'https://www.betano.pt/sport/tenis/',
  ],
  // Fallback: if the live page's window['initial_state'] has no events, try the
  // live events REST API in-browser (we still have the CF cookies from this session).
  // The danae-webapi /live/overview/latest endpoint returns ALL live events as a
  // normalised store (events + markets + selections keyed by ID). It is the actual
  // API that betano's live page calls — confirmed via network-tab inspection.
  supplementInBrowserApiUrls: [
    '/danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=7',
    '/api/sports/events/?sport=BASKETBALL&status=SCHEDULED',
    '/api/sports/events/?sport=BASKETBALL',
    '/api/sports/events/?sport=TENNIS&status=SCHEDULED',
    '/api/sports/events/?sport=TENNIS',
  ],
} as const;

function normaliseEventKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

function mergeEventMarkets(primary: ScrapedEvent, secondary: ScrapedEvent): ScrapedEvent {
  const marketMap = new Map(primary.markets.map((market) => [market.market, market]));

  for (const market of secondary.markets) {
    if (!marketMap.has(market.market)) {
      primary.markets.push(market);
      marketMap.set(market.market, market);
      continue;
    }

    const existing = marketMap.get(market.market);
    if (!existing) {
      continue;
    }

    const selectionMap = new Map(existing.selections.map((selection) => [selection.selection, selection]));
    for (const selection of market.selections) {
      if (!selectionMap.has(selection.selection)) {
        existing.selections.push(selection);
        continue;
      }

      const current = selectionMap.get(selection.selection);
      if (current && (!Number.isFinite(current.value) || selection.value > 0)) {
        current.value = selection.value;
      }
    }
  }

  if (secondary.isLive) {
    primary.isLive = true;
    primary.homeScore = secondary.homeScore ?? primary.homeScore;
    primary.awayScore = secondary.awayScore ?? primary.awayScore;
    primary.liveClock = secondary.liveClock ?? primary.liveClock;
    primary.eventDate = secondary.eventDate;
  }

  return primary;
}

function mergeScrapedEvents(events: ScrapedEvent[]): ScrapedEvent[] {
  const merged: ScrapedEvent[] = [];

  for (const event of events) {
    const existing = merged.find((candidate) => {
      if (candidate.externalId && event.externalId && candidate.externalId === event.externalId) {
        return true;
      }

      return normaliseEventKey(candidate.homeTeam) === normaliseEventKey(event.homeTeam)
        && normaliseEventKey(candidate.awayTeam) === normaliseEventKey(event.awayTeam)
        && isSameCalendarDay(candidate.eventDate, event.eventDate);
    });

    if (!existing) {
      merged.push({
        ...event,
        markets: event.markets.map((market) => ({
          ...market,
          selections: market.selections.map((selection) => ({ ...selection })),
        })),
      });
      continue;
    }

    mergeEventMarkets(existing, event);
  }

  return merged;
}

export class BetanoScraper implements IScraper {
  readonly siteSlug = 'betano';
  readonly siteName = 'Betano';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    // Strategy 1 — Direct REST API (no browser) for all sports in parallel.
    // Betano's WAF (Cloudflare) blocks most direct Node.js HTTP calls with 403,
    // but we try all sports simultaneously as a low-cost first attempt.
    const [
      liveFootball,
      todayFootball,
      liveBasketball,
      todayBasketball,
      liveTennis,
      todayTennis,
    ] = await Promise.all([
      fetchBetanoSportsApi('BetanoScraper', BETANO_LIVE_API_URLS, Sport.FOOTBALL),
      fetchBetanoSportsApi('BetanoScraper', BETANO_TODAY_API_URLS, Sport.FOOTBALL),
      fetchBetanoSportsApi('BetanoScraper:basketball', BETANO_BASKETBALL_LIVE_API_URLS, Sport.BASKETBALL),
      fetchBetanoSportsApi('BetanoScraper:basketball', BETANO_BASKETBALL_TODAY_API_URLS, Sport.BASKETBALL),
      fetchBetanoSportsApi('BetanoScraper:tennis', BETANO_TENNIS_LIVE_API_URLS, Sport.TENNIS),
      fetchBetanoSportsApi('BetanoScraper:tennis', BETANO_TENNIS_TODAY_API_URLS, Sport.TENNIS),
    ]);

    const footballApiEvents = mergeScrapedEvents([...liveFootball, ...todayFootball]);
    const basketballApiEvents = mergeScrapedEvents([...liveBasketball, ...todayBasketball]);
    const tennisApiEvents = mergeScrapedEvents([...liveTennis, ...todayTennis]);

    if (footballApiEvents.length > 0) {
      // Football API succeeded — return all sports from direct API.
      return mergeScrapedEvents([...footballApiEvents, ...basketballApiEvents, ...tennisApiEvents]);
    }

    // Strategy 2 — Single Puppeteer session for football (today + live in same browser).
    // Basketball/tennis from the direct API are merged in even if football fell back to Puppeteer.
    //
    // TODAY_CONFIG has `supplementNavigationUrls` so after extracting today events,
    // scrapeConfiguredFootballSite navigates to the live page in the same browser
    // session (sharing the Cloudflare clearance cookies) before returning.
    const puppeteerFootball = await scrapeConfiguredFootballSite(TODAY_CONFIG);
    return mergeScrapedEvents([...puppeteerFootball, ...basketballApiEvents, ...tennisApiEvents]);
  }
}
