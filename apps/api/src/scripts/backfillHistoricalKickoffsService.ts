// apps/api/src/services/backfillHistoricalKickoffsService.ts
//
// One-time backfill: fetches the full 2025-26 season CSV for each secondary
// league from football-data.co.uk and patches midnight placeholder kickoff times.
//
// URL pattern: https://www.football-data.co.uk/mmz4281/2526/{DIV}.csv
// These files contain ALL played matches for the season with kickoff times.
//
// Run once: npx ts-node -r tsconfig-paths/register src/scripts/runBackfillHistoricalKickoffs.ts

import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { normaliseTeamName } from '../utils/nameNormalisation';

// ─── League config ────────────────────────────────────────────────────────────

const LEAGUES: Array<{
  div: string;          // football-data.co.uk div code
  seasonCode: string;   // URL segment, e.g. "2526"
  competition: string;  // must match Fixture.competition exactly
  country: string;
  dbSeason: string;     // must match Fixture.season exactly
}> = [
  { div: 'D2',  seasonCode: '2526', competition: '2. Bundesliga', country: 'Germany', dbSeason: '2025-26' },
  { div: 'F2',  seasonCode: '2526', competition: 'Ligue 2',       country: 'France',  dbSeason: '2025-26' },
  { div: 'I2',  seasonCode: '2526', competition: 'Serie B',       country: 'Italy',   dbSeason: '2025-26' },
  { div: 'SP2', seasonCode: '2526', competition: 'La Liga 2',     country: 'Spain',   dbSeason: '2025-26' },
  { div: 'T1',  seasonCode: '2526', competition: 'Süper Lig',     country: 'Turkey',  dbSeason: '2025-26' },
  { div: 'B1',  seasonCode: '2526', competition: 'Pro League',    country: 'Belgium', dbSeason: '2025-26' },
];

// ─── Alias map (CSV name → DB normKey) ───────────────────────────────────────
// The season CSVs use slightly different names than fixtures.csv in some cases.
// Extend this if you see NO MATCH lines in the logs.

