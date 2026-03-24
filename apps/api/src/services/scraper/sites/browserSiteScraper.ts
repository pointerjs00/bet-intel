import * as fs from 'fs';
import * as path from 'path';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteerCore, { type HTTPRequest, type HTTPResponse, type Page } from 'puppeteer-core';
import * as proxyChain from 'proxy-chain';
import { Sport } from '@betintel/shared';
import { logger } from '../../../utils/logger';
import type { ScrapedEvent, ScrapedMarket } from '../types';

const puppeteer = addExtra(puppeteerCore as Parameters<typeof addExtra>[0]);
puppeteer.use(StealthPlugin());

const USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0',
];

// --no-zygote and --single-process are Linux-only and crash Edge/Chrome on Windows
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

/** Per-process cache of the proxy-chain local proxy URL (shared with betclicScraper pattern). */
let _localProxyUrl: string | undefined;

/** Returns a local unauthenticated proxy URL via proxy-chain, or undefined if no proxy is configured. */
async function getLocalProxyUrl(): Promise<string | undefined> {
  const proxy = process.env.SCRAPER_HTTP_PROXY?.trim();
  if (!proxy) return undefined;
  if (!_localProxyUrl) {
    _localProxyUrl = await proxyChain.anonymizeProxy(proxy);
    logger.info('Proxy chain: local bridge started', { localUrl: _localProxyUrl });
  }
  return _localProxyUrl;
}

/** Returns Chromium launch args with optional proxy-chain local URL. */
function buildBrowserArgs(localProxyUrl?: string): string[] {
  if (!localProxyUrl) return [...BROWSER_ARGS];
  return [...BROWSER_ARGS, `--proxy-server=${localProxyUrl}`];
}

interface RawEventData {
  externalId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDateIso: string;
  home: string;
  draw: string;
  away: string;
  isLive: boolean;
}

interface BrowserSiteScraperConfig {
  siteLabel: string;
  footballUrl: string;
  eventSelectors: readonly string[];
  teamSelectors: readonly string[];
  dateSelectors: readonly string[];
  leagueSelectors: readonly string[];
  oddSelectors: readonly string[];
  cookieSelectors?: readonly string[];
  /** Selectors to click to dismiss entry gates / splash screens before waiting for events */
  preDismissSelectors?: readonly string[];
  /** Extra ms to wait after preDismissSelectors clicks before starting waitForSelector */
  preWaitMs?: number;
  /** Extra ms to wait after networkidle2 for SPAs to hydrate before starting waitForSelector */
  spaExtraWaitMs?: number;
  waitForSelector?: string;
  acceptLanguage?: string;
  /**
   * URL substring patterns to intercept JSON API responses from the SPA.
   * When DOM extraction yields 0 events, the scraper attempts to parse events
   * from the collected API responses as a fallback.
   * Example: ['api/sport', 'offering/v', 'events', 'matches']
   */
  apiInterceptPatterns?: readonly string[];
}

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string;
}

