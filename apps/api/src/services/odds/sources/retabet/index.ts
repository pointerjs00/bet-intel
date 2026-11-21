/**
 * Retabet `OddsSource`: Retabet's own platform (ASP.NET Core + React SSR, behind Akamai/F5; no external provider,
 * no BetRadar id). Plain GET/POST with browser headers and the anonymous session cookie of a first `GET /`
 * (the POSTs answer 400 without it). The cookie jar lives in memory; a 400 renews the session once and retries,
 * a second 400 is an error.
 *
 * Calendar of a sport for the next 48 h:
 *  - today (the server's day): `GET /calendario` (200 events of every sport, JSON in the widget's `data-cp`) then
 *    `POST /api/sportsbookCalendarEvents/LoadPending` with the cursor of the last event until the end (≈ 800 events,
 *    3-4 requests). This day snapshot is shared by the sports of one refresh (CALENDAR_TTL_MS).
 *  - tomorrow: the server keeps the day filter in its own state (not reproducible), so football and basketball read the
 *    league pages of the biggest competitions (FOOTBALL_LEAGUES / BASKETBALL_LEAGUES: ids from the site menu, one
 *    request each; the slug in the URL is ignored and redirected) and tennis the tennis page (today + tomorrow, 17-20
 *    events, under the 80-event cut). A league page that fails is skipped; all of them failing fails the refresh.
 * Markets of one game: its page (tab "Principais" in HTML, with the tab list) and one `POST
 * /api/sportsbookEventDetail/GetTabsContents` for the extra tabs that carry comparable markets (EXTRA_TAGS).
 *
 * Pacing and blocking: requests are serialised and ≥ REQUEST_GAP_MS apart. A 429/403 or an anti-bot HTML page aborts
 * the refresh and the adapter then fails fast, with no request at all, for BLOCK_MS (10 min). It is never something to
 * get around. A changed front end (missing structure) is a `ProviderFormatError`, not a block.
 *
 * Mapping and HTML reading are pure (`map.ts`, `html.ts`); the I/O takes injectable `fetch`/`sleep`/`now`.
 * Health is recorded by the odds service around every call.
 */
import { logger } from '../../../../utils/logger';
import { BlockError, ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { isChallenge, parseCalendarHtml, parseEventPage, parseTabsContents, type PageMarket, type RawEvent } from './html';
import { cursorOf, mapCalendarEvents, mapMarkets, parsePending, pendingBody } from './map';

const SITE = 'https://www.retabet.pt';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Spacing between two requests of this adapter (the study ran at ≥ 2 s without a 429; production uses 1 s). */
export const REQUEST_GAP_MS = 1000;
/** Day calendar (calendar page + LoadPending chain) cache, shared by the sports of one refresh. */
export const CALENDAR_TTL_MS = 3 * 60 * 1000;
/** `LoadPending` pages read per refresh, at most (200 events each; a busy Saturday is ≈ 4). */
export const MAX_PENDING_PAGES = 8;
/** After a 429/403/anti-bot answer the adapter makes no request for this long. */
export const BLOCK_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 30_000;

/** Football competitions read for the days after "today" (ids of the site menu). Primeira/Liga 2/Taça, UEFA, top 5 + second tiers, Eredivisie, cups. */
export const FOOTBALL_LEAGUES = [123, 1720, 169, 10, 11, 24703, 6093, 6, 619, 147, 61, 1, 2, 8, 690, 7, 1103, 9, 1236, 122];
/** Basketball competitions (NBA, ACB, Lega, France, Germany, Turkey, Greece, Adriatic, Israel). */
export const BASKETBALL_LEAGUES = [41, 35, 318, 1554, 974, 1186, 308, 5743, 6216];

/** Tabs of a game page that carry comparable markets: Jogo, Golos, 1.ª/2.ª parte, Equipas, halves, quarters, sets. */
export const EXTRA_TAGS = new Set([1024, 1017, 1475, 1049, 1002, 1003, 1009, 1028]);

const SPORT_SLUG: Record<OddsSport, string> = { FOOTBALL: 'futebol', BASKETBALL: 'basquetebol', TENNIS: 'tenis' };
const SPORT_PAGE_ID: Record<OddsSport, number> = { FOOTBALL: 1, BASKETBALL: 5, TENNIS: 8 };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface RetabetDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** HTTP status error. */
class HttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`Retabet ${what}: HTTP ${status}`);
  }
}

/** The adapter is in its fail-fast period; nothing was sent. */
class BlockedError extends Error {}

