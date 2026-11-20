// I/O glue of the odds comparator: catalogue refresh, per-event comparison, day listing.
// Dependencies are injected so tests run without network or Redis.

import { DayCache } from '../sportsData/itemMatch';
import { teamKey, teamNamesMatch } from '../marketResolutionEngine';
import { ProviderFormatError, tracked, type Provider } from '../sportsData/providerHealth';
import { canonicalKey, swapTennisKey } from './canonical';
import { mergeEvent, compareMultiple, type ComparedSelection, type HousePrice } from './compare';
import { candidatesFor, eventKey, matchEvent, radarOf, type Candidate } from './matcher';
import { createOddsStore, type EventCtx, type MarketsSnapshot, type OddsStore } from './store';
import { getSources } from './registry';
import type { CanonicalSelection, HouseId, OddsSource, OddsSport, SourceEvent, SourceMarket } from './types';

export interface OddsServiceDeps {
  sources: OddsSource[];
  store: OddsStore;
  candidates: (sport: OddsSport, dateIso: string, cache?: DayCache) => Promise<Candidate[]>;
  now: () => number;
  /** Health wrapper; defaults to providerHealth.tracked. */
  track: <T>(provider: Provider, call: () => Promise<T>) => Promise<T>;
}

export interface EventInfo {
  home: string;
  away: string;
  startsAt: string;
  competition: string;
  live: boolean;
  /** ISO country of the competition, from the first house that gives one. */
  countryCode?: string;
  /** ESPN participant names, for ESPN-matched events (crests and photos are looked up by them). */
  canonical?: { home: string; away: string };
}

/** Optional EventInfo extras: country code and, for espn: keys, the stored ESPN names. */
function infoExtras(key: string, countryCode: string | undefined, ctx: { home: string; away: string } | null): Pick<EventInfo, 'countryCode' | 'canonical'> {
  return {
    ...(countryCode ? { countryCode } : {}),
    ...(key.startsWith('espn:') && ctx ? { canonical: { home: ctx.home, away: ctx.away } } : {}),
  };
}

export interface EventView {
  eventKey: string;
  sport: OddsSport;
  event: EventInfo;
  houses: HouseId[];
  rows: ComparedSelection[];
  /**
   * Each house's own participant names (the order its market text was keyed with). A boletim
   * registered at a house must carry these names, since settlement parses the house's text.
   */
  names: Partial<Record<HouseId, { home: string; away: string }>>;
}

export interface EventListItem {
  eventKey: string;
  sport: OddsSport;
  event: EventInfo;
  houses: HouseId[];
  houseCount: number;
  main: ComparedSelection[];
  /**
   * How big the game is: the most markets any house opened for it (bookmakers open far more for big
   * games), plus ESPN_BONUS when it is matched to ESPN (top leagues, UEFA, ATP/WTA). 0 when unknown.
   */
  popularity: number;
}

/** Popularity bonus of ESPN-matched events. */
export const ESPN_BONUS = 100;

const HORIZON_MS = 48 * 3600e3;
/** Parallel getEvent calls in multiple(). */
const MULTIPLE_CONCURRENCY = 4;

/** Maps items with at most `limit` calls in flight; results keep the input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
const DAY_MS = 24 * 3600e3;
const MAIN_PREFIX: Record<OddsSport, string> = { FOOTBALL: 'FT.1X2.', TENNIS: 'T.WIN.', BASKETBALL: 'B.ML.' };

/** Folds a numeric line into the selection label when the label lacks it ('Over' + 2.5 -> 'Over 2.5'). */
export function foldLine(label: string, line: number | null | undefined): string {
  if (line === null || line === undefined) return label;
  const n = String(line);
  return label.includes(n) ? label : `${label} ${n}`;
}

const LISBON_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
/** YYYY-MM-DD of an instant in Europe/Lisbon. */
function lisbonDay(ms: number): string {
  return LISBON_DAY.format(new Date(ms));
}

function sportOfKey(key: string): OddsSport | null {
  const s = key.split(':')[1];
  return s === 'FOOTBALL' || s === 'BASKETBALL' || s === 'TENNIS' ? s : null;
}