function randomDelay(minMs = 500, maxMs = 2000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOdds(raw: string): number {
  return parseFloat(raw.replace(',', '.').trim());
}

/**
 * Shared Puppeteer-based football scraper used by the non-Betclic site classes.
 * Keeps the same anti-detection strategy as the existing Betclic scraper.
 */
export async function scrapeConfiguredFootballSite(
  config: BrowserSiteScraperConfig,
): Promise<ScrapedEvent[]> {
  let browser;

  try {
    const localProxyUrl = await getLocalProxyUrl();
    browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
      headless: true,
      args: buildBrowserArgs(localProxyUrl),
    });

    const page = await browser.newPage();

    await page.setUserAgent(randomUA());
    await page.setExtraHTTPHeaders({
      'Accept-Language': config.acceptLanguage ?? 'pt-PT,pt;q=0.9,en;q=0.8',
    });
    await page.setViewport({ width: 1366, height: 768 });

    // Collect JSON API responses from the SPA for fallback event extraction
    const interceptedApiResponses: Array<{ url: string; body: unknown }> = [];

    await page.setRequestInterception(true);
    page.on('request', (request: HTTPRequest) => {
      const type = request.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    if (config.apiInterceptPatterns?.length) {
      page.on('response', (response: HTTPResponse) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] ?? '';
        if (!contentType.includes('json')) return;

        const matchesPattern = config.apiInterceptPatterns!.some((p) => url.includes(p));
        if (!matchesPattern) return;

        response.json().then((body: unknown) => {
          interceptedApiResponses.push({ url, body });
          logger.debug(`${config.siteLabel}: intercepted API response`, { url: url.slice(0, 200) });
        }).catch(() => { /* not valid JSON */ });
      });
    }

    logger.debug(`${config.siteLabel}: navigating to ${config.footballUrl}`);
    await page.goto(config.footballUrl, {
      waitUntil: 'networkidle2',
      timeout: 45_000,
    });

    await randomDelay();
    await dismissCookieConsent(page, config);
    await randomDelay(300, 800);

    // Extra wait for JS SPAs that need time to hydrate after networkidle2
    if (config.spaExtraWaitMs) {
      await randomDelay(config.spaExtraWaitMs, config.spaExtraWaitMs + 2000);
    }

    // Dismiss entry gates / splash screens (age verification, casino intros, etc.)
    if (config.preDismissSelectors?.length) {
      await dismissSplashOrAgeGate(page, config);
      await randomDelay(config.preWaitMs ?? 1000, (config.preWaitMs ?? 1000) + 1500);
    }

    try {
      await page.waitForSelector(config.waitForSelector ?? config.eventSelectors.join(', '), {
        timeout: 30_000,
      });
    } catch {
      const currentUrl = page.url();
      let pageTitle = '';
      try { pageTitle = await page.title(); } catch { /* ignore */ }
      logger.warn(`${config.siteLabel}: event list selector not found — page may have changed structure`, {
        url: currentUrl,
        title: pageTitle,
      });
      try {
        const screenshotDir = path.join(process.cwd(), 'debug-screenshots');
        fs.mkdirSync(screenshotDir, { recursive: true });
        const slug = config.siteLabel.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const ts = Date.now();
        await page.screenshot({ path: path.join(screenshotDir, `${slug}-${ts}.png`) });
        const bodyHtml = await page.evaluate(() => document.body?.innerHTML?.slice(0, 8000) ?? '');
        fs.writeFileSync(path.join(screenshotDir, `${slug}-${ts}.html`), bodyHtml);
        logger.debug(`${config.siteLabel}: debug screenshot + HTML saved to debug-screenshots/`);
      } catch { /* diagnostic is best-effort */ }

      // Try API response fallback before giving up
      if (interceptedApiResponses.length > 0) {
        logger.info(`${config.siteLabel}: DOM extraction failed, trying ${interceptedApiResponses.length} intercepted API responses`);
        const apiEvents = parseApiResponses(config.siteLabel, interceptedApiResponses);
        if (apiEvents.length > 0) {
          logger.info(`${config.siteLabel}: extracted ${apiEvents.length} events from API responses`);
          await browser.close();
          return apiEvents;
        }
      }

      await browser.close();
      return [];
    }

    await scrollDown(page);
    await randomDelay(500, 1200);

    const rawEvents = await extractEvents(page, config);
    logger.info(`${config.siteLabel}: extracted ${rawEvents.length} raw events`);

    if (rawEvents.length === 0) {
      try {
        const screenshotDir = path.join(process.cwd(), 'debug-screenshots');
        fs.mkdirSync(screenshotDir, { recursive: true });
        const slug = config.siteLabel.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const ts = Date.now();
        await page.screenshot({ path: path.join(screenshotDir, `${slug}-${ts}-0events.png`) });
        const bodyHtml = await page.evaluate(() => document.body?.innerHTML?.slice(0, 8000) ?? '');
        fs.writeFileSync(path.join(screenshotDir, `${slug}-${ts}-0events.html`), bodyHtml);
        logger.debug(`${config.siteLabel}: debug snapshot saved (0 events)`);
      } catch { /* diagnostic is best-effort */ }

      // Try API response fallback
      if (interceptedApiResponses.length > 0) {
        logger.info(`${config.siteLabel}: DOM extraction returned 0, trying ${interceptedApiResponses.length} intercepted API responses`);
        const apiEvents = parseApiResponses(config.siteLabel, interceptedApiResponses);
        if (apiEvents.length > 0) {
          logger.info(`${config.siteLabel}: extracted ${apiEvents.length} events from API responses`);
          await browser.close();
          return apiEvents;
        }
      }
    }

    const events = parseRawEvents(config.siteLabel, rawEvents);

    // Enrich league names: when DOM selectors couldn't determine the competition
    // (fell back to 'Futebol'), try matching against intercepted API responses
    // which carry structured league metadata in their JSON payload.
    if (interceptedApiResponses.length > 0 && events.some((e) => e.league === 'Futebol')) {
      const apiEvents = parseApiResponses(config.siteLabel, interceptedApiResponses);
      if (apiEvents.length > 0) {
        const apiLeagueMap = new Map<string, string>();
        for (const ae of apiEvents) {
          if (ae.league !== 'Futebol') {
            apiLeagueMap.set(
              `${ae.homeTeam.toLowerCase()}|${ae.awayTeam.toLowerCase()}`,
              ae.league,
            );
          }
        }
        for (const ev of events) {
          if (ev.league === 'Futebol') {
            const matched = apiLeagueMap.get(
              `${ev.homeTeam.toLowerCase()}|${ev.awayTeam.toLowerCase()}`,
            );
            if (matched) ev.league = matched;
          }
        }
        logger.debug(`${config.siteLabel}: enriched league names from API responses`);
      }
    }

    await browser.close();
    return events;
  } catch (error) {
    logger.error(`${config.siteLabel}: uncaught error`, {
      error: error instanceof Error ? error.message : JSON.stringify(error),
    });
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    return [];
  }
}

