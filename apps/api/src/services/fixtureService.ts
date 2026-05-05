/**
 * fixtureService.ts — DEPRECATED (OpenFootball ingestion only)
 *
 * ingestFixtures() is a no-op — fixtures now come from API-Football via
 * apps/api/src/services/apifootball/fixturesSync.ts
 *
 * recomputeTeamStats() is KEPT ACTIVE as the standings bridge until the
 * dedicated API-Football standings sync (standingsSync.ts) is built. It
 * aggregates TeamStat rows from finished Fixture rows, which are now
 * populated by API-Football, so season values will be "2025" (not "2025-26"),
 * matching what the standings controller queries.
 *
 * Once standingsSync.ts is live, delete this file.
 */

import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { normaliseTeamName } from '../utils/nameNormalisation';
import {
  fixturesSyncJob,
  ensureFixturesFresh as apiFootballEnsureFixturesFresh,
} from './apifootball/fixturesSync';

export interface IngestResult {
  upserted: number;
  leagues: number;
  fallbacks: number;
}

export interface RecomputeResult {
  teams: number;
  competitions: number;
}

// ─── ingestFixtures — no-op ───────────────────────────────────────────────────

/** @deprecated Use fixturesSyncJob() from apifootball/fixturesSync instead. */
export async function ingestFixtures(): Promise<IngestResult> {
  logger.warn('[fixtureService] ingestFixtures() is deprecated — delegating to API-Football');
  await fixturesSyncJob();
  return { upserted: 0, leagues: 0, fallbacks: 0 };
}

// ─── recomputeTeamStats — ACTIVE bridge ──────────────────────────────────────

/**
 * Recomputes TeamStat rows by aggregating all FINISHED fixtures.
 * Called by fixturesSync.ts after every sync run.
 *
 * Season is taken from each Fixture row directly. API-Football stores
 * season = "2025", so TeamStat rows will be written with season = "2025",
 * matching what the standings controller queries.
 */
export async function recomputeTeamStats(): Promise<RecomputeResult> {
  interface MatchRecord {
    date: Date;
    gf: number;
    ga: number;
    isHome: boolean;
    htGf: number | null;
    htGa: number | null;
  }
  interface Accum {
    team: string;
    competition: string;
    season: string;
    country: string;
    matches: MatchRecord[];
  }

  const fixtures = await prisma.fixture.findMany({
    where: { status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } },
    orderBy: { kickoffAt: 'asc' },
  });

  const map = new Map<string, Accum>();
  const key = (team: string, comp: string, season: string) =>
    `${normaliseTeamName(team)}|||${comp}|||${season}`;
  const get = (team: string, comp: string, season: string, country: string): Accum => {
    const normTeam = normaliseTeamName(team);
    const k = key(normTeam, comp, season);
    if (!map.has(k)) map.set(k, { team: normTeam, competition: comp, season, country, matches: [] });
    return map.get(k)!;
  };

  for (const f of fixtures) {
    const hg = f.homeScore!;
    const ag = f.awayScore!;
    get(f.homeTeam, f.competition, f.season, f.country).matches.push(
      { date: f.kickoffAt, gf: hg, ga: ag, isHome: true,  htGf: f.htHomeScore, htGa: f.htAwayScore },
    );
    get(f.awayTeam, f.competition, f.season, f.country).matches.push(
      { date: f.kickoffAt, gf: ag, ga: hg, isHome: false, htGf: f.htAwayScore, htGa: f.htHomeScore },
    );
  }

  const positioning: Array<{
    id: string; competition: string; season: string;
    points: number; gd: number; gf: number;
  }> = [];

  for (const acc of map.values()) {
    let played = 0, won = 0, drawn = 0, lost = 0, gf = 0, ga = 0;
    let hW = 0, hD = 0, hL = 0, hGF = 0, hGA = 0;
    let aW = 0, aD = 0, aL = 0, aGF = 0, aGA = 0;
    let cs = 0, fts = 0, btts = 0, ov25 = 0, ov15 = 0;
    let htW = 0, htD = 0, htL = 0, cb = 0;
    const form: string[] = [];

    for (const m of acc.matches) {
      played++; gf += m.gf; ga += m.ga;
      const total = m.gf + m.ga;
      if (m.ga === 0) cs++;
      if (m.gf === 0) fts++;
      if (m.gf > 0 && m.ga > 0) btts++;
      if (total > 2) ov25++;
      if (total > 1) ov15++;

      if (m.gf > m.ga)      { won++;   form.push('W'); }
      else if (m.gf === m.ga) { drawn++; form.push('D'); }
      else                    { lost++;  form.push('L'); }

      if (m.isHome) {
        hGF += m.gf; hGA += m.ga;
        if (m.gf > m.ga) hW++; else if (m.gf === m.ga) hD++; else hL++;
      } else {
        aGF += m.gf; aGA += m.ga;
        if (m.gf > m.ga) aW++; else if (m.gf === m.ga) aD++; else aL++;
      }

      if (m.htGf !== null && m.htGa !== null) {
        if (m.htGf > m.htGa) htW++;
        else if (m.htGf === m.htGa) htD++;
        else { htL++; if (m.gf >= m.ga) cb++; }
      }
    }

    const points = won * 3 + drawn;
    const formLast5 = form.slice(-5).join(',') || null;
    const data = {
      country: acc.country, played, won, drawn, lost,
      goalsFor: gf, goalsAgainst: ga, points,
      homeWon: hW, homeDrawn: hD, homeLost: hL, homeGoalsFor: hGF, homeGoalsAgainst: hGA,
      awayWon: aW, awayDrawn: aD, awayLost: aL, awayGoalsFor: aGF, awayGoalsAgainst: aGA,
      cleanSheets: cs, failedToScore: fts, bttsCount: btts, over25Count: ov25, over15Count: ov15,
      formLast5, htWon: htW, htDrawn: htD, htLost: htL, comebacks: cb,
    };

    const result = await prisma.teamStat.upsert({
      where: { teamstat_unique: { team: normaliseTeamName(acc.team), competition: acc.competition, season: acc.season } },
      update: data,
      create: { team: acc.team, competition: acc.competition, season: acc.season, ...data },
      select: { id: true },
    });
    positioning.push({
      id: result.id, competition: acc.competition, season: acc.season,
      points, gd: gf - ga, gf,
    });
  }

  // Assign table positions within each competition+season group
  const groups = new Map<string, typeof positioning>();
  for (const ts of positioning) {
    const k = `${ts.competition}|||${ts.season}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(ts);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
    await Promise.all(
      group.map((ts, i) =>
        prisma.teamStat.update({ where: { id: ts.id }, data: { position: i + 1 } }),
      ),
    );
  }

  logger.info(
    `[TeamStats] Recomputed stats for ${map.size} team-seasons across ${groups.size} competition-seasons`,
  );
  return { teams: map.size, competitions: groups.size };
}

// ─── ensureFixturesFresh — delegates to API-Football ─────────────────────────

/** @deprecated Use ensureFixturesFresh() from apifootball/fixturesSync instead. */
export async function ensureFixturesFresh(maxAgeHours = 24 * 7): Promise<void> {
  logger.warn('[fixtureService] ensureFixturesFresh() is deprecated — delegating to API-Football');
  await apiFootballEnsureFixturesFresh();
}