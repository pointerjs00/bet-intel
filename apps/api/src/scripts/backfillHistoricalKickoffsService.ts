// apps/api/src/services/backfillHistoricalKickoffsService.ts
//
// One-time backfill: fetches full season CSVs from football-data.co.uk and
// patches midnight placeholder kickoff times in the Fixture table.
//
// Matching strategy:
//   1. Primary:  exact normKey pair match
//   2. Fallback: same date + one team name matches (handles Ligue 2 / La Liga 2
//                where the CSV has a different season's team set)

import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { normaliseTeamName } from '../utils/nameNormalisation';

const LEAGUES: Array<{
  div: string;
  seasonCode: string;
  competition: string;
  country: string;
  dbSeason: string;
}> = [
  { div: 'D2',  seasonCode: '2526', competition: '2. Bundesliga', country: 'Germany', dbSeason: '2025-26' },
  { div: 'F2',  seasonCode: '2526', competition: 'Ligue 2',       country: 'France',  dbSeason: '2025-26' },
  { div: 'I2',  seasonCode: '2526', competition: 'Serie B',       country: 'Italy',   dbSeason: '2025-26' },
  { div: 'SP2', seasonCode: '2526', competition: 'La Liga 2',     country: 'Spain',   dbSeason: '2025-26' },
  { div: 'T1',  seasonCode: '2526', competition: 'Süper Lig',     country: 'Turkey',  dbSeason: '2025-26' },
  { div: 'B1',  seasonCode: '2526', competition: 'Pro League',    country: 'Belgium', dbSeason: '2025-26' },
];

// ─── Alias: normaliseTeamName(csvName) → exact DB homeTeamNormKey ─────────────
// DB normKeys confirmed from live queries on 2026-05-03.

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
  'fortuna dusseldorf'   : 'fortuna dusseldorf',
  'karlsruhe'            : 'karlsruher sc',
  'nurnberg'             : '1 fc nurnberg',
  'paderborn'            : 'sc paderborn 07',
  'magdeburg'            : '1 fc magdeburg',
  'munster'              : 'preuen munster',       // DB has typo "preuen"
  'preuen munster'       : 'preuen munster',
  'preußen munster'      : 'preuen munster',
  'elversberg'           : 'sv 07 elversberg',
  'sv elversberg'        : 'sv 07 elversberg',
  'greuther furth'       : 'spvgg greuther furth',
  'darmstadt'            : 'sv darmstadt 98',
  'kiel'                 : 'holstein kiel',
  'holstein kiel'        : 'holstein kiel',

  // Italy Serie B (I2) — DB normKeys confirmed
  'bari'                 : 'ssc bari',
  'carrarese'            : 'carrarese calcio',
  'catanzaro'            : 'us catanzaro',
  'cesena'               : 'cesena fc',
  'ac cesena'            : 'cesena fc',
  'frosinone'            : 'frosinone calcio',
  'juve stabia'          : 'juve stabia',
  'ss juve stabia'       : 'juve stabia',
  'mantova'              : 'mantova 1911 ssd',
  'mantova 1911'         : 'mantova 1911 ssd',
  'modena'               : 'modena fc',
  'palermo'              : 'palermo fc',
  'reggiana'             : 'ac reggiana 1919',
  'ac reggiana'          : 'ac reggiana 1919',
  'sampdoria'            : 'sampdoria',
  'uc sampdoria'         : 'sampdoria',
  'spezia'               : 'spezia calcio',
  'sudtirol'             : 'fc sudtirol',
  'avellino'             : 'us avellino',
  'monza'                : 'ac monza',
  'pescara'              : 'delfino pescara',
  'empoli'               : 'empoli fc',
  'venezia'              : 'venezia fc',
  'padova'               : 'calcio padova',
  'entella'              : 'virtus entella',
  'virtus entella'       : 'virtus entella',
  'brescia'              : 'brescia calcio',
  'cremonese'            : 'us cremonese',
  'salernitana'          : 'us salernitana',
  'sassuolo'             : 'us sassuolo',
  'pisa'                 : 'ac pisa 1909',
  'cittadella'           : 'as cittadella',
  'cosenza'              : 'cosenza calcio',

  // Turkey Süper Lig (T1) — DB normKeys confirmed
  'basaksehir'           : 'istanbul basaksehir',
  'istanbul basaksehir'  : 'istanbul basaksehir',
  'kasimpasa'            : 'kasmpasa sk',           // DB has typo "kasmpasa"
  'kasımpasa'            : 'kasmpasa sk',
  'karagumruk'           : 'fatih karagumruk',

  // Spain La Liga 2 (SP2) — DB normKeys confirmed
  'almeria'              : 'ud almeria',
  'albacete'             : 'albacete',
  'burgos'               : 'burgos cf',
  'cadiz'                : 'cadiz cf',
  'castellon'            : 'cd castellon',
  'leganes'              : 'cd leganes',
  'mirandes'             : 'cd mirandes',
  'cordoba'              : 'cordoba cf',
  'ceuta'                : 'ad ceuta fc',
  'ad ceuta'             : 'ad ceuta fc',
  'cultural leonesa'     : 'cultural leonesa',
  'deportivo'            : 'deportivo la coruna',
  'la coruna'            : 'deportivo la coruna',
  'andorra'              : 'fc andorra',
  'granada'              : 'granada cf',
  'malaga'               : 'malaga cf',
  'racing'               : 'racing santander',
  'real sociedad b'      : 'real sociedad b',
  'zaragoza'             : 'real zaragoza',
  'eibar'                : 'sd eibar',
  'huesca'               : 'sd huesca',
  'gijon'                : 'sporting gijon',
  'las palmas'           : 'ud las palmas',
  'villarreal b'         : 'villarreal cf b',
  'tenerife'             : 'cd tenerife',
  'oviedo'               : 'real oviedo',
  'ferrol'               : 'racing ferrol',
  'alcorcon'             : 'ad alcorcon',
  'eldense'              : 'cd eldense',
  'sabadell'             : 'ce sabadell',

  // France Ligue 2 (F2) — DB normKeys confirmed
  'amiens'               : 'amiens sc',
  'nancy'                : 'as nancy lorraine',
  'as nancy'             : 'as nancy lorraine',
  'saintetienne'         : 'as saintetienne',
  'saint etienne'        : 'as saintetienne',
  'as saint-etienne'     : 'as saintetienne',
  'clermont'             : 'clermont foot 63',
  'guingamp'             : 'ea guingamp',
  'troyes'               : 'estac troyes',
  'annecy'               : 'fc annecy',
  'grenoble'             : 'grenoble foot 38',
  'le mans'              : 'le mans fc',
  'montpellier'          : 'montpellier hsc',
  'pau'                  : 'pau fc',
  'red star'             : 'red star fc',
  'rodez'                : 'rodez af',
  'bastia'               : 'sc bastia',
  'reims'                : 'stade de reims',
  'laval'                : 'stade lavallois',
  'stade laval'          : 'stade lavallois',
  'stade lavallois'      : 'stade lavallois',
  'boulogne'             : 'us boulogne',
  'dunkerque'            : 'usl dunkerque',
};