async function dismissCookieConsent(page: Page, config: BrowserSiteScraperConfig): Promise<void> {
  for (const selector of config.cookieSelectors ?? []) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        logger.debug(`${config.siteLabel}: dismissed cookie consent`);
        return;
      }
    } catch {
      // Ignore missing or detached cookie buttons.
    }
  }
}

async function dismissSplashOrAgeGate(page: Page, config: BrowserSiteScraperConfig): Promise<void> {
  for (const selector of config.preDismissSelectors ?? []) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        logger.debug(`${config.siteLabel}: clicked entry gate / splash dismiss: ${selector}`);
        return;
      }
    } catch {
      // Try next selector
    }
  }
  // Fallback: click anywhere on the body to dismiss a fullscreen overlay
  try {
    await page.click('body');
    logger.debug(`${config.siteLabel}: clicked body as splash fallback`);
  } catch { /* ignore */ }
}

async function scrollDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight * 0.5, behavior: 'smooth' });
  });
  await randomDelay(400, 900);
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });
}

async function extractEvents(page: Page, config: BrowserSiteScraperConfig): Promise<RawEventData[]> {
  // Pre-extract league names from the page's initial state JSON or heading elements
  // Many sites (Betano, etc.) store structured data with proper league → region mapping
  const leagueContext = await page.evaluate(() => {
    const mapping: Record<string, string> = {};

    // Strategy 1: Try window.initial_state (Betano)
    try {
      const state = (window as unknown as Record<string, unknown>)['initial_state'] as {
        data?: {
          topLeagues?: Array<{ name?: string; regionName?: string; displayName?: string }>;
          regionGroups?: Array<{
            regions?: Array<{
              name?: string;
              leagues?: Array<{ name?: string; id?: string }>;
            }>;
          }>;
        };
      } | undefined;
      if (state?.data) {
        // Map league names to "Region - League" format
        for (const tl of state.data.topLeagues ?? []) {
          if (tl.name && tl.regionName) {
            mapping[tl.name.toLowerCase()] = `${tl.regionName} - ${tl.displayName ?? tl.name}`;
          }
        }
        for (const group of state.data.regionGroups ?? []) {
          for (const region of group.regions ?? []) {
            for (const league of region.leagues ?? []) {
              if (league.name && region.name) {
                mapping[league.name.toLowerCase()] = `${region.name} - ${league.name}`;
              }
            }
          }
        }
      }
    } catch { /* ignore */ }

    // Strategy 2: Look for section/heading elements with league context
    try {
      const headings = document.querySelectorAll(
        'h2, h3, [class*="league-header"], [class*="competition-header"], [class*="group-header"]'
      );
      headings.forEach((h) => {
        const text = h.textContent?.trim();
        if (text && text.length > 3 && text.length < 80) {
          mapping[text.toLowerCase()] = text;
        }
      });
    } catch { /* ignore */ }

    return mapping;
  });

  const rawEvents = await page.evaluate((pageConfig): RawEventData[] => {
    const results: RawEventData[] = [];

    const textContent = (value: string | null | undefined): string => value?.trim() ?? '';
    const uniqueTexts = (elements: Element[]): string[] => {
      const seen = new Set<string>();
      const values: string[] = [];

      for (const element of elements) {
        const value = textContent(element.textContent);
        if (!value) {
          continue;
        }
        if (seen.has(value)) {
          continue;
        }
        seen.add(value);
        values.push(value);
      }

      return values;
    };

    const queryFromSelectors = (root: ParentNode, selectors: readonly string[]): Element[] => {
      for (const selector of selectors) {
        const nodes = Array.from(root.querySelectorAll(selector));
        if (nodes.length > 0) {
          return nodes;
        }
      }
      return [];
    };

    const getLeague = (item: Element): string => {
      // Try configured selectors walking up
      let node: Element | null = item;
      while (node) {
        const leagueNode = queryFromSelectors(node, pageConfig.leagueSelectors)[0];
        if (leagueNode) {
          return textContent(leagueNode.textContent) || 'Futebol';
        }
        node = node.parentElement;
      }

      // Fallback: look for preceding heading/section elements
      let prevSibling: Element | null = item.parentElement;
      for (let i = 0; i < 5 && prevSibling; i++) {
        const heading = prevSibling.querySelector('h2, h3, h4, [class*="league"], [class*="competition"], [class*="tournament"]');
        if (heading) {
          const text = textContent(heading.textContent);
          if (text && text.length > 2 && text.length < 80) return text;
        }
        prevSibling = prevSibling.parentElement;
      }

      return 'Futebol';
    };

    let items: Element[] = [];
    for (const selector of pageConfig.eventSelectors) {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        items = Array.from(found);
        break;
      }
    }

    for (const item of items) {
      try {
        const teamTexts = uniqueTexts(queryFromSelectors(item, pageConfig.teamSelectors));
        if (teamTexts.length < 2) {
          continue;
        }

        const oddTexts = uniqueTexts(queryFromSelectors(item, pageConfig.oddSelectors));
        if (oddTexts.length < 3) {
          continue;
        }

        const homeTeam = teamTexts[0] ?? '';
        const awayTeam = teamTexts[1] ?? '';
        if (!homeTeam || !awayTeam) {
          continue;
        }

        const timeNode = item.querySelector('time[datetime]');
        const datetime = timeNode?.getAttribute('datetime');
        const dateFallback = queryFromSelectors(item, pageConfig.dateSelectors)[0];
        let eventDateIso = datetime && datetime.length > 0
          ? datetime
          : textContent(dateFallback?.textContent);

        if (!eventDateIso || Number.isNaN(new Date(eventDateIso).getTime())) {
          eventDateIso = new Date().toISOString();
        }

        const externalId =
          item.getAttribute('data-id') ??
          item.getAttribute('id') ??
          item.getAttribute('data-event-id') ??
          item.getAttribute('data-fixture-id') ??
          item.getAttribute('data-test') ??
          `${homeTeam}__${awayTeam}__${eventDateIso}`;

        // Detect live/in-play status using data attributes and child-element text.
        // textContent on the item itself is intentionally avoided: it includes
        // ancestor/section text ("Ao Vivo", "Live") that leaks into every card.
        // Child-text check via querySelectorAll is scoped to descendants only.
        const hasLiveAttr =
          item.querySelector(
            '[data-live="true"], [data-status="live"], [data-status="LIVE"], [data-status="inprogress"], ' +
            '[data-match-status="live"], [data-match-status="LIVE"], ' +
            '[class*="inplay"], [class*="InPlay"], [class*="in-play"], ' +
            '[class*="live-score"], [class*="livescore"], [class*="live-time"], ' +
            '[class*="live-clock"], [class*="live-indicator"], [class*="match-live"]'
          ) !== null;

        // In-play minute counter / status strings rendered inside each event card.
        const hasLiveChildText = Array.from(item.querySelectorAll('*')).some((el) => {
          const txt = ((el as HTMLElement).innerText ?? (el as HTMLElement).textContent ?? '').trim();
          return (
            /^\d+['']\s*(?:\+\s*\d+['']\s*)?$/.test(txt) ||
            /^(Início|Intervalo|HT|Intervalo\s+\d+)$/i.test(txt)
          );
        });

        const isLive = hasLiveAttr || hasLiveChildText;

        results.push({
          externalId,
          league: getLeague(item),
          homeTeam,
          awayTeam,
          eventDateIso,
          home: oddTexts[0] ?? '',
          draw: oddTexts[1] ?? '',
          away: oddTexts[2] ?? '',
          isLive,
        });
      } catch {
        // Never throw from page context.
      }
    }

    return results;
  }, config);

  // Post-process: enrich league names with leagueContext from initial_state / headings
  if (Object.keys(leagueContext).length > 0) {
    // If every event defaulted to 'Futebol' and there is exactly one known
    // context entry (i.e. the page is scoped to a single league), apply it
    // to all unknown events.
    const contextKeys = Object.keys(leagueContext);
    const uniqueContextValues = [...new Set(Object.values(leagueContext))];

    for (const ev of rawEvents) {
      if (ev.league !== 'Futebol' && ev.league !== '') {
        // Normalise known leagues via the context mapping
        const mapped = leagueContext[ev.league.toLowerCase()];
        if (mapped) ev.league = mapped;
        continue;
      }

      // Event has no league info — try to find a match in the context:

      // 1. If the page is scoped to one league, use it
      if (uniqueContextValues.length === 1) {
        ev.league = uniqueContextValues[0]!;
        continue;
      }

      // 2. Try matching any context key against either team name substring
      const home = ev.homeTeam.toLowerCase();
      const away = ev.awayTeam.toLowerCase();
      for (const key of contextKeys) {
        if (home.includes(key) || away.includes(key)) {
          ev.league = leagueContext[key]!;
          break;
        }
      }
    }
  }

  return rawEvents;
}

