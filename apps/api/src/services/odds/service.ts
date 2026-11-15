// I/O glue of the odds comparator: catalogue refresh, per-event comparison, day listing.
// Dependencies are injected so tests run without network or Redis.

import { tracked, type Provider } from '../sportsData/providerHealth';
import { canonicalKey } from './canonical';
import { mergeEvent, compareMultiple, type ComparedSelection, type HousePrice } from './compare';
import { candidatesFor, eventKey, matchEvent, type Candidate } from './matcher';
import { createOddsStore, type OddsStore } from './store';
import { getSources } from './registry';
import type { CanonicalSelection, HouseId, OddsSource, OddsSport, SourceEvent, SourceMarket } from './types';

export interface OddsServiceDeps {
  sources: OddsSource[];
  store: OddsStore;
  candidates: (sport: OddsSport, dateIso: string) => Promise<Candidate[]>;
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
}

export interface EventView {
  eventKey: string;
  sport: OddsSport;
  event: EventInfo;
  houses: HouseId[];
  rows: ComparedSelection[];
}

export interface EventListItem {
  eventKey: string;
  sport: OddsSport;
  event: EventInfo;
  houses: HouseId[];
  houseCount: number;
  main: ComparedSelection[];
}

const HORIZON_MS = 48 * 3600e3;
const DAY_MS = 24 * 3600e3;
const MAIN_PREFIX: Record<OddsSport, string> = { FOOTBALL: 'FT.1X2.', TENNIS: 'T.WIN.', BASKETBALL: 'B.ML.' };

