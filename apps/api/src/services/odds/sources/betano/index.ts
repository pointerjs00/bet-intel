/* eslint-disable @typescript-eslint/no-explicit-any -- Betano JSON is untyped external data; `any` is confined to this boundary. */
import { logger } from '../../../../utils/logger';
import { redis } from '../../../../utils/redis';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { readBootstrap } from './bootstrap';
import { SPORT, leagueEvents } from './endpoints';
import { calendarEvents, mapEvent, mapMarkets, marketsFromState, parseInitialState } from './map';
import { ORIGIN, navigationHeaders } from './profile';
import { createBetanoSession, type BetanoSession, type LockStore } from './session';
import { createImpersonateTransport, createUndiciTransport, type BetanoTransport } from './transport';

export interface BetanoDeps {
  session: BetanoSession;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
}

export const PAGE_GAP_MS = 1200;
/** At most this many extra day requests per listing (the window is 48 h: today + 2 days). */
export const MAX_DAYS = 3;
export const MAX_LEAGUES = 25;
const DAY_MS = 24 * 3_600_000;
/** The site always sends it; it makes "today" a Lisbon day, not the Pi's UTC day. */
const TIME_ZONE = 'Europe/Lisbon';

const json = <T>(text: string, what: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderFormatError(`Betano ${what}: JSON inválido`);
  }
};

