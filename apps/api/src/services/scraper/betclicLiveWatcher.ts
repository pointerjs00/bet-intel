import { logger } from '../../utils/logger';
import { BetclicScraper, type BetclicLiveWatchDispatch } from './sites/betclicScraper';
import { persistScrapedEventsForSite } from './scraperRegistry';

let stopWatcher: (() => Promise<void>) | null = null;

function isWatcherEnabled(): boolean {
  return process.env.BETCLIC_LIVE_WATCHER_ENABLED !== 'false';
}

async function handleDispatch(scraper: BetclicScraper, dispatch: BetclicLiveWatchDispatch): Promise<void> {
  await persistScrapedEventsForSite(scraper.siteSlug, scraper.siteName, dispatch.events, {
    incremental: dispatch.incremental,
  });
}

export async function startBetclicLiveWatcher(): Promise<void> {
  if (!isWatcherEnabled()) {
    logger.info('Betclic live watcher disabled by env');
    return;
  }

  if (stopWatcher) {
    return;
  }

  const scraper = new BetclicScraper();
  stopWatcher = await scraper.startLiveWatch((dispatch) => handleDispatch(scraper, dispatch));
  logger.info('Betclic live watcher started');
}

export async function stopBetclicLiveWatcher(): Promise<void> {
  if (!stopWatcher) {
    return;
  }

  const stop = stopWatcher;
  stopWatcher = null;
  await stop();
  logger.info('Betclic live watcher stopped');
}
