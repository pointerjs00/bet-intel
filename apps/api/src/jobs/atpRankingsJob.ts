/**
 * ATP Rankings Update Job
 *
 * Scrapes the current ATP singles rankings from the ATP Tour website and
 * upserts all players into the Team table with sport=TENNIS.
 *
 * Schedule: every Monday at 06:00 UTC (rankings update by ATP on Mondays).
 * Can also be triggered manually via POST /api/reference/atp-rankings/refresh.
 *
 * Player photo URLs are stored in the Redis cache key `atp:photos:{name}`
 * so they can be served dynamically without a DB schema change.
 */

import Bull from 'bull';
import * as cheerio from 'cheerio';
import { existsSync } from 'fs';
import { Sport } from '@prisma/client';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { prisma } from '../prisma';
import { backfillMissingPlayerCountries, getTennisCountryFromCode, TENNIS_COUNTRY_CODE_TO_NAME } from '../utils/tennisCountryBackfill';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

puppeteer.use(StealthPlugin());

// ─── Queue ────────────────────────────────────────────────────────────────────

export const atpRankingsQueue = new Bull('atp-rankings', process.env.REDIS_URL!, {
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  },
});

atpRankingsQueue.on('error', (err) => {
  logger.error('[ATP Rankings] Queue error', { error: err.message });
});

// ─── Scraper ──────────────────────────────────────────────────────────────────

interface ScrapedPlayer {
  rank: number;
  name: string;
  displayName: string | null;
  photoUrl: string | null;
  country: string | null;
}

const ATP_HEADSHOT_ALIAS = (playerCode: string) =>
  `https://www.atptour.com/-/media/alias/player-headshot/${playerCode.toLowerCase()}`;

const ATP_FLAG_CODE_TO_COUNTRY: Record<string, string> = TENNIS_COUNTRY_CODE_TO_NAME;

