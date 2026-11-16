/* eslint-disable @typescript-eslint/no-explicit-any -- Betano JSON is untyped external data; `any` is confined to this boundary. */
import { logger } from '../../../../utils/logger';
import { redis } from '../../../../utils/redis';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { readBootstrap } from './bootstrap';
import { SPORT, leagueEvents } from './endpoints';
import { mapEvent, mapMarkets, marketsFromState, parseInitialState } from './map';
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
export const MAX_PAGES = 12;
export const MAX_LEAGUES = 25;

const json = <T>(text: string, what: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderFormatError(`Betano ${what}: JSON inválido`);
  }
};

/** Same calendar URL with `page=p`; the URL may already carry a query string. */
const pageUrl = (calendar: string, p: number): string => {
  const u = new URL(calendar);
  u.searchParams.set('page', String(p));
  return u.toString();
};

/**
 * Prematch calendar: the shell names the endpoint, paged until a short page. When the calendar is
 * refused, the highlighted leagues are walked instead — fewer events, still real.
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

  const first = await deps.session.request(boot.calendar);
  if (first.status === 200) {
    const page = json<any>(first.text, 'calendário'); // external JSON boundary
    const events = page?.data?.events ?? page?.events ?? page?.data ?? [];
    for (const e of Array.isArray(events) ? events : []) keep(e);
    let raw = Array.isArray(events) ? events.length : 0;
    const total = Number(page?.data?.totalCount ?? page?.totalCount ?? 0);
    for (let p = 1; p < (deps.maxPages ?? MAX_PAGES); p++) {
      if (total > 0 && raw >= total) break;
      await sleep(PAGE_GAP_MS);
      const next = await deps.session.request(pageUrl(boot.calendar, p));
      if (next.status !== 200) break;
      const body = json<any>(next.text, 'calendário'); // external JSON boundary
      const more = body?.data?.events ?? body?.events ?? body?.data ?? [];
      if (!Array.isArray(more) || more.length === 0) break;
      raw += more.length;
      for (const e of more) keep(e);
    }
    if (out.length > 0) return out;
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
      for (const e of json<any>(res.text, `liga ${leagueId}`)?.data ?? []) keep(e); // external JSON boundary
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
  const { markets, selections } = marketsFromState(state);
  const mapped = mapMarkets(markets, selections, now);
  if (mapped.length === 0) throw new ProviderFormatError(`Betano evento: sem mercados em ${url}`);
  return mapped;
}

/** Builds the Betano source on an already-created session. */
export function createBetanoSource(deps: BetanoDeps): OddsSource {
  return {
    house: 'betano',
    listEvents: (sport, fromIso, toIso) => listBetanoEvents(sport, fromIso, toIso, deps),
    getMarkets: (houseEventId, hint?: { pageUrl?: string }) => getBetanoMarkets(houseEventId, hint, deps),
  };
}

/** Production factory: sidecar transport when configured, direct `fetch` otherwise. */
export function betanoSourceFactory(): OddsSource {
  const url = process.env.BETANO_EGRESS_URL;
  const token = process.env.BETANO_EGRESS_TOKEN;
  const transport: BetanoTransport = url && token ? createImpersonateTransport(url, token) : createUndiciTransport();
  if (!url) logger.warn('[odds] BETANO_EGRESS_URL ausente: a usar fetch direto (sem fingerprint)');
  const session = createBetanoSession({ transport, redis: redis as unknown as LockStore, log: logger });
  return createBetanoSource({ session });
}
