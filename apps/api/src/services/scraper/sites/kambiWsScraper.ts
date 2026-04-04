/**
 * Kambi WebSocket scraper — extracts event data by injecting STOMP
 * SUBSCRIBE frames into the Kambi widget's existing WebSocket connection.
 *
 * This approach yields the FULL event catalogue (≈167 events for Solverde,
 * ≈166 for Placard) with 1X2 odds, compared to the pre-fetch CDN which
 * only returns 16–75 events with partial market data.
 *
 * Flow:
 *   1. Hook WebSocket constructor via `evaluateOnNewDocument`
 *   2. Navigate to the soccer today/tomorrow page
 *   3. Capture eventGroups STOMP frame (all events with team names / leagues)
 *   4. Inject SUBSCRIBE frames for `/api/events/multi` with all event IDs
 *      → receives marketLine IDs for every event
 *   5. Inject SUBSCRIBE frames for each 1X2 market ID
 *      → receives full odds (selections with decimal prices)
 *   6. Convert to ScrapedEvent[]
 */

import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteerCore, { type HTTPRequest } from 'puppeteer-core';
import { Sport } from '@betintel/shared';
import { logger } from '../../../utils/logger';
import type { ScrapedEvent, ScrapedMarket } from '../types';

const puppeteer = addExtra(puppeteerCore as Parameters<typeof addExtra>[0]);
puppeteer.use(StealthPlugin());

const USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--lang=pt-PT',
  '--window-size=1366,768',
];

/** Batch size for events/multi SUBSCRIBE frames. */
const EVENT_BATCH_SIZE = 30;
/** Delay between sending market SUBSCRIBE frames (ms). */
const MARKET_SUBSCRIBE_DELAY_MS = 80;
/** Delay between batches of events/multi requests (ms). */
const BATCH_DELAY_MS = 400;
/** Time to wait for all events/multi responses (ms). */
const EVENTS_RESPONSE_WAIT_MS = 8000;
/** Time to wait for all market responses (ms). */
const MARKETS_RESPONSE_WAIT_MS = 15000;
/** Maximum time to wait for the eventGroups frame after page load (ms). */
const EVENTGROUPS_WAIT_MS = 20000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface KambiWsEvent {
  id: string;
  name: string;
  typeName: string;
  className: string;
  startTime: string;
  countryCode: string;
  /** Kambi state: 'NOT_STARTED', 'STARTED', etc. */
  state?: string;
  /** Current score object from Kambi, e.g. { home: 1, away: 0 } */
  score?: Record<string, unknown>;
  /** Kambi details blob (contains inPlay, timeInformation, isClockRunning, totalScores) */
  details?: Record<string, unknown>;
}

interface KambiWsMarket {
  id: string;
  name: string;
  canonicalName: string;
  type: string;
  selections: Array<{
    name: string;
    canonicalName: string;
    type: string;
    handicapLabel?: string;
    prices: Array<{ decimalLabel: string }>;
  }>;
}

export interface KambiWsConfig {
  siteLabel: string;
  /** Full URL for the sport page, e.g. https://www.solverde.pt/apostas/sports/soccer/matches/today */
  pageUrl: string;
  /** Sport enum to tag on returned events. Default: FOOTBALL. */
  sport?: Sport;
  /** Additional page URLs to visit in the same browser session (e.g. tomorrow, next days). */
  extraPageUrls?: string[];
  /** Selectors to click to dismiss entry gates / splash screens before the widget loads */
  preDismissSelectors?: string[];
  /** Extra ms to wait after dismissing splash screens */
  preWaitMs?: number;
  /**
   * CDN pre-fetch URL to supplement the WebSocket scrape.
   * After the page loop, this URL is fetched via HTTP to discover future-dated
   * events not loaded by the Kambi widget. Their market IDs are then resolved
   * via the still-open WebSocket connection.
   */
  cdnPrefetchUrl?: string;
}

// ─── STOMP frame parser ─────────────────────────────────────────────────────

function parseStompMessage(raw: string): { id: string; type: string; body: unknown } | null {
  const lines = raw.split('\n');
  if (lines[0] !== 'MESSAGE') return null;

  const headers: Record<string, string> = {};
  let bodyStart = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') { bodyStart = i + 1; break; }
    const colon = lines[i]!.indexOf(':');
    if (colon > 0) headers[lines[i]!.slice(0, colon)] = lines[i]!.slice(colon + 1);
  }
  if (bodyStart < 0) return null;

  let body = lines.slice(bodyStart).join('\n');
  if (body.endsWith('\0')) body = body.slice(0, -1);

  try {
    return { id: headers['id'] ?? '', type: headers['type'] ?? '', body: JSON.parse(body) };
  } catch {
    return null;
  }
}

