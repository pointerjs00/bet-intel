import type { HouseId, OddsSport, SourceEvent, SourceMarket } from './types';
import { redis } from '../../utils/redis';

/** Minimal Redis surface used by the odds store (ioredis satisfies it; easy to fake). */
export interface OddsRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export const EVENTS_TTL_S = 30 * 60;
export const LINK_TTL_S = 48 * 3600;
export const MARKETS_TTL_S = 60;
export const INDEX_TTL_S = 48 * 3600;

/** Cached full-market snapshot of one house event. */
export interface MarketsSnapshot {
  fetchedAt: string;
  markets: SourceMarket[];
}

async function getJson<T>(client: OddsRedis, key: string): Promise<T | null> {
  const raw = await client.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Thin Redis I/O for the odds comparator; keys and TTLs per PLANO_ODDS. */
export function createOddsStore(client: OddsRedis = redis as unknown as OddsRedis) {
  return {
    /** Last calendar of a house/sport (TTL 30 min). */
    getEvents: (house: HouseId, sport: OddsSport) =>
      getJson<SourceEvent[]>(client, `odds:events:${house}:${sport}`),
    setEvents: (house: HouseId, sport: OddsSport, events: SourceEvent[]) =>
      client.set(`odds:events:${house}:${sport}`, JSON.stringify(events), 'EX', EVENTS_TTL_S),

    /** House event to canonical event key (TTL 48 h). */
    getLink: (house: HouseId, houseEventId: string) =>
      client.get(`odds:link:${house}:${houseEventId}`),
    setLink: (house: HouseId, houseEventId: string, eventKey: string) =>
      client.set(`odds:link:${house}:${houseEventId}`, eventKey, 'EX', LINK_TTL_S),

    /** Full markets of one house event (TTL 60 s). */
    getMarkets: (house: HouseId, houseEventId: string) =>
      getJson<MarketsSnapshot>(client, `odds:markets:${house}:${houseEventId}`),
    setMarkets: (house: HouseId, houseEventId: string, snapshot: MarketsSnapshot) =>
      client.set(`odds:markets:${house}:${houseEventId}`, JSON.stringify(snapshot), 'EX', MARKETS_TTL_S),

    /** Canonical event key to { house: houseEventId } (TTL 48 h). */
    async getIndex(eventKey: string): Promise<Partial<Record<HouseId, string>>> {
      return (await client.hgetall(`odds:index:${eventKey}`)) as Partial<Record<HouseId, string>>;
    },
    async setIndex(eventKey: string, house: HouseId, houseEventId: string): Promise<void> {
      const key = `odds:index:${eventKey}`;
      await client.hset(key, house, houseEventId);
      await client.expire(key, INDEX_TTL_S);
    },
  };
}

export type OddsStore = ReturnType<typeof createOddsStore>;
