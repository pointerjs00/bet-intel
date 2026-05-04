/**
 * fixtureService.ts — DEPRECATED
 *
 * This file previously fetched fixtures from openfootball JSON feeds.
 * The project now uses API-Football exclusively via:
 *   apps/api/src/services/apifootball/fixturesSync.ts
 *
 * All exports below are kept as no-ops so that any call sites that haven't
 * been updated yet don't crash. Remove this file once all references are
 * gone (search for `fixtureService` imports).
 */

import { logger } from '../utils/logger';
import {
  fixturesSyncJob,
  ensureFixturesFresh as apiFootballEnsureFixturesFresh,
} from './apifootball/fixturesSync';

export interface IngestResult {
  upserted: number;
  leagues: number;
  fallbacks: number;
}

export interface RecomputeResult {
  teams: number;
  competitions: number;
}

/**
 * @deprecated Use fixturesSyncJob() from apifootball/fixturesSync instead.
 * Delegates to the API-Football sync so any existing job triggers still work.
 */
export async function ingestFixtures(): Promise<IngestResult> {
  logger.warn(
    '[fixtureService] ingestFixtures() is deprecated — delegating to API-Football fixturesSyncJob()',
  );
  await fixturesSyncJob();
  return { upserted: 0, leagues: 0, fallbacks: 0 };
}

/**
 * @deprecated TeamStat recomputation is now driven by the API-Football
 * standings sync (standingsSync.ts) rather than being derived from raw
 * fixture scores. This is a no-op.
 */
export async function recomputeTeamStats(): Promise<RecomputeResult> {
  logger.warn(
    '[fixtureService] recomputeTeamStats() is deprecated and is now a no-op. ' +
      'TeamStat rows are populated by the API-Football standings sync job.',
  );
  return { teams: 0, competitions: 0 };
}

/**
 * @deprecated Use ensureFixturesFresh() from apifootball/fixturesSync instead.
 */
export async function ensureFixturesFresh(maxAgeHours = 24 * 7): Promise<void> {
  logger.warn(
    '[fixtureService] ensureFixturesFresh() is deprecated — delegating to API-Football',
  );
  await apiFootballEnsureFixturesFresh();
}