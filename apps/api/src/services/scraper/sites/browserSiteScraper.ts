import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteerCore, { type HTTPRequest, type Page } from 'puppeteer-core';
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

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
];

interface RawEventData {
  externalId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDateIso: string;
  home: string;
  draw: string;
  away: string;
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
  waitForSelector?: string;
  acceptLanguage?: string;
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
    browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
      headless: true,
      args: BROWSER_ARGS,
    });

    const page = await browser.newPage();

    await page.setUserAgent(randomUA());
    await page.setExtraHTTPHeaders({
      'Accept-Language': config.acceptLanguage ?? 'pt-PT,pt;q=0.9,en;q=0.8',
    });
    await page.setViewport({ width: 1366, height: 768 });

    await page.setRequestInterception(true);
    page.on('request', (request: HTTPRequest) => {
      const type = request.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    logger.debug(`${config.siteLabel}: navigating to ${config.footballUrl}`);
    await page.goto(config.footballUrl, {
      waitUntil: 'networkidle2',
      timeout: 45_000,
    });

    await randomDelay();
    await dismissCookieConsent(page, config);
    await randomDelay(300, 800);

    try {
      await page.waitForSelector(config.waitForSelector ?? config.eventSelectors.join(', '), {
        timeout: 20_000,
      });
    } catch {
      logger.warn(`${config.siteLabel}: event list selector not found — page may have changed structure`);
      await browser.close();
      return [];
    }

    await scrollDown(page);
    await randomDelay(500, 1200);

    const rawEvents = await extractEvents(page, config);
    logger.info(`${config.siteLabel}: extracted ${rawEvents.length} raw events`);

    const events = parseRawEvents(config.siteLabel, rawEvents);
    await browser.close();
    return events;
  } catch (error) {
    logger.error(`${config.siteLabel}: uncaught error`, {
      error: error instanceof Error ? error.message : String(error),
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
  return page.evaluate((pageConfig): RawEventData[] => {
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
      let node: Element | null = item;
      while (node) {
        const leagueNode = queryFromSelectors(node, pageConfig.leagueSelectors)[0];
        if (leagueNode) {
          return textContent(leagueNode.textContent) || 'Futebol';
        }
        node = node.parentElement;
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

        results.push({
          externalId,
          league: getLeague(item),
          homeTeam,
          awayTeam,
          eventDateIso,
          home: oddTexts[0] ?? '',
          draw: oddTexts[1] ?? '',
          away: oddTexts[2] ?? '',
        });
      } catch {
        // Never throw from page context.
      }
    }

    return results;
  }, config);
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