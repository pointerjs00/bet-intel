/**
 * Casino Portugal `OddsSource`: the public JSON offer API of the NSoft "AIO" sportsbook the site embeds
 * (`/desporto`). No cookie, token or login; plain GETs with a browser User-Agent and the site's Origin/Referer.
 *
 * Start-up (cached 6 h, nothing hard-coded): the HTML of `https://www.casinoportugal.pt/desporto` carries the
 * `sportsWidget` config, the tenant id and the API host (`statisticsDomain`). Concurrent first calls share one request.
 *
 * Calendar of a sport: `offer/cursors` for the window with `numberOfMarketsPerSport=1` (only the main market:
 * 1x2 / winner / moneyline, 5-20 kB per page of 200 events instead of 200 kB with six markets), then
 * `offer/cursors/{cursorId}` while pages come back full (≤ MAX_PAGES). Pages are not in chronological order, so the
 * window is filtered by `startsAt`. Markets of one event: `offer/events/{id}` with the dictionary included.
 *
 * Pacing and blocking: requests are serialised and ≥ REQUEST_GAP_MS apart (the study ran 28 at ≥ 2 s without a
 * 429; production uses 1 s). A 429/403 or an HTML (anti-bot) answer aborts the refresh and the adapter then fails
 * fast, with no request at all, for BLOCK_MS (10 min). It is never something to get around.
 *
 * Mapping is pure (`map.ts`); the I/O takes injectable `fetch`/`sleep`/`now`, so tests run on fixtures.
 * Health is recorded by the odds service around every call.
 */
import { logger } from '../../../../utils/logger';
import { BlockError, ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { SPORT_ID, type Dictionary, mapCalendarPage, mapEventMarketsResponse, nextCursor, parseConfig } from './map';

const SITE = 'https://www.casinoportugal.pt';
const PAGE_URL = `${SITE}/desporto`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Spacing between two requests of this adapter. */
export const REQUEST_GAP_MS = 1000;
/** Events per calendar page (the API's maximum for `expectedNumberOfEvents`). */
export const PAGE_SIZE = 200;
/** Calendar pages read per sport and refresh, at most. */
export const MAX_PAGES = 5;
/** Config (tenant id, API host) cache. */
export const CONFIG_TTL_MS = 6 * 60 * 60 * 1000;
/** After a 429/403/HTML answer the adapter makes no request for this long. */
export const BLOCK_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 30_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface CasinoPortugalDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** HTTP status error. */
class HttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`Casino Portugal ${what}: HTTP ${status}`);
  }
}

/** An answer that means "stop asking for a while": rate limit, forbidden or an anti-bot page. */
const isBlock = (err: unknown): boolean =>
  (err instanceof HttpError && (err.status === 429 || err.status === 403)) || err instanceof BlockError;

/** `2026-11-21T19:45:00.000Z` → `2026-11-21T19:45:00` (the API takes UTC without a zone suffix). */
const apiDate = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '');

