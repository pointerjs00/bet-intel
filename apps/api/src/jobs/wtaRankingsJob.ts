/**
 * WTA Rankings Update Job
 *
 * Scrapes the current WTA singles rankings from the WTA Tour website and
 * upserts all players into the Team table with sport=TENNIS, linked to the
 * 'WTA Tour' competition.
 *
 * Schedule: every Monday at 07:00 UTC (WTA rankings update on Mondays).
 * Can also be triggered manually via POST /api/reference/wta-rankings/refresh.
 *
 * Player photo URLs stored in Redis key `wta:photo:{name}`.
 * Display names stored in Redis key `wta:display-name:{name}`.
 * Rankings stored in Redis key `wta:rank:{name}`.
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

const WTA_SITE_BASE = 'https://www.wtatennis.com';

// ─── Queue ────────────────────────────────────────────────────────────────────

export const wtaRankingsQueue = new Bull('wta-rankings', process.env.REDIS_URL!, {
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  },
});

wtaRankingsQueue.on('error', (err) => {
  logger.error('[WTA Rankings] Queue error', { error: err.message });
});

// ─── Scraper ──────────────────────────────────────────────────────────────────

interface ScrapedPlayer {
  rank: number;
  name: string;
  displayName: string | null;
  photoUrl: string | null;
  country: string | null;
  /** Numeric player ID as used in the WTA URL (e.g. 320196 for Swiatek). */
  playerId?: string;
}

const WTA_FLAG_CODE_TO_COUNTRY: Record<string, string> = TENNIS_COUNTRY_CODE_TO_NAME;

function getCountryFromCode(code?: string | null): string | null {
  return getTennisCountryFromCode(code) ?? (code ? WTA_FLAG_CODE_TO_COUNTRY[code.toLowerCase()] ?? null : null);
}

interface WtaRankingsApiRow {
  player?: {
    id?: number;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    countryCode?: string | null;
  };
  ranking?: number;
  rankedAt?: string;
}

interface WtaPhotoAsset {
  title?: string | null;
  imageUrl?: string | null;
  onDemandUrl?: string | null;
  references?: Array<{ id?: number | string; type?: string | null }>;
  tags?: Array<{ label?: string | null }>;
}

async function getCurrentWTARankingsDate(): Promise<string> {
  const url = 'https://api.wtatennis.com/tennis/players/ranked?metric=SINGLES&type=rankSingles&sort=asc&page=0&pageSize=1';
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`WTA rankings API HTTP ${res.status}`);
  }

  const rows = await res.json() as WtaRankingsApiRow[];
  const rankedAt = typeof rows?.[0]?.rankedAt === 'string' ? rows[0].rankedAt : null;
  if (!rankedAt) {
    throw new Error('WTA rankings API did not return a rankedAt date');
  }

  return rankedAt.slice(0, 10);
}