function parseRawEvents(siteLabel: string, rawEvents: RawEventData[]): ScrapedEvent[] {
  const events: ScrapedEvent[] = [];

  for (const event of rawEvents) {
    try {
      const homeOdds = parseOdds(event.home);
      const drawOdds = parseOdds(event.draw);
      const awayOdds = parseOdds(event.away);

      if ([homeOdds, drawOdds, awayOdds].some((value) => !Number.isFinite(value) || value < 1.01)) {
        continue;
      }

      const markets: ScrapedMarket[] = [
        {
          market: '1X2',
          selections: [
            { selection: '1', value: homeOdds },
            { selection: 'X', value: drawOdds },
            { selection: '2', value: awayOdds },
          ],
        },
      ];

      events.push({
        externalId: event.externalId,
        sport: Sport.FOOTBALL,
        league: event.league || 'Futebol',
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        eventDate: new Date(event.eventDateIso),
        markets,
        isLive: event.isLive,
      });
    } catch (error) {
      logger.debug(`${siteLabel}: failed to parse raw event`, {
        event: `${event.homeTeam} vs ${event.awayTeam}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return events;
}

// ─── API Response Fallback Parser ─────────────────────────────────────────────

/**
 * Heuristic parser that extracts football events from intercepted JSON API responses.
 *
 * Betting sites (Betano/Kaizen, Bet365, etc.) return event data in varied JSON
 * shapes. This function recursively searches the JSON for arrays of objects that
 * look like football events (having team names, odds, and dates) and normalises
 * them into ScrapedEvent[].
 */
function parseApiResponses(
  siteLabel: string,
  responses: Array<{ url: string; body: unknown }>,
): ScrapedEvent[] {
  const events: ScrapedEvent[] = [];
  const seenKeys = new Set<string>();

  for (const { url, body } of responses) {
    try {
      const candidates = findEventArrays(body);
      for (const arr of candidates) {
        for (const item of arr) {
          const parsed = tryParseApiEvent(item, url);
          if (!parsed) continue;
          const key = `${parsed.homeTeam}__${parsed.awayTeam}__${parsed.eventDate.toISOString().slice(0, 16)}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          events.push(parsed);
        }
      }
    } catch {
      logger.debug(`${siteLabel}: failed to parse API response`, { url: url.slice(0, 200) });
    }
  }

  logger.debug(`${siteLabel}: API fallback found ${events.length} unique events from ${responses.length} responses`);
  return events;
}