/** Builds the Casino Portugal adapter. Each instance keeps its own config cache, pacing and block state. */
export function createCasinoPortugalSource(deps: CasinoPortugalDeps = {}): OddsSource {
  const doFetch = deps.fetch ?? (fetch as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;

  let blockedUntil = 0;
  let gate: Promise<void> = Promise.resolve();
  let started = false;
  /** Serialises requests and keeps ≥ REQUEST_GAP_MS between their starts. */
  const pace = (): Promise<void> => {
    const turn = gate.then(async () => {
      if (started) await sleep(REQUEST_GAP_MS);
      started = true;
    });
    gate = turn.catch(() => undefined);
    return turn;
  };

  /** One paced GET returning the body text; a block answer starts the fail-fast period. */
  async function get(url: string, headers: Record<string, string>, what: string): Promise<string> {
    if (now() < blockedUntil) throw new Error(`Casino Portugal ${what}: skipped, blocked until ${new Date(blockedUntil).toISOString()}`);
    await pace();
    // A request queued behind the one that got blocked must not go out either.
    if (now() < blockedUntil) throw new Error(`Casino Portugal ${what}: skipped, blocked until ${new Date(blockedUntil).toISOString()}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await doFetch(url, { method: 'GET', headers: { 'user-agent': USER_AGENT, 'accept-language': 'pt-PT', ...headers }, signal: controller.signal });
      if (!res.ok) throw new HttpError(res.status, what);
      return await res.text();
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`Casino Portugal ${what}: timeout`);
      if (isBlock(err)) blockedUntil = now() + BLOCK_MS;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  let config: { value: { tenantId: string; apiUrl: string }; at: number } | null = null;
  let configPending: Promise<{ tenantId: string; apiUrl: string }> | null = null;
  async function loadConfig(): Promise<{ tenantId: string; apiUrl: string }> {
    const html = await get(PAGE_URL, { accept: 'text/html' }, 'sports page');
    const cfg = parseConfig(html);
    if (!cfg) {
      // A page without the widget config is a changed site or an anti-bot page: do not hammer it.
      blockedUntil = now() + BLOCK_MS;
      throw new ProviderFormatError(`Casino Portugal: sports page without tenant id / API host${/^\s*</.test(html) ? ' (HTML page)' : ''}`);
    }
    return cfg;
  }
  function getConfig(): Promise<{ tenantId: string; apiUrl: string }> {
    if (config && now() - config.at < CONFIG_TTL_MS) return Promise.resolve(config.value);
    configPending ??= loadConfig()
      .then((value) => {
        config = { value, at: now() };
        return value;
      })
      .finally(() => {
        configPending = null;
      });
    return configPending;
  }

  /** GET of `{apiUrl}/tenants/{tenant}/games/1,2/languages/pt/{path}` parsed as JSON; HTML or non-JSON is a format error. */
  async function api(path: string, what: string): Promise<unknown> {
    const { apiUrl, tenantId } = await getConfig();
    const raw = await get(`${apiUrl}/tenants/${tenantId}/games/1,2/languages/pt/${path}`, { accept: 'application/json', origin: SITE, referer: `${SITE}/` }, what);
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      const err = /^\s*</.test(raw)
        ? new BlockError(`Casino Portugal ${what}: response is not JSON (HTML page)`)
        : new ProviderFormatError(`Casino Portugal ${what}: response is not JSON`);
      if (isBlock(err)) blockedUntil = now() + BLOCK_MS;
      throw err;
    }
  }

  async function listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const paging = 'expectedNumberOfEvents=' + PAGE_SIZE + '&numberOfMarketsPerSport=1&extensions=market-feature-flags';
    let path = `offer/cursors?${paging}&marketTypes=1&eventTypes=1&sports=${SPORT_ID[sport]}&startsAtFrom=${apiDate(from)}&startsAtTo=${apiDate(to)}`;
    const out: SourceEvent[] = [];
    const seen = new Set<string>();
    // The market dictionary only comes with the first page; the later pages need it to name their main market.
    const known: Dictionary = new Map();
    for (let page = 1; page <= MAX_PAGES; page++) {
      let body: unknown;
      try {
        body = await api(path, `${sport} calendar page ${page}`);
        if (!Array.isArray((body as { events?: unknown } | null)?.events)) throw new ProviderFormatError(`Casino Portugal ${sport} calendar page ${page}: no events list`);
      } catch (err) {
        // The first page failing is the house failing; a later page failing only loses the tail (unless it is a block).
        if (page === 1 || isBlock(err) || err instanceof ProviderFormatError) throw err;
        logger.warn(`[odds] Casino Portugal ${sport} calendar page ${page} failed; keeping the rest`, { error: err instanceof Error ? err.message : String(err) });
        break;
      }
      for (const ev of mapCalendarPage(body, sport, known)) {
        const t = Date.parse(ev.startsAt);
        if (t < from || t > to || seen.has(ev.houseEventId)) continue;
        seen.add(ev.houseEventId);
        out.push(ev);
      }
      const cursor = nextCursor(body, PAGE_SIZE);
      if (!cursor) break;
      path = `offer/cursors/${cursor}?${paging}`;
    }
    return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }

  async function getMarkets(houseEventId: string): Promise<SourceMarket[]> {
    if (!/^\d+$/.test(houseEventId)) throw new ProviderFormatError(`Casino Portugal: bad event id ${houseEventId}`);
    const body = await api(
      `offer/events/${houseEventId}?extensions=market-feature-flags&excludeSportCategoryTournamentMetadata=false&excludeMarketMetadata=false&waitForEventsToBecomeAvailable=false`,
      `event ${houseEventId}`,
    );
    const view = mapEventMarketsResponse(body);
    if (!view) throw new ProviderFormatError(`Casino Portugal event ${houseEventId}: no event or sport not covered`);
    return view.markets;
  }

  return { house: 'casinoportugal', listEvents, getMarkets };
}