async function fetchWTARankingsFromApi(limit: number): Promise<ScrapedPlayer[]> {
  const rankedAt = await getCurrentWTARankingsDate();
  const pageSize = 100;
  const pageCount = Math.ceil(limit / pageSize);

  const pageResults = await Promise.all(
    Array.from({ length: pageCount }, async (_unused, page) => {
      const pageLimit = Math.min(pageSize, limit - (page * pageSize));
      const url = `https://api.wtatennis.com/tennis/players/ranked?metric=SINGLES&type=rankSingles&sort=asc&at=${rankedAt}&page=${page}&pageSize=${pageLimit}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        throw new Error(`WTA rankings API HTTP ${res.status} on page ${page}`);
      }
      return res.json() as Promise<WtaRankingsApiRow[]>;
    }),
  );

  const players: ScrapedPlayer[] = [];

  for (const rows of pageResults) {
    for (const row of rows) {
      const rank = Number(row.ranking);
      const playerId = row.player?.id != null ? String(row.player.id) : undefined;
      const name = row.player?.fullName?.trim()
        ?? [row.player?.firstName, row.player?.lastName].filter(Boolean).join(' ').trim();

      if (!rank || Number.isNaN(rank) || rank < 1 || rank > limit || !name) {
        continue;
      }

      players.push({
        rank,
        name,
        displayName: name,
        photoUrl: null,
        country: getCountryFromCode(row.player?.countryCode) ?? row.player?.countryCode ?? null,
        playerId,
      });
    }
  }

  return deduplicateAndSort(players, limit);
}

/**
 * Fetch official WTA headshots from the content API.
 * Uses WTA-native player IDs from the rankings API, not external CSV IDs.
 */
async function fetchWTAPlayerPhotos(
  players: Array<{ name: string; playerId?: string }>,
  limit = 100,
): Promise<Map<string, string>> {
  const top = players
    .filter((player): player is { name: string; playerId: string } => Boolean(player.playerId))
    .slice(0, limit);

  if (top.length === 0) {
    return new Map();
  }

  const idToName = new Map(top.map((player) => [player.playerId, player.name]));
  const bestByPlayerId = new Map<string, { score: number; url: string }>();
  const batchSize = 10;

  for (let i = 0; i < top.length; i += batchSize) {
    const batch = top.slice(i, i + batchSize);
    const referenceExpression = encodeURIComponent(
      batch.map((player) => `TENNIS_PLAYER:${player.playerId}`).join(' or '),
    );
    const contentLimit = Math.max(batch.length * 8, 100);
    const url = `https://api.wtatennis.com/content/wta/PHOTO/en?limit=${contentLimit}&tagNames=player-headshot&referenceExpression=${referenceExpression}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        continue;
      }

      const payload = await res.json() as { content?: WtaPhotoAsset[] };
      for (const asset of payload.content ?? []) {
        const reference = asset.references?.find((item) =>
          item.type === 'TENNIS_PLAYER' && item.id != null && idToName.has(String(item.id)));
        if (!reference) {
          continue;
        }

        const imageUrl = asset.imageUrl ?? asset.onDemandUrl ?? null;
        if (!imageUrl || !imageUrl.startsWith('http')) {
          continue;
        }

        const title = (asset.title ?? '').toLowerCase();
        const labels = new Set(
          (asset.tags ?? [])
            .map((tag) => (tag.label ?? '').toLowerCase())
            .filter(Boolean),
        );

        let score = 0;
        if (labels.has('head-cropped-photo')) score += 10;
        if (title.includes('crop_')) score += 5;
        if (labels.has('player-headshot')) score += 2;
        if (imageUrl.includes('.jpg')) score += 1;

        const playerId = String(reference.id);
        const existing = bestByPlayerId.get(playerId);
        if (!existing || score > existing.score) {
          bestByPlayerId.set(playerId, { score, url: imageUrl });
        }
      }
    } catch {
      // Player photos are non-critical. Keep the job going.
    }

    if (i + batchSize < top.length) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const photos = new Map<string, string>();
  for (const [playerId, best] of bestByPlayerId) {
    const name = idToName.get(playerId);
    if (name) {
      photos.set(name, best.url);
    }
  }

  logger.info(`[WTA Rankings] Fetched headshots for ${photos.size}/${top.length} players via content API`);
  return photos;
}

/** Make a potentially relative URL absolute using the WTA site base. */
function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${WTA_SITE_BASE}${url}`;
  return null;
}

/** Return true if an image src is a flag/resource SVG (not a player headshot). */
function isFlagOrResource(src: string): boolean {
  return (
    src.includes('/flags/') ||
    src.includes('/resources/') ||
    src.includes('elements/') ||
    src.endsWith('.svg') ||
    src.includes('logo') ||
    src.includes('icon') ||
    src.includes('sponsor') ||
    src.includes('partner') ||
    src.includes('cookie')
  );
}

/** Extract the best player headshot URL from a row element. */
function extractPhotoUrl($: cheerio.CheerioAPI, rowRoot: cheerio.Cheerio<any>): string | null {
  // Priority 1: photoresources.wtatennis.com (official headshots)
  let src = rowRoot.find('img[src*="photoresources.wtatennis.com"]').first().attr('src')
    ?? rowRoot.find('img[data-src*="photoresources.wtatennis.com"]').first().attr('data-src')
    ?? null;
  if (src) return src;

  // Priority 2: any img that is NOT a flag/resource/svg
  let found: string | null = null;
  rowRoot.find('img').each((_i, img) => {
    const imgSrc = $(img).attr('src') ?? $(img).attr('data-src') ?? '';
    if (imgSrc && !isFlagOrResource(imgSrc)) {
      found = absoluteUrl(imgSrc);
      return false; // break
    }
    return undefined;
  });
  return found;
}

function buildDisplayName(href?: string | null): string | null {
  const slug = href?.match(/\/players\/([^/?#]+)/i)?.[1];
  if (!slug) return null;
  const lowerCaseParticles = new Set(['da', 'de', 'del', 'di', 'dos', 'du', 'la', 'le', 'van', 'von']);
  return slug
    .split('-')
    .filter(Boolean)
    .map((part, index) =>
      lowerCaseParticles.has(part) && index > 0
        ? part
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(' ');
}

function parseWTARankingsHtml(html: string, limit: number): ScrapedPlayer[] {
  const $ = cheerio.load(html);
  const players: ScrapedPlayer[] = [];

  // Strategy A: standard table rows
  $('table tbody tr').each((_i, row) => {
    if (players.length >= limit) return false;
    const rowRoot = $(row);
    const cells = rowRoot.find('td');
    if (cells.length < 2) return;

    // First cell = rank (a plain integer; ignore movement numbers which start with +/-)
    const rankText = cells.first().text().trim();
    const rankMatch = rankText.match(/^(\d+)/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : NaN;
    if (!rank || isNaN(rank) || rank > limit) return;

    // Player name from link
    const nameLink = rowRoot.find('a[href*="/players/"]').first();
    const name = nameLink.text().replace(/\s+/g, ' ').trim();
    if (!name) return;

    const displayName = buildDisplayName(nameLink.attr('href'));
    const photoUrl = extractPhotoUrl($, rowRoot);

    // Country from flag image alt or src code
    const flagImg = rowRoot.find('img[src*="/flags/"], img[data-src*="/flags/"], img[src$=".svg"]').first();
    const flagCode = flagImg.attr('src')?.match(/flags[/\\-]([a-z]{2,3})/i)?.[1]
      ?? flagImg.attr('data-src')?.match(/flags[/\\-]([a-z]{2,3})/i)?.[1]
      ?? flagImg.attr('alt')?.toLowerCase();
    const country = getCountryFromCode(flagCode) ?? flagImg.attr('alt')?.trim() ?? null;

    players.push({ rank, name, displayName, photoUrl, country });
  });

  if (players.length > 0) {
    return deduplicateAndSort(players, limit);
  }

  // Strategy B: div/li based player rows (newer JS-rendered layout)
  const rowSelectors = [
    '[class*="ranking-row"]',
    '[class*="player-row"]',
    '[class*="ranking-item"]',
    '[class*="RankingRow"]',
    '[class*="PlayerRow"]',
    '[data-rank]',
  ];

  for (const sel of rowSelectors) {
    $(sel).each((_i, el) => {
      if (players.length >= limit) return false;
      const root = $(el);

      // Rank: from data-rank attribute OR first element with "rank" in class
      const dataRank = root.attr('data-rank');
      const rankText = dataRank
        ?? root.find('[class*="rank"]:not([class*="ranking"])').first().text().trim()
        ?? root.find('[class*="Rank"]').first().text().trim();
      const rankMatch = String(rankText).match(/^(\d+)/);
      const rank = rankMatch ? parseInt(rankMatch[1], 10) : NaN;
      if (!rank || isNaN(rank) || rank > limit) return;

      const nameLink = root.find('a[href*="/players/"]').first();
      const name = nameLink.text().replace(/\s+/g, ' ').trim()
        || root.find('[class*="player-name"], [class*="PlayerName"], [class*="name"]').first().text().trim();
      if (!name) return;

      const flagImg = root.find('img[src*="/flags/"], img[src$=".svg"]').first();
      const flagCode = flagImg.attr('src')?.match(/flags[/\\-]([a-z]{2,3})/i)?.[1]
        ?? flagImg.attr('alt')?.toLowerCase();
      const country = getCountryFromCode(flagCode) ?? flagImg.attr('alt')?.trim() ?? null;

      players.push({
        rank,
        name,
        displayName: buildDisplayName(nameLink.attr('href')),
        photoUrl: extractPhotoUrl($, root),
        country,
      });
    });

    if (players.length > 0) break;
  }

  return deduplicateAndSort(players, limit);
}

function deduplicateAndSort(players: ScrapedPlayer[], limit: number): ScrapedPlayer[] {
  return [...new Map(players.map((p) => [p.name.toLowerCase(), p])).values()]
    .sort((a, b) => a.rank - b.rank)
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
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((v): v is string => Boolean(v));
  return candidates.find((c) => existsSync(c));
}

/**
 * Scrape WTA rankings via Puppeteer.
 * Strategy:
 *  1. Intercept XHR/fetch JSON responses from WTA's internal API.
 *  2. Scroll-click "LOAD MORE" button until we have `limit` players or the button disappears.
 *  3. Parse the final rendered HTML.
 */
async function scrapeWTARankingsViaBrowser(limit: number): Promise<ScrapedPlayer[]> {
  const executablePath = getBrowserExecutablePath();
  if (!executablePath) {
    throw new Error('No Chromium/Chrome executable found for WTA rankings browser scrape');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // ── Strategy 1: intercept the WTA backend API JSON ──────────────────────
    let interceptedPlayers: ScrapedPlayer[] = [];

    page.on('response', async (response: { url: () => string; headers: () => Record<string, string>; json: () => Promise<unknown> }) => {
      try {
        const url = response.url();
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('json')) return;
        if (!url.includes('ranking') && !url.includes('player')) return;

        const json = await response.json().catch(() => null);
        if (!json) return;

        const extracted = extractPlayersFromWTAJson(json, limit);
        if (extracted.length > interceptedPlayers.length) {
          interceptedPlayers = extracted;
        }
      } catch {
        // ignore
      }
    });

    // Try the full-range URL first (may or may not work on WTA)
    const urls = [
      `${WTA_SITE_BASE}/rankings/singles?rankRange=1-${limit}`,
      `${WTA_SITE_BASE}/rankings/singles`,
    ];

    for (const url of urls) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

      // Wait for at least one player row to appear
      await page.waitForFunction(
        () =>
          document.querySelectorAll('table tbody tr, [class*="ranking-row"], [class*="player-row"], [data-rank]').length > 0,
        { timeout: 15_000 },
      ).catch(() => undefined);

      // Check how many rows are already rendered
      const rowCount = await page.evaluate(
        () =>
          document.querySelectorAll('table tbody tr, [class*="ranking-row"], [class*="player-row"], [data-rank]').length,
      );
      logger.info(`[WTA Rankings] Initial row count on ${url}: ${rowCount}`);

      if (rowCount >= limit) break; // Full set already loaded (e.g. rankRange=1-500 worked)

      // ── Strategy 2: keep clicking "LOAD MORE" until we have enough rows ──
      const batches = Math.ceil(limit / 50); // WTA shows 50 per batch
      for (let attempt = 0; attempt < batches; attempt++) {
        // Count current rows
        const currentRows = await page.evaluate(
          () =>
            document.querySelectorAll('table tbody tr, [class*="ranking-row"], [class*="player-row"], [data-rank]').length,
        );
        if (currentRows >= limit) break;

        // Find and click LOAD MORE
        const clicked = await page.evaluate(() => {
          const candidates = [
            ...Array.from(document.querySelectorAll('button, [role="button"], [class*="load-more"], [class*="LoadMore"]')),
          ].filter((el) =>
            el.textContent?.trim().toUpperCase().includes('LOAD MORE') ||
            el.textContent?.trim().toUpperCase().includes('MORE'),
          );
          if (candidates.length > 0) {
            (candidates[0] as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!clicked) {
          logger.info(`[WTA Rankings] No LOAD MORE button found after attempt ${attempt + 1}`);
          break;
        }

        // Wait for new rows to appear
        const prevCount = currentRows;
        await page.waitForFunction(
          (prev: number) =>
            document.querySelectorAll('table tbody tr, [class*="ranking-row"], [class*="player-row"], [data-rank]').length > prev,
          { timeout: 10_000, polling: 500 },
          prevCount,
        ).catch(() => undefined);

        // Small delay for stability
        await new Promise((r) => setTimeout(r, 800));
      }

      break; // Only try the first URL that loads successfully
    }

    // Give intercepted players priority (API data is more accurate)
    if (interceptedPlayers.length >= 50) {
      logger.info(`[WTA Rankings] Got ${interceptedPlayers.length} players from API interception`);
      return deduplicateAndSort(interceptedPlayers, limit);
    }

    // Parse the fully rendered HTML
    const html = await page.content();
    const parsed = parseWTARankingsHtml(html, limit);
    logger.info(`[WTA Rankings] Got ${parsed.length} players from HTML parsing`);
    return parsed;
  } finally {
    await browser.close();
  }
}

/**
 * Try to extract player data from a JSON response intercepted from the WTA internal API.
 * The structure varies; we try several common shapes.
 */
function extractPlayersFromWTAJson(json: unknown, limit: number): ScrapedPlayer[] {
  if (!json || typeof json !== 'object') return [];

  const findArray = (obj: unknown, depth = 0): unknown[] | null => {
    if (depth > 5) return null;
    if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') return obj;
    if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj as Record<string, unknown>)) {
        const found = findArray(val, depth + 1);
        if (found && found.length > 0) return found;
      }
    }
    return null;
  };

  const arr = findArray(json);
  if (!arr) return [];

  const players: ScrapedPlayer[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const nestedPlayer = obj['player'] && typeof obj['player'] === 'object'
      ? obj['player'] as Record<string, unknown>
      : null;

    const rank = Number(
      obj['rank']
      ?? obj['ranking']
      ?? obj['singlesRank']
      ?? obj['playerRank']
      ?? obj['position']
      ?? obj['currentRank'],
    );
    if (!rank || isNaN(rank) || rank < 1 || rank > limit) continue;

    const name = String(
      obj['name']
      ?? obj['playerName']
      ?? obj['fullName']
      ?? nestedPlayer?.['fullName']
      ?? [nestedPlayer?.['firstName'], nestedPlayer?.['lastName']].filter(Boolean).join(' ')
      ?? obj['lastName']
      ?? '',
    ).trim();
    if (!name) continue;

    const photoUrl = String(obj['photoUrl'] ?? obj['photo'] ?? obj['image'] ?? obj['headshot'] ?? obj['playerImage'] ?? '');
    const countryCode = String(
      obj['country']
      ?? obj['nationality']
      ?? obj['countryName']
      ?? nestedPlayer?.['countryCode']
      ?? '',
    ).trim();
    const playerId = nestedPlayer?.['id'] != null ? String(nestedPlayer['id']) : undefined;

    players.push({
      rank,
      name,
      displayName: name,
      photoUrl: absoluteUrl(photoUrl || null),
      country: getCountryFromCode(countryCode) ?? (countryCode || null),
      playerId,
    });
  }

  return deduplicateAndSort(players, limit);
}

async function scrapeWTARankings(limit = 500): Promise<ScrapedPlayer[]> {
  // ── Strategy 1: WTA public rankings API ───────────────────────────────────
  // Uses WTA-native player IDs, which are also required for the photo content API.
  try {
    const players = await fetchWTARankingsFromApi(limit);
    if (players.length >= limit) {
      logger.info(`[WTA Rankings] WTA API strategy returned ${players.length} players`);
      return players;
    }
    logger.warn(`[WTA Rankings] WTA API returned only ${players.length} players — falling back to CSV/browser`);
  } catch (err) {
    logger.warn('[WTA Rankings] WTA API fetch failed — falling back to CSV/browser', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Strategy 2: Jeff Sackmann open tennis CSV (GitHub raw) ────────────────
  // Reliable for 500-player rankings, but IDs do not match WTA's photo API.
  try {
    const players = await fetchWTARankingsFromCSV(limit);
    if (players.length >= 50) {
      logger.info(`[WTA Rankings] CSV strategy returned ${players.length} players`);
      return players;
    }
    logger.warn(`[WTA Rankings] CSV returned only ${players.length} players — falling back to browser`);
  } catch (err) {
    logger.warn('[WTA Rankings] CSV fetch failed — falling back to browser', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Strategy 3: WTA website via Puppeteer (fallback) ─────────────────────
  // Direct fetch first (no JS, may return SSR shell only — but worth trying)
  const url = `${WTA_SITE_BASE}/rankings/singles?rankRange=1-${limit}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (res.ok) {
      const html = await res.text();
      const players = parseWTARankingsHtml(html, limit);
      if (players.length >= 100) {
        logger.info(`[WTA Rankings] Direct fetch returned ${players.length} players`);
        return players;
      }
    }
  } catch (err) {
    logger.warn('[WTA Rankings] Direct fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return scrapeWTARankingsViaBrowser(limit);
}

/**
 * Fetch WTA rankings from Jeff Sackmann's open tennis dataset on GitHub.
 * CSV files are updated weekly, have no bot protection, and cover 500+ players.
 *
 * Rankings CSV: ranking_date,rank,player_id,points,tours
 * Players CSV:  player_id,name_first,name_last,hand,dob,ioc,height,wikidata_id
 */
async function fetchWTARankingsFromCSV(limit: number): Promise<ScrapedPlayer[]> {
  const RANKINGS_URL =
    'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_rankings_current.csv';
  const PLAYERS_URL =
    'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_players.csv';

  const [rankingsText, playersText] = await Promise.all([
    fetch(RANKINGS_URL, { signal: AbortSignal.timeout(20_000) }).then((r) => {
      if (!r.ok) throw new Error(`Rankings CSV HTTP ${r.status}`);
      return r.text();
    }),
    fetch(PLAYERS_URL, { signal: AbortSignal.timeout(20_000) }).then((r) => {
      if (!r.ok) throw new Error(`Players CSV HTTP ${r.status}`);
      return r.text();
    }),
  ]);

  // ── Parse players CSV ──────────────────────────────────────────────────────
  // player_id,name_first,name_last,hand,dob,ioc,height,wikidata_id
  const playerMap = new Map<string, { nameFirst: string; nameLast: string; ioc: string }>();
  const playersLines = playersText.trim().split(/\r?\n/);
  for (const line of playersLines.slice(1)) {
    const parts = line.split(',');
    if (parts.length < 6) continue;
    const [id, nameFirst, nameLast, , , ioc] = parts;
    if (id?.trim() && nameFirst?.trim() && nameLast?.trim()) {
      playerMap.set(id.trim(), {
        nameFirst: nameFirst.trim(),
        nameLast: nameLast.trim(),
        ioc: ioc?.trim() ?? '',
      });
    }
  }

  // ── Find the latest date present in the rankings CSV ──────────────────────
  // Format: ranking_date,rank,player_id,points,tours  (date = YYYYMMDD string)
  const rankLines = rankingsText.trim().split(/\r?\n/);
  let latestDate = '';
  for (const line of rankLines.slice(1)) {
    const date = line.split(',')[0]?.trim() ?? '';
    if (date && date > latestDate) latestDate = date;
  }

  if (!latestDate) {
    throw new Error('Could not determine latest ranking date from CSV');
  }

  // ── Extract rankings for the latest date ──────────────────────────────────
  const players: ScrapedPlayer[] = [];
  const seen = new Set<string>();

  for (const line of rankLines.slice(1)) {
    if (players.length >= limit) break;
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const [date, rankStr, playerId] = parts;
    if (date?.trim() !== latestDate) continue;

    const id = playerId?.trim() ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const rank = parseInt(rankStr?.trim() ?? '', 10);
    if (isNaN(rank) || rank < 1 || rank > limit) continue;

    const info = playerMap.get(id);
    if (!info) continue;

    const displayName = `${info.nameFirst} ${info.nameLast}`;
    const country = getCountryFromCode(info.ioc) ?? (info.ioc || null);

    players.push({ rank, name: displayName, displayName, photoUrl: null, country });
  }

  return players.sort((a, b) => a.rank - b.rank);
}

// ─── Job processor ────────────────────────────────────────────────────────────

export async function processWTARankingsUpdate(): Promise<{ updated: number; skipped: number }> {
  logger.info('[WTA Rankings] Starting update');

  let players: ScrapedPlayer[];
  try {
    players = await scrapeWTARankings(500);
  } catch (err) {
    logger.error('[WTA Rankings] Scrape failed', { error: (err as Error).message });
    throw err;
  }

  if (players.length === 0) {
    logger.warn('[WTA Rankings] No players scraped — skipping DB update');
    return { updated: 0, skipped: 0 };
  }

  logger.info(`[WTA Rankings] Scraped ${players.length} players`);

  players = await backfillMissingPlayerCountries(players, 'wta');

  // Fetch player headshots concurrently — done before DB upserts so we can
  // store photoUrl from the profile pages alongside ranking data.
  const photoMap = await fetchWTAPlayerPhotos(players).catch((err) => {
    logger.warn('[WTA Rankings] Photo fetch step failed', { error: (err as Error).message });
    return new Map<string, string>();
  });

  // Merge fetched photos back onto the player objects
  for (const player of players) {
    if (!player.photoUrl && photoMap.has(player.name)) {
      player.photoUrl = photoMap.get(player.name)!;
    }
  }

  let updated = 0;
  let skipped = 0;

  const wtaTourCompetition = await prisma.competition.upsert({
    where: { name_country_sport: { name: 'WTA Tour', country: 'Internacional', sport: Sport.TENNIS } },
    update: { tier: 1, isActive: true },
    create: { name: 'WTA Tour', country: 'Internacional', sport: Sport.TENNIS, tier: 1, isActive: true },
  });

  // Reset links so only the current ranking pool is associated
  await prisma.teamCompetition.deleteMany({ where: { competitionId: wtaTourCompetition.id } });

  for (const player of players) {
    try {
      const normalizedName = player.name.trim().replace(/\s+/g, ' ');
      const team = await prisma.team.upsert({
        where: { name_sport: { name: normalizedName, sport: Sport.TENNIS } },
        update: { country: player.country ?? undefined },
        create: { name: normalizedName, sport: Sport.TENNIS, country: player.country ?? null },
      });

      await prisma.teamCompetition.upsert({
        where: { teamId_competitionId: { teamId: team.id, competitionId: wtaTourCompetition.id } },
        update: {},
        create: { teamId: team.id, competitionId: wtaTourCompetition.id },
      });

      if (player.photoUrl) {
        await redis.set(`wta:photo:${normalizedName}`, player.photoUrl, 'EX', 7 * 24 * 3600);
      } else {
        await redis.del(`wta:photo:${normalizedName}`);
      }
      if (player.displayName) {
        await redis.set(`wta:display-name:${normalizedName}`, player.displayName, 'EX', 7 * 24 * 3600);
      }
      await redis.set(`wta:rank:${normalizedName}`, String(player.rank), 'EX', 7 * 24 * 3600);

      updated++;
    } catch {
      skipped++;
    }
  }

  await redis.set('wta:rankings:last-updated-at', new Date().toISOString(), 'EX', 8 * 24 * 3600);
  logger.info(`[WTA Rankings] Done — updated: ${updated}, skipped: ${skipped}`);
  return { updated, skipped };
}

export async function ensureFreshWTARankings(maxAgeHours = 24): Promise<void> {
  const wtaTourComp = await prisma.competition.findUnique({
    where: { name_country_sport: { name: 'WTA Tour', country: 'Internacional', sport: Sport.TENNIS } },
    select: { id: true },
  });
  const linkedPlayerCount = wtaTourComp
    ? await prisma.teamCompetition.count({ where: { competitionId: wtaTourComp.id } })
    : 0;

  const lastUpdatedAt = await redis.get('wta:rankings:last-updated-at');
  if (lastUpdatedAt) {
    const ageMs = Date.now() - Date.parse(lastUpdatedAt);
    if (linkedPlayerCount > 0 && Number.isFinite(ageMs) && ageMs < maxAgeHours * 60 * 60 * 1000) {
      logger.info('[WTA Rankings] Fresh rankings already cached', { lastUpdatedAt });
      return;
    }
  }

  if (linkedPlayerCount === 0) {
    logger.info('[WTA Rankings] WTA Tour has no linked players, forcing refresh');
  }

  await processWTARankingsUpdate();
}

export async function triggerWTARankingsUpdate() {
  return wtaRankingsQueue.add({}, { priority: 1 });
}

export async function scheduleWTARankingsJob(): Promise<void> {
  // Every Monday at 07:00 UTC
  await wtaRankingsQueue.add({}, { repeat: { cron: '0 7 * * 1' } });
  wtaRankingsQueue.process(async () => {
    await processWTARankingsUpdate();
  });
  logger.info('[WTA Rankings] Job scheduled (Mondays 07:00 UTC)');
}
