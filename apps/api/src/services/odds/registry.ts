import { logger } from '../../utils/logger';
import { createBetclicSource } from './sources/betclic';
import { betanoSourceFactory } from './sources/betano';
import { createLebullSource } from './sources/lebull';
import { createBwinSource } from './sources/bwin';
import { createCasinoPortugalSource } from './sources/casinoportugal';
import { createGoldenParkSource } from './sources/goldenpark';
import { createRetabetSource } from './sources/retabet';
import { sharedSportsWidgetSource } from './sources/sportswidget';
import type { HouseId, OddsSource } from './types';

/** Adapter factories, filled in as each house adapter lands. */
const FACTORIES: Partial<Record<HouseId, () => OddsSource>> = {
  betclic: () => createBetclicSource(),
  betano: betanoSourceFactory,
  lebull: () => createLebullSource(),
  bwin: () => createBwinSource(),
  casinoportugal: () => createCasinoPortugalSource(),
  goldenpark: () => createGoldenParkSource(),
  retabet: () => createRetabetSource(),
  // Same widget feed, separate hosts and state; one shared instance per house (the model is several MB).
  placard: () => sharedSportsWidgetSource('placard'),
  solverde: () => sharedSportsWidgetSource('solverde'),
};

/** Registers an adapter factory (used by the adapter modules). */
export function registerSource(house: HouseId, factory: () => OddsSource): void {
  FACTORIES[house] = factory;
}

/** One production instance per house, shared by the catalogue job and the API service. */
const instances = new Map<HouseId, OddsSource>();

/**
 * Sources enabled by `ODDS_SOURCES` (comma-separated house ids; empty by default). Each house is built
 * once per process and reused, so the job (which calls this every run) and the API's getMarkets share
 * one config cache, session, request pacing and block cooldown per house. `fresh: true` builds new,
 * unshared instances (tests, the coverage probe).
 */
export function getSources(env: string | undefined = process.env.ODDS_SOURCES, opts: { fresh?: boolean } = {}): OddsSource[] {
  const out: OddsSource[] = [];
  for (const raw of (env ?? '').split(',')) {
    const id = raw.trim().toLowerCase() as HouseId;
    if (!id) continue;
    const factory = FACTORIES[id];
    if (!factory) {
      logger.warn(`[odds] ODDS_SOURCES: unknown or unavailable house "${id}"`);
      continue;
    }
    if (opts.fresh) { out.push(factory()); continue; }
    let src = instances.get(id);
    if (!src) instances.set(id, (src = factory()));
    out.push(src);
  }
  return out;
}
