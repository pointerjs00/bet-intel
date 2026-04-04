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
  marketName?: string;
  selections?: Array<{
    selection: string;
    price: string;
  }>;
  home: string;
  draw: string;
  away: string;
  isLive: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  liveClock?: string | null;
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
  /** Only keep cards whose text contains at least one of these substrings. */
  requiredTextPatterns?: readonly string[];
  acceptLanguage?: string;
  /**
   * URL substring patterns to intercept JSON API responses from the SPA.
   * When DOM extraction yields 0 events, the scraper attempts to parse events
   * from the collected API responses as a fallback.
   * Example: ['api/sport', 'offering/v', 'events', 'matches']
   */
  apiInterceptPatterns?: readonly string[];
  /**
   * Direct URL to a Kambi pre-fetch endpoint, e.g.
   * 'https://sportswidget-cdn.solverde.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP'
   * When all other extraction methods fail, the scraper will fetch this URL
   * directly via HTTP (no browser needed) and parse the Kambi JSON.
   */
  kambiPrefetchUrl?: string;
  /**
   * API URLs to try **from within the browser context** (using the page's cookies)
   * after navigation succeeds. Used for sites like Betano where direct HTTP calls
   * are blocked by WAF but in-browser fetch() calls work because the browser has
   * the WAF session cookies set.
   *
   * Each URL is tried in order; the first that returns a non-empty events list wins.
   * Tried BEFORE waitForSelector, so results are available even if the DOM never hydrates.
   */
  inBrowserApiUrls?: readonly string[];
  /**
   * When true, extract events from `window['initial_state']` immediately after
   * `spaExtraWaitMs` (before waitForSelector). Useful for Betano/Kaizen SPAs
   * that embed event data in the page as a JS variable.
   */
  extractFromWindowState?: boolean;
  /**
   * After successfully loading `footballUrl` and extracting events via
   * `extractFromWindowState`, navigate the SAME browser instance to each of
   * these additional URLs (using the same WAF cookies) and also extract events
   * from their `window['initial_state']`. Results are merged.
   *
   * Used by Betano to scrape both the today page AND the live page in a single
   * browser session: the today page gets Cloudflare clearance cookies that make
   * the live page load correctly.
   */
  supplementNavigationUrls?: readonly string[];
  /**
   * After navigating to each `supplementNavigationUrls` page, if `window['initial_state']`
   * yields 0 events, try these relative API paths via in-browser `fetch()` (which
   * uses the page's WAF/CF cookies). First successful response with events wins.
   *
   * Used by Betano: the live page SPA may not embed events in JS state but the
   * live events API is accessible via in-browser fetch with the CF cookies.
   * Paths are relative to the supplement page origin (e.g. '/api/sports/live/events/').
   */
  supplementInBrowserApiUrls?: readonly string[];
  /**
   * Key-value pairs to inject into `localStorage` via `page.evaluateOnNewDocument`
   * before the page's own JS runs. Used to pre-accept age gates / splash screens
   * that store their "accepted" state in localStorage.
   */
  preNavigationLocalStorage?: Readonly<Record<string, string>>;
  /**
   * Key-value pairs to inject into `sessionStorage` via `page.evaluateOnNewDocument`.
   */
  preNavigationSessionStorage?: Readonly<Record<string, string>>;
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

function normaliseEventMergeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

function mergeWithAuthoritativeKambiEvents(
  domEvents: ScrapedEvent[],
  kambiEvents: ScrapedEvent[],
): ScrapedEvent[] {
  if (kambiEvents.length === 0) {
    return domEvents;
  }

  const remainingKambi = new Map<string, ScrapedEvent[]>();
  for (const event of kambiEvents) {
    const key = `${normaliseEventMergeName(event.homeTeam)}|${normaliseEventMergeName(event.awayTeam)}`;
    const bucket = remainingKambi.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      remainingKambi.set(key, [event]);
    }
  }

  const merged: ScrapedEvent[] = [];

  for (const domEvent of domEvents) {
    const key = `${normaliseEventMergeName(domEvent.homeTeam)}|${normaliseEventMergeName(domEvent.awayTeam)}`;
    const candidates = remainingKambi.get(key);
    if (!candidates || candidates.length === 0) {
      merged.push(domEvent);
      continue;
    }

    const candidateIndex = candidates.findIndex((candidate) =>
      isSameCalendarDay(candidate.eventDate, domEvent.eventDate)
      || Math.abs(candidate.eventDate.getTime() - domEvent.eventDate.getTime()) <= 12 * 60 * 60 * 1000,
    );
    if (candidateIndex === -1) {
      merged.push(domEvent);
      continue;
    }

    const [kambiEvent] = candidates.splice(candidateIndex, 1);
    if (candidates.length === 0) {
      remainingKambi.delete(key);
    }

    merged.push({
      ...kambiEvent,
      league: kambiEvent.league === 'Futebol' && domEvent.league !== 'Futebol'
        ? domEvent.league
        : kambiEvent.league,
    });
  }

  for (const leftover of remainingKambi.values()) {
    merged.push(...leftover);
  }

  return merged;
}

/**
 * Directly fetch a Kambi pre-fetch URL via HTTP (no browser needed) and parse
 * events using the Kambi parser. This is a last-resort fallback for sites where
 * the Kambi widget doesn't initialise inside Puppeteer (e.g. Solverde).
 */