const ALIAS: Record<string, string> = {
  // Belgium (B1)
  'antwerp'              : 'royal antwerp fc',
  'standard'             : 'standard liege',
  'st gilloise'          : 'union saintgilloise',
  'st. gilloise'         : 'union saintgilloise',
  'union st gilloise'    : 'union saintgilloise',
  'westerlo'             : 'kvc westerlo',
  'mechelen'             : 'kv mechelen',
  'gent'                 : 'kaa gent',
  'club brugge'          : 'club brugge kv',
  'genk'                 : 'krc genk',
  'st truiden'           : 'sinttruidense vv',
  'sint truiden'         : 'sinttruidense vv',
  'waregem'              : 'sv zulte waregem',
  'zulte waregem'        : 'sv zulte waregem',
  'dender'               : 'fcv dender eh',
  'la louviere'          : 'raal la louviere',
  'raal louviere'        : 'raal la louviere',
  'oud heverlee leuven'  : 'oud-heverlee leuven',

  // Germany 2. Bundesliga (D2)
  // Season CSV uses "Schalke 04" not "FC Schalke 04", "Hertha" not "Hertha BSC" etc.
  'schalke 04'           : 'fc schalke 04',
  'schalke'              : 'fc schalke 04',
  'hertha'               : 'hertha bsc',
  'bielefeld'            : 'arminia bielefeld',
  'bochum'               : 'vfl bochum',
  'braunschweig'         : 'eintracht braunschweig',
  'kaiserslautern'       : '1 fc kaiserslautern',
  'dresden'              : 'dynamo dresden',
  'hamburg'              : 'hamburger sv',
  'hannover'             : 'hannover 96',
  'dusseldorf'           : 'fortuna dusseldorf',
  'karlsruhe'            : 'karlsruher sc',
  'nurnberg'             : '1 fc nurnberg',
  'paderborn'            : 'sc paderborn 07',
  'regensburg'           : 'jahn regensburg',
  'magdeburg'            : '1 fc magdeburg',
  'munster'              : 'preussen munster',
  'preuen munster'       : 'preussen munster',  // typo seen in DB
  'elversberg'           : 'sv 07 elversberg',
  'sv elversberg'        : 'sv 07 elversberg',
  'darmstadt'            : 'sv darmstadt 98',
  'furth'                : 'spvgg greuther furth',
  'greuther furth'       : 'spvgg greuther furth',
  'kiel'                 : 'holstein kiel',

  // France Ligue 2 (F2)
  'auxerre'              : 'aj auxerre',
  'grenoble'             : 'grenoble foot 38',
  'guingamp'             : 'ea guingamp',
  'laval'                : 'stade laval',
  'le havre'             : 'le havre ac',
  'lens'                 : 'rc lens',
  'metz'                 : 'fc metz',
  'niort'                : 'chamois niortais',
  'pau'                  : 'pau fc',
  'rodez'                : 'rodez af',
  'saint etienne'        : 'as saint-etienne',
  'troyes'               : 'estac troyes',
  'valenciennes'         : 'valenciennes fc',
  'quevilly rouen'       : 'fc rouen',
  'rouen'                : 'fc rouen',

  // Italy Serie B (I2)
  'bari'                 : 'ssc bari',
  'brescia'              : 'brescia calcio',
  'carrarese'            : 'carrarese calcio',
  'catanzaro'            : 'us catanzaro',
  'cesena'               : 'ac cesena',
  'cittadella'           : 'as cittadella',
  'cosenza'              : 'cosenza calcio',
  'cremonese'            : 'us cremonese',
  'frosinone'            : 'frosinone calcio',
  'juve stabia'          : 'ss juve stabia',
  'mantova'              : 'mantova 1911',
  'modena'               : 'modena fc',
  'palermo'              : 'palermo fc',
  'pisa'                 : 'ac pisa 1909',
  'reggiana'             : 'ac reggiana',
  'salernitana'          : 'us salernitana',
  'sampdoria'            : 'uc sampdoria',
  'sassuolo'             : 'us sassuolo',
  'spezia'               : 'spezia calcio',
  'sudtirol'             : 'fc sudtirol',
  'avellino'             : 'us avellino',

  // Spain La Liga 2 (SP2)
  'albacete'             : 'albacete balompie',
  'alcorcon'             : 'ad alcorcon',
  'almeria'              : 'ud almeria',
  'burgos'               : 'burgos cf',
  'castellon'            : 'cd castellon',
  'eldense'              : 'cd eldense',
  'ferrol'               : 'racing ferrol',
  'granada'              : 'granada cf',
  'huesca'               : 'sd huesca',
  'leganes'              : 'cd leganes',
  'malaga'               : 'malaga cf',
  'mirandes'             : 'cd mirandes',
  'oviedo'               : 'real oviedo',
  'racing'               : 'racing santander',
  'racing santander'     : 'racing santander',
  'real valladolid'      : 'real valladolid',
  'sabadell'             : 'ce sabadell',
  'tenerife'             : 'cd tenerife',
  'villarreal b'         : 'villarreal cf b',
  'zaragoza'             : 'real zaragoza',

  // Turkey Süper Lig (T1)
  'basaksehir'           : 'istanbul basaksehir',
  'istanbul basaksehir'  : 'istanbul basaksehir',
  'kasimpasa'            : 'kasimpasa sk',
  'kasmpasa'             : 'kasimpasa sk',
  'fatih karagumruk'     : 'fatih karagumruk',
};

function resolveNormKey(csvName: string): string {
  const norm = normaliseTeamName(csvName);
  return ALIAS[norm] ?? norm;
}

// ─── UTC offsets (local → UTC conversion) ────────────────────────────────────

const UTC_OFFSET: Record<string, number> = {
  Germany : 2,  // CEST summer
  France  : 2,
  Italy   : 2,
  Spain   : 2,
  Turkey  : 3,  // TRT, no DST
  Belgium : 2,
};

