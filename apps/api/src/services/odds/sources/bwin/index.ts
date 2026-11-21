/**
 * Bwin `OddsSource`: the public JSON API (Entain "CDS") the bwin.pt site itself calls.
 *
 * Start-up (cached 6 h, nothing hard-coded): `GET bwin.pt/pt/api/clientconfig` gives the public access id
 * (`x-bwin-accessid`, sent in the query) and the CDS base URL. Requests are plain GETs with a browser
 * User-Agent, no cookies and no token, ≥ 300 ms apart. A 401/403 refreshes the config once. A 429, a 403
 * that survives that re-read, or an HTML answer (anti-bot page) stops the refresh and the adapter then fails
 * fast, with no request at all, for BLOCK_MS (10 min); it is never something to get around.
 *
 * Calendar of one sport: `/bettingoffer/fixtures` for the window, sorted by start date, `take=100` per
 * page (football ~500 games in 48 h = 6 pages, basketball ~200 = 3, tennis 1). The pages already carry
 * the main market, the BetRadar id and the market count. Markets of one event: `/bettingoffer/fixture-view`.
 *
 * Mapping is pure (`map.ts`); the I/O takes injectable `fetch`/`sleep`, so tests run on fixtures.
 * Health is recorded by the odds service around every call.
 */
import { logger } from '../../../../utils/logger';
import { BlockError, ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { SPORT_ID, mapCalendar, mapFixtureView, parseClientConfig } from './map';

const CONFIG_URL = 'https://www.bwin.pt/pt/api/clientconfig?browserUrl=http%3A%2F%2Fwww.bwin.pt%2Fpt%2Fsports';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BROWSER_URL = 'http%3A%2F%2Fwww.bwin.pt%2Fpt%2Fsports';

/** Spacing between two requests of this adapter. */
export const REQUEST_GAP_MS = 300;
/** Config (access id, CDS url) cache. */
export const CONFIG_TTL_MS = 6 * 3_600_000;
/** Fixtures per calendar page. */
export const PAGE_SIZE = 100;
/** Calendar pages read per sport and refresh, at most. */
export const MAX_PAGES = 10;
/** After a 429/403/HTML answer the adapter makes no request for this long. */
export const BLOCK_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 30_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface BwinDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** HTTP status error, so the caller can tell 401/403 from the rest. */
class HttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`Bwin ${what}: HTTP ${status}`);
  }
}

/** The adapter is in its fail-fast period; nothing was sent. */
class BlockedError extends Error {}