export async function fetchKambiPrefetchEvents(
  siteLabel: string,
  url: string,
): Promise<ScrapedEvent[]> {
  try {
    logger.info(`${siteLabel}: attempting direct Kambi pre-fetch from ${url}`);
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        'User-Agent': randomUA(),
      },
    });
    if (!resp.ok) {
      logger.warn(`${siteLabel}: Kambi pre-fetch returned ${resp.status}`);
      return [];
    }
    const body = await resp.json();
    const events = tryParseKambiPreFetch(body);
    if (events.length > 0) {
      logger.info(`${siteLabel}: extracted ${events.length} events from direct Kambi pre-fetch`);
    }
    return events;
  } catch (err) {
    logger.warn(`${siteLabel}: direct Kambi pre-fetch failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Directly fetches a Betano (Kaizen Gaming) sports API endpoint without Puppeteer.
 *
 * Betano's frontend anti-bot detection blocks headless Chrome aggressively, causing
 * the Puppeteer-based scraper to receive a blank page and capture zero events.
 * Their internal REST API endpoints are served with lighter protection and can be
 * reached server-to-server with browser-like headers.
 *
 * The response is parsed with the generic `parseApiResponses` heuristic which handles
 * the Kaizen event shape: `{ name: "Home - Away", startTime, participants, markets }`.
 *
 * @param siteLabel  - Label used in log messages (e.g. "BetanoScraperLive")
 * @param urls       - Ordered list of candidate API URLs to try; stops at first success
 * @returns Parsed ScrapedEvent array, or [] if all URLs fail
 */
export async function fetchBetanoSportsApi(
  siteLabel: string,
  urls: readonly string[],
  sport?: Sport,
): Promise<ScrapedEvent[]> {
  const baseHeaders = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    'Referer': 'https://www.betano.pt/',
    'Origin': 'https://www.betano.pt',
    'User-Agent': randomUA(),
    'X-Requested-With': 'XMLHttpRequest',
    'Cache-Control': 'no-cache',
  };

  for (const url of urls) {
    try {
      logger.debug(`${siteLabel}: direct API fetch → ${url}`);
      const resp = await fetch(url, { headers: baseHeaders });
      if (!resp.ok) {
        logger.debug(`${siteLabel}: direct API returned ${resp.status} for ${url} (WAF block expected, will fall back to Puppeteer)`);
        continue;
      }
      const body: unknown = await resp.json();
      const events = parseApiResponses(siteLabel, [{ url, body }]);
      if (events.length > 0) {
        logger.info(`${siteLabel}: direct API extracted ${events.length} events from ${url}`);
        if (sport !== undefined) {
          for (const ev of events) ev.sport = sport;
        }
        return events;
      }
      logger.debug(`${siteLabel}: direct API returned 0 parseable events from ${url}`);
    } catch (err) {
      logger.debug(`${siteLabel}: direct API fetch failed for ${url}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.warn(`${siteLabel}: all direct API URLs exhausted, falling back to Puppeteer`);
  return [];
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

    // Pre-set localStorage / sessionStorage before the page's own JS loads so
    // that age-gate / splash-screen SPAs see the "already accepted" flag and
    // skip showing the overlay.
    if (config.preNavigationLocalStorage || config.preNavigationSessionStorage) {
      const ls = config.preNavigationLocalStorage ?? {};
      const ss = config.preNavigationSessionStorage ?? {};
      await page.evaluateOnNewDocument(
        (lsItems: Record<string, string>, ssItems: Record<string, string>) => {
          for (const [k, v] of Object.entries(lsItems)) {
            try { localStorage.setItem(k, v); } catch { /* sandboxed origin — ignore */ }
          }
          for (const [k, v] of Object.entries(ssItems)) {
            try { sessionStorage.setItem(k, v); } catch { /* sandboxed origin — ignore */ }
          }
        },
        ls as Record<string, string>,
        ss as Record<string, string>,
      );
    }

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

    // ── Proactive window.initial_state extraction (Betano/Kaizen SPAs) ──────────
    // Read event data from the embedded JS state BEFORE the DOM selector times out.
    // This is more reliable than waiting for DOM elements that may never render.
    if (config.extractFromWindowState) {
      try {
        const windowState = await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          return w['initial_state'] ?? null;
        });
        const stateEvents: ScrapedEvent[] = windowState
          ? parseApiResponses(config.siteLabel, [{ url: 'window:initial_state:proactive', body: windowState }])
          : [];
        if (stateEvents.length > 0) {
          logger.info(`${config.siteLabel}: proactive window.initial_state extraction found ${stateEvents.length} events`);
        } else if (windowState) {
          logger.debug(`${config.siteLabel}: window.initial_state available but parseApiResponses returned 0 events`);
        }

        // ── Supplement: also navigate to additional URLs (same session/cookies) ──
        // Always run supplemental navigation if configured — regardless of whether
        // the primary page found events. The primary page (e.g. today's games) is
        // only needed for Cloudflare cookie setup; the live page must always be
        // harvested even when the today page returns zero scheduled events.
        const supplementEvents: ScrapedEvent[] = [];
        if (config.supplementNavigationUrls?.length) {
          for (const suppUrl of config.supplementNavigationUrls) {
            try {
              logger.debug(`${config.siteLabel}: supplemental navigation → ${suppUrl}`);
              await page.goto(suppUrl, { waitUntil: 'networkidle2', timeout: 30_000 });
              // The splash / age-gate can reappear on each new navigation — dismiss it again.
              if (config.preDismissSelectors?.length) {
                await dismissSplashOrAgeGate(page, config);
                await randomDelay(500, 1000);
              }
              await randomDelay(3000, 5000);
              const suppState = await page.evaluate(() => {
                const w = window as unknown as Record<string, unknown>;
                return w['initial_state'] ?? null;
              });
              if (suppState) {
                const suppParsed = parseApiResponses(config.siteLabel, [
                  { url: `window:initial_state:supplement:${suppUrl}`, body: suppState },
                ]);
                if (suppParsed.length > 0) {
                  logger.info(`${config.siteLabel}: supplemental ${suppUrl} found ${suppParsed.length} events`);
                  supplementEvents.push(...suppParsed);
                } else {
                  logger.debug(`${config.siteLabel}: supplemental ${suppUrl} initial_state had 0 parseable events`);
                }
              }

              // If initial_state yielded nothing, try in-browser API calls while we
              // still have the WAF/CF cookies from this browser session.
              const suppEventsBefore = supplementEvents.length;
              if (supplementEvents.length === suppEventsBefore && config.supplementInBrowserApiUrls?.length) {
                try {
                  // Try ALL supplemental URLs and merge results (not stop at first).
                  // This lets the danae live API AND sport-specific scheduled APIs both
                  // contribute to the event list (e.g. danae=live events, /api/sports/events/?sport=BASKETBALL=upcoming).
                  const apiResults = await page.evaluate(async (urls: string[]) => {
                    const results: Array<{ url: string; text: string }> = [];
                    for (const url of urls) {
                      try {
                        const r = await fetch(url, { credentials: 'include' });
                        if (r.ok) {
                          const text = await r.text();
                          if (text && text.length > 10) results.push({ url, text });
                        }
                      } catch { /* try next */ }
                    }
                    return results;
                  }, [...config.supplementInBrowserApiUrls] as string[]);
                  for (const apiResult of apiResults) {
                    try {
                      const body: unknown = JSON.parse(apiResult.text);
                      const apiEvents = parseApiResponses(config.siteLabel, [{ url: apiResult.url, body }]);
                      if (apiEvents.length > 0) {
                        logger.info(`${config.siteLabel}: supplemental in-browser API got ${apiEvents.length} events from ${apiResult.url}`);
                        supplementEvents.push(...apiEvents);
                      } else {
                        logger.debug(`${config.siteLabel}: supplemental in-browser API at ${apiResult.url} returned 0 parseable events`);
                      }
                    } catch { /* JSON parse or parse failed */ }
                  }
                  if (apiResults.length === 0) {
                    logger.debug(`${config.siteLabel}: all supplemental in-browser API URLs failed`);
                  }
                } catch (apiErr) {
                  logger.debug(`${config.siteLabel}: supplemental in-browser API fetch failed`, {
                    error: apiErr instanceof Error ? apiErr.message : String(apiErr),
                  });
                }
              }
            } catch (suppErr) {
              logger.warn(`${config.siteLabel}: supplemental navigation to ${suppUrl} failed`, {
                error: suppErr instanceof Error ? suppErr.message : String(suppErr),
              });
            }
          }
        }

        // Return if we have events from either source
        if (stateEvents.length > 0 || supplementEvents.length > 0) {
          await browser.close();

          // Only supplemental events (today page had 0) — return them directly
          if (stateEvents.length === 0) {
            logger.info(`${config.siteLabel}: returning ${supplementEvents.length} supplemental-only events (today page had 0)`);
            return supplementEvents;
          }
          // Only today-page events (no supplemental configured or found)
          if (supplementEvents.length === 0) return stateEvents;

          // Both sources have events — merge.
          // When the same event appears in both (matched by team names + calendar date):
          //   • If the supplemental event is live: promote the primary to live and
          //     replace its markets with the in-play odds (which differ from pre-match).
          //   • Otherwise: keep the primary and discard the supplemental duplicate.
          // When a supplemental event is NOT in the primary set, add it directly.
          //
          // Name matching uses alphanumeric substring comparison so that clubs
          // listed with and without their label prefix (e.g. "Bragantino" vs
          // "RB Bragantino") are treated as the same team.
          const normTeamSupp = (s: string) =>
            s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
          const teamsMatchSupp = (a: string, b: string) => {
            const na = normTeamSupp(a), nb = normTeamSupp(b);
            return na === nb || na.includes(nb) || nb.includes(na);
          };

          const merged = [...stateEvents];
          for (const ev of supplementEvents) {
            const evDate = ev.eventDate.toISOString().slice(0, 10);
            const existingIdx = merged.findIndex((e) =>
              teamsMatchSupp(e.homeTeam, ev.homeTeam)
              && teamsMatchSupp(e.awayTeam, ev.awayTeam)
              && e.eventDate.toISOString().slice(0, 10) === evDate,
            );
            if (existingIdx === -1) {
              // Not in today page — brand-new event (e.g. started late, not originally listed)
              merged.push(ev);
            } else if (ev.isLive) {
              // Same event is live on the supplemental page — promote and use live odds
              const primary = merged[existingIdx]!;
              primary.isLive = true;
              primary.homeScore = ev.homeScore ?? primary.homeScore;
              primary.awayScore = ev.awayScore ?? primary.awayScore;
              primary.liveClock = ev.liveClock ?? primary.liveClock;
              // Replace today-page markets with live-page markets (in-play odds differ from pre-match)
              const liveMarketMap = new Map(ev.markets.map((m) => [m.market, m]));
              primary.markets = primary.markets.map((m) => liveMarketMap.get(m.market) ?? m);
              for (const [name, m] of liveMarketMap) {
                if (!primary.markets.some((pm) => pm.market === name)) primary.markets.push(m);
              }
            }
            // else: non-live supplemental that duplicates today page → skip
          }
          logger.info(`${config.siteLabel}: merged ${stateEvents.length} primary + ${supplementEvents.length} supplemental = ${merged.length} total events`);
          return merged;
        }
        // Zero events from both sources → fall through to DOM extraction
      } catch { /* ignore — fallthrough to DOM extraction */ }
    }

    // ── In-browser API fetch (for sites with WAF that blocks direct HTTP) ────────
    // After the browser navigated and got WAF cookies, try calling the site's
    // internal API from within the page context. This has the cookies that WAF
    // requires, unlike direct Node.js HTTP calls.
    if (config.inBrowserApiUrls?.length) {
      try {
        const urlsToTry = [...config.inBrowserApiUrls];
        const apiResult = await page.evaluate(async (urls: string[]) => {
          for (const url of urls) {
            try {
              const r = await fetch(url, { credentials: 'include' });
              if (r.ok) {
                const text = await r.text();
                return { url, text };
              }
            } catch { /* try next */ }
          }
          return null;
        }, urlsToTry as string[]);

        if (apiResult) {
          try {
            const body: unknown = JSON.parse(apiResult.text);
            const apiEvents = parseApiResponses(config.siteLabel, [{ url: apiResult.url, body }]);
            if (apiEvents.length > 0) {
              logger.info(`${config.siteLabel}: in-browser API fetch extracted ${apiEvents.length} events from ${apiResult.url}`);
              await browser.close();
              return apiEvents;
            }
            logger.debug(`${config.siteLabel}: in-browser API responded but parseApiResponses returned 0 events from ${apiResult.url}`);
          } catch { /* JSON parse failed */ }
        }
      } catch (err) {
        logger.debug(`${config.siteLabel}: in-browser API fetch failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      await page.waitForSelector(config.waitForSelector ?? config.eventSelectors.join(', '), {
        timeout: 30_000,
      });
    } catch {
      const currentUrl = page.url();
      let pageTitle = '';
      let bodyHtml = '';
      try { pageTitle = await page.title(); } catch { /* ignore */ }
      logger.warn(`${config.siteLabel}: event list selector not found ��� page may have changed structure`, {
        url: currentUrl,
        title: pageTitle,
      });
      try {
        const screenshotDir = path.join(process.cwd(), 'debug-screenshots');
        fs.mkdirSync(screenshotDir, { recursive: true });
        const slug = config.siteLabel.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const ts = Date.now();
        await page.screenshot({ path: path.join(screenshotDir, `${slug}-${ts}.png`) });
        bodyHtml = await page.evaluate(() => document.body?.innerHTML?.slice(0, 200000) ?? '');
        fs.writeFileSync(path.join(screenshotDir, `${slug}-${ts}.html`), bodyHtml);
        logger.debug(`${config.siteLabel}: debug screenshot + HTML saved to debug-screenshots/`);
      } catch { /* diagnostic is best-effort */ }

      const htmlEvents = parseHtmlFallback(config.siteLabel, bodyHtml);
      if (htmlEvents.length > 0) {
        logger.info(`${config.siteLabel}: extracted ${htmlEvents.length} events from embedded HTML state`);
        await browser.close();
        return htmlEvents;
      }

      // Try window.initial_state (Betano SPA) — the object lives in JS memory,
      // not in body innerHTML, so we must read it via page.evaluate.
      try {
        const windowState = await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          return w['initial_state'] ?? null;
        });
        if (windowState) {
          const stateEvents = parseApiResponses(config.siteLabel, [
            { url: 'window:initial_state', body: windowState },
          ]);
          if (stateEvents.length > 0) {
            logger.info(`${config.siteLabel}: extracted ${stateEvents.length} events from window.initial_state`);
            await browser.close();
            return stateEvents;
          }
        }
      } catch { /* ignore — page may have been destroyed */ }

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

      // Last resort: direct HTTP fetch of Kambi pre-fetch URL (bypasses Puppeteer entirely)
      if (config.kambiPrefetchUrl) {
        const kambiEvents = await fetchKambiPrefetchEvents(config.siteLabel, config.kambiPrefetchUrl);
        if (kambiEvents.length > 0) {
          await browser.close();
          return kambiEvents;
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
      let bodyHtml = '';
      try {
        const screenshotDir = path.join(process.cwd(), 'debug-screenshots');
        fs.mkdirSync(screenshotDir, { recursive: true });
        const slug = config.siteLabel.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const ts = Date.now();
        await page.screenshot({ path: path.join(screenshotDir, `${slug}-${ts}-0events.png`) });
        bodyHtml = await page.evaluate(() => document.body?.innerHTML?.slice(0, 200000) ?? '');
        fs.writeFileSync(path.join(screenshotDir, `${slug}-${ts}-0events.html`), bodyHtml);
        logger.debug(`${config.siteLabel}: debug snapshot saved (0 events)`);
      } catch { /* diagnostic is best-effort */ }

      const htmlEvents = parseHtmlFallback(config.siteLabel, bodyHtml);
      if (htmlEvents.length > 0) {
        logger.info(`${config.siteLabel}: extracted ${htmlEvents.length} events from embedded HTML state`);
        await browser.close();
        return htmlEvents;
      }

      // Try window.initial_state (Betano SPA)
      try {
        const windowState = await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          return w['initial_state'] ?? null;
        });
        if (windowState) {
          const stateEvents = parseApiResponses(config.siteLabel, [
            { url: 'window:initial_state', body: windowState },
          ]);
          if (stateEvents.length > 0) {
            logger.info(`${config.siteLabel}: extracted ${stateEvents.length} events from window.initial_state`);
            await browser.close();
            return stateEvents;
          }
        }
      } catch { /* ignore */ }

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

      // Last resort: direct Kambi pre-fetch
      if (config.kambiPrefetchUrl) {
        const kambiEvents = await fetchKambiPrefetchEvents(config.siteLabel, config.kambiPrefetchUrl);
        if (kambiEvents.length > 0) {
          await browser.close();
          return kambiEvents;
        }
      }
    }

    let events = parseRawEvents(config.siteLabel, rawEvents);

    if (config.kambiPrefetchUrl) {
      const kambiEvents = await fetchKambiPrefetchEvents(config.siteLabel, config.kambiPrefetchUrl);
      if (kambiEvents.length > 0) {
        events = mergeWithAuthoritativeKambiEvents(events, kambiEvents);
      }
    }

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
  // First pass: try each selector, waiting briefly for the element to appear
  for (const selector of config.preDismissSelectors ?? []) {
    try {
      // Wait up to 2 s for the element — splash overlays may render after networkidle
      const el = await page.waitForSelector(selector, { timeout: 2000, visible: true }).catch(() => null);
      if (el) {
        await el.scrollIntoView();
        await el.click();
        logger.debug(`${config.siteLabel}: clicked entry gate / splash dismiss: ${selector}`);
        return;
      }
    } catch {
      // Try next selector
    }
  }

  // Second pass: text-based fallback — find any visible button whose label matches
  // common Portuguese age-gate / welcome-screen phrases.
  try {
    const clicked = await page.$$eval(
      'button, a[role="button"], [role="button"], [class*="cta"], [class*="confirm"]',
      (elements: Element[]) => {
        const pattern = /tenho\s*\+?\s*18|sou maior|aceitar|confirmar|entrar|continuar|over\s*18|enter\s*site|i['']?m\s*18/i;
        for (const el of elements) {
          const text = (el.textContent ?? '').trim();
          const htmlEl = el as HTMLElement;
          if (pattern.test(text) && htmlEl.offsetParent !== null) {
            htmlEl.click();
            return text;
          }
        }
        return null;
      },
    );
    if (clicked) {
      logger.debug(`${config.siteLabel}: dismissed age-gate via text-based button ("${clicked}")`);
      return;
    }
  } catch { /* ignore */ }

  // Last resort: click anywhere on the body to dismiss a fullscreen overlay
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
  // Many sites (Betano, etc.) store structured data with proper league ��� region mapping
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

    const parseDisplayDate = (rawValue: string): string => {
      const value = rawValue.trim();
      if (!value) {
        return new Date().toISOString();
      }

      const now = new Date();
      const parsed = new Date(now);

      const timeMatch = value.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        parsed.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
      } else {
        parsed.setHours(12, 0, 0, 0);
      }

      if (/amanh[aã]/i.test(value)) {
        parsed.setDate(parsed.getDate() + 1);
        return parsed.toISOString();
      }

      if (/hoje/i.test(value) || timeMatch) {
        return parsed.toISOString();
      }

      const slashMatch = value.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (slashMatch) {
        const day = Number(slashMatch[1]);
        const month = Number(slashMatch[2]) - 1;
        const year = slashMatch[3]
          ? Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3])
          : now.getFullYear();
        parsed.setFullYear(year, month, day);
        return parsed.toISOString();
      }

      const direct = new Date(value);
      return Number.isNaN(direct.getTime()) ? now.toISOString() : direct.toISOString();
    };

    const normaliseLiveClockText = (rawValue: string): string | null => {
      const value = rawValue.replace(/\s+/g, ' ').trim();
      if (!value) return null;

      if (/^(?:intervalo|ht|half[ -]?time|int\.?|break time)$/i.test(value)) {
        return 'Int.';
      }

      const minuteMatch = value.match(/^(\d+)(?:\s*\+\s*(\d+))?\s*['′]?$/);
      if (!minuteMatch) {
        return null;
      }

      return minuteMatch[2]
        ? `${minuteMatch[1]}+${minuteMatch[2]}'`
        : `${minuteMatch[1]}'`;
    };

    const liveClockProgress = (value: string): number => {
      if (/^Int\.$/i.test(value)) {
        return 45.5;
      }

      const minuteMatch = value.match(/^(\d+)(?:\+(\d+))?'$/);
      if (!minuteMatch) {
        return -1;
      }

      const minute = Number(minuteMatch[1]);
      const addedTime = Number(minuteMatch[2] ?? '0');
      return minute + addedTime / 1000;
    };

    const extractLiveClock = (item: Element): string | null => {
      let bestClock: string | null = null;
      let bestProgress = -1;

      for (const element of Array.from(item.querySelectorAll('*'))) {
        const text = ((element as HTMLElement).innerText ?? (element as HTMLElement).textContent ?? '').trim();
        const liveClock = normaliseLiveClockText(text);
        if (!liveClock) continue;

        const progress = liveClockProgress(liveClock);
        if (progress > bestProgress) {
          bestClock = liveClock;
          bestProgress = progress;
        }
      }

      return bestClock;
    };

    const extractSelections = (item: Element): Array<{ selection: string; price: string }> => {
      const placardButtons = Array.from(item.querySelectorAll('.ta-SelectionButtonView'));
      if (placardButtons.length > 0) {
        return placardButtons.map((button) => {
          const price = textContent(button.querySelector('.ta-price_text')?.textContent);
          const name = textContent(button.querySelector('.ta-infoTextName')?.textContent);
          const handicap = textContent(button.querySelector('.ta-infoTextHandicap')?.textContent);
          const label = [name, handicap].filter(Boolean).join(' ').trim() || textContent(button.textContent).replace(price, '').trim();
          return {
            selection: label,
            price,
          };
        }).filter((entry) => entry.selection && entry.price);
      }

      const oddTexts = uniqueTexts(queryFromSelectors(item, pageConfig.oddSelectors)).filter((value) => /\d/.test(value));
      if (oddTexts.length >= 3) {
        return [
          { selection: '1', price: oddTexts[0] ?? '' },
          { selection: 'X', price: oddTexts[1] ?? '' },
          { selection: '2', price: oddTexts[2] ?? '' },
        ];
      }

      return oddTexts.map((value, index) => ({
        selection: `Selection ${index + 1}`,
        price: value,
      }));
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
        const itemText = textContent(item.textContent);
        if (pageConfig.requiredTextPatterns?.length) {
          const matchesRequiredText = pageConfig.requiredTextPatterns.some((pattern) => itemText.includes(pattern));
          if (!matchesRequiredText) {
            continue;
          }
        }

        const teamTexts = uniqueTexts(queryFromSelectors(item, pageConfig.teamSelectors));
        if (teamTexts.length < 2) {
          continue;
        }

        const selections = extractSelections(item);
        if (selections.length < 2) {
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
          eventDateIso = parseDisplayDate(eventDateIso);
        }

        const marketTitleNode = item.querySelector('.ta-marketTitle');
        const marketName = textContent(marketTitleNode?.textContent) || (selections.length >= 3 ? '1X2' : 'Mercado');

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
            /^(In+�cio|Intervalo|HT|Intervalo\s+\d+)$/i.test(txt)
          );
        });

        const isLive = hasLiveAttr || hasLiveChildText;
        const liveClock = isLive ? extractLiveClock(item) : null;

        // Live scores
        let homeScore: number | null = null;
        let awayScore: number | null = null;
        if (isLive) {
          const scoreEls = item.querySelectorAll(
            '[class*="score-home"], [class*="score-away"], [class*="live-score"] span, [class*="scoreboard_score"], [data-qa="scoreboard-score"] span',
          );
          if (scoreEls.length >= 2) {
            const h = parseInt((scoreEls[0] as HTMLElement)?.textContent?.trim() ?? '', 10);
            const a = parseInt((scoreEls[1] as HTMLElement)?.textContent?.trim() ?? '', 10);
            if (!isNaN(h) && !isNaN(a)) {
              homeScore = h;
              awayScore = a;
            }
          }
          if (homeScore === null) {
            // Fallback: look for "1 - 0" pattern in any score container
            const scoreContainer = item.querySelector('[class*="score"], [class*="result"]');
            if (scoreContainer) {
              const scoreText = scoreContainer.textContent?.trim() ?? '';
              const scoreMatch = scoreText.match(/(\d+)\s*[-\u2013]\s*(\d+)/);
              if (scoreMatch) {
                homeScore = parseInt(scoreMatch[1], 10);
                awayScore = parseInt(scoreMatch[2], 10);
              }
            }
          }
        }

        results.push({
          externalId,
          league: getLeague(item),
          homeTeam,
          awayTeam,
          eventDateIso,
          marketName,
          selections,
          home: selections[0]?.price ?? '',
          draw: selections[1]?.price ?? '',
          away: selections[2]?.price ?? '',
          isLive,
          homeScore,
          awayScore,
          liveClock,
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

      // Event has no league info ��� try to find a match in the context:

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
      const selectionEntries = event.selections && event.selections.length > 0
        ? event.selections
            .map((selection) => ({
              selection: selection.selection,
              value: parseOdds(selection.price),
            }))
            .filter((selection) => Number.isFinite(selection.value) && selection.value >= 1.01)
        : [
            { selection: '1', value: parseOdds(event.home) },
            { selection: 'X', value: parseOdds(event.draw) },
            { selection: '2', value: parseOdds(event.away) },
          ].filter((selection) => Number.isFinite(selection.value) && selection.value >= 1.01);

      if (selectionEntries.length < 2) {
        continue;
      }

      // Normalise selection names for match-result markets: when exactly 3
      // selections exist and they aren't already '1'/'X'/'2' (e.g. Placard
      // buttons show team names like "Porto" / "Empate" / "Benfica"), map
      // them to the standard '1'/'X'/'2' by position (home/draw/away).
      const isStandard = selectionEntries.some((s) => s.selection === '1') &&
        selectionEntries.some((s) => s.selection === 'X');
      if (selectionEntries.length === 3 && !isStandard) {
        selectionEntries[0]!.selection = '1';
        selectionEntries[1]!.selection = 'X';
        selectionEntries[2]!.selection = '2';
      }

      const markets: ScrapedMarket[] = [
        {
          market: event.marketName || (selectionEntries.length === 3 ? '1X2' : 'Mercado'),
          selections: selectionEntries,
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
        homeScore: event.homeScore ?? null,
        awayScore: event.awayScore ?? null,
        liveClock: event.liveClock ?? null,
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

function parseKambiSelectionOdds(selection: Record<string, unknown>): number | null {
  const prices = selection.prices as Array<Record<string, unknown>> | undefined;
  let odds = 0;
  if (Array.isArray(prices) && prices.length > 0) {
    odds = parseFloat(String(prices[0]!.decimalLabel ?? '0'));
  }
  if (!odds) {
    odds = Number(selection.odds ?? selection.price ?? selection.value ?? 0);
  }

  return Number.isFinite(odds) && odds >= 1.01
    ? Math.round(odds * 100) / 100
    : null;
}

function canonicaliseKambiMarketName(market: Record<string, unknown>): string | null {
  const rawName = String(market.name ?? market.canonicalName ?? '').trim();
  const canonicalName = String(market.canonicalName ?? market.name ?? '').trim();
  const lower = `${rawName} ${canonicalName}`.toLowerCase();
  const selections = market.selections as Array<Record<string, unknown>> | undefined;

  if (!rawName && !canonicalName) {
    return null;
  }

  if (lower.includes('handicap')) {
    return rawName || canonicalName || 'Handicap';
  }

  if (
    lower.includes('fulltime') ||
    lower.includes('full time') ||
    lower.includes('match result') ||
    lower.includes('resultado final') ||
    lower.includes('1x2') ||
    lower.includes('3way') ||
    lower.includes('moneyline') ||
    lower.includes('money line') ||
    lower.includes('home/away') ||
    lower.includes('match winner') ||
    lower.includes('winner') ||
    lower.includes('vencedor do jogo') ||
    lower.includes('vencedor da partida')
  ) {
    return '1X2';
  }

  if (lower.includes('double chance') || lower.includes('hipótese dupla') || lower.includes('hipotese dupla')) {
    return 'Double Chance';
  }

  if (lower.includes('both teams') || lower.includes('ambas as equipas marcam')) {
    return 'BTTS';
  }

  if (
    lower.includes('total goals') ||
    lower.includes('over/under') ||
    lower.includes('total de golos') ||
    lower.includes('total points') ||
    lower.includes('pontos totais') ||
    lower.includes('total games') ||
    lower.includes('total de jogos')
  ) {
    const line = Array.isArray(selections)
      ? selections
          .map((selection) => String(selection.handicapLabel ?? selection.marketHcap ?? '').trim())
          .find(Boolean)
      : '';

    return line ? `Over/Under ${line}` : 'Over/Under';
  }

  return rawName || canonicalName || null;
}

function canonicaliseKambiSelectionLabel(
  marketName: string,
  selection: Record<string, unknown>,
  homeTeam: string,
  awayTeam: string,
): string | null {
  const rawLabel = String(selection.shortName ?? selection.name ?? selection.label ?? '').replace(/\s+/g, ' ').trim();
  const type = String(selection.type ?? '').trim().toUpperCase();
  const canonical = String(selection.canonicalName ?? '').trim().toLowerCase();

  if (marketName === '1X2') {
    if (type === '1' || type === 'P1' || rawLabel === '1' || rawLabel === homeTeam || canonical === homeTeam.toLowerCase()) return '1';
    if (type === 'X' || /^empate$/i.test(rawLabel) || rawLabel === 'X') return 'X';
    if (type === '2' || type === 'P2' || rawLabel === '2' || rawLabel === awayTeam || canonical === awayTeam.toLowerCase()) return '2';
  }

  if (marketName === 'Double Chance') {
    if (type === '1X' || /^1\s*\/\s*X$/i.test(rawLabel) || /draw/i.test(canonical) && canonical.includes(homeTeam.toLowerCase())) return '1X';
    if (type === '12' || /^1\s*\/\s*2$/i.test(rawLabel)) return '12';
    if (type === 'X2' || /^X\s*\/\s*2$/i.test(rawLabel) || /draw/i.test(canonical) && canonical.includes(awayTeam.toLowerCase())) return 'X2';
  }

  if (marketName === 'BTTS') {
    if (type === 'Y' || canonical === 'yes' || /^sim$/i.test(rawLabel)) return 'Sim';
    if (type === 'N' || canonical === 'no' || /^n[ãa]o$/i.test(rawLabel)) return 'Não';
  }

  if (marketName.startsWith('Over/Under')) {
    if (type === 'O' || canonical.startsWith('over') || /^mais de/i.test(rawLabel)) return 'Over';
    if (type === 'U' || canonical.startsWith('under') || /^menos de/i.test(rawLabel)) return 'Under';
  }

  return rawLabel || null;
}

function parseKambiLinkedMarket(
  market: Record<string, unknown>,
  homeTeam: string,
  awayTeam: string,
): ScrapedMarket | null {
  const marketName = canonicaliseKambiMarketName(market);
  if (!marketName) {
    return null;
  }

  const selections = market.selections as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(selections) || selections.length < 2) {
    return null;
  }

  const deduped = new Map<string, number>();
  for (const selection of selections) {
    const label = canonicaliseKambiSelectionLabel(marketName, selection, homeTeam, awayTeam);
    const odds = parseKambiSelectionOdds(selection);
    if (!label || odds == null) {
      continue;
    }
    deduped.set(label, odds);
  }

  const parsedSelections = Array.from(deduped.entries()).map(([selection, value]) => ({ selection, value }));
  if (marketName === '1X2') {
    const labels = new Set(parsedSelections.map((selection) => selection.selection));
    const hasThreeWay = labels.has('1') && labels.has('X') && labels.has('2');
    const hasTwoWay = labels.has('1') && labels.has('2') && !labels.has('X');
    if (!hasThreeWay && !hasTwoWay) {
      return null;
    }
  } else if (parsedSelections.length < 2) {
    return null;
  }

  return {
    market: marketName,
    selections: parsedSelections,
  };
}

// ��������� API Response Fallback Parser ���������������������������������������������������������������������������������������������������������������������������������������

/**
 * Heuristic parser that extracts football events from intercepted JSON API responses.
 *
 * Betting sites (Betano/Kaizen, Bet365, etc.) return event data in varied JSON
 * shapes. This function recursively searches the JSON for arrays of objects that
 * look like football events (having team names, odds, and dates) and normalises
 * them into ScrapedEvent[].
 */

/**
 * Canonicalize a Betano danae market name to the standard internal name.
 * Mirrors the logic in `canonicaliseKambiMarketName` for Kambi sites.
 */
function canonicaliseDanaeMarketName(rawName: string, mkt: Record<string, unknown>): string {
  const lower = rawName.toLowerCase();
  if (
    lower.includes('vencedor da partida') ||
    lower.includes('vencedor do jogo') ||
    lower.includes('match winner') ||
    lower.includes('resultado final') ||
    lower.includes('1x2') ||
    lower.includes('moneyline') ||
    lower.includes('home/away') ||
    lower.includes('winner')
  ) {
    return '1X2';
  }
  if (lower.includes('dupla chance') || lower.includes('double chance') || lower.includes('hipótese dupla')) {
    return 'Double Chance';
  }
  if (lower.includes('ambas as equipa') || lower.includes('both teams') || lower.includes('btts')) {
    return 'BTTS';
  }
  if (lower.includes('total') || lower.includes('mais/menos') || lower.includes('over') || lower.includes('under')) {
    // Extract the line value from market metadata
    const lineVal = typeof mkt.line === 'number' ? String(mkt.line / 1000) :
                    typeof mkt.handicap === 'string' ? mkt.handicap : '';
    return lineVal ? `Over/Under ${lineVal}` : 'Over/Under';
  }
  if (lower.includes('handicap') || lower.includes('desvantagem')) {
    return rawName;
  }
  return rawName;
}

/**
 * Canonicalize a Betano danae selection label for a given market.
 * Maps team names to "1"/"2" for 1X2 markets; returns raw label for others.
 */
function canonicaliseDanaeSelectionLabel(
  marketName: string,
  rawLabel: string,
  homeTeam: string,
  awayTeam: string,
): string {
  if (marketName === '1X2') {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const labelNorm = norm(rawLabel);
    const homeNorm = norm(homeTeam);
    const awayNorm = norm(awayTeam);

    if (labelNorm === homeNorm || homeNorm.includes(labelNorm) || labelNorm.includes(homeNorm)) return '1';
    if (labelNorm === awayNorm || awayNorm.includes(labelNorm) || labelNorm.includes(awayNorm)) return '2';
    if (/^empate$|^draw$|^x$/i.test(rawLabel.trim())) return 'X';
    // If label looks like a position marker
    if (/^(home|casa|1|p1)$/i.test(rawLabel.trim())) return '1';
    if (/^(away|fora|2|p2)$/i.test(rawLabel.trim())) return '2';
  }
  if (marketName === 'Double Chance') {
    if (/^1\s*[\/x]\s*x|^1\s*ou\s*empate/i.test(rawLabel)) return '1X';
    if (/^1\s*[\/x]\s*2/i.test(rawLabel)) return '12';
    if (/^x\s*[\/x]\s*2|^empate\s*ou\s*2/i.test(rawLabel)) return 'X2';
  }
  if (marketName === 'BTTS') {
    if (/^sim$|^yes$/i.test(rawLabel.trim())) return 'Sim';
    if (/^n[ãa]o$|^no$/i.test(rawLabel.trim())) return 'Não';
  }
  if (marketName.startsWith('Over/Under')) {
    if (/^mais|^over/i.test(rawLabel.trim())) return 'Over';
    if (/^menos|^under/i.test(rawLabel.trim())) return 'Under';
  }
  return rawLabel;
}

/**
 * Parses Betano's danae-webapi live overview response.
 *
 * URL: /danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=7
 *
 * The response is a fully normalised store: top-level `events`, `markets`, and
 * `selections` objects keyed by ID, plus `leagues` and `sports` metadata.
 * All events in the live overview endpoint are genuine in-play events (`isLive: true`).
 * Note: the danae `willGoLive` flag is unrelated to the pre-match flag with the same
 * name on the regular sports-page API — it does not indicate a pre-match event here.
 */
function tryParseBetanoDanaeApi(siteLabel: string, body: unknown): ScrapedEvent[] {
  if (!body || typeof body !== 'object') return [];
  const d = body as Record<string, unknown>;

  // Detect danae format by requiring all five top-level normalized stores
  if (
    typeof d.events !== 'object' || d.events === null ||
    typeof d.markets !== 'object' || d.markets === null ||
    typeof d.selections !== 'object' || d.selections === null ||
    typeof d.sports !== 'object' || d.sports === null ||
    typeof d.leagues !== 'object' || d.leagues === null
  ) return [];

  // Confirm it's not an array-shaped response (Kambi-style)
  if (Array.isArray(d.events) || Array.isArray(d.markets)) return [];

  const events = d.events as Record<string, unknown>;
  const markets = d.markets as Record<string, unknown>;
  const selections = d.selections as Record<string, unknown>;
  const leagues = d.leagues as Record<string, unknown>;

  const results: ScrapedEvent[] = [];

  for (const eventId of Object.keys(events)) {
    const ev = events[eventId] as Record<string, unknown>;

    // Map danae sportId to our Sport enum
    const danaeToSport: Record<string, Sport> = {
      FOOT: 'FOOTBALL' as Sport,
      BASK: 'BASKETBALL' as Sport,
      TENN: 'TENNIS' as Sport,
    };
    const sport = danaeToSport[String(ev.sportId)];
    if (!sport) continue;

    const participants = ev.participants as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(participants) || participants.length < 2) continue;

    // isHome: true = home team; fall back to order if flag missing
    const home = participants.find((p) => p.isHome === true) ?? participants[0]!;
    const away = participants.find((p) => p !== home) ?? participants[1]!;

    const homeTeam = String(home.name ?? '').trim();
    const awayTeam = String(away.name ?? '').trim();
    if (!homeTeam || !awayTeam) continue;

    // startTime is Unix ms
    const startTime = typeof ev.startTime === 'number' ? new Date(ev.startTime) : new Date();

    // Scores and live clock
    const liveData = ev.liveData as Record<string, unknown> | undefined;
    let homeScore: number | undefined;
    let awayScore: number | undefined;
    let liveClock: string | undefined;

    if (liveData) {
      const score = liveData.score as Record<string, string> | undefined;
      if (score) {
        const h = parseInt(String(score.home ?? ''), 10);
        const a = parseInt(String(score.away ?? ''), 10);
        if (!isNaN(h) && !isNaN(a)) { homeScore = h; awayScore = a; }
      }
      const clock = liveData.clock as Record<string, number> | undefined;
      if (clock && typeof clock.secondsSinceStart === 'number') {
        liveClock = `${Math.floor(clock.secondsSinceStart / 60)}'`;
      }
    }

    // Markets → selections
    const marketIdList = ev.marketIdList as number[] | undefined;
    const scrapedMarkets: ScrapedEvent['markets'] = [];

    if (Array.isArray(marketIdList)) {
      for (const mktId of marketIdList) {
        const mkt = markets[String(mktId)] as Record<string, unknown> | undefined;
        if (!mkt) continue;

        // Skip suspended/inactive markets
        const mktStatus = String(mkt.status ?? mkt.tradingStatus ?? '').toLowerCase();
        if (mktStatus === 'suspended' || mktStatus === 'blocked' || mkt.isActive === false) continue;

        const rawMarketName = String(mkt.name ?? mkt.type ?? mktId);
        // Canonicalize market name to standard internal names
        const marketName = canonicaliseDanaeMarketName(rawMarketName, mkt);

        const selectionIdList = mkt.selectionIdList as number[] | undefined;
        if (!Array.isArray(selectionIdList)) continue;

        const parsedSelections: Array<{ selection: string; value: number }> = [];
        for (const selId of selectionIdList) {
          const sel = selections[String(selId)] as Record<string, unknown> | undefined;
          if (!sel) continue;

          // Skip suspended/inactive selections
          const selStatus = String(sel.status ?? sel.tradingStatus ?? '').toLowerCase();
          if (selStatus === 'suspended' || selStatus === 'blocked' || sel.isActive === false) continue;

          const price = typeof sel.price === 'number' ? sel.price : parseFloat(String(sel.price ?? ''));
          if (!isFinite(price) || price <= 1) continue;

          // Canonicalize selection label for match-winner markets
          const rawLabel = String(sel.name ?? selId);
          const label = canonicaliseDanaeSelectionLabel(marketName, rawLabel, homeTeam, awayTeam);
          parsedSelections.push({ selection: label, value: price });
        }

        // Deduplicate by label, keeping highest price
        const deduped = new Map<string, number>();
        for (const { selection, value } of parsedSelections) {
          const existing = deduped.get(selection);
          if (existing == null || value > existing) deduped.set(selection, value);
        }
        const finalSelections = Array.from(deduped.entries()).map(([selection, value]) => ({ selection, value }));

        if (marketName === '1X2') {
          const labels = new Set(finalSelections.map((s) => s.selection));
          const valid = (labels.has('1') && labels.has('2')) ||
                        (labels.has('1') && labels.has('X') && labels.has('2'));
          if (!valid) continue;
        }

        if (finalSelections.length > 0) {
          scrapedMarkets.push({ market: marketName, selections: finalSelections });
        }
      }
    }

    if (scrapedMarkets.length === 0) continue;

    // League name from normalised leagues store
    const leagueId = ev.leagueId;
    const leagueEntry = leagueId != null
      ? leagues[String(leagueId)] as Record<string, unknown> | undefined
      : undefined;
    const defaultLeague = sport === ('FOOTBALL' as Sport) ? 'Futebol' : sport === ('BASKETBALL' as Sport) ? 'Basketball' : 'Tennis';
    const league = leagueEntry ? String(leagueEntry.name ?? defaultLeague) : defaultLeague;

    results.push({
      externalId: String(ev.id ?? eventId),
      sport,
      league,
      homeTeam,
      awayTeam,
      eventDate: startTime,
      isLive: true, // all events in /live/overview/latest are in-play
      homeScore,
      awayScore,
      liveClock,
      markets: scrapedMarkets,
    });
  }

  logger.info(`${siteLabel}: danae live API parsed ${results.length} live events`);
  return results;
}

/**
 * Parses Kambi pre-fetch responses (used by Placard and other Kambi-powered sites).
 * Kambi stores events and markets in separate top-level arrays linked by ID.
 */
function tryParseKambiPreFetch(body: unknown, defaultSport?: Sport): ScrapedEvent[] {
  if (!body || typeof body !== 'object') return [];
  const root = body as Record<string, unknown>;

  // Kambi CDN pre-fetch returns events/markets as objects with numeric keys
  // (e.g. { "0": {...}, "1": {...} }) while offering API returns arrays.
  // Normalise both shapes to arrays.
  const rawEvents = root.events;
  const rawMarkets = root.markets;
  const eventsArr: unknown[] = Array.isArray(rawEvents)
    ? rawEvents
    : (rawEvents && typeof rawEvents === 'object' ? Object.values(rawEvents) : []);
  const marketsArr: unknown[] = Array.isArray(rawMarkets)
    ? rawMarkets
    : (rawMarkets && typeof rawMarkets === 'object' ? Object.values(rawMarkets) : []);
  if (eventsArr.length === 0) return [];

  // Quick structural check: Kambi events have className, sportId, marketLines
  const sample = eventsArr[0] as Record<string, unknown>;
  if (!('className' in sample) && !('sportId' in sample)) return [];

  // Build market lookup: id → market object
  const marketMap = new Map<string, Record<string, unknown>>();
  for (const m of marketsArr) {
    const mkt = m as Record<string, unknown>;
    if (mkt.id) marketMap.set(String(mkt.id), mkt);
  }

  const results: ScrapedEvent[] = [];
  const teamSplitRe = /\s+(?:v|vs|x|@|[-–—])\s+/i;
  const atSeparatorRe = /\s+@\s+/;

  for (const rawEv of eventsArr) {
    try {
      const ev = rawEv as Record<string, unknown>;
      const name = String(ev.name ?? '');
      const sportId = String(ev.sportId ?? '').toLowerCase();

      // Map Kambi sportId to our Sport enum
      let eventSport: Sport;
      if (sportId === 'soccer' || sportId === 'football') {
        eventSport = Sport.FOOTBALL;
      } else if (sportId === 'basketball') {
        eventSport = Sport.BASKETBALL;
      } else if (sportId === 'tennis') {
        eventSport = Sport.TENNIS;
      } else if (sportId) {
        // Unknown sport — skip
        continue;
      } else {
        // No sportId — use default or FOOTBALL
        eventSport = defaultSport ?? Sport.FOOTBALL;
      }

      const parts = name.split(teamSplitRe);
      if (parts.length < 2) continue;

      const first = parts[0]!.trim();
      const second = parts.slice(1).join(' ').trim();
      if (!first || !second) continue;
      // "@" format is American: "Away @ Home" — swap to our home/away convention
      const homeTeam = atSeparatorRe.test(name) ? second : first;
      const awayTeam = atSeparatorRe.test(name) ? first : second;

      // Build league from the most specific source available.
      // Kambi pre-fetch events carry:
      //   - typeName: specific league (e.g. "Portugal - Primeira Liga", "Bundesliga")
      //   - className: broad region/continent (e.g. "Europa", "Alemanha")
      //   - path[]: detailed hierarchy (only in offering API, not pre-fetch)
      //   - group/groupName: occasionally present
      let league = 'Futebol';
      const typeName = typeof ev.typeName === 'string' ? ev.typeName.trim() : '';
      const className = typeof ev.className === 'string' ? ev.className.trim() : '';

      if (typeName) {
        // typeName is the most specific league name (e.g. "Portugal - Primeira Liga", "La Liga")
        // If it already contains a country/region separator, use it directly.
        // Otherwise combine with className: "Alemanha - Bundesliga"
        if (typeName.includes(' - ') || typeName.includes('/')) {
          league = typeName;
        } else if (className && className !== typeName) {
          league = `${className} - ${typeName}`;
        } else {
          league = typeName;
        }
      } else if (className) {
        // Fallback: try path or group fields (available in offering API responses)
        const pathArr = ev.path as Array<{ name?: string; englishName?: string }> | undefined;
        if (Array.isArray(pathArr) && pathArr.length >= 3) {
          const country = pathArr[1]?.name ?? pathArr[1]?.englishName ?? '';
          const leagueParts = pathArr.slice(2).map((p) => p.name ?? p.englishName ?? '').filter(Boolean);
          if (country && leagueParts.length > 0) {
            league = `${country} - ${leagueParts.join(' ')}`;
          } else if (country) {
            league = country;
          } else {
            league = className;
          }
        } else {
          const group = ev.group ?? ev.groupName ?? ev.categoryName;
          const groupStr = typeof group === 'string' ? group.trim() : '';
          if (groupStr && groupStr !== className) {
            league = `${groupStr} - ${className}`;
          } else {
            league = className;
          }
        }
      }

      const marketLines = ev.marketLines as Record<string, { id?: string }> | undefined;
      const parsedMarkets: ScrapedMarket[] = [];
      const seenMarketNames = new Set<string>();
      if (marketLines) {
        for (const marketLine of Object.values(marketLines)) {
          const linkedId = String(marketLine?.id ?? '');
          const linkedMarket = marketMap.get(linkedId);
          if (!linkedMarket) {
            continue;
          }

          const parsedMarket = parseKambiLinkedMarket(linkedMarket, homeTeam, awayTeam);
          if (!parsedMarket || seenMarketNames.has(parsedMarket.market)) {
            continue;
          }

          seenMarketNames.add(parsedMarket.market);
          parsedMarkets.push(parsedMarket);
        }
      }

      // Try to extract event date
      let eventDate: Date;
      const startTs = ev.startTime ?? ev.start ?? ev.startDate ?? ev.lastModified;
      if (typeof startTs === 'string') {
        eventDate = new Date(startTs);
      } else if (typeof startTs === 'number') {
        eventDate = new Date(startTs > 1e12 ? startTs : startTs * 1000);
      } else {
        // Kambi events may not have start time in pre-fetch; use lastModified as fallback
        eventDate = new Date();
      }

      if (isNaN(eventDate.getTime())) continue;

      // Detect live status and scores from Kambi data
      const kambiDetails = ev.details as Record<string, unknown> | undefined;
      const kambiState = String(ev.state ?? ev.status ?? '').toLowerCase();
      const kambiIsLive =
        kambiDetails?.inPlay === true ||
        kambiState === 'started' ||
        kambiState === 'live' ||
        kambiState === 'inprogress' ||
        kambiState === 'active';
      let kambiHomeScore: number | null = null;
      let kambiAwayScore: number | null = null;
      let kambiLiveClock: string | null = null;
      if (kambiIsLive) {
        const scoreSources = [
          ev.score,
          kambiDetails?.score,
          kambiDetails?.totalScores,
        ];

        for (const source of scoreSources) {
          const score = source as Record<string, unknown> | undefined;
          if (!score) {
            continue;
          }
          const h = Number(score.home ?? score.homeScore ?? score['1'] ?? NaN);
          const a = Number(score.away ?? score.awayScore ?? score['2'] ?? NaN);
          if (!isNaN(h) && !isNaN(a)) {
            kambiHomeScore = h;
            kambiAwayScore = a;
            break;
          }
        }

        const rawSeconds = Number((kambiDetails?.timeInformation as Record<string, unknown> | undefined)?.time ?? NaN);
        if ((kambiDetails?.isClockRunning as boolean | undefined) === false) {
          kambiLiveClock = 'Int.';
        } else if (Number.isFinite(rawSeconds) && rawSeconds > 0) {
          kambiLiveClock = `${Math.floor(rawSeconds / 60)}'`;
        }
      }
      results.push({
        externalId: String(ev.id ?? `${homeTeam}__${awayTeam}`),
        sport: eventSport,
        league,
        homeTeam: homeTeam.replace(/\s+/g, ' ').trim(),
        awayTeam: awayTeam.replace(/\s+/g, ' ').trim(),
        eventDate,
        markets: parsedMarkets,
        isLive: kambiIsLive,
        homeScore: kambiHomeScore,
        awayScore: kambiAwayScore,
        liveClock: kambiLiveClock,
      });
    } catch {
      // Skip unparseable events
    }
  }

  return results;
}

function parseApiResponses(
  siteLabel: string,
  responses: Array<{ url: string; body: unknown }>,
): ScrapedEvent[] {
  const events: ScrapedEvent[] = [];
  const seenKeys = new Set<string>();

  for (const { url, body } of responses) {
    try {
      // ── Betano danae live API: normalised events/markets/selections stores ──
      const danaeEvents = tryParseBetanoDanaeApi(siteLabel, body);
      if (danaeEvents.length > 0) {
        for (const ev of danaeEvents) {
          const key = `${ev.homeTeam}__${ev.awayTeam}__${ev.eventDate.toISOString().slice(0, 16)}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          events.push(ev);
        }
        continue; // skip generic parsing for this response
      }

      // ── Kambi pre-fetch: events + markets in separate top-level arrays ──
      const kambiEvents = tryParseKambiPreFetch(body);
      if (kambiEvents.length > 0) {
        for (const ev of kambiEvents) {
          const key = `${ev.homeTeam}__${ev.awayTeam}__${ev.eventDate.toISOString().slice(0, 16)}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          events.push(ev);
        }
        continue; // skip generic parsing for this response
      }

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

function parseHtmlFallback(siteLabel: string, html: string): ScrapedEvent[] {
  if (!html) {
    return [];
  }

  const responses: Array<{ url: string; body: unknown }> = [];

  const betanoInitialState = html.match(/window\["initial_state"\]\s*=\s*(\{[\s\S]*?\})\s*<\/script>/i);
  if (betanoInitialState?.[1]) {
    try {
      responses.push({
        url: 'html:betano:initial_state',
        body: JSON.parse(betanoInitialState[1]),
      });
    } catch {
      logger.debug(`${siteLabel}: failed to parse embedded Betano initial_state`);
    }
  }

  if (responses.length === 0) {
    return [];
  }

  const events = parseApiResponses(siteLabel, responses);
  logger.debug(`${siteLabel}: HTML fallback found ${events.length} unique events from ${responses.length} payloads`);
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
    // Check if this array contains event-like objects.
    // Accept arrays with 1+ event-like items (e.g. a single-event block/league).
    const eventLikeCount = value.filter((item) => isEventLikeObject(item)).length;
    if (eventLikeCount >= 1) {
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

  // ��������� Extract teams ������������������������������������������������������������������������������������������������������������������������������������������������������
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

  // Pattern: { name: "Team A - Team B" } or { name: "Team A vs Team B" } or { name: "Team A @ Team B" }
  if (!homeTeam || !awayTeam) {
    const name = String(o.name ?? o.eventName ?? o.matchName ?? '');
    const match = name.match(/^(.+?)\s*(?:[-–—@]|vs\.?)\s*(.+)$/i);
    if (match) {
      const first = match[1]!.trim();
      const second = match[2]!.trim();
      // "@" format is American: "Away @ Home" — swap to our home/away convention
      if (/\s+@\s+/.test(name)) {
        homeTeam = second;
        awayTeam = first;
      } else {
        homeTeam = first;
        awayTeam = second;
      }
    }
  }

  if (!homeTeam || !awayTeam) return null;

  // ��������� Extract date ���������������������������������������������������������������������������������������������������������������������������������������������������������
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

  // ��������� Extract league ���������������������������������������������������������������������������������������������������������������������������������������������������
  let league = 'Futebol';
  // Prefer leagueDescription (e.g. "Jogos de Qualificação - Europa - Play-off")
  // over leagueName (e.g. "Mundial 2026") for more descriptive naming.
  const leagueVal = o.leagueDescription ?? o.league ?? o.leagueName ?? o.competitionName ?? o.competition ??
    o.tournamentName ?? o.tournament ?? o.categoryName ?? o.category;
  if (typeof leagueVal === 'string' && leagueVal.length > 2) {
    league = leagueVal;
  } else if (leagueVal && typeof leagueVal === 'object') {
    const l = leagueVal as Record<string, unknown>;
    const lName = String(l.name ?? l.displayName ?? '');
    if (lName.length > 2) league = lName;
  }

  // Try to enrich league with region from URL path
  // e.g. /sport/futebol/portugal/primeira-liga/ ��� "Portugal - Primeira Liga"
  if (league !== 'Futebol') {
    const regionVal = o.regionName ?? o.countryName ?? o.region ?? o.country;
    if (typeof regionVal === 'string' && regionVal.length > 1 && !league.toLowerCase().includes(regionVal.toLowerCase())) {
      league = `${regionVal} - ${league}`;
    }
  }

  // ��������� Extract odds (1X2 market) ������������������������������������������������������������������������������������������������������������������
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

  // Infer sport from the source URL when the URL contains a sport hint.
  // This allows basketball/tennis events fetched via sport-specific API
  // endpoints (e.g. /api/sports/events/?sport=BASKETBALL) to be tagged
  // with the correct sport even though tryParseApiEvent has no sport param.
  let inferredSport: Sport = Sport.FOOTBALL;
  const urlUpper = sourceUrl.toUpperCase();
  if (urlUpper.includes('BASKETBALL') || urlUpper.includes('BASQUETEBOL')) {
    inferredSport = Sport.BASKETBALL;
  } else if (urlUpper.includes('TENNIS') || urlUpper.includes('TENIS')) {
    inferredSport = Sport.TENNIS;
  }

  // Detect live status from common API fields.
  // Betano sets willGoLive:true on pre-match events shown on its /live/ page —
  // these are upcoming fixtures available for in-play betting once the match
  // starts, NOT currently live. Exclude them so they don't get promoted to LIVE.
  const willGoLive = o.willGoLive === true;
  const isLive =
    !willGoLive && (
      o.isLive === true ||
      o.inPlay === true ||
      o.inplay === true ||
      o.isInPlay === true ||
      String(o.status ?? o.eventStatus ?? o.matchStatus ?? '').toLowerCase() === 'live' ||
      String(o.status ?? o.eventStatus ?? o.matchStatus ?? '').toLowerCase() === 'inplay' ||
      String(o.status ?? o.eventStatus ?? o.matchStatus ?? '').toLowerCase() === 'in_play'
    );

  return {
    externalId,
    sport: inferredSport,
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
      // Only look at 1X2 / Match Result / Match Winner / Moneyline markets
      if (mName && !/(1x2|match.?result|full.?time|vencedor|resultado|match.?winner|winner|moneyline|home\/away)/i.test(mName)) continue;
      const sels = (m.selections ?? m.outcomes ?? m.odds ?? m.prices) as unknown[] | undefined;
      if (!Array.isArray(sels) || sels.length < 2) continue;
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
      // 2-way market (basketball, tennis): home + away only, no draw
      if (extracted.length === 2) {
        return [
          { selection: '1', value: extracted[0]!.value },
          { selection: '2', value: extracted[1]!.value },
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
    // 2-way: home + away only (basketball, tennis)
    if (Number.isFinite(home) && home >= 1.01 && Number.isFinite(away) && away >= 1.01) {
      return [
        { selection: '1', value: home },
        { selection: '2', value: away },
      ];
    }
  }

  // Pattern 3: { odds: [number, number, number] } or { odds: [number, number] } for 2-way
  if (Array.isArray(o.odds) && o.odds.length >= 2) {
    const vals = o.odds.map(Number);
    if (vals.length >= 3 && vals.slice(0, 3).every((v) => Number.isFinite(v) && v >= 1.01)) {
      return [
        { selection: '1', value: vals[0]! },
        { selection: 'X', value: vals[1]! },
        { selection: '2', value: vals[2]! },
      ];
    }
    // 2-way market (basketball, tennis)
    if (vals.length === 2 && vals.every((v) => Number.isFinite(v) && v >= 1.01)) {
      return [
        { selection: '1', value: vals[0]! },
        { selection: '2', value: vals[1]! },
      ];
    }
  }

  // Pattern 4: { mainMarket: { selections/outcomes: [...] } }
  const mainMarket = o.mainMarket as Record<string, unknown> | undefined;
  if (mainMarket && typeof mainMarket === 'object') {
    const sels = (mainMarket.selections ?? mainMarket.outcomes) as unknown[] | undefined;
    if (Array.isArray(sels) && sels.length >= 2) {
      const values = sels.map((s) => {
        if (!s || typeof s !== 'object') return NaN;
        const sel = s as Record<string, unknown>;
        return Number(sel.price ?? sel.odds ?? sel.value ?? sel.decimal);
      });
      if (values.length >= 3 && values.slice(0, 3).every((v) => Number.isFinite(v) && v >= 1.01)) {
        return [
          { selection: '1', value: values[0]! },
          { selection: 'X', value: values[1]! },
          { selection: '2', value: values[2]! },
        ];
      }
      // 2-way market (basketball, tennis)
      if (values.length === 2 && values.every((v) => Number.isFinite(v) && v >= 1.01)) {
        return [
          { selection: '1', value: values[0]! },
          { selection: '2', value: values[1]! },
        ];
      }
    }
  }

  return null;
}