/** Calendar URL with extra query params; the shell's URL may already carry a query string. */
const withQuery = (calendar: string, params: Record<string, string>): string => {
  const u = new URL(calendar);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

/**
 * Day tabs of the calendar header (`header.dates`) other than the one already returned, whose
 * [midnight, +24 h) overlaps the window. "3 HORAS"/"12 HORAS" carry `hours` and are skipped.
 */
function otherDays(body: any, from: number, to: number): number[] {
  const dates = body?.data?.header?.dates;
  if (!Array.isArray(dates)) return [];
  return dates
    .filter((d: any) => d && d.hours == null && d.selected !== true && d.hasEvents !== false)
    .map((d: any) => Number(d.date))
    .filter((t: number) => Number.isFinite(t) && t > 0 && t < to && t + DAY_MS > from);
}

/**
 * Prematch calendar: the shell names the endpoint. The default response is today (Lisbon); the
 * other days in the window are asked with `day=<midnight ms>` (the `page` param does not exist).
 * When the calendar is refused or empty, the highlighted leagues are walked instead.
 */
export async function listBetanoEvents(sport: OddsSport, fromIso: string, toIso: string, deps: BetanoDeps): Promise<SourceEvent[]> {
  const now = (deps.now ?? Date.now)();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { code, slug } = SPORT[sport];
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const boot = await readBootstrap(deps.session, code, slug);

  const out: SourceEvent[] = [];
  const seen = new Set<string>();
  const keep = (raw: unknown) => {
    const ev = mapEvent(raw, sport, now);
    if (!ev || seen.has(ev.houseEventId)) return;
    const t = Date.parse(ev.startsAt);
    if (t > to || (t < from && !ev.live)) return;
    seen.add(ev.houseEventId);
    out.push(ev);
  };

  const calendar = withQuery(boot.calendar, { timeZoneId: TIME_ZONE });
  const first = await deps.session.request(calendar);
  if (first.status === 200) {
    const page = json<any>(first.text, 'calendário'); // external JSON boundary
    const events = calendarEvents(page);
    for (const e of events) keep(e);
    let raw = events.length;
    for (const day of otherDays(page, from, to).slice(0, MAX_DAYS)) {
      await sleep(PAGE_GAP_MS);
      const res = await deps.session.request(withQuery(calendar, { day: String(day), sort: 'Leagues' }));
      if (res.status !== 200) break;
      const more = calendarEvents(json<any>(res.text, 'calendário')); // external JSON boundary
      raw += more.length;
      for (const e of more) keep(e);
    }
    // A 200 calendar with raw events is authoritative, even when none fall in the window.
    if (raw > 0) return out;
  } else {
    logger.warn(`[odds] Betano calendário ${sport}: HTTP ${first.status}; a usar destacados`);
  }

  const leagueIds = boot.leagueIds.length > 0 ? boot.leagueIds : await boot.trendingLeagueIds();
  let attempted = 0;
  let failed = 0;
  let succeeded = 0;
  for (const leagueId of leagueIds.slice(0, MAX_LEAGUES)) {
    await sleep(PAGE_GAP_MS);
    const res = await deps.session.request(leagueEvents(code, leagueId));
    if (res.status !== 200) continue;
    attempted++;
    try {
      for (const e of calendarEvents(json<any>(res.text, `liga ${leagueId}`))) keep(e); // external JSON boundary
      succeeded++;
    } catch (err) {
      if (!(err instanceof ProviderFormatError)) throw err;
      failed++;
      logger.warn(`[odds] Betano liga ${leagueId}: ${err.message}`);
    }
  }
  if (attempted > 0 && succeeded === 0 && failed === attempted) {
    throw new ProviderFormatError(`Betano ligas ${sport}: todas as respostas com JSON inválido`);
  }
  return out;
}

/** Resolves the event page URL from the hint: relative → absolute on www.betano.pt; other hosts rejected. */
function resolvePageUrl(houseEventId: string, hint?: { pageUrl?: string }): string {
  if (!hint?.pageUrl) throw new ProviderFormatError(`Betano evento ${houseEventId}: sem pageUrl`);
  let url: URL;
  try {
    url = new URL(hint.pageUrl, ORIGIN);
  } catch {
    throw new ProviderFormatError(`Betano evento ${houseEventId}: pageUrl inválido`);
  }
  if (url.origin !== ORIGIN) throw new ProviderFormatError(`Betano evento ${houseEventId}: host não permitido (${url.host})`);
  return url.toString();
}

/** Markets of one event, from its page's `initial_state`. */
export async function getBetanoMarkets(houseEventId: string, hint: { pageUrl?: string } | undefined, deps: BetanoDeps): Promise<SourceMarket[]> {
  const now = (deps.now ?? Date.now)();
  const url = resolvePageUrl(houseEventId, hint);
  const res = await deps.session.request(url, { headers: navigationHeaders(url, `${ORIGIN}/sport/futebol/`) });
  if (res.status !== 200) throw new ProviderFormatError(`Betano evento: HTTP ${res.status} em ${url}`);
  const state = parseInitialState(res.text);
  if (!state) throw new ProviderFormatError(`Betano evento: initial_state ausente em ${url}`);
  const { markets, selections } = marketsFromState(state, houseEventId);
  const mapped = mapMarkets(markets, selections, now);
  if (mapped.length === 0) throw new ProviderFormatError(`Betano evento: sem mercados em ${url}`);
  return mapped;
}

/** Builds the Betano source on an already-created session. */
export function createBetanoSource(deps: BetanoDeps): OddsSource {
  return {
    house: 'betano',
    listEvents: (sport, fromIso, toIso) => listBetanoEvents(sport, fromIso, toIso, deps),
    getMarkets: (houseEventId, hint) => getBetanoMarkets(houseEventId, hint, deps),
  };
}

/** Source whose every call rejects with `message`; used when the configuration is unusable. */
function brokenSource(message: string): OddsSource {
  const fail = async (): Promise<never> => {
    throw new ProviderFormatError(message);
  };
  return { house: 'betano', listEvents: fail, getMarkets: fail };
}

/**
 * Production factory: sidecar transport when `BETANO_EGRESS_URL` is set (the token is then mandatory,
 * otherwise every call fails without touching the network); direct `fetch` only when the URL is unset.
 */
export function betanoSourceFactory(env: NodeJS.ProcessEnv = process.env): OddsSource {
  const url = env.BETANO_EGRESS_URL;
  const token = env.BETANO_EGRESS_TOKEN;
  if (url && !token) {
    logger.error('[odds] BETANO_EGRESS_URL definido mas BETANO_EGRESS_TOKEN em falta: Betano desativado');
    return brokenSource('Betano: BETANO_EGRESS_TOKEN em falta');
  }
  const transport: BetanoTransport = url && token ? createImpersonateTransport(url, token) : createUndiciTransport();
  if (!url) logger.warn('[odds] BETANO_EGRESS_URL ausente: a usar fetch direto (sem fingerprint)');
  const session = createBetanoSession({ transport, redis: redis as unknown as LockStore, log: logger });
  return createBetanoSource({ session });
}
