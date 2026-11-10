// Fills the crest/photo registry (assetRegistry → GET /api/sports/assets) from consistent,
// freely reachable sources, so the app doesn't depend on hand-kept IDs that drift or break:
//  - Football clubs and national teams: ESPN team lists of ~40 competitions (one CDN, one style).
//  - NBA: ESPN team list.
//  - Tennis (ATP/WTA top 150): ESPN headshot when ESPN has one; else the official WTA photo
//    (stored by wtaRankingsJob); else the photo of the player's Wikipedia page.
// Runs at start-up and once a day; every step is best-effort.

import { logger } from '../utils/logger';
import { redis } from '../utils/redis';
import { recordAssets, espnTennisHeadshot } from '../services/sportsData/assetRegistry';
import { ESPN_FOOTBALL_LEAGUES } from '../services/sportsData/espnFootball';
import { countryToPt } from '../utils/countryNames';

const UA = 'BetIntel/1.0 (personal use)';
const EXTRA_FOOTBALL = [
  'eng.2', 'esp.2', 'ger.2', 'ita.2', 'fra.2', 'ned.2', 'sco.1', 'bel.1', 'sui.1', 'aut.1', 'gre.1', 'den.1', 'swe.1',
  'nor.1', 'usa.1', 'bra.1', 'arg.1', 'mex.1', 'ksa.1',
];
const NATIONAL_LISTS = ['fifa.world', 'uefa.nations'];

interface EspnTeam { displayName?: string; shortDisplayName?: string; name?: string; location?: string; logos?: Array<{ href?: string }> }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function espnTeams(sport: 'soccer' | 'basketball', league: string): Promise<EspnTeam[]> {
  const j = await getJson<{ sports?: Array<{ leagues?: Array<{ teams?: Array<{ team?: EspnTeam }> }> }> }>(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams`,
  );
  return (j?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team ?? {});
}

/** Every name a team goes by, so "Benfica", "SL Benfica" and "Sport Lisboa e Benfica" all resolve. */
function namesOf(t: EspnTeam, national: boolean): string[] {
  const names = [t.displayName, t.shortDisplayName, t.name, t.location].filter((n): n is string => Boolean(n && n.length > 2));
  return national ? [...names, ...names.map(countryToPt)] : names;
}

export async function syncTeamLogos(): Promise<number> {
  const teams: Record<string, string> = {};
  const add = (list: EspnTeam[], national = false) => {
    for (const t of list) {
      const logo = t.logos?.[0]?.href;
      if (!logo) continue;
      for (const n of namesOf(t, national)) teams[n] ??= logo;
    }
  };
  const club = [...new Set([...Object.values(ESPN_FOOTBALL_LEAGUES), ...EXTRA_FOOTBALL])].filter((s) => !s.startsWith('fifa.') && !s.startsWith('conmebol.') && s !== 'uefa.nations' && !s.startsWith('uefa.euro'));
  for (const league of club) add(await espnTeams('soccer', league));
  for (const league of NATIONAL_LISTS) add(await espnTeams('soccer', league), true);
  add(await espnTeams('basketball', 'nba'));
  recordAssets(teams, {});
  return Object.keys(teams).length;
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

async function wikipediaPhoto(name: string): Promise<string | null> {
  for (const title of [name, `${name} (tennis)`]) {
    const j = await getJson<{ type?: string; description?: string; thumbnail?: { source?: string } }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    );
    if (j && j.type !== 'disambiguation' && /tennis/i.test(j.description ?? '') && j.thumbnail?.source) return j.thumbnail.source;
  }
  return null;
}

export async function syncTennisPhotos(): Promise<{ total: number; found: number }> {
  const players: Record<string, string> = {};
  let total = 0;
  for (const tour of ['atp', 'wta'] as const) {
    const j = await getJson<{ rankings?: Array<{ ranks?: Array<{ athlete?: { id?: string; displayName?: string } }> }> }>(
      `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`,
    );
    for (const r of j?.rankings?.[0]?.ranks ?? []) {
      const id = r.athlete?.id; const name = r.athlete?.displayName;
      if (!id || !name) continue;
      total++;
      // Remember what we found for 30 days so the daily run makes few requests.
      const memo = `asset:tennis:${id}`;
      const known = await redis.get(memo).catch(() => null);
      if (known !== null) { if (known) players[name] = known; continue; }
      let url: string | null = espnTennisHeadshot(id);
      if (!(await headOk(url))) url = null;
      if (!url && tour === 'wta') url = await redis.get(`wta:photo:${name.trim().replace(/\s+/g, ' ')}`).catch(() => null);
      if (!url) url = await wikipediaPhoto(name);
      await redis.set(memo, url ?? '', 'EX', (url ? 30 : 7) * 24 * 3600).catch(() => {});
      if (url) players[name] = url;
    }
  }
  recordAssets({}, players);
  return { total, found: Object.keys(players).length };
}

export async function sportAssetsJob(): Promise<void> {
  const teams = await syncTeamLogos().catch((e: unknown) => { logger.warn('[assets] team logos failed', { error: String(e) }); return 0; });
  const tennis = await syncTennisPhotos().catch((e: unknown) => { logger.warn('[assets] tennis photos failed', { error: String(e) }); return { total: 0, found: 0 }; });
  logger.info(`[assets] ${teams} team names with crests; tennis photos ${tennis.found}/${tennis.total}`);
}
