// apps/api/src/services/patchFixturesFromCsvService.ts

import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { normaliseTeamName } from '../utils/nameNormalisation';

const FIXTURES_CSV_URL = 'https://www.football-data.co.uk/fixtures.csv';

const DIV_MAP: Record<string, { competition: string; country: string }> = {
  D2: { competition: '2. Bundesliga', country: 'Germany'  },
  F2: { competition: 'Ligue 2',       country: 'France'   },
  I2: { competition: 'Serie B',       country: 'Italy'    },
  SP2:{ competition: 'La Liga 2',     country: 'Spain'    },
  T1: { competition: 'Süper Lig',     country: 'Turkey'   },
  B1: { competition: 'Pro League',    country: 'Belgium'  },
};

// ─── CSV name → exact normKey used in your DB ─────────────────────────────────
// Left side:  normaliseTeamName(csvName)   — what the CSV produces after normalisation
// Right side: the homeTeamNormKey/awayTeamNormKey already stored in your DB
//
// To find missing ones: add a logger.debug in the match loop below, then check
// the output for "NO MATCH" lines and add the mapping here.

const ALIAS: Record<string, string> = {
  // ── Belgium (B1) ──────────────────────────────────────────────────────────
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
  'cercle brugge'        : 'cercle brugge',       // already matches — keep for safety
  'oud heverlee leuven'  : 'oud-heverlee leuven',
  'waregem'              : 'sv zulte waregem',
  'zulte waregem'        : 'sv zulte waregem',
  'charleroi'            : 'charleroi',
  'dender'               : 'fcv dender eh',
  'la louviere'          : 'raal la louviere',
  'raal louviere'        : 'raal la louviere',

  // ── Germany 2. Bundesliga (D2) ────────────────────────────────────────────
  'bielefeld'            : 'arminia bielefeld',
  'bochum'               : 'vfl bochum',
  'holstein kiel'        : 'holstein kiel',
  'braunschweig'         : 'eintracht braunschweig',
  'kaiserslautern'       : '1 fc kaiserslautern',
  'dresden'              : 'dynamo dresden',
  'hamburg'              : 'hamburger sv',
  'hsv'                  : 'hamburger sv',
  'hannover'             : 'hannover 96',
  'schalke'              : 'fc schalke 04',
  'dusseldorf'           : 'fortuna dusseldorf',
  'karlsruhe'            : 'karlsruher sc',
  'nurnberg'             : '1 fc nurnberg',
  'paderborn'            : 'sc paderborn 07',
  'regensburg'           : 'jahn regensburg',
  'magdeburg'            : '1 fc magdeburg',
  'munster'              : 'preussen munster',
  'elversberg'           : 'sv elversberg',

  // ── France Ligue 2 (F2) ───────────────────────────────────────────────────
  'auxerre'              : 'aj auxerre',
  'grenoble'             : 'grenoble foot 38',
  'guingamp'             : 'ea guingamp',
  'laval'                : 'stade laval',
  'le havre'             : 'le havre ac',
  'lens'                 : 'rc lens',
  'metz'                 : 'fc metz',
  'niort'                : 'chamois niortais',
  'pau'                  : 'pau fc',
  'quevilly rouen'       : 'fc rouen',
  'rodez'                : 'rodez af',
  'saint etienne'        : 'as saint-etienne',
  'sd eibar'             : 'sd eibar',
  'troyes'               : 'estac troyes',
  'valenciennes'         : 'valenciennes fc',

  // ── Italy Serie B (I2) ────────────────────────────────────────────────────
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

  // ── Spain La Liga 2 (SP2) ─────────────────────────────────────────────────
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
  'santander'            : 'racing santander',
  'tenerife'             : 'cd tenerife',
  'villarreal b'         : 'villarreal cf b',
  'zaragoza'             : 'real zaragoza',

  // ── Turkey Süper Lig (T1) ─────────────────────────────────────────────────
  'alanyaspor'           : 'alanyaspor',
  'antalyaspor'          : 'antalyaspor',
  'basaksehir'           : 'istanbul basaksehir',
  'istanbul basaksehir'  : 'istanbul basaksehir',
  'besiktas'             : 'besiktas',
  'caykur rizespor'      : 'caykur rizespor',
  'eyupspor'             : 'eyupspor',
  'fenerbahce'           : 'fenerbahce',
  'galatasaray'          : 'galatasaray',
  'gaziantep fk'         : 'gaziantep fk',
  'genclerbirligi'       : 'genclerbirligi',
  'goztepe'              : 'goztepe',
  'kasimpasa'            : 'kasimpasa sk',
  'kasmpasa'             : 'kasimpasa sk',   // typo seen in your DB
  'kayserispor'          : 'kayserispor',
  'kocaelispor'          : 'kocaelispor',
  'konyaspor'            : 'konyaspor',
  'samsunspor'           : 'samsunspor',
  'sivasspor'            : 'sivasspor',
  'trabzonspor'          : 'trabzonspor',
  'fatih karagumruk'     : 'fatih karagumruk',
};

// ─── Resolve a CSV team name to the DB normKey ────────────────────────────────