/**
 * Recursively searches a JSON value for arrays of objects that look like events.
 * An "event-like" object has at least 2 team-related fields and some odds data.
 */
function findEventArrays(value: unknown, depth = 0): unknown[][] {
  if (depth > 8) return [];
  const results: unknown[][] = [];

  if (Array.isArray(value)) {
    // Check if this array contains event-like objects
    const eventLikeCount = value.filter((item) => isEventLikeObject(item)).length;
    if (eventLikeCount >= 2) {
      results.push(value);
    }
    // Also recurse into array items
    for (const item of value) {
      results.push(...findEventArrays(item, depth + 1));
    }
  } else if (value && typeof value === 'object') {
    for (const val of Object.values(value as Record<string, unknown>)) {
      results.push(...findEventArrays(val, depth + 1));
    }
  }
  return results;
}

/** Checks whether a JSON object looks like a betting event (has teams + odds). */
function isEventLikeObject(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;

  // Common property name patterns for teams
  const teamKeys = ['homeTeam', 'awayTeam', 'home', 'away', 'homeTeamName', 'awayTeamName',
    'participants', 'teams', 'competitor1', 'competitor2', 'player1', 'player2',
    'homeName', 'awayName', 'team1', 'team2', 'name'];
  const hasTeamInfo = teamKeys.some((k) => k in o);
  if (!hasTeamInfo) return false;

  // Common property name patterns for odds/markets
  const oddsKeys = ['odds', 'markets', 'selections', 'outcomes', 'prices', 'betOffers',
    'mainMarket', 'market', 'oddsList', 'bettingOffers'];
  const hasOdds = oddsKeys.some((k) => k in o);

  // Common property name patterns for dates
  const dateKeys = ['startTime', 'eventDate', 'date', 'kickoff', 'start', 'scheduledTime',
    'matchDate', 'startDate', 'time', 'startsAt', 'startTimestamp'];
  const hasDate = dateKeys.some((k) => k in o);

  return hasOdds || hasDate;
}