function resolveNormKey(csvName: string): string {
  const norm = normaliseTeamName(csvName);
  return ALIAS[norm] ?? norm;
}

// ─── UTC offsets (local → UTC) ────────────────────────────────────────────────

const UTC_OFFSET: Record<string, number> = {
  Germany: 2, France: 2, Italy: 2, Spain: 2, Turkey: 3, Belgium: 2,
};

function parseKickoff(date: string, time: string, country: string): Date | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [dd, mm, yyyy] = date.split('/');
  const [hh, min] = time.split(':');
  if (!dd || !mm || !yyyy || !hh || !min) return null;
  const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh.padStart(2,'0')}:${min.padStart(2,'0')}:00Z`;
  const localAsUtc = new Date(iso);
  if (isNaN(localAsUtc.getTime())) return null;
  return new Date(localAsUtc.getTime() - (UTC_OFFSET[country] ?? 0) * 3_600_000);
}

// ─── CSV fetch ────────────────────────────────────────────────────────────────

interface CsvRow {
  date: string; time: string;
  homeTeam: string; awayTeam: string;
  homeNorm: string; awayNorm: string;
}

async function fetchSeasonCsv(div: string, seasonCode: string): Promise<CsvRow[]> {
  const url = `https://www.football-data.co.uk/mmz4281/${seasonCode}/${div}.csv`;
  logger.info(`[backfill] Fetching ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let text: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timeout);
  }
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = (n: string) => headers.indexOf(n);
  const iDate = idx('date'), iTime = idx('time');
  const iHome = idx('hometeam'), iAway = idx('awayteam');
  if ([iDate, iTime, iHome, iAway].some(i => i === -1)) return [];
  return lines.slice(1).map(line => {
    const c = line.split(',');
    const homeTeam = c[iHome]?.trim() ?? '';
    const awayTeam = c[iAway]?.trim() ?? '';
    return {
      date: c[iDate]?.trim() ?? '', time: c[iTime]?.trim() ?? '',
      homeTeam, awayTeam,
      homeNorm: resolveNormKey(homeTeam),
      awayNorm: resolveNormKey(awayTeam),
    };
  }).filter(r => r.date && r.homeTeam && r.awayTeam);
}

// ─── Per-league backfill ──────────────────────────────────────────────────────

async function backfillLeague(league: typeof LEAGUES[number]) {
  const csvRows = await fetchSeasonCsv(league.div, league.seasonCode);
  logger.info(`[backfill] ${league.competition}: fetched ${csvRows.length} rows from CSV`);
  if (csvRows.length === 0) return;

  const dbFixtures = await prisma.fixture.findMany({
    where: { competition: league.competition, season: league.dbSeason },
    select: { id: true, homeTeamNormKey: true, awayTeamNormKey: true, kickoffAt: true },
  });

  const placeholders = dbFixtures.filter(
    f => f.kickoffAt.getUTCHours() === 0 && f.kickoffAt.getUTCMinutes() === 0,
  );
  logger.info(`[backfill] ${league.competition}: ${placeholders.length} placeholder fixtures in DB`);
  if (placeholders.length === 0) return;

  // Index 1: exact normKey pair
  const exactIndex = new Map<string, typeof placeholders[number]>();
  for (const f of placeholders) {
    exactIndex.set(`${f.homeTeamNormKey}||${f.awayTeamNormKey}`, f);
  }

  // Index 2: date → list of fixtures (for fuzzy fallback)
  const dateIndex = new Map<string, typeof placeholders[number][]>();
  for (const f of placeholders) {
    // Midnight UTC placeholders — the date IS the match date
    const dateKey = f.kickoffAt.toISOString().slice(0, 10);
    const arr = dateIndex.get(dateKey) ?? [];
    arr.push(f);
    dateIndex.set(dateKey, arr);
  }

  let exactMatched = 0, fuzzyMatched = 0, updated = 0, noMatch = 0, noTime = 0;
  const updatedIds = new Set<string>();

  for (const row of csvRows) {
    const kickoff = parseKickoff(row.date, row.time, league.country);
    if (!kickoff) { noTime++; continue; }

    // Strategy 1: exact normKey pair match
    const exactKey = `${row.homeNorm}||${row.awayNorm}`;
    let dbFixture = exactIndex.get(exactKey);

    if (dbFixture && !updatedIds.has(dbFixture.id)) {
      exactMatched++;
    } else {
      dbFixture = undefined;

      // Strategy 2: same date + at least one team matches
      // Check kickoff date and ±1 day to handle timezone edge cases
      const dates = [-1, 0, 1].map(offset => {
        const d = new Date(kickoff);
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      });

      for (const dateKey of dates) {
        const candidates = dateIndex.get(dateKey) ?? [];
        const match = candidates.find(c =>
          !updatedIds.has(c.id) && (
            (c.homeTeamNormKey === row.homeNorm && c.awayTeamNormKey === row.awayNorm) ||
            (c.homeTeamNormKey === row.homeNorm) ||
            (c.awayTeamNormKey === row.awayNorm)
          )
        );
        if (match) { dbFixture = match; break; }
      }

      if (dbFixture) {
        fuzzyMatched++;
        logger.debug(
          `[backfill] FUZZY [${league.div}] "${row.homeTeam}" vs "${row.awayTeam}" ` +
          `→ DB "${dbFixture.homeTeamNormKey}" vs "${dbFixture.awayTeamNormKey}"`,
        );
      } else {
        noMatch++;
        logger.debug(
          `[backfill] NO MATCH [${league.div}] "${row.homeTeam}"(→${row.homeNorm}) ` +
          `vs "${row.awayTeam}"(→${row.awayNorm}) @ ${kickoff.toISOString()}`,
        );
        continue;
      }
    }

    if (updatedIds.has(dbFixture.id)) continue;

    await prisma.fixture.update({
      where: { id: dbFixture.id },
      data:  { kickoffAt: kickoff },
    });
    updatedIds.add(dbFixture.id);
    exactIndex.delete(exactKey);
    updated++;
  }

  logger.info(
    `[backfill] ${league.competition}: ` +
    `exactMatch=${exactMatched} fuzzyMatch=${fuzzyMatched} updated=${updated} noMatch=${noMatch} noTime=${noTime}`,
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runBackfillHistoricalKickoffs(): Promise<void> {
  logger.info('[backfill] Starting historical kickoff backfill');
  for (const league of LEAGUES) {
    logger.info(`[backfill] Processing ${league.competition}`);
    try {
      await backfillLeague(league);
    } catch (err) {
      logger.error(`[backfill] Failed for ${league.competition}`, err);
    }
    await new Promise(r => setTimeout(r, 1_500));
  }
  logger.info('[backfill] Done');
}