function parseKickoff(date: string, time: string, country: string): Date | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [dd, mm, yyyy] = date.split('/');
  const [hh, min] = time.split(':');
  if (!dd || !mm || !yyyy || !hh || !min) return null;

  const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh.padStart(2,'0')}:${min.padStart(2,'0')}:00Z`;
  const localAsUtc = new Date(iso);
  if (isNaN(localAsUtc.getTime())) return null;

  const offsetMs = (UTC_OFFSET[country] ?? 0) * 3_600_000;
  return new Date(localAsUtc.getTime() - offsetMs);
}

// ─── CSV fetch ────────────────────────────────────────────────────────────────

interface CsvRow {
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
}

async function fetchSeasonCsv(div: string, seasonCode: string): Promise<CsvRow[]> {
  const url = `https://www.football-data.co.uk/mmz4281/${seasonCode}/${div}.csv`;
  logger.info(`[backfill] Fetching ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let text: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    text = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);

  const iDate = idx('date');
  const iTime = idx('time');
  const iHome = idx('hometeam');
  const iAway = idx('awayteam');

  if ([iDate, iTime, iHome, iAway].some(i => i === -1)) {
    logger.warn(`[backfill] ${div}: missing expected columns in header`);
    return [];
  }

  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const date     = cells[iDate]?.trim();
    const time     = cells[iTime]?.trim();
    const homeTeam = cells[iHome]?.trim();
    const awayTeam = cells[iAway]?.trim();
    if (!date || !homeTeam || !awayTeam) continue;
    rows.push({ date, time: time ?? '', homeTeam, awayTeam });
  }

  return rows;
}

// ─── Patch one league ─────────────────────────────────────────────────────────

async function backfillLeague(league: typeof LEAGUES[number]) {
  const csvRows = await fetchSeasonCsv(league.div, league.seasonCode);
  logger.info(`[backfill] ${league.competition}: fetched ${csvRows.length} rows from CSV`);

  if (csvRows.length === 0) return;

  // Only load DB fixtures that are still midnight placeholders — no point loading the rest
  const dbFixtures = await prisma.fixture.findMany({
    where: {
      competition: league.competition,
      season: league.dbSeason,
      kickoffAt: {
        // midnight UTC = time component is 00:00:00
        // Prisma doesn't have a direct time filter, so use range per day would be
        // complex — instead load all and filter in JS (dataset is small, ~300 rows)
      },
    },
    select: {
      id: true,
      homeTeamNormKey: true,
      awayTeamNormKey: true,
      kickoffAt: true,
    },
  });

  // Filter to just the midnight placeholders in JS
  const placeholders = dbFixtures.filter(
    f => f.kickoffAt.getUTCHours() === 0 && f.kickoffAt.getUTCMinutes() === 0,
  );
  logger.info(`[backfill] ${league.competition}: ${placeholders.length} placeholder fixtures in DB`);

  if (placeholders.length === 0) {
    logger.info(`[backfill] ${league.competition}: nothing to patch`);
    return;
  }

  // Index placeholders by normKey pair
  const dbIndex = new Map<string, typeof placeholders[number]>();
  for (const f of placeholders) {
    dbIndex.set(`${f.homeTeamNormKey}||${f.awayTeamNormKey}`, f);
  }

  let matched = 0, updated = 0, skipped = 0, noTime = 0;

  for (const row of csvRows) {
    const homeKey = resolveNormKey(row.homeTeam);
    const awayKey = resolveNormKey(row.awayTeam);
    const key = `${homeKey}||${awayKey}`;

    const dbFixture = dbIndex.get(key);
    if (!dbFixture) {
      logger.debug(`[backfill] NO MATCH [${league.div}] "${row.homeTeam}"(→${homeKey}) vs "${row.awayTeam}"(→${awayKey})`);
      skipped++;
      continue;
    }

    matched++;

    const kickoff = parseKickoff(row.date, row.time, league.country);
    if (!kickoff) {
      noTime++;
      continue;
    }

    await prisma.fixture.update({
      where: { id: dbFixture.id },
      data:  { kickoffAt: kickoff },
    });

    // Remove from index so we don't double-update if CSV has duplicate rows
    dbIndex.delete(key);
    updated++;
  }

  logger.info(
    `[backfill] ${league.competition}: matched=${matched} updated=${updated} skipped=${skipped} noTime=${noTime}`,
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runBackfillHistoricalKickoffs(): Promise<void> {
  logger.info('[backfill] Starting historical kickoff backfill for secondary leagues');

  for (const league of LEAGUES) {
    logger.info(`[backfill] Processing ${league.competition} (${league.country})`);
    try {
      await backfillLeague(league);
    } catch (err) {
      logger.error(`[backfill] Failed for ${league.competition}`, err);
    }
    // Polite delay between requests
    await new Promise(r => setTimeout(r, 1_500));
  }

  logger.info('[backfill] Done');
}