/**
 * Attempts to extract a ScrapedEvent from a single JSON object.
 * Handles multiple known JSON shapes from common betting platforms.
 */
function tryParseApiEvent(obj: unknown, sourceUrl: string): ScrapedEvent | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  // ─── Extract teams ──────────────────────────────────────────────────
  let homeTeam = '';
  let awayTeam = '';

  // Pattern: { homeTeamName, awayTeamName } or { homeName, awayName }
  if (typeof o.homeTeamName === 'string') homeTeam = o.homeTeamName;
  else if (typeof o.homeName === 'string') homeTeam = o.homeName;
  else if (typeof o.home === 'string') homeTeam = o.home;
  else if (typeof o.homeTeam === 'string') homeTeam = o.homeTeam;
  else if (typeof o.team1 === 'string') homeTeam = o.team1;
  else if (typeof o.competitor1 === 'string') homeTeam = o.competitor1;

  if (typeof o.awayTeamName === 'string') awayTeam = o.awayTeamName;
  else if (typeof o.awayName === 'string') awayTeam = o.awayName;
  else if (typeof o.away === 'string') awayTeam = o.away;
  else if (typeof o.awayTeam === 'string') awayTeam = o.awayTeam;
  else if (typeof o.team2 === 'string') awayTeam = o.team2;
  else if (typeof o.competitor2 === 'string') awayTeam = o.competitor2;

  // Pattern: { participants: [{ name }, { name }] } or { teams: [{ name }, { name }] }
  if (!homeTeam || !awayTeam) {
    const participants = (o.participants ?? o.teams ?? o.competitors) as unknown[] | undefined;
    if (Array.isArray(participants) && participants.length >= 2) {
      const p0 = participants[0] as Record<string, unknown> | undefined;
      const p1 = participants[1] as Record<string, unknown> | undefined;
      if (p0 && p1) {
        homeTeam = String(p0.name ?? p0.teamName ?? p0.shortName ?? '');
        awayTeam = String(p1.name ?? p1.teamName ?? p1.shortName ?? '');
      }
    }
  }

  // Pattern: { name: "Team A - Team B" } or { name: "Team A vs Team B" }
  if (!homeTeam || !awayTeam) {
    const name = String(o.name ?? o.eventName ?? o.matchName ?? '');
    const match = name.match(/^(.+?)\s*(?:[-–]|vs\.?)\s*(.+)$/i);
    if (match) {
      homeTeam = match[1]!.trim();
      awayTeam = match[2]!.trim();
    }
  }

  if (!homeTeam || !awayTeam) return null;

  // ─── Extract date ───────────────────────────────────────────────────
  let eventDate: Date | null = null;
  for (const key of ['startTime', 'eventDate', 'date', 'kickoff', 'start', 'scheduledTime',
    'matchDate', 'startDate', 'startsAt', 'startTimestamp']) {
    const val = o[key];
    if (val == null) continue;
    if (typeof val === 'number') {
      // Unix timestamp (seconds or ms)
      const ts = val > 1e12 ? val : val * 1000;
      const d = new Date(ts);
      if (!isNaN(d.getTime())) { eventDate = d; break; }
    }
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) { eventDate = d; break; }
    }
  }
  if (!eventDate) eventDate = new Date();

  // ─── Extract league ─────────────────────────────────────────────────
  let league = 'Futebol';
  const leagueVal = o.league ?? o.leagueName ?? o.competitionName ?? o.competition ??
    o.tournamentName ?? o.tournament ?? o.categoryName ?? o.category;
  if (typeof leagueVal === 'string' && leagueVal.length > 2) {
    league = leagueVal;
  } else if (leagueVal && typeof leagueVal === 'object') {
    const l = leagueVal as Record<string, unknown>;
    const lName = String(l.name ?? l.displayName ?? '');
    if (lName.length > 2) league = lName;
  }

  // Try to enrich league with region from URL path
  // e.g. /sport/futebol/portugal/primeira-liga/ → "Portugal - Primeira Liga"
  if (league !== 'Futebol') {
    const regionVal = o.regionName ?? o.countryName ?? o.region ?? o.country;
    if (typeof regionVal === 'string' && regionVal.length > 1 && !league.toLowerCase().includes(regionVal.toLowerCase())) {
      league = `${regionVal} - ${league}`;
    }
  }

  // ─── Extract odds (1X2 market) ──────────────────────────────────────
  const selections = extract1X2Odds(o);
  if (!selections) return null;

  const markets: ScrapedMarket[] = [{
    market: '1X2',
    selections,
  }];

  const externalId = String(
    o.id ?? o.eventId ?? o.matchId ?? o.fixtureId ??
    `${homeTeam}__${awayTeam}__${eventDate.toISOString()}`
  );

  // Detect live status from common API fields
  const isLive =
    o.isLive === true ||
    o.inPlay === true ||
    o.inplay === true ||
    o.isInPlay === true ||
    String(o.status ?? o.eventStatus ?? o.matchStatus ?? '').toLowerCase() === 'live' ||
    String(o.status ?? o.eventStatus ?? o.matchStatus ?? '').toLowerCase() === 'inplay' ||
    String(o.status ?? o.eventStatus ?? o.matchStatus ?? '').toLowerCase() === 'in_play';

  return {
    externalId,
    sport: Sport.FOOTBALL,
    league,
    homeTeam: homeTeam.replace(/\s+/g, ' ').trim(),
    awayTeam: awayTeam.replace(/\s+/g, ' ').trim(),
    eventDate,
    markets,
    isLive,
  };
}