function getPlayerCodeFromHref(profileHref?: string | null): string | null {
  const match = profileHref?.match(/\/players\/[^/]+\/([^/]+)\//i);
  return match?.[1]?.toLowerCase() ?? null;
}

function getDisplayNameFromHref(profileHref?: string | null): string | null {
  const slug = profileHref?.match(/\/players\/([^/]+)\/[^/]+\//i)?.[1];
  if (!slug) {
    return null;
  }

  const lowerCaseParticles = new Set(['da', 'de', 'del', 'des', 'di', 'dos', 'du', 'la', 'le', 'van', 'von']);
  return slug
    .split('-')
    .filter(Boolean)
    .map((part, index) => (
      lowerCaseParticles.has(part) && index > 0
        ? part
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`
    ))
    .join(' ');
}

function getCountryFromFlag(root: cheerio.Cheerio<any>): string | null {
  const flagRef = root.find('svg.atp-flag use, svg[class*="flag"] use').first().attr('href')
    ?? root.find('svg.atp-flag use, svg[class*="flag"] use').first().attr('xlink:href');
  const flagCode = flagRef?.match(/flag-([a-z]+)/i)?.[1]?.toLowerCase();
  return flagCode ? (getTennisCountryFromCode(flagCode) ?? ATP_FLAG_CODE_TO_COUNTRY[flagCode] ?? null) : null;
}

function parseATPRankingsHtml(html: string, limit: number): ScrapedPlayer[] {
  const $ = cheerio.load(html);
  const players: ScrapedPlayer[] = [];

  $('table.mega-table tbody tr, table[class*="rankings"] tbody tr').each((_i, row) => {
    if (players.length >= limit) return false;

    const rowRoot = $(row);
    const cells = rowRoot.find('td');
    const rankText = rowRoot.find('td.rank, td[class*="rank"]').first().text().trim() || cells.eq(0).text().trim();
    const rank = parseInt(rankText, 10);
    if (!rank || isNaN(rank)) return;

    const profileLink = rowRoot.find('a[href*="/players/"]').first();
    const profileHref = profileLink.attr('href');
    const playerCode = getPlayerCodeFromHref(profileHref);
    const displayName = getDisplayNameFromHref(profileHref);
    const nameCell = rowRoot.find('td.player, td[class*="player"]').first();
    const name = profileLink.text().replace(/\s+/g, ' ').trim() || nameCell.text().replace(/\s+/g, ' ').trim();
    if (!name) return;

    const img = rowRoot.find('img[src*="player"], img[src*="headshot"], img[data-src*="player"], img[data-src*="headshot"]').first();
    const photoUrl = img.attr('data-src') ?? img.attr('src') ?? (playerCode ? ATP_HEADSHOT_ALIAS(playerCode) : null);
    const countryImg = rowRoot.find('img[alt]').first();
    const country = countryImg.attr('alt')?.trim() ?? getCountryFromFlag(rowRoot) ?? null;

    players.push({ rank, name, displayName, photoUrl: photoUrl ?? null, country });
  });

  if (players.length === 0) {
    $('[class*="player-row"], [class*="ranking-item"]').each((_i, el) => {
      if (players.length >= limit) return false;
      const rowRoot = $(el);
      const rankText = rowRoot.find('[class*="rank"]').first().text().trim();
      const rank = parseInt(rankText, 10);
      if (!rank || isNaN(rank)) return;

      const profileLink = rowRoot.find('a[href*="/players/"]').first();
      const profileHref = profileLink.attr('href');
      const playerCode = getPlayerCodeFromHref(profileHref);
      const displayName = getDisplayNameFromHref(profileHref);
      const name = profileLink.text().replace(/\s+/g, ' ').trim()
        || rowRoot.find('[class*="player-name"], [class*="name"]').first().text().replace(/\s+/g, ' ').trim();
      if (!name) return;

      const img = rowRoot.find('img[src*="player"], img[src*="headshot"], img[data-src*="player"], img[data-src*="headshot"]').first();
      const photoUrl = img.attr('data-src') ?? img.attr('src') ?? (playerCode ? ATP_HEADSHOT_ALIAS(playerCode) : null);
      players.push({
        rank,
        name,
        displayName,
        photoUrl: photoUrl ?? null,
        country: getCountryFromFlag(rowRoot),
      });
    });
  }

  return [...new Map(players.map((player) => [player.name.toLowerCase().trim(), player])).values()]
    .map((player) => ({ ...player, name: player.name.trim().replace(/\s+/g, ' ') }))
    .sort((left, right) => left.rank - right.rank)
    .slice(0, limit);
}

function getBrowserExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => existsSync(candidate));
}

async function scrapeATPRankingsViaBrowser(limit: number): Promise<ScrapedPlayer[]> {
  const rankingsUrl = 'https://www.atptour.com/en/rankings/singles?rankRange=1-500';
  const executablePath = getBrowserExecutablePath();
  if (!executablePath) {
    throw new Error('No Chromium/Chrome executable found for ATP rankings browser scrape');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 2200 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    await page.goto(rankingsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => Boolean(
        document.querySelector('table.mega-table tbody tr')
          || document.querySelector('table[class*="rankings"] tbody tr')
          || document.querySelector('[class*="player-row"]')
          || document.querySelector('[class*="ranking-item"]'),
      ),
      { timeout: 20_000 },
    ).catch(() => undefined);

    const html = await page.content();
    return parseATPRankingsHtml(html, limit);
  } finally {
    await browser.close();
  }
}

/**
 * Fetches and parses ATP singles rankings page.
 * Uses Cheerio (HTML already in response — no JS rendering needed for rankings).
 */
async function scrapeATPRankings(limit = 500): Promise<ScrapedPlayer[]> {
  const url = 'https://www.atptour.com/en/rankings/singles?rankRange=1-500';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!res.ok) {
      throw new Error(`ATP rankings fetch failed: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const players = parseATPRankingsHtml(html, limit);
    if (players.length > 0) {
      return players;
    }
  } catch (err) {
    logger.warn('[ATP Rankings] Direct fetch blocked or empty, falling back to browser scrape', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return scrapeATPRankingsViaBrowser(limit);
}

// ─── Job processor ────────────────────────────────────────────────────────────

export async function processATPRankingsUpdate(): Promise<{ updated: number; skipped: number }> {
  logger.info('[ATP Rankings] Starting update');

  let players: ScrapedPlayer[];
  try {
    players = await scrapeATPRankings(500);
  } catch (err) {
    logger.error('[ATP Rankings] Scrape failed', { error: (err as Error).message });
    throw err;
  }

  if (players.length === 0) {
    logger.warn('[ATP Rankings] No players scraped — skipping DB update');
    return { updated: 0, skipped: 0 };
  }

  logger.info(`[ATP Rankings] Scraped ${players.length} players`);

  players = await backfillMissingPlayerCountries(players, 'atp');

  let updated = 0;
  let skipped = 0;
  const atpTourCompetition = await prisma.competition.upsert({
    where: {
      name_country_sport: {
        name: 'ATP Tour',
        country: 'Internacional',
        sport: Sport.TENNIS,
      },
    },
    update: { tier: 1, isActive: true },
    create: {
      name: 'ATP Tour',
      country: 'Internacional',
      sport: Sport.TENNIS,
      tier: 1,
      isActive: true,
    },
  });

  // Keep the ATP Tour competition linked only to the current rankings pool.
  await prisma.teamCompetition.deleteMany({ where: { competitionId: atpTourCompetition.id } });

  // Upsert each player into the Team table with sport=TENNIS
  for (const player of players) {
    try {
      const normalizedName = player.name.trim().replace(/\s+/g, ' ');
      const team = await prisma.team.upsert({
        where: { name_sport: { name: normalizedName, sport: Sport.TENNIS } },
        update: { country: player.country ?? undefined },
        create: { name: normalizedName, sport: Sport.TENNIS, country: player.country ?? null },
      });

      await prisma.teamCompetition.upsert({
        where: {
          teamId_competitionId: {
            teamId: team.id,
            competitionId: atpTourCompetition.id,
          },
        },
        update: {},
        create: {
          teamId: team.id,
          competitionId: atpTourCompetition.id,
        },
      });

      // Cache photo URL in Redis so the mobile app can fetch it without a DB column
      if (player.photoUrl) {
        await redis.set(`atp:photo:${normalizedName}`, player.photoUrl, 'EX', 7 * 24 * 3600);
      }
      if (player.displayName) {
        await redis.set(`atp:display-name:${normalizedName}`, player.displayName, 'EX', 7 * 24 * 3600);
      }
      await redis.set(`atp:rank:${normalizedName}`, String(player.rank), 'EX', 7 * 24 * 3600);

      updated++;
    } catch {
      skipped++;
    }
  }

  await redis.set('atp:rankings:last-updated-at', new Date().toISOString(), 'EX', 8 * 24 * 3600);

  logger.info(`[ATP Rankings] Done — updated: ${updated}, skipped: ${skipped}`);
  return { updated, skipped };
}

export async function ensureFreshATPRankings(maxAgeHours = 24): Promise<void> {
  const atpTourCompetition = await prisma.competition.findUnique({
    where: {
      name_country_sport: {
        name: 'ATP Tour',
        country: 'Internacional',
        sport: Sport.TENNIS,
      },
    },
    select: { id: true },
  });
  const linkedPlayerCount = atpTourCompetition
    ? await prisma.teamCompetition.count({ where: { competitionId: atpTourCompetition.id } })
    : 0;

  const lastUpdatedAt = await redis.get('atp:rankings:last-updated-at');
  if (lastUpdatedAt) {
    const ageMs = Date.now() - Date.parse(lastUpdatedAt);
    if (linkedPlayerCount > 0 && Number.isFinite(ageMs) && ageMs < maxAgeHours * 60 * 60 * 1000) {
      logger.info('[ATP Rankings] Fresh rankings already cached', { lastUpdatedAt });
      return;
    }
  }

  if (linkedPlayerCount === 0) {
    logger.info('[ATP Rankings] ATP Tour has no linked players, forcing refresh');
  }

  await processATPRankingsUpdate();
}

// Register Bull processor
atpRankingsQueue.process(async (_job) => {
  return processATPRankingsUpdate();
});

atpRankingsQueue.on('completed', (_job, result) => {
  logger.info('[ATP Rankings] Job completed', result);
});

atpRankingsQueue.on('failed', (_job, err) => {
  logger.error('[ATP Rankings] Job failed', { error: err.message });
});

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Schedules the ATP rankings update job.
 * Call this once at app startup.
 */
export async function scheduleATPRankingsJob(): Promise<void> {
  // Remove existing repeatable jobs to avoid duplicates on restart
  const repeatableJobs = await atpRankingsQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await atpRankingsQueue.removeRepeatableByKey(job.key);
  }

  // Every Monday at 06:00 UTC
  await atpRankingsQueue.add(
    {},
    { repeat: { cron: '0 6 * * 1' }, jobId: 'atp-rankings-weekly' },
  );

  logger.info('[ATP Rankings] Weekly job scheduled (Mondays 06:00 UTC)');
}

/**
 * Manually enqueue an immediate update (used by the admin endpoint).
 */
export async function triggerATPRankingsUpdate(): Promise<Bull.Job> {
  return atpRankingsQueue.add({}, { jobId: `atp-rankings-manual-${Date.now()}` });
}