// ─── Market conversion ──────────────────────────────────────────────────────

function convertWsMarketToScraped(
  mkt: KambiWsMarket,
  homeTeam: string,
  awayTeam: string,
): ScrapedMarket | null {
  const lower = `${mkt.name} ${mkt.canonicalName}`.toLowerCase();

  // Determine canonical market name
  let marketName: string | null = null;
  if (
    lower.includes('fulltime') || lower.includes('full time') ||
    lower.includes('match result') || lower.includes('resultado final') ||
    lower.includes('1x2') || lower.includes('3way') ||
    // Basketball / tennis: 2-way winner markets (no draw)
    lower.includes('home/away') || lower.includes('moneyline') ||
    lower.includes('match winner') || lower.includes('winner') ||
    lower.includes('vencedor do jogo') || lower.includes('vencedor da partida')
  ) {
    marketName = '1X2';
  } else if (lower.includes('double chance') || lower.includes('hipótese dupla') || lower.includes('hipotese dupla')) {
    marketName = 'Double Chance';
  } else if (lower.includes('both teams') || lower.includes('ambas as equipas marcam')) {
    marketName = 'BTTS';
  } else if (
    lower.includes('total goals') || lower.includes('over/under') || lower.includes('total de golos') ||
    // Basketball: total points; tennis: total games
    lower.includes('total points') || lower.includes('pontos totais') ||
    lower.includes('total games') || lower.includes('total de jogos')
  ) {
    const line = mkt.selections.map((s) => s.handicapLabel ?? '').find(Boolean)
      || mkt.selections.map((s) => s.name.match(/(\d+\.?\d*)/)?.[1] ?? '').find(Boolean);
    marketName = line ? `Over/Under ${line}` : 'Over/Under';
  } else if (lower.includes('handicap')) {
    marketName = mkt.name || mkt.canonicalName || 'Handicap';
  }

  if (!marketName) return null;

  const selections: Array<{ selection: string; value: number }> = [];
  for (const sel of mkt.selections) {
    const type = sel.type?.toUpperCase() ?? '';
    const odds = sel.prices?.[0]?.decimalLabel ? parseFloat(sel.prices[0].decimalLabel) : 0;
    if (!Number.isFinite(odds) || odds < 1.01) continue;

    let label: string | null = null;
    if (marketName === '1X2') {
      if (type === '1' || type === 'P1') label = '1';
      else if (type === 'X') label = 'X';
      else if (type === '2' || type === 'P2') label = '2';
    } else if (marketName === 'Double Chance') {
      if (type === '1X') label = '1X';
      else if (type === '12') label = '12';
      else if (type === 'X2') label = 'X2';
    } else if (marketName === 'BTTS') {
      if (type === 'Y' || sel.canonicalName?.toLowerCase() === 'yes') label = 'Sim';
      else if (type === 'N' || sel.canonicalName?.toLowerCase() === 'no') label = 'Não';
    } else if (marketName.startsWith('Over/Under')) {
      if (type === 'O' || sel.canonicalName?.toLowerCase().startsWith('over')) label = 'Over';
      else if (type === 'U' || sel.canonicalName?.toLowerCase().startsWith('under')) label = 'Under';
    } else {
      label = sel.name || sel.canonicalName || type || null;
    }

    if (label) selections.push({ selection: label, value: Math.round(odds * 100) / 100 });
  }

  if (marketName === '1X2') {
    const labels = new Set(selections.map((s) => s.selection));
    // Football requires 3-way (1, X, 2); basketball/tennis are 2-way (1 and 2 only, no draw)
    const hasThreeWay = labels.has('1') && labels.has('X') && labels.has('2');
    const hasTwoWay = labels.has('1') && labels.has('2') && !labels.has('X');
    if (!hasThreeWay && !hasTwoWay) return null;
  } else if (selections.length < 2) {
    return null;
  }

  return { market: marketName, selections };
}

// ─── League name builder (same logic as tryParseKambiPreFetch) ──────────────

function buildLeagueName(className: string, typeName: string): string {
  if (typeName) {
    if (typeName.includes(' - ') || typeName.includes('/')) return typeName;
    if (className && className !== typeName) return `${className} - ${typeName}`;
    return typeName;
  }
  return className || 'Futebol';
}

// ─── Fallback: events without odds (used when socket is unavailable) ────────

const teamSplitRe = /\s+(?:v|vs|x|@|[-–—])\s+/i;
const atSeparatorRe = /\s+@\s+/;