/**
 * Tries multiple JSON shapes to extract 1X2 (home/draw/away) odds from an event object.
 * Returns null if a valid 1X2 set cannot be found.
 */
function extract1X2Odds(
  o: Record<string, unknown>,
): Array<{ selection: string; value: number }> | null {
  // Pattern 1: { markets: [{ selections: [{ price, name/outcome }] }] }
  const marketsArr = (o.markets ?? o.betOffers ?? o.oddsList) as unknown[] | undefined;
  if (Array.isArray(marketsArr)) {
    for (const mkt of marketsArr) {
      if (!mkt || typeof mkt !== 'object') continue;
      const m = mkt as Record<string, unknown>;
      const mName = String(m.name ?? m.marketName ?? m.type ?? '').toLowerCase();
      // Only look at 1X2 / Match Result market
      if (mName && !/(1x2|match.?result|full.?time|vencedor|resultado)/i.test(mName)) continue;
      const sels = (m.selections ?? m.outcomes ?? m.odds ?? m.prices) as unknown[] | undefined;
      if (!Array.isArray(sels) || sels.length < 3) continue;
      const extracted = sels.map((s) => {
        if (!s || typeof s !== 'object') return null;
        const sel = s as Record<string, unknown>;
        const value = Number(sel.price ?? sel.odds ?? sel.value ?? sel.decimal ?? sel.odd);
        const name = String(sel.name ?? sel.outcome ?? sel.label ?? sel.selection ?? '');
        return { value, name };
      }).filter((x): x is { value: number; name: string } => x !== null && Number.isFinite(x.value) && x.value >= 1.01);
      if (extracted.length >= 3) {
        return [
          { selection: '1', value: extracted[0]!.value },
          { selection: 'X', value: extracted[1]!.value },
          { selection: '2', value: extracted[2]!.value },
        ];
      }
    }
  }

  // Pattern 2: { odds: { home, draw, away } } or { odds: { "1", "X", "2" } }
  const oddsObj = o.odds as Record<string, unknown> | undefined;
  if (oddsObj && typeof oddsObj === 'object' && !Array.isArray(oddsObj)) {
    const home = Number(oddsObj.home ?? oddsObj['1'] ?? oddsObj.homeWin);
    const draw = Number(oddsObj.draw ?? oddsObj.X ?? oddsObj.x ?? oddsObj.tie);
    const away = Number(oddsObj.away ?? oddsObj['2'] ?? oddsObj.awayWin);
    if ([home, draw, away].every((v) => Number.isFinite(v) && v >= 1.01)) {
      return [
        { selection: '1', value: home },
        { selection: 'X', value: draw },
        { selection: '2', value: away },
      ];
    }
  }

  // Pattern 3: { odds: [number, number, number] }
  if (Array.isArray(o.odds) && o.odds.length >= 3) {
    const vals = o.odds.map(Number);
    if (vals.slice(0, 3).every((v) => Number.isFinite(v) && v >= 1.01)) {
      return [
        { selection: '1', value: vals[0]! },
        { selection: 'X', value: vals[1]! },
        { selection: '2', value: vals[2]! },
      ];
    }
  }

  // Pattern 4: { mainMarket: { selections/outcomes: [...] } }
  const mainMarket = o.mainMarket as Record<string, unknown> | undefined;
  if (mainMarket && typeof mainMarket === 'object') {
    const sels = (mainMarket.selections ?? mainMarket.outcomes) as unknown[] | undefined;
    if (Array.isArray(sels) && sels.length >= 3) {
      const values = sels.map((s) => {
        if (!s || typeof s !== 'object') return NaN;
        const sel = s as Record<string, unknown>;
        return Number(sel.price ?? sel.odds ?? sel.value ?? sel.decimal);
      });
      if (values.slice(0, 3).every((v) => Number.isFinite(v) && v >= 1.01)) {
        return [
          { selection: '1', value: values[0]! },
          { selection: 'X', value: values[1]! },
          { selection: '2', value: values[2]! },
        ];
      }
    }
  }

  return null;
}