/** Builds the Bwin adapter. Each instance keeps its own config cache, request pacing and block state. */
export function createBwinSource(deps: BwinDeps = {}): OddsSource {
  const doFetch = deps.fetch ?? (fetch as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;

  let blockedUntil = 0;
  const checkBlock = (what: string) => {
    if (now() < blockedUntil) throw new BlockedError(`Bwin ${what}: skipped, blocked until ${new Date(blockedUntil).toISOString()}`);
  };
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

  /**
   * One paced GET returning parsed JSON; HTML or non-JSON bodies are format errors. A 429, an HTML page, or
   * a 403 the caller will not retry (`retry403` false) starts the block.
   */
  async function getJson(url: string, what: string, retry403 = false): Promise<unknown> {
    checkBlock(what);
    await pace();
    // A request queued behind the one that got blocked must not go out either.
    checkBlock(what);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await doFetch(url, {
        method: 'GET',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json',
          'accept-language': 'pt-PT',
          origin: 'https://www.bwin.pt',
          referer: 'https://www.bwin.pt/pt/sports',
          'x-bwin-browser-url': BROWSER_URL,
          'x-from-product': 'host-app',
          'x-bwin-sports-api': 'prod',
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new HttpError(res.status, what);
      const text = await res.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        if (/^\s*</.test(text)) throw new BlockError(`Bwin ${what}: response is not JSON (HTML page)`);
        throw new ProviderFormatError(`Bwin ${what}: response is not JSON`);
      }
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`Bwin ${what}: timeout`);
      const blocked = err instanceof BlockError || (err instanceof HttpError && (err.status === 429 || (err.status === 403 && !retry403)));
      if (blocked) blockedUntil = now() + BLOCK_MS;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  let config: { value: { accessId: string; cdsUrl: string }; at: number } | null = null;
  let configPending: Promise<{ accessId: string; cdsUrl: string }> | null = null;
  async function getConfig(force = false): Promise<{ accessId: string; cdsUrl: string }> {
    if (!force && config && now() - config.at < CONFIG_TTL_MS) return config.value;
    // Concurrent start-ups share one request.
    configPending ??= getJson(CONFIG_URL, 'clientconfig')
      .then((body) => {
        const value = parseClientConfig(body);
        if (!value) throw new ProviderFormatError('Bwin: clientconfig without access id / CDS url');
        config = { value, at: now() };
        return value;
      })
      .finally(() => {
        configPending = null;
      });
    return configPending;
  }

  /** A CDS GET; on 401/403 the config is re-read once (the access id can rotate). */
  async function cds(path: (accessId: string) => string, what: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const { accessId, cdsUrl } = await getConfig(attempt > 0);
      try {
        return await getJson(`${cdsUrl}${path(encodeURIComponent(accessId))}`, what, attempt === 0);
      } catch (err) {
        if (attempt === 0 && err instanceof HttpError && (err.status === 401 || err.status === 403)) continue;
        throw err;
      }
    }
  }

  const COMMON = 'lang=pt&country=PT&userCountry=PT';

  async function listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const range = `from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`;
    const out: SourceEvent[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const skip = page * PAGE_SIZE;
      const body = (await cds(
        (id) =>
          `/bettingoffer/fixtures?x-bwin-accessid=${id}&${COMMON}&fixtureTypes=Standard&state=Latest&offerMapping=Filtered&offerCategories=Gridable` +
          `&fixtureCategories=Gridable,NonGridable,Specials,Outrights&regionIds=&competitionIds=&conferences=&isPriceBoost=false&statisticsModes=None` +
          `&sportIds=${SPORT_ID[sport]}&skip=${skip}&take=${PAGE_SIZE}&sortBy=StartDate&${range}`,
        `${sport} calendar page ${page + 1}`,
      )) as { fixtures?: unknown; totalCount?: unknown } | null;
      if (!body || !Array.isArray(body.fixtures)) throw new ProviderFormatError(`Bwin ${sport} calendar: no fixtures list`);
      for (const ev of mapCalendar(body, sport)) {
        const t = Date.parse(ev.startsAt);
        if (t > to || (t < from && !ev.live) || seen.has(ev.houseEventId)) continue;
        seen.add(ev.houseEventId);
        out.push(ev);
      }
      const total = Number(body.totalCount);
      if (body.fixtures.length < PAGE_SIZE || (Number.isFinite(total) && skip + PAGE_SIZE >= total)) break;
      if (page === MAX_PAGES - 1) logger.warn(`[odds] Bwin ${sport} calendar capped at ${MAX_PAGES} pages`);
    }
    return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }

  async function getMarkets(houseEventId: string): Promise<SourceMarket[]> {
    if (!/^[\d:]+$/.test(houseEventId)) throw new ProviderFormatError(`Bwin: bad event id ${houseEventId}`);
    const body = await cds(
      (id) =>
        `/bettingoffer/fixture-view?x-bwin-accessid=${id}&${COMMON}&offerMapping=All&scoreboardMode=Full&fixtureIds=${houseEventId}` +
        '&state=Latest&includePrecreatedBetBuilder=true&supportVirtual=false&isBettingInsightsEnabled=true&useRegionalisedConfiguration=true&includeRelatedFixtures=false',
      `event ${houseEventId}`,
    );
    const view = mapFixtureView(body);
    if (!view) throw new ProviderFormatError(`Bwin event ${houseEventId}: no fixture or sport not covered`);
    return view.markets;
  }

  return { house: 'bwin', listEvents, getMarkets };
}
