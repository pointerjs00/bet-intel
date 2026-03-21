/**
 * Bet365 scraper — https://www.bet365.com (PT locale)
 */

import type { IScraper, ScrapedEvent } from '../types';
import { scrapeConfiguredFootballSite } from './browserSiteScraper';

const CONFIG = {
  siteLabel: 'Bet365Scraper',
  footballUrl: 'https://www.bet365.com/#/IP/B1',
  waitForSelector: '.ovm-Fixture, .srb-EventContainer, [data-testid="fixture"]',
  eventSelectors: [
    '.ovm-Fixture',
    '.srb-EventContainer',
    '[data-testid="fixture"]',
    '.gl-MarketGroup',
  ],
  teamSelectors: [
    '.ovm-FixtureDetailsTwoWay_TeamName',
    '.srb-ParticipantLabel_Name',
    '[data-testid="team-name"]',
  ],
  dateSelectors: [
    '.ovm-FixtureDetailsTwoWay_Date',
    '.srb-EventDate',
    '[data-testid="fixture-time"]',
  ],
  leagueSelectors: [
    '.ovm-CompetitionHeader_Name',
    '.srb-CompetitionHeader_Name',
    '[data-testid="competition-name"]',
  ],
  oddSelectors: [
    '.ovm-ParticipantStackedCentered_Odds',
    '.gl-Participant_Odds',
    '[data-testid="price-button"]',
  ],
  cookieSelectors: [
    '#onetrust-accept-btn-handler',
    '[data-testid="cookie-accept"]',
    'button[class*="cookie"]',
  ],
  acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8',
} as const;

export class Bet365Scraper implements IScraper {
  readonly siteSlug = 'bet365';
  readonly siteName = 'Bet365';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    return scrapeConfiguredFootballSite(CONFIG);
  }
}