/** Split "Team A vs Team B" or "Away @ Home" into [homeTeam, awayTeam]. */
function splitTeamNames(name: string): { homeTeam: string; awayTeam: string } | null {
  const parts = name.split(teamSplitRe);
  if (parts.length < 2) return null;
  const first = parts[0]!.trim();
  const second = parts.slice(1).join(' ').trim();
  if (!first || !second) return null;
  // "@" format is American: "Away @ Home" — swap to our home/away convention
  if (atSeparatorRe.test(name)) {
    return { homeTeam: second, awayTeam: first };
  }
  return { homeTeam: first, awayTeam: second };
}

function convertEventsWithoutOdds(events: Map<string, KambiWsEvent>, sport: Sport = Sport.FOOTBALL): ScrapedEvent[] {
  const results: ScrapedEvent[] = [];
  for (const ev of events.values()) {
    const teams = splitTeamNames(ev.name);
    if (!teams) continue;
    const { homeTeam, awayTeam } = teams;
    let eventDate = ev.startTime ? new Date(ev.startTime) : new Date();
    if (isNaN(eventDate.getTime())) eventDate = new Date();

    const kambiState = String(ev.state ?? '').toLowerCase();
    const kambiIsLive =
      ev.details?.inPlay === true ||
      kambiState === 'started' ||
      kambiState === 'live' ||
      kambiState === 'inprogress' ||
      kambiState === 'active';
    let kambiHomeScore: number | null = null;
    let kambiAwayScore: number | null = null;
    let kambiLiveClock: string | null = null;
    if (kambiIsLive) {
      const scoreSources = [ev.score, ev.details?.score, ev.details?.totalScores];
      for (const source of scoreSources) {
        const score = source as Record<string, unknown> | undefined;
        if (!score) continue;
        const h = Number(score.home ?? score.homeScore ?? score['1'] ?? NaN);
        const a = Number(score.away ?? score.awayScore ?? score['2'] ?? NaN);
        if (!isNaN(h) && !isNaN(a)) {
          kambiHomeScore = h;
          kambiAwayScore = a;
          break;
        }
      }
      const rawSeconds = Number(
        (ev.details?.timeInformation as Record<string, unknown> | undefined)?.time ?? NaN,
      );
      if ((ev.details?.isClockRunning as boolean | undefined) === false) {
        kambiLiveClock = 'Int.';
      } else if (Number.isFinite(rawSeconds) && rawSeconds > 0) {
        kambiLiveClock = `${Math.floor(rawSeconds / 60)}'`;
      }
    }

    results.push({
      externalId: ev.id,
      sport,
      league: buildLeagueName(ev.className, ev.typeName),
      homeTeam,
      awayTeam,
      eventDate,
      markets: [],
      isLive: kambiIsLive,
      homeScore: kambiHomeScore,
      awayScore: kambiAwayScore,
      liveClock: kambiLiveClock,
    });
  }
  return results;
}

// ─── Main scraper ───────────────────────────────────────────────────────────

/**
 * Scrape a Kambi-powered betting site via WebSocket injection.
 * Navigates to one or more page URLs in a single browser session,
 * accumulating events from each page.
 * Returns ScrapedEvent[] with full event data and 1X2 odds.
 */
