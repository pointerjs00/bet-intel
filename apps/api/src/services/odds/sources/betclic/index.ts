/**
 * Betclic `OddsSource`: the public gRPC-web offering API (`offering.access.api.MatchService`).
 *
 * Each call is a server stream: the first data frame is the snapshot, later frames are odds
 * updates that never end. We read the first data frame, then abort (10 s timeout).
 * Plain requests only: fixed browser User-Agent, `Accept-Language: pt-PT`, the `x-bg-ref-*`
 * headers the site itself sends. No cookies, no tokens, no retries on 403.
 *
 * Mapping (`mapMatch`, `mapMarkets`) is pure and kept apart from the I/O, which takes an
 * injectable `fetch`/`sleep` so tests run offline on the recorded fixtures.
 * Health is recorded by the odds service (`track('odds-betclic', …)` around every call).
 */
import { logger } from '../../../../utils/logger';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { encodeFrame, readFrames } from './grpcWeb';
import {
  ScoreboardStatus,
  SelectionStatus,
  decodeMatchFrame,
  decodeMatchesBySportFrame,
  encodeMatchRequest,
  encodeMatchesBySportRequest,
  type BetclicMarket,
  type BetclicMatch,
  type BetclicMatchesBySportPayload,
  type BetclicMatchPayload,
  type BetclicSelection,
} from './schema';

const BASE_URL = 'https://offering.begmedia.com/web/offering.access.api/offering.access.api.MatchService/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS: Record<string, string> = {
  'content-type': 'application/grpc-web+proto',
  accept: 'application/grpc-web+proto',
  'x-grpc-web': '1',
  'x-bg-ref-brand': 'BETCLIC',
  'x-bg-ref-platform': 'DESKTOP',
  'x-bg-ref-regulator-zone': 'PT',
  'x-bg-regulation': 'PT',
  origin: 'https://www.betclic.pt',
  referer: 'https://www.betclic.pt/',
  'user-agent': USER_AGENT,
  'accept-language': 'pt-PT',
};
const LANGUAGE = 'pt';

/** Server page cap (asking for more still returns 40). */
export const PAGE_SIZE = 40;
/** Hard stop for one calendar listing. */
export const MAX_PAGES = 25;
/** Spacing between calendar pages. */
export const PAGE_GAP_MS = 1000;
/** Market categories fetched after "Top", at most. */
export const MAX_CATEGORIES = 8;
/** Spacing between category requests. */
export const CATEGORY_GAP_MS = 500;
const TIMEOUT_MS = 10_000;

const SPORT_CODE: Record<OddsSport, string> = { FOOTBALL: 'football', BASKETBALL: 'basketball', TENNIS: 'tennis' };

// ─── Pure mapping ────────────────────────────────────────────────────────────

