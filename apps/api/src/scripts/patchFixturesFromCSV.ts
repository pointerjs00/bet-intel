// apps/api/src/services/patchFixturesFromCsvService.ts
//
// Patches kickoff times for secondary leagues using football-data.co.uk's
// fixtures.csv — a free, no-auth-required file updated daily.
//
// URL: https://www.football-data.co.uk/fixtures.csv
//
// Covers: 2. Bundesliga (D2), Ligue 2 (F2), Serie B (I2),
//         La Liga 2 (SP2), Süper Lig (T1), Pro League Belgium (B1)
//
// Run once to backfill, then weekly via scheduler.

import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { normaliseTeamName } from '../utils/nameNormalisation';

const FIXTURES_CSV_URL = 'https://www.football-data.co.uk/fixtures.csv';

// ─── Div code → Fixture table competition/country ─────────────────────────────
// These are the exact Div column values in the CSV mapped to your DB values.

const DIV_MAP: Record<string, { competition: string; country: string }> = {
  D2: { competition: '2. Bundesliga', country: 'Germany'  },
  F2: { competition: 'Ligue 2',       country: 'France'   },
  I2: { competition: 'Serie B',       country: 'Italy'    },
  SP2:{ competition: 'La Liga 2',     country: 'Spain'    },
  T1: { competition: 'Süper Lig',     country: 'Turkey'   },
  B1: { competition: 'Pro League',    country: 'Belgium'  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CsvRow {
  div: string;
  date: string;   // "02/05/2026"
  time: string;   // "14:30"
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

  // Strip BOM if present
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) throw new Error('fixtures.csv appears empty');

  // Parse header to find column indices — future-proof against column additions
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
    if (!div || !DIV_MAP[div]) continue; // skip leagues we don't care about

    const date     = cells[iDate]?.trim();
    const time     = cells[iTime]?.trim();
    const homeTeam = cells[iHome]?.trim();
    const awayTeam = cells[iAway]?.trim();

    if (!date || !time || !homeTeam || !awayTeam) continue;
    if (!/^\d{2}:\d{2}$/.test(time)) continue; // skip rows with no valid time

    rows.push({ div, date, time, homeTeam, awayTeam });
  }

  return rows;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────
// football-data.co.uk uses DD/MM/YYYY + HH:MM (times are local to the match,
// but for fixture scheduling purposes treating as UTC is acceptable — the times
// are already correct-ish for display, and you can refine the timezone offset
// per country if needed).

function parseKickoff(date: string, time: string): Date | null {
  // date = "02/05/2026", time = "14:30"
  const [dd, mm, yyyy] = date.split('/');
  if (!dd || !mm || !yyyy) return null;
  const [hh, min] = time.split(':');
  if (!hh || !min) return null;

  const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh.padStart(2,'0')}:${min.padStart(2,'0')}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Country UTC offsets (approximate, for summer/winter) ─────────────────────
// football-data.co.uk times are listed in local time for each league.
// Apply an offset so kickoffAt is stored correctly in UTC.
// Adjust these if your DB stores UTC and your UI converts — if you're already
// storing as-is (treating them as UTC), set all to 0 and remove this section.

const COUNTRY_UTC_OFFSET_HOURS: Record<string, number> = {
  Germany : 2,  // CEST (summer)
  France  : 2,  // CEST (summer)
  Italy   : 2,  // CEST (summer)
  Spain   : 2,  // CEST (summer)
  Turkey  : 3,  // TRT (no DST)
  Belgium : 2,  // CEST (summer)
};

function applyTimezoneOffset(utcDate: Date, country: string): Date {
  const offsetHours = COUNTRY_UTC_OFFSET_HOURS[country] ?? 0;
  // The CSV time is local; subtract offset to get real UTC
  return new Date(utcDate.getTime() - offsetHours * 60 * 60 * 1000);
}

// ─── Determine current DB season from a kickoff date ─────────────────────────

function kickoffToDbSeason(kickoff: Date): string {
  const year  = kickoff.getUTCFullYear();
  const month = kickoff.getUTCMonth() + 1; // 1-based
  // Season starts in July/August; if month < 7 it's the second half of a season
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

// ─── Main patch logic ─────────────────────────────────────────────────────────

export async function runPatchFixturesFromCsv(): Promise<void> {
  logger.info('[patchCsv] Fetching fixtures.csv from football-data.co.uk');

  const rows = await fetchAndParseCsv();
  logger.info(`[patchCsv] Parsed ${rows.length} relevant fixture rows`);

  if (rows.length === 0) {
    logger.warn('[patchCsv] No rows parsed — check div codes or CSV format');
    return;
  }

  let totalMatched = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  // Group rows by div so we can do one DB query per league
  const byDiv = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const arr = byDiv.get(row.div) ?? [];
    arr.push(row);
    byDiv.set(row.div, arr);
  }

  for (const [div, divRows] of byDiv.entries()) {
    const meta = DIV_MAP[div];

    // Collect all seasons appearing in this batch
    const seasons = new Set<string>();
    for (const row of divRows) {
      const kickoff = parseKickoff(row.date, row.time);
      if (kickoff) seasons.add(kickoffToDbSeason(kickoff));
    }

    // Load DB fixtures for this league across all relevant seasons
    const dbFixtures = await prisma.fixture.findMany({
      where: {
        competition: meta.competition,
        season: { in: [...seasons] },
      },
      select: {
        id: true,
        homeTeamNormKey: true,
        awayTeamNormKey: true,
        kickoffAt: true,
        season: true,
      },
    });

    // Index by normKey pair
    const dbIndex = new Map<string, typeof dbFixtures[number]>();
    for (const f of dbFixtures) {
      const key = `${f.homeTeamNormKey}||${f.awayTeamNormKey}`;
      dbIndex.set(key, f);
    }

    let matched = 0, updated = 0, skipped = 0;

    for (const row of divRows) {
      const rawKickoff = parseKickoff(row.date, row.time);
      if (!rawKickoff) { skipped++; continue; }

      const kickoff = applyTimezoneOffset(rawKickoff, meta.country);

      const homeNorm = normaliseTeamName(row.homeTeam);
      const awayNorm = normaliseTeamName(row.awayTeam);
      const key = `${homeNorm}||${awayNorm}`;

      const dbFixture = dbIndex.get(key);
      if (!dbFixture) { skipped++; continue; }

      matched++;

      // Only update if current kickoffAt is a midnight placeholder
      const cur = dbFixture.kickoffAt;
      const isPlaceholder =
        cur.getUTCHours() === 0 && cur.getUTCMinutes() === 0;

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

  logger.info(
    `[patchCsv] Done — matched=${totalMatched} updated=${totalUpdated} skipped=${totalSkipped}`,
  );
}