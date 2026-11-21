/**
 * Lebull `OddsSource`: the public JSON API of the sbteam "betting-platform" the site embeds.
 *
 * Start-up (cached 6 h, nothing hard-coded): `GET lebull.pt/share/content/init` gives the sportsbook
 * host (`data.bootstrap.sb_host`); that host's HTML carries `window.PROCESS_ENV` with the API URL and the
 * public tenant id the site itself sends as `X-Auth-Tenant-Id`. Requests are plain GETs with a browser
 * User-Agent, no cookies and no token, ≥ 300 ms apart.
 *
 * Calendar of one sport (no cheap per-date listing exists; `/sports/{id}/leagues/upcoming` is 2-7 MB
 * and top leagues only): the `/sports` tree (one request, shared by the three sports for 60 s), then
 * `/leagues/{id}/upcoming?stakeTypes=[main market]` for the sport's leagues with events, most events
 * first, at most 60 (about 3-30 kB each). Window filtering uses `timestamp`, never `date`.
 * Markets of one event: `/games/{id}/prematch` (17-190 kB).
 *
 * Mapping is pure (`map.ts`); the I/O takes injectable `fetch`/`sleep`, so tests run on fixtures.
 * Health is recorded by the odds service around every call.
 */
import { logger } from '../../../../utils/logger';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { MAIN_STAKE_TYPES, mapLeagueGames, mapPrematch, sportOfId, treeLeagues } from './map';

const INIT_URL = 'https://www.lebull.pt/share/content/init';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const QUERY = 'lang=pt&currency=EUR';
/** `leagueTimeFilter` of the site's "all time" tab: every upcoming game of the league. */
const ALL_TIME = 10;

/** Leagues read per sport and refresh, at most. */
export const MAX_LEAGUES = 60;
/** Spacing between two requests of this adapter. */
export const REQUEST_GAP_MS = 300;
/** Config (API host, tenant) cache. */
export const CONFIG_TTL_MS = 6 * 3_600_000;
/** The `/sports` tree is shared by the calendars of the three sports for this long. */
export const TREE_TTL_MS = 60_000;
const TIMEOUT_MS = 15_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LebullDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ApiConfig {
  apiUrl: string;
  tenantId: string;
}

/** `PROCESS_ENV` of the sportsbook page → API URL and tenant id; throws `ProviderFormatError` when absent. */
export function parseProcessEnv(html: string): ApiConfig {
  const m = html.match(/PROCESS_ENV['"][\s\S]{0,200}?Object\.freeze\((\{[\s\S]*?\})\)/);
  let env: Record<string, unknown> | null = null;
  try {
    env = m ? (JSON.parse(m[1]!) as Record<string, unknown>) : null;
  } catch {
    env = null;
  }
  const apiUrl = String(env?.BETTING_PLATFORM_SVC_URL ?? '');
  const tenantId = String(env?.BETTING_PLATFORM_SVC_TENANT_ID ?? '');
  if (!/^https:\/\/[\w.-]+$/.test(apiUrl) || !/^[\w-]{8,64}$/.test(tenantId)) {
    throw new ProviderFormatError('Lebull: sportsbook page without API URL / tenant id');
  }
  return { apiUrl, tenantId };
}

/** Builds the Lebull adapter. Each instance keeps its own config cache and request pacing. */
export function createLebullSource(deps: LebullDeps = {}): OddsSource {
  const doFetch = deps.fetch ?? (fetch as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;

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

  async function get(url: string, headers: Record<string, string>, what: string): Promise<Response> {
    await pace();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await doFetch(url, { method: 'GET', headers: { 'user-agent': USER_AGENT, 'accept-language': 'pt-PT', ...headers }, signal: controller.signal });
      if (!res.ok) throw new Error(`Lebull ${what}: HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`Lebull ${what}: timeout`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  let config: { value: ApiConfig; at: number } | null = null;
  let configPending: Promise<ApiConfig> | null = null;
  async function loadConfig(): Promise<ApiConfig> {
    const init = (await (await get(INIT_URL, { accept: 'application/json', 'x-locale': 'pt' }, 'init')).json().catch(() => null)) as {
      data?: { bootstrap?: { sb_host?: unknown } };
      bootstrap?: { sb_host?: unknown };
    } | null;
    const host = String(init?.data?.bootstrap?.sb_host ?? init?.bootstrap?.sb_host ?? '');
    if (!/^https:\/\/[\w.-]+\/?$/.test(host)) throw new ProviderFormatError('Lebull: init without sportsbook host');
    const html = await (await get(`${host.replace(/\/$/, '')}/pt`, { accept: 'text/html' }, 'sportsbook page')).text();
    return parseProcessEnv(html);
  }
  async function getConfig(): Promise<ApiConfig> {
    if (config && now() - config.at < CONFIG_TTL_MS) return config.value;
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

  async function api<T>(path: string, what: string): Promise<T> {
    const { apiUrl, tenantId } = await getConfig();
    const sep = path.includes('?') ? '&' : '?';
    const res = await get(`${apiUrl}${path}${sep}${QUERY}`, { accept: 'application/json', 'x-auth-tenant-id': tenantId }, what);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ProviderFormatError(`Lebull ${what}: response is not JSON`);
    }
  }

  let tree: { body: Promise<unknown>; at: number } | null = null;
  function getTree(): Promise<unknown> {
    if (tree && now() - tree.at < TREE_TTL_MS) return tree.body;
    const body = api<unknown>('/sports', 'sports tree');
    tree = { body, at: now() };
    body.catch(() => {
      if (tree?.body === body) tree = null;
    });
    return body;
  }

  async function listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const leagues = treeLeagues(await getTree(), sport).slice(0, MAX_LEAGUES);
    const stakeTypes = `[${MAIN_STAKE_TYPES[sport].join(',')}]`;
    const out: SourceEvent[] = [];
    const seen = new Set<string>();
    let failures = 0;
    let firstError: unknown;
    for (const league of leagues) {
      try {
        const body = await api<unknown>(`/leagues/${league.leagueId}/upcoming?leagueTimeFilter=${ALL_TIME}&stakeTypes=${stakeTypes}`, `league ${league.leagueId}`);
        for (const ev of mapLeagueGames(body, sport)) {
          const t = Date.parse(ev.startsAt);
          if (t > to || (t < from && !ev.live) || seen.has(ev.houseEventId)) continue;
          seen.add(ev.houseEventId);
          out.push(ev);
        }
      } catch (err) {
        failures++;
        firstError ??= err;
        logger.warn(`[odds] Lebull league ${league.leagueId} failed; keeping the rest`, { error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Every league failing is a house failure (health), a few failing is partial data.
    if (leagues.length > 0 && failures === leagues.length) throw firstError;
    return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }

  async function getMarkets(houseEventId: string): Promise<SourceMarket[]> {
    if (!/^\d+$/.test(houseEventId)) throw new ProviderFormatError(`Lebull: bad event id ${houseEventId}`);
    let body: unknown;
    try {
      body = await api<unknown>(`/games/${houseEventId}/prematch`, `event ${houseEventId}`);
    } catch (err) {
      // A game that already started is served by /live.
      if (!(err instanceof Error) || !/HTTP 404/.test(err.message)) throw err;
      body = await api<unknown>(`/games/${houseEventId}/live`, `live event ${houseEventId}`);
    }
    const sport = sportOfId((body as { sportId?: unknown } | null)?.sportId);
    if (!sport) throw new ProviderFormatError(`Lebull event ${houseEventId}: sport not covered`);
    return mapPrematch(body, sport);
  }

  return { house: 'lebull', listEvents, getMarkets };
}
