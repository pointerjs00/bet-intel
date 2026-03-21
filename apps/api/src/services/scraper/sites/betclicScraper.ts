/**
 * Betclic Portugal scraper — https://www.betclic.pt
 *
 * Uses puppeteer-extra + stealth plugin to scrape football events and 1X2 odds
 * from Betclic's JavaScript-rendered SPA (Angular).
 *
 * Anti-detection measures:
 * - puppeteer-extra-plugin-stealth (removes headless signals)
 * - Random User-Agent rotation per browser session
 * - Random inter-action delays (500 – 2000 ms)
 * - PUPPETEER_EXECUTABLE_PATH env var → system Chromium in Docker
 */

import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import puppeteerCore from 'puppeteer-core';
import type { HTTPRequest, Page } from 'puppeteer-core';
import { Sport } from '@betintel/shared';
import { logger } from '../../../utils/logger';
import type { IScraper, ScrapedEvent, ScrapedMarket } from '../types';

// Wrap puppeteer-core with the puppeteer-extra plugin system
const puppeteer = addExtra(puppeteerCore as Parameters<typeof addExtra>[0]);
puppeteer.use(StealthPlugin());

// ─── Configuration ────────────────────────────────────────────────────────────

const FOOTBALL_URL = 'https://www.betclic.pt/futebol-s1';

/** Pool of real browser UA strings — one is picked at random per session */
const USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0',
];

/** Browser launch args suitable for Docker (runs as root in Alpine container) */
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
];

// ─── Internal types (DOM-serialisable — used inside page.evaluate()) ──────────

interface RawEventData {
  externalId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDateIso: string;
  /** Decimal odds as string (may use comma as decimal separator) */
  home: string;
  draw: string;
  away: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string;
}