function resolveNormKey(csvName: string): string {
  const norm = normaliseTeamName(csvName);
  return ALIAS[norm] ?? norm;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CsvRow {
  div: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
}

// ─── CSV fetch + parse ────────────────────────────────────────────────────────

async function fetchAndParseCsv(): Promise<CsvRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let text: string;
  try {
    const res = await fetch(FIXTURES_CSV_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('fixtures.csv appears empty');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const col = (name: string) => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`fixtures.csv missing column: ${name}`);
    return i;
  };

  const iDiv  = col('div');
  const iDate = col('date');
  const iTime = col('time');
  const iHome = col('hometeam');
  const iAway = col('awayteam');

  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const div = cells[iDiv]?.trim();
    if (!div || !DIV_MAP[div]) continue;

    const date     = cells[iDate]?.trim();
    const time     = cells[iTime]?.trim();
    const homeTeam = cells[iHome]?.trim();
    const awayTeam = cells[iAway]?.trim();

    if (!date || !time || !homeTeam || !awayTeam) continue;
    if (!/^\d{2}:\d{2}$/.test(time)) continue;

    rows.push({ div, date, time, homeTeam, awayTeam });
  }
  return rows;
}

// ─── Date/time parsing ────────────────────────────────────────────────────────

const COUNTRY_UTC_OFFSET_HOURS: Record<string, number> = {
  Germany : 2,
  France  : 2,
  Italy   : 2,
  Spain   : 2,
  Turkey  : 3,
  Belgium : 2,
};

function parseKickoff(date: string, time: string, country: string): Date | null {
  const [dd, mm, yyyy] = date.split('/');
  const [hh, min] = time.split(':');
  if (!dd || !mm || !yyyy || !hh || !min) return null;

  const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh.padStart(2,'0')}:${min.padStart(2,'0')}:00Z`;
  const localAsUtc = new Date(iso);
  if (isNaN(localAsUtc.getTime())) return null;

  // CSV times are local — subtract offset to get true UTC
  const offsetMs = (COUNTRY_UTC_OFFSET_HOURS[country] ?? 0) * 3_600_000;
  return new Date(localAsUtc.getTime() - offsetMs);
}

function kickoffToDbSeason(kickoff: Date): string {
  const year  = kickoff.getUTCFullYear();
  const month = kickoff.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runPatchFixturesFromCsv(): Promise<void> {
  logger.info('[patchCsv] Fetching fixtures.csv from football-data.co.uk');

  const rows = await fetchAndParseCsv();
  logger.info(`[patchCsv] Parsed ${rows.length} relevant fixture rows`);
  if (rows.length === 0) {
    logger.warn('[patchCsv] No rows parsed — check div codes or CSV format');
    return;
  }

  let totalMatched = 0, totalUpdated = 0, totalSkipped = 0;

  const byDiv = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const arr = byDiv.get(row.div) ?? [];
    arr.push(row);
    byDiv.set(row.div, arr);
  }

  for (const [div, divRows] of byDiv.entries()) {
    const meta = DIV_MAP[div];

    const seasons = new Set<string>();
    for (const row of divRows) {
      const kickoff = parseKickoff(row.date, row.time, meta.country);
      if (kickoff) seasons.add(kickoffToDbSeason(kickoff));
    }

    const dbFixtures = await prisma.fixture.findMany({
      where: { competition: meta.competition, season: { in: [...seasons] } },
      select: { id: true, homeTeamNormKey: true, awayTeamNormKey: true, kickoffAt: true },
    });

    const dbIndex = new Map<string, typeof dbFixtures[number]>();
    for (const f of dbFixtures) {
      dbIndex.set(`${f.homeTeamNormKey}||${f.awayTeamNormKey}`, f);
    }

    let matched = 0, updated = 0, skipped = 0;

    for (const row of divRows) {
      const kickoff = parseKickoff(row.date, row.time, meta.country);
      if (!kickoff) { skipped++; continue; }

      const homeKey = resolveNormKey(row.homeTeam);
      const awayKey = resolveNormKey(row.awayTeam);
      const key = `${homeKey}||${awayKey}`;

      const dbFixture = dbIndex.get(key);
      if (!dbFixture) {
        // Log unmatched so we can add missing aliases
        logger.debug(`[patchCsv] NO MATCH [${div}] "${row.homeTeam}"(→${homeKey}) vs "${row.awayTeam}"(→${awayKey})`);
        skipped++;
        continue;
      }

      matched++;

      const cur = dbFixture.kickoffAt;
      const isPlaceholder = cur.getUTCHours() === 0 && cur.getUTCMinutes() === 0;
      if (!isPlaceholder) { skipped++; continue; }

      await prisma.fixture.update({
        where: { id: dbFixture.id },
        data:  { kickoffAt: kickoff },
      });
      updated++;
    }

    totalMatched += matched;
    totalUpdated += updated;
    totalSkipped += skipped;

    logger.info(
      `[patchCsv] ${meta.competition}: rows=${divRows.length} matched=${matched} updated=${updated} skipped=${skipped}`,
    );
  }

  logger.info(`[patchCsv] Done — matched=${totalMatched} updated=${totalUpdated} skipped=${totalSkipped}`);
}