export async function scrapeKambiViaWebSocket(config: KambiWsConfig): Promise<ScrapedEvent[]> {
  const { siteLabel, pageUrl, extraPageUrls, preDismissSelectors, preWaitMs } = config;
  const allPageUrls = [pageUrl, ...(extraPageUrls ?? [])];
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
      headless: 'new' as never,
      args: BROWSER_ARGS,
    });

    const page = await browser.newPage();
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
    await page.setUserAgent(ua);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' });
    await page.setViewport({ width: 1366, height: 768 });

    // Hook WebSocket constructor in ALL frames (including Kambi iframe) via CDP.
    const cdp = await page.createCDPSession();

    const WS_HOOK_SCRIPT = `
      (function() {
        if (window.__kambiWsHooked) return;
        window.__kambiWsHooked = true;
        var OrigWS = window.WebSocket;
        window.__kambiSockets = [];
        var ProxyWS = function(url, protocols) {
          var ws = new OrigWS(url, protocols);
          if (typeof url === 'string' && url.indexOf('sportswidget') !== -1) {
            window.__kambiSockets.push(ws);
          }
          return ws;
        };
        ProxyWS.prototype = OrigWS.prototype;
        ProxyWS.CONNECTING = OrigWS.CONNECTING;
        ProxyWS.OPEN = OrigWS.OPEN;
        ProxyWS.CLOSING = OrigWS.CLOSING;
        ProxyWS.CLOSED = OrigWS.CLOSED;
        window.WebSocket = ProxyWS;
      })();
    `;

    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: WS_HOOK_SCRIPT });

    // Block heavy resources
    await page.setRequestInterception(true);
    page.on('request', (req: HTTPRequest) => {
      const type = req.resourceType();
      if (['image', 'media', 'font'].includes(type)) req.abort();
      else req.continue();
    });

    // Shared data stores — these accumulate events across ALL page navigations.
    const allEvents = new Map<string, KambiWsEvent>();
    const eventMarketLines = new Map<string, Map<string, string>>();
    const allMarkets = new Map<string, KambiWsMarket>();
    let eventGroupsVersion = 0;

    await cdp.send('Network.enable');

    cdp.on('Network.webSocketFrameReceived', (params: { response?: { payloadData?: string } }) => {
      const data = params.response?.payloadData;
      if (typeof data !== 'string') return;

      const frame = parseStompMessage(data);
      if (!frame) return;
      const body = frame.body as Record<string, unknown>;

      // 1) eventGroups → all events with basic info + live state/score
      if (frame.id.includes('eventgroups') && Array.isArray(body?.groups)) {
        for (const g of body.groups as Array<Record<string, unknown>>) {
          for (const ev of (g.events ?? []) as Array<Record<string, unknown>>) {
            allEvents.set(String(ev.id), {
              id: String(ev.id),
              name: String(ev.name ?? ''),
              typeName: String(g.typeName ?? ''),
              className: String(g.className ?? ''),
              startTime: String(ev.startTime ?? ''),
              countryCode: String(g.countryCode ?? ''),
              state: typeof ev.state === 'string' ? ev.state : undefined,
              score: (ev.score && typeof ev.score === 'object') ? ev.score as Record<string, unknown> : undefined,
              details: (ev.details && typeof ev.details === 'object') ? ev.details as Record<string, unknown> : undefined,
            });
          }
        }
        eventGroupsVersion++;
      }

      // 2) events/multi → marketLine IDs per event + live state/score updates
      if (frame.id.includes('events/multi') && frame.type === 'MULTI') {
        for (const [evId, evData] of Object.entries(body as Record<string, unknown>)) {
          const s = (evData as Record<string, unknown>)?.s ?? evData;
          const sObj = s as Record<string, unknown> | undefined;
          const marketLines = sObj?.marketLines as Record<string, { id?: string }> | undefined;
          if (marketLines) {
            const lines = new Map<string, string>();
            for (const [idx, ml] of Object.entries(marketLines)) {
              if (ml?.id) lines.set(idx, String(ml.id));
            }
            if (lines.size) eventMarketLines.set(evId, lines);
          }
          // Update live state/score if the events/multi frame carries them
          const existing = allEvents.get(evId);
          if (existing && sObj) {
            const multiState = typeof sObj.state === 'string' ? sObj.state : undefined;
            const multiScore = (sObj.score && typeof sObj.score === 'object') ? sObj.score as Record<string, unknown> : undefined;
            const multiDetails = (sObj.details && typeof sObj.details === 'object') ? sObj.details as Record<string, unknown> : undefined;
            if (multiState) existing.state = multiState;
            if (multiScore) existing.score = multiScore;
            if (multiDetails) existing.details = multiDetails;
          }
        }
      }

      // 3) individual market data → odds
      if (/\/api\/markets\/\d+/.test(frame.id) && body?.selections) {
        const mktId = frame.id.replace('/api/markets/', '');
        allMarkets.set(mktId, {
          id: mktId,
          name: String(body.name ?? ''),
          canonicalName: String(body.canonicalName ?? ''),
          type: String(body.type ?? ''),
          selections: (body.selections as Array<Record<string, unknown>>).map((s) => ({
            name: String(s.name ?? ''),
            canonicalName: String(s.canonicalName ?? ''),
            type: String(s.type ?? ''),
            handicapLabel: s.handicapLabel ? String(s.handicapLabel) : undefined,
            prices: Array.isArray(s.prices) ? s.prices.map((p: Record<string, unknown>) => ({
              decimalLabel: String(p.decimalLabel ?? '0'),
            })) : [],
          })),
        });
      }
    });

    // ── Helper functions (shared across all pages) ──────────────────────────

    const findKambiFrame = () => {
      for (const f of page.frames()) {
        const u = f.url();
        if (u.includes('sportswidget') || u.includes('kambi')) return f;
      }
      return null;
    };

    const sendStompFrame = async (frame: string): Promise<boolean> => {
      const kambiFrame = findKambiFrame();
      if (kambiFrame) {
        try {
          const sent = await kambiFrame.evaluate((f: string) => {
            const socks = (window as unknown as Record<string, unknown>).__kambiSockets as WebSocket[] | undefined;
            if (socks) {
              for (const ws of socks) {
                if (ws.readyState === 1) { ws.send(f); return true; }
              }
            }
            return false;
          }, frame);
          if (sent) return true;
        } catch { /* frame may have detached */ }
      }
      try {
        return await page.evaluate((f: string) => {
          const socks = (window as unknown as Record<string, unknown>).__kambiSockets as WebSocket[] | undefined;
          if (socks) {
            for (const ws of socks) {
              if (ws.readyState === 1) { ws.send(f); return true; }
            }
          }
          return false;
        }, frame);
      } catch { return false; }
    };

    const waitForSocketReady = async (): Promise<boolean> => {
      for (let i = 0; i < 20; i++) {
        const kambiFrame = findKambiFrame();
        if (kambiFrame) {
          try {
            const hasOpen = await kambiFrame.evaluate(() => {
              const socks = (window as unknown as Record<string, unknown>).__kambiSockets as WebSocket[] | undefined;
              return socks?.some((ws) => ws.readyState === 1) ?? false;
            });
            if (hasOpen) return true;
          } catch { /* frame may not be ready yet */ }
        }
        try {
          const hasOpen = await page.evaluate(() => {
            const socks = (window as unknown as Record<string, unknown>).__kambiSockets as WebSocket[] | undefined;
            return socks?.some((ws) => ws.readyState === 1) ?? false;
          });
          if (hasOpen) return true;
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    };

    const injectEventsMulti = async (missingIds: string[], batchOffset: number): Promise<void> => {
      for (let i = 0; i < missingIds.length; i += EVENT_BATCH_SIZE) {
        const batch = missingIds.slice(i, i + EVENT_BATCH_SIZE);
        const mid = batch.join(';') + ';';
        const key = batch.join('-');
        const batchIdx = batchOffset + Math.floor(i / EVENT_BATCH_SIZE);
        const stompFrame = `SUBSCRIBE\nid:/api/events/multi-b${batchIdx}\nlocale:pt\nmid:${mid}\nkey:${key}\ndestination:/api/events/multi\n\n\0`;
        const sent = await sendStompFrame(stompFrame);
        if (!sent) {
          logger.warn(`${siteLabel}: Kambi WS — failed to send events/multi batch`);
          break;
        }
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    };

    const injectMarketSubscribes = async (marketIds: Set<string>): Promise<void> => {
      let count = 0;
      for (const mktId of marketIds) {
        const stompFrame = `SUBSCRIBE\nid:/api/markets/${mktId}\nlocale:pt\ndestination:/api/markets/${mktId}\n\n\0`;
        const sent = await sendStompFrame(stompFrame);
        if (!sent) {
          logger.warn(`${siteLabel}: Kambi WS — socket closed after ${count} market subscriptions`);
          break;
        }
        count++;
        if (count % 20 === 0) {
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          await new Promise((r) => setTimeout(r, MARKET_SUBSCRIBE_DELAY_MS));
        }
      }
    };

    // ── Navigate to each page URL and scrape ────────────────────────────────

    let totalBatchOffset = 0;
    let consecutiveEmpty = 0;

    for (let pageIdx = 0; pageIdx < allPageUrls.length; pageIdx++) {
      const currentUrl = allPageUrls[pageIdx]!;
      const versionBefore = eventGroupsVersion;
      const eventCountBefore = allEvents.size;

      logger.info(`${siteLabel}: navigating to ${currentUrl} (page ${pageIdx + 1}/${allPageUrls.length})`);

      try {
        await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 45_000 });
      } catch (navErr) {
        logger.warn(`${siteLabel}: navigation failed for ${currentUrl}`, {
          error: navErr instanceof Error ? navErr.message : String(navErr),
        });
        continue;
      }

      // Dismiss splash / age-gate / cookies on the first page only
      if (pageIdx === 0) {
        if (preDismissSelectors?.length) {
          for (const selector of preDismissSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 5000 });
              await page.click(selector);
              logger.debug(`${siteLabel}: clicked splash/age-gate: ${selector}`);
              await new Promise((r) => setTimeout(r, 1500));
            } catch { /* selector not present — skip */ }
          }
          if (preWaitMs) await new Promise((r) => setTimeout(r, preWaitMs));
        }

        try {
          const btns = await page.$$('button');
          for (const btn of btns) {
            const text = await page.evaluate((el: Element) => el.textContent?.trim() ?? '', btn);
            if (/aceitar|accept|confirm|concordo|entrar|enter/i.test(text)) {
              await btn.click();
              logger.debug(`${siteLabel}: dismissed cookie/splash button: "${text}"`);
              await new Promise((r) => setTimeout(r, 1000));
              break;
            }
          }
        } catch { /* best effort */ }
      }

      // Give the Kambi widget time to initialise its WebSocket
      await new Promise((r) => setTimeout(r, pageIdx === 0 ? 3000 : 2000));

      // Wait for new eventGroups frame from this page
      const waitStart = Date.now();
      while (eventGroupsVersion === versionBefore && Date.now() - waitStart < EVENTGROUPS_WAIT_MS) {
        await new Promise((r) => setTimeout(r, 500));
      }

      if (eventGroupsVersion === versionBefore) {
        logger.warn(`${siteLabel}: no eventGroups received for ${currentUrl}`);
        if (pageIdx === 0 && allEvents.size === 0) {
          // First page failed completely — abort
          await browser.close();
          return [];
        }
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2 && pageIdx >= 2) {
          logger.info(`${siteLabel}: ${consecutiveEmpty} consecutive empty pages — stopping early (${allPageUrls.length - pageIdx - 1} pages skipped)`);
          break;
        }
        continue; // Try next page
      }

      const newEvents = allEvents.size - eventCountBefore;
      logger.info(`${siteLabel}: page ${pageIdx + 1} added ${newEvents} new events (total: ${allEvents.size})`);

      // Early exit: if multiple consecutive pages add 0 new events, the Kambi
      // widget is returning the same cached eventGroups — no point continuing.
      if (newEvents === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2 && pageIdx >= 2) {
          logger.info(`${siteLabel}: ${consecutiveEmpty} consecutive empty pages — stopping early (${allPageUrls.length - pageIdx - 1} pages skipped)`);
          break;
        }
        continue;
      }
      consecutiveEmpty = 0;

      // Wait for socket to be ready on this page
      const socketReady = await waitForSocketReady();
      if (!socketReady) {
        logger.warn(`${siteLabel}: no open socket for page ${pageIdx + 1}, skipping market injection`);
        continue;
      }

      // Inject events/multi for events that don't have market line data yet
      const missingIds = Array.from(allEvents.keys()).filter((id) => !eventMarketLines.has(id));
      if (missingIds.length > 0) {
        await injectEventsMulti(missingIds, totalBatchOffset);
        totalBatchOffset += Math.ceil(missingIds.length / EVENT_BATCH_SIZE);
        await new Promise((r) => setTimeout(r, EVENTS_RESPONSE_WAIT_MS));
        logger.info(`${siteLabel}: events with marketLines: ${eventMarketLines.size}/${allEvents.size}`);
      }

      // Inject market subscriptions for ALL market lines (1X2, O/U, BTTS, etc.)
      const newMarketIds = new Set<string>();
      for (const lines of eventMarketLines.values()) {
        for (const mktId of lines.values()) {
          if (!allMarkets.has(mktId)) newMarketIds.add(mktId);
        }
      }
      if (newMarketIds.size > 0) {
        await injectMarketSubscribes(newMarketIds);
        await new Promise((r) => setTimeout(r, MARKETS_RESPONSE_WAIT_MS));
        logger.info(`${siteLabel}: total markets received: ${allMarkets.size}`);
      }
    }

    // ── CDN pre-fetch supplement: discover future-dated events ─────────────
    // The Kambi widget only surfaces ~100 events (mostly today). The CDN
    // pre-fetch endpoint returns a smaller set that includes future dates
    // (tomorrow + days ahead). We fetch it, seed any new events/marketLines
    // into our stores, then resolve their markets via the still-open WS.
    if (config.cdnPrefetchUrl) {
      try {
        const cdnResp = await fetch(config.cdnPrefetchUrl, {
          headers: {
            'Accept': 'application/json',
            'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
            'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!,
          },
        });
        if (cdnResp.ok) {
          const cdnBody = await cdnResp.json() as Record<string, unknown>;
          const rawCdnEvents = cdnBody.events;
          const cdnEvents: Array<Record<string, unknown>> =
            Array.isArray(rawCdnEvents) ? rawCdnEvents
              : (rawCdnEvents && typeof rawCdnEvents === 'object' ? Object.values(rawCdnEvents) : []);

          let cdnNewEvents = 0;
          let cdnLiveUpdates = 0;
          let cdnNewMarketLineIds = new Set<string>();

          for (const ev of cdnEvents) {
            const evId = String(ev.id ?? '');
            if (!evId) continue;

            // Extract live state/score/details from CDN — the CDN snapshot
            // includes current scores and clocks for in-play events, which
            // the eventGroups STOMP frame may omit for Saudi/non-EU leagues.
            const cdnState = typeof ev.state === 'string' ? ev.state : undefined;
            const cdnScore = (ev.score && typeof ev.score === 'object')
              ? ev.score as Record<string, unknown> : undefined;
            const cdnDetails = (ev.details && typeof ev.details === 'object')
              ? ev.details as Record<string, unknown> : undefined;
            const cdnIsLive =
              (cdnDetails as Record<string, unknown> | undefined)?.inPlay === true ||
              ['started', 'live', 'inprogress', 'active'].includes(String(cdnState ?? '').toLowerCase());

            if (allEvents.has(evId)) {
              // Existing event (already captured from WS STOMP): update live data
              // from CDN when the CDN confirms this is an in-play event. CDN
              // snapshots are generated by Kambi every ~15 s and include accurate
              // score and timeInformation even when the STOMP frame omits them.
              if (cdnIsLive) {
                const existing = allEvents.get(evId)!;
                if (cdnState) existing.state = cdnState;
                if (cdnScore) existing.score = cdnScore;
                if (cdnDetails) {
                  // Merge CDN details into the WS event's details. CDN may omit
                  // timeInformation on some pre-fetch variants — preserve the WS
                  // snapshot value so the live clock is never regressed to null.
                  const wsTimeInfo = (existing.details as Record<string, unknown> | undefined)?.timeInformation;
                  existing.details = {
                    ...(existing.details as Record<string, unknown> ?? {}),
                    ...cdnDetails,
                    ...(cdnDetails.timeInformation == null && wsTimeInfo != null
                      ? { timeInformation: wsTimeInfo }
                      : {}),
                  };
                }
                cdnLiveUpdates++;
              }
              // Fall through to the market-lines section below for this event
            } else {
              // New event not seen in WS frame — seed it
              const name = String(ev.name ?? '');
              if (!name || !teamSplitRe.test(name)) continue;

              allEvents.set(evId, {
                id: evId,
                name,
                typeName: String(ev.typeName ?? ''),
                className: String(ev.className ?? ''),
                startTime: String(ev.startTime ?? ''),
                countryCode: String(ev.countryCode ?? ''),
                state: cdnState,
                score: cdnScore,
                details: cdnDetails,
              });
              cdnNewEvents++;
            }

            // Seed marketLine IDs for this event (both new and existing)
            const marketLines = ev.marketLines as Record<string, { id?: string }> | undefined;
            if (marketLines) {
              const lines = new Map<string, string>();
              for (const [idx, ml] of Object.entries(marketLines)) {
                if (ml?.id) {
                  const mktId = String(ml.id);
                  lines.set(idx, mktId);
                  if (!allMarkets.has(mktId)) cdnNewMarketLineIds.add(mktId);
                }
              }
              if (lines.size > 0) eventMarketLines.set(evId, lines);
            }
          }

          logger.info(`${siteLabel}: CDN pre-fetch added ${cdnNewEvents} new events, ${cdnLiveUpdates} live score updates, ${cdnNewMarketLineIds.size} unresolved market IDs`);

          // Also parse CDN markets that ARE included in the pre-fetch
          const rawCdnMarkets = cdnBody.markets;
          const cdnMarkets: Array<Record<string, unknown>> =
            Array.isArray(rawCdnMarkets) ? rawCdnMarkets
              : (rawCdnMarkets && typeof rawCdnMarkets === 'object' ? Object.values(rawCdnMarkets) : []);

          let cdnDirectMarkets = 0;
          for (const m of cdnMarkets) {
            const mktId = String(m.id ?? '');
            if (mktId && !allMarkets.has(mktId)) {
              // Convert CDN market to KambiWsMarket format
              const selections = m.selections as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(selections)) {
                allMarkets.set(mktId, {
                  id: mktId,
                  name: String(m.name ?? ''),
                  canonicalName: String(m.canonicalName ?? ''),
                  type: String(m.type ?? ''),
                  selections: selections.map((s) => ({
                    name: String(s.name ?? ''),
                    canonicalName: String(s.canonicalName ?? ''),
                    type: String(s.type ?? ''),
                    handicapLabel: s.handicapLabel ? String(s.handicapLabel) : undefined,
                    prices: Array.isArray(s.prices) ? s.prices.map((p: Record<string, unknown>) => ({
                      decimalLabel: String(p.decimalLabel ?? '0'),
                    })) : [],
                  })),
                });
                cdnDirectMarkets++;
                cdnNewMarketLineIds.delete(mktId); // No longer unresolved
              }
            }
          }

          if (cdnDirectMarkets > 0) {
            logger.info(`${siteLabel}: CDN pre-fetch provided ${cdnDirectMarkets} markets directly, ${cdnNewMarketLineIds.size} still unresolved`);
          }

          // Resolve remaining market IDs via the still-open WebSocket
          if (cdnNewMarketLineIds.size > 0) {
            const socketReady = await waitForSocketReady();
            if (socketReady) {
              await injectMarketSubscribes(cdnNewMarketLineIds);
              await new Promise((r) => setTimeout(r, MARKETS_RESPONSE_WAIT_MS));
              const resolvedCount = [...cdnNewMarketLineIds].filter((id) => allMarkets.has(id)).length;
              logger.info(`${siteLabel}: WS resolved ${resolvedCount}/${cdnNewMarketLineIds.size} CDN market IDs`);
            } else {
              logger.warn(`${siteLabel}: no open socket to resolve CDN market IDs`);
            }
          }
        }
      } catch (cdnErr) {
        logger.warn(`${siteLabel}: CDN pre-fetch supplement failed`, {
          error: cdnErr instanceof Error ? cdnErr.message : String(cdnErr),
        });
      }
    }

    await browser.close();

    // Convert to ScrapedEvent[]
    const results: ScrapedEvent[] = [];

    for (const [evId, ev] of allEvents) {
      const teams = splitTeamNames(ev.name);
      if (!teams) continue;
      const { homeTeam, awayTeam } = teams;

      const league = buildLeagueName(ev.className, ev.typeName);

      let eventDate = ev.startTime ? new Date(ev.startTime) : new Date();
      if (isNaN(eventDate.getTime())) eventDate = new Date();

      const markets: ScrapedMarket[] = [];
      const seenMarketNames = new Set<string>();
      const lines = eventMarketLines.get(evId);
      if (lines) {
        for (const mktId of lines.values()) {
          const wsMkt = allMarkets.get(mktId);
          if (wsMkt) {
            const parsed = convertWsMarketToScraped(wsMkt, homeTeam, awayTeam);
            if (parsed && !seenMarketNames.has(parsed.market)) {
              seenMarketNames.add(parsed.market);
              markets.push(parsed);
            }
          }
        }
      }

      // Detect live status and scores — same logic as tryParseKambiPreFetch
      const kambiState = String(ev.state ?? '').toLowerCase();
      const kambiIsLive =
        ev.details?.inPlay === true ||
        kambiState === 'started' ||
        kambiState === 'live' ||
        kambiState === 'inprogress' ||
        kambiState === 'active';
      let kambiHomeScore: number | null = null;
      let kambiAwayScore: number | null = null;
      let kambiLiveClock: string | null = null;
      if (kambiIsLive) {
        const scoreSources = [ev.score, ev.details?.score, ev.details?.totalScores];
        for (const source of scoreSources) {
          const score = source as Record<string, unknown> | undefined;
          if (!score) continue;
          const h = Number(score.home ?? score.homeScore ?? score['1'] ?? NaN);
          const a = Number(score.away ?? score.awayScore ?? score['2'] ?? NaN);
          if (!isNaN(h) && !isNaN(a)) {
            kambiHomeScore = h;
            kambiAwayScore = a;
            break;
          }
        }
        const rawSeconds = Number(
          (ev.details?.timeInformation as Record<string, unknown> | undefined)?.time ?? NaN,
        );
        if ((ev.details?.isClockRunning as boolean | undefined) === false) {
          kambiLiveClock = 'Int.';
        } else if (Number.isFinite(rawSeconds) && rawSeconds > 0) {
          kambiLiveClock = `${Math.floor(rawSeconds / 60)}'`;
        }
      }

      results.push({
        externalId: evId,
        sport: config.sport ?? Sport.FOOTBALL,
        league,
        homeTeam,
        awayTeam,
        eventDate,
        markets,
        isLive: kambiIsLive,
        homeScore: kambiHomeScore,
        awayScore: kambiAwayScore,
        liveClock: kambiLiveClock,
      });
    }

    const withOdds = results.filter((e) => e.markets.length > 0);
    logger.info(`${siteLabel}: Kambi WS — returning ${results.length} events (${withOdds.length} with odds)`);
    return results;
  } catch (err) {
    logger.error(`${siteLabel}: Kambi WS scrape failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    return [];
  }
}
