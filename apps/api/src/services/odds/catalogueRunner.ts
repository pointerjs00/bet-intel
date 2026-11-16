import type { DayCache } from '../sportsData/itemMatch';
import type { OddsSource, OddsSport } from './types';

/** Sports refreshed for each house, in order. */
export const ODDS_SPORTS: OddsSport[] = ['FOOTBALL', 'BASKETBALL', 'TENNIS'];
/** Pause between sports of the same house (low traffic). */
export const SPORT_PAUSE_MS = 2000;

export interface CatalogueRunnerDeps {
  sources: OddsSource[];
  refresh: (source: OddsSource, sport: OddsSport, cache: DayCache) => Promise<number>;
  /** Takes the per-house lock; false when another run holds it. */
  acquire: (house: string) => Promise<boolean>;
  release: (house: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  newCache: () => DayCache;
  log: { warn: (m: string, meta?: unknown) => void; error: (m: string, meta?: unknown) => void; debug: (m: string) => void };
}

/**
 * One catalogue pass: for each house (lock held) and each sport, refreshes the calendar. A failure in
 * one sport or house is logged and never stops the others. One DayCache is shared across the pass.
 */
export async function runOddsCatalogue(deps: CatalogueRunnerDeps): Promise<void> {
  const cache = deps.newCache();
  for (const source of deps.sources) {
    const house = source.house;
    let locked = false;
    try {
      locked = await deps.acquire(house);
    } catch (err) {
      deps.log.warn(`[oddsCatalogue] lock error for ${house}`, { error: String(err) });
    }
    if (!locked) {
      deps.log.debug(`[oddsCatalogue] ${house} still running, skipping`);
      continue;
    }
    try {
      for (let i = 0; i < ODDS_SPORTS.length; i++) {
        if (i > 0) await deps.sleep(SPORT_PAUSE_MS);
        const sport = ODDS_SPORTS[i];
        try {
          await deps.refresh(source, sport, cache);
        } catch (err) {
          deps.log.error(`[oddsCatalogue] ${house}/${sport} failed`, { error: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      await deps.release(house).catch(() => undefined);
    }
  }
}