/** An answer that means "stop asking for a while": rate limit, forbidden or an anti-bot page. */
const isBlock = (err: unknown): boolean =>
  (err instanceof HttpError && (err.status === 429 || err.status === 403)) || err instanceof BlockError;

/** Builds the Retabet adapter. Each instance keeps its own session, calendar cache, pacing and block state. */
export function createRetabetSource(deps: RetabetDeps = {}): OddsSource {
  const doFetch = deps.fetch ?? (fetch as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  // RETABET_GAP_MS can only slow the adapter down (slower probing); it never goes under the production gap.
  const gapMs = Math.max(REQUEST_GAP_MS, Number(process.env.RETABET_GAP_MS) || 0);

  let blockedUntil = 0;
  let gate: Promise<void> = Promise.resolve();
  let started = false;
  const cookies = new Map<string, string>();
  const blockedMessage = (what: string) => `Retabet ${what}: skipped, blocked until ${new Date(blockedUntil).toISOString()}`;
  const block = () => {
    blockedUntil = now() + BLOCK_MS;
  };

  /** Runs one request at a time (the turn lasts until its answer is read) and keeps ≥ gapMs between two of them. */
  async function turn<T>(what: string, fn: () => Promise<T>): Promise<T> {
    const previous = gate;
    let release!: () => void;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (now() < blockedUntil) throw new BlockedError(blockedMessage(what));
      if (started) await sleep(gapMs);
      started = true;
      // A request queued behind the one that got blocked must not go out either.
      if (now() < blockedUntil) throw new BlockedError(blockedMessage(what));
      return await fn();
    } finally {
      release();
    }
  }

  function storeCookies(res: Response): number {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of list) {
      const pair = line.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '') cookies.delete(name);
      else cookies.set(name, value);
    }
    return list.length;
  }

  /** One paced request returning the body text; a block answer starts the fail-fast period. */
  async function send(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body: string | undefined, what: string): Promise<string> {
    return turn(what, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
      try {
        const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await doFetch(url, {
          method,
          headers: { 'user-agent': USER_AGENT, 'accept-language': 'pt-PT,pt;q=0.9', referer: `${SITE}/`, ...headers, ...(cookie ? { cookie } : {}) },
          ...(body === undefined ? {} : { body }),
          signal: controller.signal,
        });
        storeCookies(res);
        if (!res.ok) throw new HttpError(res.status, what);
        return await res.text();
      } catch (err) {
        if (controller.signal.aborted) throw new Error(`Retabet ${what}: timeout`);
        if (isBlock(err)) block();
        throw err;
      } finally {
        clearTimeout(timer);
      }
    });
  }

  /** An anti-bot / WAF page is a block (never worked around); anything else HTML-shaped is left to the readers. */
  function rejectChallenge(html: string, what: string): void {
    if (!isChallenge(html)) return;
    block();
    throw new BlockError(`Retabet ${what}: anti-bot page (HTML page)`);
  }

  // ─── Session ───────────────────────────────────────────────────────────────

  let sessionPending: Promise<void> | null = null;
  /** The anonymous session cookie comes with a first `GET /`; it is kept in memory. */
  function ensureSession(): Promise<void> {
    if (cookies.size > 0) return Promise.resolve();
    sessionPending ??= (async () => {
      const html = await send('GET', `${SITE}/`, { accept: 'text/html' }, undefined, 'session');
      rejectChallenge(html, 'session');
      if (cookies.size === 0) throw new ProviderFormatError('Retabet session: the home page set no cookie');
    })().finally(() => {
      sessionPending = null;
    });
    return sessionPending;
  }

  async function getHtml(url: string, what: string): Promise<string> {
    await ensureSession();
    const html = await send('GET', url, { accept: 'text/html,application/xhtml+xml' }, undefined, what);
    rejectChallenge(html, what);
    return html;
  }

  /** XHR-style POST of a JSON body; answers 400 when the session cookie is not accepted: renew once, a second 400 is an error. */
  async function post(path: string, referer: string, body: unknown, what: string): Promise<string> {
    const headers = {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: SITE,
      referer,
    };
    const run = async () => {
      await ensureSession();
      return send('POST', `${SITE}${path}`, headers, JSON.stringify(body), what);
    };
    let text: string;
    try {
      text = await run();
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 400) throw err;
      cookies.clear();
      text = await run();
    }
    rejectChallenge(text, what);
    return text;
  }

  // ─── Calendar ──────────────────────────────────────────────────────────────

  /** All events of the server's day: the calendar page and the LoadPending chain. */
  async function loadDay(): Promise<RawEvent[]> {
    const first = parseCalendarHtml(await getHtml(`${SITE}/calendario`, 'calendar'));
    const out = [...first];
    let cursor = first.length > 0 ? cursorOf(first[first.length - 1]!) : null;
    for (let page = 1; cursor && page <= MAX_PENDING_PAGES; page++) {
      const raw = await post('/api/sportsbookCalendarEvents/LoadPending', `${SITE}/calendario`, pendingBody(cursor), `calendar page ${page}`);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        const err = /^\s*</.test(raw)
          ? new BlockError(`Retabet calendar page ${page}: response is not JSON (HTML page)`)
          : new ProviderFormatError(`Retabet calendar page ${page}: response is not JSON`);
        if (isBlock(err)) block();
        throw err;
      }
      const next = parsePending(body);
      out.push(...next.events);
      cursor = next.next;
    }
    return out;
  }

  let day: { events: RawEvent[]; at: number } | null = null;
  let dayPending: Promise<RawEvent[]> | null = null;
  function getDay(): Promise<RawEvent[]> {
    if (day && now() - day.at < CALENDAR_TTL_MS) return Promise.resolve(day.events);
    dayPending ??= loadDay()
      .then((events) => {
        day = { events, at: now() };
        return events;
      })
      .finally(() => {
        dayPending = null;
      });
    return dayPending;
  }

  /** Pages that list the days after "today" for a sport: league pages (football, basketball) or the tennis page. */
  async function loadExtra(sport: OddsSport): Promise<RawEvent[]> {
    if (sport === 'TENNIS') return parseCalendarHtml(await getHtml(`${SITE}/desportos/tenis/${SPORT_PAGE_ID.TENNIS}`, 'tennis page'));
    const leagues = sport === 'FOOTBALL' ? FOOTBALL_LEAGUES : BASKETBALL_LEAGUES;
    const out: RawEvent[] = [];
    let failures = 0;
    for (const id of leagues) {
      try {
        out.push(...parseCalendarHtml(await getHtml(`${SITE}/desportos/${SPORT_SLUG[sport]}/liga/liga/${id}`, `${sport} league ${id}`)));
      } catch (err) {
        // A block ends the refresh; one league that is gone or empty only loses that league.
        if (err instanceof BlockedError || isBlock(err)) throw err;
        failures++;
        logger.warn(`[odds] Retabet ${sport} league ${id} skipped`, { error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failures === leagues.length) throw new ProviderFormatError(`Retabet ${sport}: all ${failures} league pages failed`);
    return out;
  }

  async function listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const raw = [...(await getDay()), ...(await loadExtra(sport))];
    const byId = new Map<string, SourceEvent>();
    for (const ev of mapCalendarEvents(raw, sport)) {
      const t = Date.parse(ev.startsAt);
      if (t < from || t > to || byId.has(ev.houseEventId)) continue;
      byId.set(ev.houseEventId, ev);
    }
    return [...byId.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.houseEventId.localeCompare(b.houseEventId));
  }

  // ─── Markets of one game ───────────────────────────────────────────────────

  async function getMarkets(houseEventId: string, hint?: { pageUrl?: string }): Promise<SourceMarket[]> {
    if (!/^\d+$/.test(houseEventId)) throw new ProviderFormatError(`Retabet: bad event id ${houseEventId}`);
    // Any slug between the sport and the id works (the site redirects to the real page).
    const url = hint?.pageUrl ?? `${SITE}/desportos/futebol/jogo/jogo/jogo/${houseEventId}`;
    if (!url.startsWith(`${SITE}/desportos/`) || !url.endsWith(`/${houseEventId}`)) throw new Error(`Retabet: unexpected page URL for event ${houseEventId}`);
    const page = parseEventPage(await getHtml(url, `event ${houseEventId}`));
    if (!page.sport) throw new ProviderFormatError(`Retabet event ${houseEventId}: sport not covered`);
    const have = new Set(page.markets.map((m) => m.tag));
    const wanted = page.tabs.filter((t) => EXTRA_TAGS.has(t.tag) && !have.has(t.tag));
    let extra: PageMarket[] = [];
    if (wanted.length > 0) {
      const html = await post(
        '/api/sportsbookEventDetail/GetTabsContents',
        url,
        { id: houseEventId, tabsandtags: wanted.map((t) => ({ tab: t.tab, tag: t.tag })), skey: `SportsbookEventDetail-${houseEventId}` },
        `event ${houseEventId} tabs`,
      );
      extra = parseTabsContents(html);
    }
    return mapMarkets(page.sport, { home: page.home, away: page.away }, [...page.markets, ...extra]);
  }

  return { house: 'retabet', listEvents, getMarkets };
}