/** Builds the comparison service; every dependency can be injected. */
export function createOddsService(partial: Partial<OddsServiceDeps> = {}) {
  const deps: OddsServiceDeps = {
    sources: partial.sources ?? getSources(),
    store: partial.store ?? createOddsStore(),
    candidates: partial.candidates ?? ((sport, dateIso, cache) => candidatesFor(sport, dateIso, cache)),
    now: partial.now ?? Date.now,
    track: partial.track ?? tracked,
  };
  const { store } = deps;
  const provider = (house: HouseId) => `odds-${house}` as Provider;

  /** Records a format problem of a house in its health (never throws). */
  function recordFormat(house: HouseId, message: string): void {
    void deps.track(provider(house), () => Promise.reject(new ProviderFormatError(message))).catch(() => undefined);
  }

  /** Canonical participants order: ESPN's for espn keys, sorted for tennis name keys, else the event's own. */
  function canonicalCtx(ev: SourceEvent, key: string, match: Candidate | null): EventCtx {
    if (match && key.startsWith('espn:')) return { home: match.home, away: match.away, startsAt: ev.startsAt };
    if (ev.sport === 'TENNIS' && key.startsWith('n:')) {
      const [h, a] = [ev.home, ev.away].sort((x, y) => teamKey(x).localeCompare(teamKey(y)));
      return { home: h!, away: a!, startsAt: ev.startsAt };
    }
    return { home: ev.home, away: ev.away, startsAt: ev.startsAt };
  }

  /**
   * Lists the next 48 h of a house, stores them, matches them to ESPN and records links, index and
   * canonical participant order. `cache` is shared across houses within one refresh cycle.
   */
  async function refreshCatalogue(source: OddsSource, sport: OddsSport, cache: DayCache = new DayCache()): Promise<number> {
    const from = deps.now();
    const events = await deps.track(provider(source.house), () =>
      source.listEvents(sport, new Date(from).toISOString(), new Date(from + HORIZON_MS).toISOString()));
    await store.setEvents(source.house, sport, events);
    // candidatesFor spans several days around its date; these anchors cover the 48 h window.
    const anchors = sport === 'TENNIS' ? [0, 1] : [1];
    const candidates: Candidate[] = [];
    for (const d of anchors) {
      try {
        candidates.push(...(await deps.candidates(sport, new Date(from + d * DAY_MS).toISOString(), cache)));
      } catch {
        // ESPN down: events fall back to betradar/name keys.
      }
    }
    // Overlapping day windows return the same match more than once; a duplicate would read as a tie.
    const seen = new Set<string>();
    const unique = candidates.filter((c) => (seen.has(`${c.sport}|${c.providerMatchId}`) ? false : (seen.add(`${c.sport}|${c.providerMatchId}`), true)));
    // Linked events of the other houses, built once and only if an event needs them.
    let others: Candidate[] | null = null;
    const otherCandidates = async (): Promise<Candidate[]> => {
      if (others) return others;
      const out: Candidate[] = [];
      for (const other of deps.sources) {
        if (other.house === source.house) continue;
        for (const oe of (await store.getEvents(other.house, sport)) ?? []) {
          const link = await store.getLink(other.house, oe.houseEventId);
          if (link) out.push({ providerMatchId: link, league: null, home: oe.home, away: oe.away, startsAt: oe.startsAt, sport });
        }
      }
      return (others = out);
    };
    let linked = 0;
    for (const ev of events) {
      try {
        const match = matchEvent(ev, unique);
        let key = eventKey(ev, match);
        if (!key) continue;
        const radar = radarOf(ev);
        let aliased = false;
        if (!match && !radar) {
          // No ESPN game and no BetRadar id: join an event another house has already linked.
          const near = matchEvent(ev, await otherCandidates());
          if (near) { key = near.providerMatchId; aliased = true; }
        }
        if (radar && match) {
          // Another house may have missed ESPN for this game: move its links onto the ESPN key now.
          await store.setRadarAlias(sport, radar, key);
          for (const [house, id] of Object.entries(await store.getIndex(`bet:${sport}:${radar}`)) as Array<[HouseId, string]>) {
            if (house === source.house) continue;
            await store.setLink(house, id, key);
            await store.setIndex(key, house, id);
          }
        } else if (radar) {
          const alias = await store.getRadarAlias(sport, radar);
          if (alias) { key = alias; aliased = true; }
        }
        await store.setLink(source.house, ev.houseEventId, key);
        await store.setIndex(key, source.house, ev.houseEventId);
        // bet: keys have no external order: the first house to write decides. An aliased ESPN key keeps
        // the order written by the house that matched ESPN.
        if ((!key.startsWith('bet:') && !aliased) || !(await store.getCtx(key))) await store.setCtx(key, canonicalCtx(ev, key, match));
        linked++;
      } catch {
        recordFormat(source.house, 'evento do calendário com formato inesperado');
      }
    }
    return linked;
  }

  async function findSourceEvent(house: HouseId, sport: OddsSport, houseEventId: string): Promise<SourceEvent | null> {
    const events = (await store.getEvents(house, sport)) ?? [];
    return events.find((e) => e.houseEventId === houseEventId) ?? null;
  }

  async function marketsOf(source: OddsSource, houseEventId: string, own?: { home: string; away: string }, hint?: { pageUrl?: string }): Promise<MarketsSnapshot> {
    const cached = await store.getMarkets(source.house, houseEventId);
    if (cached) return cached;
    const markets = await deps.track(provider(source.house), () => source.getMarkets(houseEventId, hint));
    const snap: MarketsSnapshot = { fetchedAt: new Date(deps.now()).toISOString(), markets, ...(own ? { own } : {}) };
    await store.setMarkets(source.house, houseEventId, snap);
    return snap;
  }

  /**
   * Keys a house's markets in that house's own participant order, then orients tennis/other keys to
   * the canonical order. Undeterminable tennis orientation drops the house's selections; an
   * unexpected reversal outside tennis (the matcher never produces one) also drops them.
   * A selection that cannot be keyed is dropped and counted as a format problem (once per call).
   */
  function canonicalise(
    sport: OddsSport, house: HouseId, markets: SourceMarket[],
    own: { home: string; away: string }, canon: { home: string; away: string } | null,
  ): CanonicalSelection[] | null {
    let swap = false;
    if (canon) {
      const straight = teamNamesMatch(own.home, canon.home) && teamNamesMatch(own.away, canon.away);
      const crossed = teamNamesMatch(own.home, canon.away) && teamNamesMatch(own.away, canon.home);
      if (straight || !crossed) {
        if (!straight && sport === 'TENNIS') return null;
      } else if (sport === 'TENNIS') {
        swap = true;
      } else {
        return null;
      }
    }
    const out: CanonicalSelection[] = [];
    let bad = 0;
    for (const m of markets) {
      try {
        const label = foldLine(m.selectionLabel, m.line);
        let key = canonicalKey(sport, m.marketLabel, label, own);
        if (key && swap) key = swapTennisKey(key);
        out.push({ key, house, marketLabel: m.marketLabel, selectionLabel: label, odds: m.odds, suspended: m.suspended });
      } catch {
        bad++;
      }
    }
    if (bad > 0) recordFormat(house, `${bad} seleções com formato inesperado`);
    return out;
  }

  /** One canonical event compared across houses; null when unknown. A failing house is left out. */
  async function getEvent(key: string): Promise<EventView | null> {
    const sport = sportOfKey(key);
    if (!sport) return null;
    const index = await store.getIndex(key);
    const stored = await store.getCtx(key);
    const perHouse: Partial<Record<HouseId, CanonicalSelection[]>> = {};
    let info: EventInfo | null = null;
    let countryCode: string | undefined;
    const houses: HouseId[] = [];
    const names: Partial<Record<HouseId, { home: string; away: string }>> = {};
    for (const source of deps.sources) {
      const houseEventId = index[source.house];
      if (!houseEventId) continue;
      try {
        const se = await findSourceEvent(source.house, sport, houseEventId);
        countryCode ??= se?.countryCode || undefined;
        const seOwn = se ? { home: se.home, away: se.away } : undefined;
        // Left the stored calendar after kickoff: serve cache only, never count it as a failure.
        const gone = !se && stored !== null && Date.parse(stored.startsAt) < deps.now();
        let snap: MarketsSnapshot;
        if (gone) {
          const cached = await store.getMarkets(source.house, houseEventId);
          if (!cached) continue;
          snap = cached;
        } else {
          snap = await marketsOf(source, houseEventId, seOwn, se?.pageUrl ? { pageUrl: se.pageUrl } : undefined);
        }
        // Own order: the live calendar entry, else the one saved with the cached markets.
        const own = seOwn ?? snap.own;
        if (!own && sport === 'TENNIS') continue; // cannot orient: drop the house
        const sels = canonicalise(sport, source.house, snap.markets, own ?? stored ?? { home: '', away: '' }, own ? stored : null);
        if (sels === null) continue;
        perHouse[source.house] = sels;
        houses.push(source.house);
        if (own) names[source.house] = { home: own.home, away: own.away };
        if (!info && se) info = { home: se.home, away: se.away, startsAt: se.startsAt, competition: se.competition, live: se.live };
      } catch {
        // already recorded by tracked(); the house is simply absent from this response
      }
    }
    if (houses.length === 0) return null;
    if (!info && stored) info = { home: stored.home, away: stored.away, startsAt: stored.startsAt, competition: '', live: false };
    return {
      eventKey: key,
      sport,
      event: { ...(info ?? { home: '', away: '', startsAt: '', competition: '', live: false }), ...infoExtras(key, countryCode, stored) },
      houses,
      rows: mergeEvent(perHouse),
      names,
    };
  }

  /** Canonical events of a Europe/Lisbon day; main market from the stored catalogue only (no per-event fetches). */
  async function listEvents(sport: OddsSport, dateIso: string): Promise<EventListItem[]> {
    const day = dateIso.slice(0, 10);
    const byKey = new Map<string, Array<{ house: HouseId; ev: SourceEvent }>>();
    for (const source of deps.sources) {
      try {
        const events = (await store.getEvents(source.house, sport)) ?? [];
        for (const ev of events) {
          const t = Date.parse(ev.startsAt);
          if (Number.isNaN(t) || lisbonDay(t) !== day) continue;
          const key = await store.getLink(source.house, ev.houseEventId);
          if (!key) continue;
          const list = byKey.get(key) ?? [];
          list.push({ house: source.house, ev });
          byKey.set(key, list);
        }
      } catch {
        recordFormat(source.house, 'calendário guardado ilegível');
      }
    }
    const out: EventListItem[] = [];
    for (const [key, entries] of byKey) {
      const canon = await store.getCtx(key);
      const perHouse: Partial<Record<HouseId, CanonicalSelection[]>> = {};
      const dropped = new Set<HouseId>();
      for (const { house, ev } of entries) {
        try {
          const sels = canonicalise(sport, house, ev.mainMarkets ?? [], { home: ev.home, away: ev.away }, canon);
          if (sels === null) { dropped.add(house); continue; }
          perHouse[house] = sels.filter((c) => c.key?.startsWith(MAIN_PREFIX[sport]));
        } catch {
          recordFormat(house, 'mercado principal com formato inesperado');
        }
      }
      const first = entries[0]!.ev;
      out.push({
        eventKey: key,
        sport,
        event: {
          home: first.home, away: first.away, startsAt: first.startsAt, competition: first.competition, live: first.live,
          ...infoExtras(key, entries.find((e) => e.ev.countryCode)?.ev.countryCode, canon),
        },
        houses: entries.map((e) => e.house).filter((h) => !dropped.has(h)),
        houseCount: entries.length - dropped.size,
        main: mergeEvent(perHouse),
        popularity: Math.max(0, ...entries.map((e) => e.ev.marketCount ?? 0)) + (key.startsWith('espn:') && entries.some((e) => e.ev.marketCount) ? ESPN_BONUS : 0),
      });
    }
    return out.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  }

  /**
   * Totals of a multiple per house; an unknown event or selection is missing for every house.
   * Distinct events are fetched with bounded concurrency (a cold house fetch can take seconds).
   */
  async function multiple(selections: Array<{ eventKey: string; selectionKey: string }>) {
    const keys = [...new Set(selections.map((s) => s.eventKey))];
    const fetched = await mapLimit(keys, MULTIPLE_CONCURRENCY, (k) => getEvent(k));
    const views = new Map<string, EventView | null>(keys.map((k, i) => [k, fetched[i] ?? null]));
    const legs: Array<Partial<Record<HouseId, HousePrice>>> = selections.map((s) => {
      const row = views.get(s.eventKey)?.rows.find((r) => r.key === s.selectionKey);
      return row ? row.prices : {};
    });
    return compareMultiple(legs);
  }

  return { refreshCatalogue, getEvent, listEvents, multiple };
}

export type OddsService = ReturnType<typeof createOddsService>;

let shared: OddsService | null = null;
/** Lazily-built production service (env-driven sources, real Redis). */
export function getOddsService(): OddsService {
  return (shared ??= createOddsService());
}