/** "2026-11-16T17:00:00.0000000Z" → "2026-11-16T17:00:00.000Z"; null when unparsable. */
export function toIsoUtc(raw: string): string | null {
  const s = raw.trim().replace(/(\.\d{3})\d+/, '$1');
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** One Betclic selection → `SourceMarket`; null when it has no label or no odds. */
function toSourceMarket(marketLabel: string, sel: BetclicSelection): SourceMarket | null {
  const selectionLabel = clean(sel.name) || clean(sel.betslipName);
  if (!marketLabel || !selectionLabel || !Number.isFinite(sel.odds) || sel.odds <= 0) return null;
  return {
    marketLabel,
    selectionLabel,
    odds: sel.odds,
    // Only ONLINE selections are real prices; suspended ones may read 1.
    suspended: sel.status !== SelectionStatus.ONLINE || sel.odds <= 1,
  };
}

/** Flattens one market (any layout) into selections, naming children after their parent. */
function flattenMarket(market: BetclicMarket, parentLabel: string | null, out: SourceMarket[]): void {
  const own = clean(market.betslipName) || clean(market.name);
  const label = parentLabel
    ? clean(market.betslipName) && clean(market.betslipName) !== clean(market.name)
      ? clean(market.betslipName)
      : [parentLabel, clean(market.name)].filter(Boolean).join(' - ')
    : own;
  const push = (sel: BetclicSelection | null | undefined) => {
    if (!sel) return;
    const m = toSourceMarket(label, sel);
    if (m) out.push(m);
  };
  market.mainSelections.forEach(push);
  for (const row of market.selectionMatrix) row.selections.forEach((cell) => push(cell.selection));
  for (const group of market.splitCardGroups) group.selections.forEach(push);
  for (const child of market.groupMarkets) flattenMarket(child, label, out);
  for (const tab of market.tabs) {
    const tabLabel = [label, clean(tab.name)].filter(Boolean).join(' - ');
    for (const child of tab.tabMarkets) flattenMarket(child, tabLabel, out);
  }
  for (const slider of market.sliders) {
    for (const value of slider.sliderValues) value.selections.forEach((cell) => push(cell.selection));
  }
}

/**
 * Betclic markets → `SourceMarket[]` with the PT labels as shown. Lines stay in the label text
 * ("Acima de 2,5", "Estónia (-1)"), so `line` is left undefined. Duplicates (same market and
 * selection label, e.g. a market present in "Top" and in its own category) keep the first.
 */
export function mapMarkets(markets: BetclicMarket[]): SourceMarket[] {
  const all: SourceMarket[] = [];
  for (const m of markets) flattenMarket(m, null, all);
  const seen = new Set<string>();
  return all.filter((m) => {
    const k = `${m.marketLabel}\u0000${m.selectionLabel}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Betclic match → `SourceEvent`; null when it is not a two-sided match with a valid start. */
export function mapMatch(m: BetclicMatch, sport: OddsSport): SourceEvent | null {
  if (m.contestants.length !== 2) return null;
  const home = clean(m.contestants[0]!.name);
  const away = clean(m.contestants[1]!.name);
  const startsAt = toIsoUtc(m.matchDateUtc);
  if (!home || !away || !startsAt || !/^\d+$/.test(m.matchId)) return null;
  // isLive turns true a few minutes before kick-off; the scoreboard says whether it really started.
  const live = m.isLive && m.scoreboard?.liveDisplayStatus !== ScoreboardStatus.NOT_STARTED;
  const radar = m.widgets.map((w) => clean(w.sportradarWidget?.externalMatchRef)).find(Boolean);
  const mainMarkets = m.market ? mapMarkets([m.market]) : [];
  return {
    house: 'betclic',
    houseEventId: m.matchId,
    sport,
    competition: clean(m.competition?.name),
    ...(m.openMarketCount > 0 ? { marketCount: m.openMarketCount } : {}),
    ...(clean(m.competition?.countryCode) ? { countryCode: clean(m.competition?.countryCode).toUpperCase() } : {}),
    home,
    away,
    startsAt,
    live,
    ...(radar ? { extraIds: { betRadarId: radar.replace(/^\D+/, '') } } : {}),
    ...(mainMarkets.length ? { mainMarkets } : {}),
  };
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface BetclicDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Decodes with `decode`, turning any protobuf failure into a `ProviderFormatError`. */
function decodeOrFormatError<T>(decode: (b: Uint8Array) => T, bytes: Uint8Array, what: string): T {
  try {
    return decode(bytes);
  } catch (err) {
    throw new ProviderFormatError(`Betclic ${what}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Posts one gRPC-web request and returns the protobuf bytes of the first data frame,
 * aborting the stream right after it. Throws on HTTP errors, a gRPC error status, timeout
 * or a stream that ends without data.
 */
export async function callFirstFrame(method: string, request: Uint8Array, deps: BetclicDeps = {}): Promise<Uint8Array> {
  const doFetch = deps.fetch ?? (fetch as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await doFetch(BASE_URL + method, { method: 'POST', headers: HEADERS, body: encodeFrame(request) as unknown as BodyInit, signal: controller.signal });
    if (!res.ok) throw new Error(`Betclic ${method}: HTTP ${res.status}`);
    const headerStatus = res.headers.get('grpc-status');
    if (headerStatus && headerStatus !== '0') {
      throw new Error(`Betclic ${method}: grpc-status ${headerStatus} ${res.headers.get('grpc-message') ?? ''}`.trim());
    }
    if (!res.body) throw new Error(`Betclic ${method}: empty body`);
    const reader = res.body.getReader();
    let buffer: Uint8Array = new Uint8Array(0);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (value?.length) buffer = buffer.length ? Buffer.concat([buffer, value]) : value;
        const frames = readFrames(buffer);
        if (frames.data.length) return frames.data[0]!.slice();
        if (frames.grpcStatus !== null) {
          throw new Error(`Betclic ${method}: grpc-status ${frames.grpcStatus} ${frames.grpcMessage ?? ''}`.trim());
        }
        if (done) throw new Error(`Betclic ${method}: stream ended without data`);
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Betclic ${method}: timeout`);
    throw err;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** One calendar page (raw payload). */
export async function fetchSportPage(sport: OddsSport, offset: number, deps: BetclicDeps = {}): Promise<BetclicMatchesBySportPayload> {
  const bytes = await callFirstFrame(
    'GetMatchesBySportWithNotifications',
    encodeMatchesBySportRequest({ sportCode: SPORT_CODE[sport], language: LANGUAGE, offset, limit: PAGE_SIZE }),
    deps,
  );
  return decodeOrFormatError(decodeMatchesBySportFrame, bytes, 'calendar');
}

/** One match detail (raw payload): "Top" without `categoryId`, else that category's markets. */
export async function fetchMatch(matchId: string, categoryId: string | undefined, deps: BetclicDeps = {}): Promise<BetclicMatchPayload> {
  const bytes = await callFirstFrame('GetMatchWithNotification', encodeMatchRequest({ matchId, language: LANGUAGE, categoryId }), deps);
  return decodeOrFormatError(decodeMatchFrame, bytes, 'match');
}

/**
 * Pages the sport's list (40 per page, ≥ 1 s apart) and keeps matches starting inside
 * [fromIso, toIso], plus live ones that started before the window. Stops on a short page,
 * when the offset reaches the total, when a whole page starts after the window end (the
 * list is ordered by start time, live first), or after MAX_PAGES.
 */
export async function listBetclicEvents(sport: OddsSport, fromIso: string, toIso: string, deps: BetclicDeps = {}): Promise<SourceEvent[]> {
  const sleep = deps.sleep ?? defaultSleep;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const out: SourceEvent[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(PAGE_GAP_MS);
    const payload = await fetchSportPage(sport, page * PAGE_SIZE, deps);
    let afterWindow = 0;
    for (const m of payload.matches) {
      const ev = mapMatch(m, sport);
      if (!ev) continue;
      const t = Date.parse(ev.startsAt);
      if (t > to && !ev.live) afterWindow++;
      if (t > to || (t < from && !ev.live) || seen.has(ev.houseEventId)) continue;
      seen.add(ev.houseEventId);
      out.push(ev);
    }
    const n = payload.matches.length;
    if (n < PAGE_SIZE || (page + 1) * PAGE_SIZE >= payload.totalCount) break;
    if (afterWindow === n) break;
  }
  return out;
}

/**
 * All markets of one match: "Top" first, then the other categories it lists (sequential,
 * ≥ 500 ms apart, at most MAX_CATEGORIES), merged and de-duplicated. A failing category
 * stops the extra fetches and keeps what was read so far; only a failing "Top" fails the call.
 */
export async function getBetclicMarkets(matchId: string, deps: BetclicDeps = {}): Promise<SourceMarket[]> {
  const sleep = deps.sleep ?? defaultSleep;
  const top = (await fetchMatch(matchId, undefined, deps)).match;
  if (!top) throw new ProviderFormatError(`Betclic match ${matchId}: payload without match`);
  const markets: BetclicMarket[] = top.subCategories.flatMap((s) => s.markets);
  // The "Top" tab ("ca_ftb_top") is what came back without a category.
  const categories = top.categories
    .map((c) => c.id)
    .filter((id) => id && !/_top$/i.test(id))
    .slice(0, MAX_CATEGORIES);
  for (const categoryId of categories) {
    await sleep(CATEGORY_GAP_MS);
    try {
      const m = (await fetchMatch(matchId, categoryId, deps)).match;
      if (!m) throw new ProviderFormatError('payload without match');
      // An unknown category comes back as "Top" (sub-categories without id): the server ignored it.
      if (!m.subCategories.some((s) => s.id)) {
        logger.warn(`[odds] Betclic category ${categoryId} of ${matchId} came back as Top; skipping the rest`);
        break;
      }
      markets.push(...m.subCategories.flatMap((s) => s.markets));
    } catch (err) {
      logger.warn(`[odds] Betclic category ${categoryId} of ${matchId} failed; keeping what was read`, {
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }
  return mapMarkets(markets);
}

/** Builds the Betclic adapter. */
export function createBetclicSource(deps: BetclicDeps = {}): OddsSource {
  return {
    house: 'betclic',
    listEvents: (sport, fromIso, toIso) => listBetclicEvents(sport, fromIso, toIso, deps),
    getMarkets: (houseEventId) => getBetclicMarkets(houseEventId, deps),
  };
}
