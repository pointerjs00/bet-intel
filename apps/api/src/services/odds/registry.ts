import { logger } from '../../utils/logger';
import type { HouseId, OddsSource } from './types';

/** Adapter factories, filled in as each house adapter lands. */
const FACTORIES: Partial<Record<HouseId, () => OddsSource>> = {};

/** Registers an adapter factory (used by the adapter modules). */
export function registerSource(house: HouseId, factory: () => OddsSource): void {
  FACTORIES[house] = factory;
}

/** Sources enabled by `ODDS_SOURCES` (comma-separated house ids; empty by default). */
export function getSources(env: string | undefined = process.env.ODDS_SOURCES): OddsSource[] {
  const out: OddsSource[] = [];
  for (const raw of (env ?? '').split(',')) {
    const id = raw.trim().toLowerCase() as HouseId;
    if (!id) continue;
    const factory = FACTORIES[id];
    if (!factory) {
      logger.warn(`[odds] ODDS_SOURCES: unknown or unavailable house "${id}"`);
      continue;
    }
    out.push(factory());
  }
  return out;
}
