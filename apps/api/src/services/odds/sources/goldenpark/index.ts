/**
 * GoldenPark `OddsSource`: the public JSON "component tree" API (Sportnco platform) that the
 * apostas.goldenpark.pt site itself calls: `POST ws.goldenpark.pt/component/datatree` with the page
 * path as `url_key`. No cookie, token or login; plain requests with a browser User-Agent and gzip.
 * An HTML answer (anti-bot page) is a `ProviderFormatError`, never something to get around.
 *
 * Rate limit: the F5 WAF in front answers 429 after ~20 requests in ~20 s (measured at 0.3 to 1 s gaps) and
 * then 403 for a few minutes, so requests are spaced REQUEST_GAP_MS = 2 s apart (the study ran 28 at that
 * pace without a 429). A 429/403 stops the refresh at once (no further requests while limited).
 *
 * There is no "all games of the next 48 h" page, so the calendar of a sport is: the sport page (list of
 * competitions with their event counts), then one request per competition taken by number of events,
 * capped per sport (football 20, basketball 8, tennis 6). Each competition answer already carries every
 * pre-match event with its main markets. Markets of one event: the event page (`/evento/<id>-<slug>`).
 *
 * Mapping is pure (`map.ts`); the I/O takes injectable `fetch`/`sleep`, so tests run on fixtures.
 * Health is recorded by the odds service around every call.
 */
import { logger } from '../../../../utils/logger';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { SPORT_PAGE, eventUrlKey, findComponent, mapCompetitionEvents, mapEventPage, parseCompetitions } from './map';

const ENDPOINT = 'https://ws.goldenpark.pt/component/datatree';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Spacing between two requests of this adapter (the WAF rate-limits at ~1 request/s sustained). */
export const REQUEST_GAP_MS = 2000;
/** Competitions read per sport and refresh, at most. */
export const MAX_COMPETITIONS: Record<OddsSport, number> = { FOOTBALL: 20, BASKETBALL: 8, TENNIS: 6 };
const TIMEOUT_MS = 30_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GoldenParkDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** HTTP status error. */
class HttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`GoldenPark ${what}: HTTP ${status}`);
  }
}

/** Builds the GoldenPark adapter. Each instance keeps its own request pacing. */
export function createGoldenParkSource(deps: GoldenParkDeps = {}): OddsSource {
  const doFetch = deps.fetch ?? (fetch as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;

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

  /** One paced page request returning the parsed component tree; HTML or non-tree bodies are format errors. */
  async function page(urlKey: string, what: string): Promise<unknown> {
    await pace();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json',
          'accept-language': 'pt-PT',
          'accept-encoding': 'gzip',
          'content-type': 'application/json',
          origin: 'https://apostas.goldenpark.pt',
          referer: 'https://apostas.goldenpark.pt/',
        },
        body: JSON.stringify({
          context: { url_key: urlKey, url_params: {}, device: 'web_vuejs_desktop', version: '1.0.1', lang: 'pt', timezone: 'Europe/Lisbon', clientIp: '1.1.1.1' },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new HttpError(res.status, what);
      const raw = await res.text();
      let body: { tree?: { components?: unknown } } | null;
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        throw new ProviderFormatError(`GoldenPark ${what}: response is not JSON${/^\s*</.test(raw) ? ' (HTML page)' : ''}`);
      }
      if (!body || !Array.isArray(body.tree?.components)) throw new ProviderFormatError(`GoldenPark ${what}: no component tree`);
      return body;
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`GoldenPark ${what}: timeout`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const sportBody = await page(SPORT_PAGE[sport], `${sport} sport page`);
    if (!findComponent(sportBody, 'sport_page_all')) throw new ProviderFormatError(`GoldenPark ${sport} sport page: no competition list`);
    const competitions = parseCompetitions(sportBody).slice(0, MAX_COMPETITIONS[sport]);
    const out: SourceEvent[] = [];
    const seen = new Set<string>();
    let failures = 0;
    let lastFailure: unknown;
    for (const c of competitions) {
      let body: unknown;
      try {
        body = await page(c.url, `${sport} competition ${c.id}`);
      } catch (err) {
        // An anti-bot / format problem, or the WAF rate limit, is the whole house's problem: stop asking.
        // Any other failure only loses that competition.
        if (err instanceof ProviderFormatError || (err instanceof HttpError && (err.status === 429 || err.status === 403))) throw err;
        failures++;
        lastFailure = err;
        logger.warn(`[odds] GoldenPark ${sport} competition ${c.id} skipped: ${(err as Error).message}`);
        continue;
      }
      for (const ev of mapCompetitionEvents(body, sport)) {
        const t = Date.parse(ev.startsAt);
        if (t > to || t < from || seen.has(ev.houseEventId)) continue;
        seen.add(ev.houseEventId);
        out.push(ev);
      }
    }
    if (competitions.length > 0 && failures === competitions.length) throw lastFailure;
    return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }

  async function getMarkets(houseEventId: string, hint?: { pageUrl?: string }): Promise<SourceMarket[]> {
    const urlKey = eventUrlKey(houseEventId, hint?.pageUrl);
    if (!urlKey) throw new ProviderFormatError(`GoldenPark: bad event id ${houseEventId}`);
    const view = mapEventPage(await page(urlKey, `event ${houseEventId}`));
    if (!view) throw new ProviderFormatError(`GoldenPark event ${houseEventId}: no event page or sport not covered`);
    return view.markets;
  }

  return { house: 'goldenpark', listEvents, getMarkets };
}