/** Folds a numeric line into the selection label when the label lacks it ('Over' + 2.5 -> 'Over 2.5'). */
export function foldLine(label: string, line: number | null | undefined): string {
  if (line === null || line === undefined) return label;
  const n = String(line);
  return label.includes(n) ? label : `${label} ${n}`;
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
    candidates: partial.candidates ?? ((sport, dateIso) => candidatesFor(sport, dateIso)),
    now: partial.now ?? Date.now,
    track: partial.track ?? tracked,
  };
  const { store } = deps;
  const provider = (house: HouseId) => `odds-${house}` as Provider;

  /** Lists the next 48 h of a house, stores them, matches them to ESPN and records links + index. */
  async function refreshCatalogue(source: OddsSource, sport: OddsSport): Promise<number> {
    const from = deps.now();
    const events = await deps.track(provider(source.house), () =>
      source.listEvents(sport, new Date(from).toISOString(), new Date(from + HORIZON_MS).toISOString()));
    await store.setEvents(source.house, sport, events);
    const candidates: Candidate[] = [];
    for (let d = 0; d <= 2; d++) {
      try {
        candidates.push(...(await deps.candidates(sport, new Date(from + d * DAY_MS).toISOString())));
      } catch {
        // ESPN down: events fall back to betradar/name keys.
      }
    }
    // Overlapping day windows return the same match more than once; a duplicate would read as a tie.
    const seen = new Set<string>();
    const unique = candidates.filter((c) => (seen.has(`${c.sport}|${c.providerMatchId}`) ? false : (seen.add(`${c.sport}|${c.providerMatchId}`), true)));
    let linked = 0;
    for (const ev of events) {
      const key = eventKey(ev, matchEvent(ev, unique));
      if (!key) continue;
      await store.setLink(source.house, ev.houseEventId, key);
      await store.setIndex(key, source.house, ev.houseEventId);
      linked++;
    }
    return linked;
  }

  async function findSourceEvent(house: HouseId, sport: OddsSport, houseEventId: string): Promise<SourceEvent | null> {
    const events = (await store.getEvents(house, sport)) ?? [];
    return events.find((e) => e.houseEventId === houseEventId) ?? null;
  }

  async function marketsOf(source: OddsSource, houseEventId: string): Promise<SourceMarket[]> {
    const cached = await store.getMarkets(source.house, houseEventId);
    if (cached) return cached.markets;
    const markets = await deps.track(provider(source.house), () => source.getMarkets(houseEventId));
    await store.setMarkets(source.house, houseEventId, { fetchedAt: new Date(deps.now()).toISOString(), markets });
    return markets;
  }

  /** One canonical event compared across houses; null when unknown. A failing house is left out. */
  async function getEvent(key: string): Promise<EventView | null> {
    const sport = sportOfKey(key);
    if (!sport) return null;
    const index = await store.getIndex(key);
    const perHouse: Partial<Record<HouseId, CanonicalSelection[]>> = {};
    let info: EventInfo | null = null;
    const houses: HouseId[] = [];
    for (const source of deps.sources) {
      const houseEventId = index[source.house];
      if (!houseEventId) continue;
      try {
        const se = await findSourceEvent(source.house, sport, houseEventId);
        const ctx = { home: se?.home ?? '', away: se?.away ?? '' };
        const markets = await marketsOf(source, houseEventId);
        perHouse[source.house] = markets.map((m) => {
          const label = foldLine(m.selectionLabel, m.line);
          return {
            key: canonicalKey(sport, m.marketLabel, label, ctx),
            house: source.house,
            marketLabel: m.marketLabel,
            selectionLabel: label,
            odds: m.odds,
            suspended: m.suspended,
          };
        });
        houses.push(source.house);
        if (!info && se) info = { home: se.home, away: se.away, startsAt: se.startsAt, competition: se.competition, live: se.live };
      } catch {
        // already recorded by tracked(); the house is simply absent from this response
      }
    }
    if (houses.length === 0) return null;
    return {
      eventKey: key,
      sport,
      event: info ?? { home: '', away: '', startsAt: '', competition: '', live: false },
      houses,
      rows: mergeEvent(perHouse),
    };
  }

  /** Canonical events of a UTC day; main market from the stored catalogue only (no per-event fetches). */
  async function listEvents(sport: OddsSport, dateIso: string): Promise<EventListItem[]> {
    const day = dateIso.slice(0, 10);
    const byKey = new Map<string, Array<{ house: HouseId; ev: SourceEvent }>>();
    for (const source of deps.sources) {
      const events = (await store.getEvents(source.house, sport)) ?? [];
      for (const ev of events) {
        const t = Date.parse(ev.startsAt);
        if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) continue;
        const key = await store.getLink(source.house, ev.houseEventId);
        if (!key) continue;
        const list = byKey.get(key) ?? [];
        list.push({ house: source.house, ev });
        byKey.set(key, list);
      }
    }
    const out: EventListItem[] = [];
    for (const [key, entries] of byKey) {
      const perHouse: Partial<Record<HouseId, CanonicalSelection[]>> = {};
      for (const { house, ev } of entries) {
        const ctx = { home: ev.home, away: ev.away };
        perHouse[house] = (ev.mainMarkets ?? []).map((m) => {
          const label = foldLine(m.selectionLabel, m.line);
          return { key: canonicalKey(sport, m.marketLabel, label, ctx), house, marketLabel: m.marketLabel, selectionLabel: label, odds: m.odds, suspended: m.suspended };
        }).filter((c) => c.key?.startsWith(MAIN_PREFIX[sport]));
      }
      const first = entries[0]!.ev;
      out.push({
        eventKey: key,
        sport,
        event: { home: first.home, away: first.away, startsAt: first.startsAt, competition: first.competition, live: first.live },
        houses: entries.map((e) => e.house),
        houseCount: entries.length,
        main: mergeEvent(perHouse),
      });
    }
    return out.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  }

  /** Totals of a multiple per house; an unknown event or selection is missing for every house. */
  async function multiple(selections: Array<{ eventKey: string; selectionKey: string }>) {
    const views = new Map<string, EventView | null>();
    const legs: Array<Partial<Record<HouseId, HousePrice>>> = [];
    for (const s of selections) {
      if (!views.has(s.eventKey)) views.set(s.eventKey, await getEvent(s.eventKey));
      const row = views.get(s.eventKey)?.rows.find((r) => r.key === s.selectionKey);
      legs.push(row ? row.prices : {});
    }
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