/** Returns a promise that resolves after a random delay in the given range. */
function randomDelay(minMs = 500, maxMs = 2000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Converts a decimal-odds string (with possible comma separator) to a number. */
function parseOdds(raw: string): number {
  return parseFloat(raw.replace(',', '.').trim());
}

// ─── Scraper class ────────────────────────────────────────────────────────────

export class BetclicScraper implements IScraper {
  readonly siteSlug = 'betclic';
  readonly siteName = 'Betclic';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
        headless: true,
        args: BROWSER_ARGS,
      });

      const page = await browser.newPage();

      // Set rotating user-agent
      await page.setUserAgent(randomUA());

      // Realistic viewport
      await page.setViewport({ width: 1366, height: 768 });

      // Block heavy resources we don't need (images, fonts, media)
      await page.setRequestInterception(true);
      page.on('request', (req: HTTPRequest) => {
        const type = req.resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      logger.debug(`BetclicScraper: navigating to ${FOOTBALL_URL}`);
      await page.goto(FOOTBALL_URL, {
        waitUntil: 'networkidle2',
        timeout: 45_000,
      });

      // Random delay after page load — mimics human reading time
      await randomDelay();

      // Dismiss cookie consent banner if present
      await this.dismissCookieConsent(page);
      await randomDelay(300, 800);

      // Wait for event list to render (Angular hydration)
      try {
        await page.waitForSelector('sports-events-list, .sportEvent-list, [data-type="sport-event"]', {
          timeout: 20_000,
        });
      } catch {
        logger.warn('BetclicScraper: event list selector not found — page may have changed structure');
        await browser.close();
        return [];
      }

      // Scroll down to trigger lazy loading of more events
      await this.scrollDown(page);
      await randomDelay(500, 1200);

      // Extract raw event data from the DOM
      const rawEvents = await this.extractEvents(page);

      logger.info(`BetclicScraper: extracted ${rawEvents.length} raw events`);

      // Parse raw data into ScrapedEvent objects
      const events = this.parseRawEvents(rawEvents);

      await browser.close();
      return events;
    } catch (err) {
      logger.error('BetclicScraper: uncaught error', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      // Never let a scraper crash the queue — return empty array
      return [];
    }
  }

  // ─── Page interaction helpers ───────────────────────────────────────────────

  /** Tries to click the cookie consent accept button silently. */
  private async dismissCookieConsent(page: Page): Promise<void> {
    const selectors = [
      '[data-testid="cookie-accept"]',
      '[id*="cookie"] button[class*="accept"]',
      'button[class*="cookieConsent"]',
      '#onetrust-accept-btn-handler',
      '.cc-btn.cc-allow',
    ];
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          logger.debug('BetclicScraper: dismissed cookie consent');
          return;
        }
      } catch {
        // Silently skip missing elements
      }
    }
  }

  private async scrollDown(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight * 0.5, behavior: 'smooth' });
    });
    await randomDelay(400, 900);
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }

  /**
   * Runs inside the browser context to extract serialisable event data from the DOM.
   *
   * Betclic PT uses Angular custom elements. The selectors below target the most
   * stable structural patterns. Update selectors here when the site redesigns.
   *
   * Selector strategy (most specific → fallback):
   * - `sport-event-listitem`  — custom element wrapping each event row
   * - `[class*="event_"]`     — fallback class-pattern match
   * Teams:
   * - `[class*="scoreboard_team"]` → first=home, second=away
   * - `[class*="team_name"]` (fallback)
   * Date:
   * - `time[datetime]` → ISO string in the datetime attribute
   * - `[class*="startDate"]` → text content fallback
   * League:
   * - Nearest `[class*="competition_title"]` ancestor text (may not be on the item itself)
   * - Fallback: "Futebol"
   * Odds (1X2 — first three oddbutton/odd-value elements on the row):
   * - `oddbutton` custom element → text content
   * - `[class*="oddValue"]` / `[class*="odd_value"]` → fallback button patterns
   */
  private async extractEvents(page: Page): Promise<RawEventData[]> {
    return page.evaluate((): RawEventData[] => {
      const results: RawEventData[] = [];

      // Try in-order from most to least specific
      const itemSelectors = [
        'sport-event-listitem',
        '[class*="event_item"]',
        '[data-type="sport-event"]',
      ];

      let items: Element[] = [];
      for (const sel of itemSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          items = Array.from(found);
          break;
        }
      }

      const getLeague = (el: Element): string => {
        // Walk up to find the competition group header
        let node: Element | null = el;
        while (node) {
          const title =
            node.querySelector('[class*="competition_title"], [class*="competition-name"]') ??
            (node.matches('[class*="competition"]') ? node : null);
          if (title) return title.textContent?.trim() ?? 'Futebol';
          node = node.parentElement;
        }
        return 'Futebol';
      };

      items.forEach((item) => {
        try {
          // ── Teams ──────────────────────────────────────────────────────────
          const teamEls = item.querySelectorAll(
            '[class*="scoreboard_team"], [class*="team_name"], [class*="competitor-name"]',
          );
          if (teamEls.length < 2) return;

          const homeTeam = teamEls[0]?.textContent?.trim() ?? '';
          const awayTeam = teamEls[1]?.textContent?.trim() ?? '';
          if (!homeTeam || !awayTeam) return;

          // ── Date ───────────────────────────────────────────────────────────
          const timeEl = item.querySelector('time[datetime]');
          const dateAttr = timeEl?.getAttribute('datetime');
          let eventDateIso = dateAttr && dateAttr.length > 0
            ? dateAttr
            : (() => {
                // Fallback: look for a date text and try to parse it
                const dateTxt = item.querySelector(
                  '[class*="startDate"], [class*="eventDate"], [class*="date"]',
                )?.textContent?.trim();
                return dateTxt ? new Date(dateTxt).toISOString() : new Date().toISOString();
              })();

          // Validate the date string; if invalid, use now (event will be persisted but with wrong date)
          if (isNaN(new Date(eventDateIso).getTime())) {
            eventDateIso = new Date().toISOString();
          }

          // ── League ─────────────────────────────────────────────────────────
          const league = getLeague(item);

          // ── 1X2 Odds ──────────────────────────────────────────────────────
          // Betclic renders odds in `oddbutton` custom elements (or fallback spans)
          const oddEls = item.querySelectorAll(
            'oddbutton, [class*="oddValue"], [class*="odd_value"], [class*="bet-btn"]',
          );
          // First three are typically home / draw / away for 1X2
          const home = oddEls[0]?.textContent?.trim() ?? '';
          const draw = oddEls[1]?.textContent?.trim() ?? '';
          const away = oddEls[2]?.textContent?.trim() ?? '';

          if (!home || !draw || !away) return; // Skip events without visible odds

          // ── External ID ───────────────────────────────────────────────────
          const externalId =
            item.getAttribute('data-id') ??
            item.getAttribute('id') ??
            item.getAttribute('data-event-id') ??
            `${homeTeam}__${awayTeam}__${eventDateIso}`;

          results.push({ externalId, league, homeTeam, awayTeam, eventDateIso, home, draw, away });
        } catch {
          // Skip malformed rows — never throw inside evaluate()
        }
      });

      return results;
    });
  }

  // ─── Data parsing ───────────────────────────────────────────────────────────

  private parseRawEvents(raw: RawEventData[]): ScrapedEvent[] {
    const events: ScrapedEvent[] = [];

    for (const r of raw) {
      try {
        const homeOdds = parseOdds(r.home);
        const drawOdds = parseOdds(r.draw);
        const awayOdds = parseOdds(r.away);

        // Skip rows where the odds did not parse to valid numbers
        if ([homeOdds, drawOdds, awayOdds].some((v) => !Number.isFinite(v) || v < 1.01)) {
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
          externalId: r.externalId,
          sport: Sport.FOOTBALL,
          league: r.league || 'Futebol',
          homeTeam: r.homeTeam,
          awayTeam: r.awayTeam,
          eventDate: new Date(r.eventDateIso),
          markets,
        });
      } catch (err) {
        logger.debug('BetclicScraper: failed to parse raw event', {
          event: `${r.homeTeam} vs ${r.awayTeam}`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return events;
  }
}
