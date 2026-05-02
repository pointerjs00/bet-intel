// apps/api/src/services/bulkHistoricalImportService.ts

import { prisma } from '../prisma';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { fdCoUkCodeToCanonical, getFdCoUkSeasonsFrom2010 } from '../utils/seasonUtils';
import { LEAGUE_BY_FDCOUK_CODE } from '../config/leagueManifest';
import { logger } from '../utils/logger';

const FDCOUK_BASE = 'https://www.football-data.co.uk/mmz4281';

const COL_ALIASES: Record<string, string> = {
  'HG': 'FTHG', 'AG': 'FTAG', 'Res': 'FTR',
};

function parseFloatSafe(val?: string): number | null {
  if (!val || val === '' || val === 'N/A') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseIntSafe(val?: string): number | null {
  if (!val || val === '' || val === 'N/A') return null;
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

function parseDateFromRow(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [day, month, yearStr] = parts;
  const year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
  const d = new Date(Date.UTC(year, parseInt(month) - 1, parseInt(day)));
  return isNaN(d.getTime()) ? null : d;
}

function parseSimpleCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    const row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        row.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

export async function fetchAndParseCsv(url: string): Promise<Record<string, string>[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404 || !res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;

    const lines = parseSimpleCsv(text);
    if (lines.length < 2) return null;

    const rawHeaders = lines[0];
    const headers = rawHeaders.map(h => COL_ALIASES[h] ?? h);

    return lines.slice(1).map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    }).filter(row => row['HomeTeam'] && row['AwayTeam'] && row['Date']);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function upsertMatchStat(
  row: Record<string, string>,
  league: { name: string },
  season: string
): Promise<boolean> {
  const date     = parseDateFromRow(row['Date']);
  const homeTeam = row['HomeTeam']?.trim();
  const awayTeam = row['AwayTeam']?.trim();
  if (!date || !homeTeam || !awayTeam) return false;

  try {
    await prisma.matchStat.upsert({
      where: {
        matchstat_unique: {
          homeTeamNormKey: normaliseTeamName(homeTeam),
          awayTeamNormKey: normaliseTeamName(awayTeam),
          date,
        },
      },
      update: {},
      create: {
        homeTeam,
        awayTeam,
        homeTeamNormKey: normaliseTeamName(homeTeam),
        awayTeamNormKey: normaliseTeamName(awayTeam),
        competition: league.name,
        season,
        date,
        homeScore:    parseIntSafe(row['FTHG']),
        awayScore:    parseIntSafe(row['FTAG']),
        htHomeScore:  parseIntSafe(row['HTHG']),
        htAwayScore:  parseIntSafe(row['HTAG']),
        homeShotsTotal:    parseIntSafe(row['HS']),
        awayShotsTotal:    parseIntSafe(row['AS']),
        homeShotsOnTarget: parseIntSafe(row['HST']),
        awayShotsOnTarget: parseIntSafe(row['AST']),
        homeCorners: parseIntSafe(row['HC']),
        awayCorners: parseIntSafe(row['AC']),
        homeYellow:  parseIntSafe(row['HY']),
        awayYellow:  parseIntSafe(row['AY']),
        homeRed:     parseIntSafe(row['HR']),
        awayRed:     parseIntSafe(row['AR']),
        homeFouls:   parseIntSafe(row['HF']),
        awayFouls:   parseIntSafe(row['AF']),
        homeOffsides: parseIntSafe(row['HO']),
        awayOffsides: parseIntSafe(row['AO']),
        b365HomeWin: parseFloatSafe(row['B365H']),
        b365Draw:    parseFloatSafe(row['B365D']),
        b365AwayWin: parseFloatSafe(row['B365A']),
        b365Over25:  parseFloatSafe(row['B365>2.5']),
        b365Under25: parseFloatSafe(row['B365<2.5']),
        pinnacleHomeWin: parseFloatSafe(row['PSH'] ?? row['PSCH']),
        pinnacleDraw:    parseFloatSafe(row['PSD'] ?? row['PSCD']),
        pinnacleAwayWin: parseFloatSafe(row['PSA'] ?? row['PSCA']),
        pinnacleOver25:  parseFloatSafe(row['P>2.5']),
        pinnacleUnder25: parseFloatSafe(row['P<2.5']),
        avgOddsHome:    parseFloatSafe(row['AvgH']    ?? row['BbAvH']),
        avgOddsDraw:    parseFloatSafe(row['AvgD']    ?? row['BbAvD']),
        avgOddsAway:    parseFloatSafe(row['AvgA']    ?? row['BbAvA']),
        avgOddsOver25:  parseFloatSafe(row['Avg>2.5'] ?? row['BbAv>2.5']),
        avgOddsUnder25: parseFloatSafe(row['Avg<2.5'] ?? row['BbAv<2.5']),
        maxOddsHome:    parseFloatSafe(row['MaxH']    ?? row['BbMxH']),
        maxOddsDraw:    parseFloatSafe(row['MaxD']    ?? row['BbMxD']),
        maxOddsAway:    parseFloatSafe(row['MaxA']    ?? row['BbMxA']),
        source: 'football-data.co.uk',
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function runBulkHistoricalImport(): Promise<void> {
  const seasons     = getFdCoUkSeasonsFrom2010();
  const leagueEntries = Object.entries(LEAGUE_BY_FDCOUK_CODE);

  let totalUpserted = 0;

  for (const [code, league] of leagueEntries) {
    for (const seasonCode of seasons) {
      const canonicalSeason = fdCoUkCodeToCanonical(seasonCode);
      const url  = `${FDCOUK_BASE}/${seasonCode}/${code}.csv`;
      const rows = await fetchAndParseCsv(url);
      if (!rows) continue;

      let fileUpserted = 0;
      for (const row of rows) {
        const ok = await upsertMatchStat(row, league, canonicalSeason);
        if (ok) fileUpserted++;
      }
      totalUpserted += fileUpserted;
      logger.info(`[bulkImport] ${league.name} ${canonicalSeason}: ${fileUpserted}/${rows.length} rows`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  logger.info(`[bulkImport] Complete — ${totalUpserted} total records`);
}
