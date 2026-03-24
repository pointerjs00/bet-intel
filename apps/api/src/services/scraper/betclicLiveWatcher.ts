/**
 * Betclic live watcher — disabled.
 * Odds are now polled via The Odds API (oddsApiService.ts).
 * Stubs kept so import sites in index.ts don't need updating.
 */
import { logger } from '../../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function startBetclicLiveWatcher(): Promise<void> {
  logger.info('Betclic live watcher disabled — using The Odds API instead');
}

export async function stopBetclicLiveWatcher(): Promise<void> {}
