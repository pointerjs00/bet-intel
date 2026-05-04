/**
 * scripts/debugStandings.ts
 *
 * Run this to diagnose why league tables are blank.
 * It checks every layer: TeamStat rows in DB, season values, competition names.
 *
 * Usage:
 *   npx tsx apps/api/scripts/debugStandings.ts
 */

import { prisma } from '../prisma';

async function main() {
  console.log('\n========================================');
  console.log('STANDINGS DEBUG');
  console.log('========================================\n');

  // 1. How many TeamStat rows exist at all?
  const totalTeamStats = await prisma.teamStat.count();
  console.log(`[1] Total TeamStat rows in DB: ${totalTeamStats}`);

  if (totalTeamStats === 0) {
    console.log('\n❌ TeamStat table is EMPTY.');
    console.log('   → Run: npx tsx apps/api/scripts/backfillTeamStats.ts');
    console.log('   → Then re-run this script.\n');
  }

  // 2. What seasons exist in TeamStat?
  const seasons = await prisma.teamStat.groupBy({
    by: ['season'],
    _count: { season: true },
    orderBy: { season: 'desc' },
  });
  console.log('\n[2] Seasons in TeamStat:');
  seasons.forEach((s) => console.log(`    season="${s.season}"  rows=${s._count.season}`));

  // 3. What competitions exist in TeamStat for season 2025?
  const comps2025 = await prisma.teamStat.groupBy({
    by: ['competition'],
    where: { season: '2025' },
    _count: { competition: true },
    orderBy: { competition: 'asc' },
  });
  console.log('\n[3] Competitions in TeamStat WHERE season="2025":');
  if (comps2025.length === 0) {
    console.log('    ❌ NONE — no rows for season 2025');
  } else {
    comps2025.forEach((c) =>
      console.log(`    "${c.competition}"  teams=${c._count.competition}`),
    );
  }

  // 4. What competitions exist in TeamStat for season 2025-26?
  const comps202526 = await prisma.teamStat.groupBy({
    by: ['competition'],
    where: { season: '2025-26' },
    _count: { competition: true },
    orderBy: { competition: 'asc' },
  });
  console.log('\n[4] Competitions in TeamStat WHERE season="2025-26":');
  if (comps202526.length === 0) {
    console.log('    (none)');
  } else {
    comps202526.forEach((c) =>
      console.log(`    "${c.competition}"  teams=${c._count.competition}`),
    );
  }

  // 5. What seasons exist in Fixture?
  const fixSeasons = await prisma.fixture.groupBy({
    by: ['season'],
    _count: { season: true },
    orderBy: { season: 'desc' },
  });
  console.log('\n[5] Seasons in Fixture table:');
  fixSeasons.forEach((s) => console.log(`    season="${s.season}"  fixtures=${s._count.season}`));

  // 6. How many FINISHED fixtures exist?
  const finishedCount = await prisma.fixture.count({
    where: { status: 'FINISHED', homeScore: { not: null } },
  });
  console.log(`\n[6] FINISHED fixtures with scores: ${finishedCount}`);

  if (finishedCount === 0) {
    console.log('    ❌ No finished fixtures → recomputeTeamStats() will produce nothing.');
    console.log('    → Wait for API-Football to sync results, or check fixturesSync job logs.');
  }

  // 7. Sample of finished fixtures — what season are they stored with?
  const sampleFinished = await prisma.fixture.findMany({
    where: { status: 'FINISHED', homeScore: { not: null } },
    select: { competition: true, season: true, homeTeam: true, awayTeam: true, kickoffAt: true },
    orderBy: { kickoffAt: 'desc' },
    take: 5,
  });
  console.log('\n[7] Sample of recent FINISHED fixtures:');
  sampleFinished.forEach((f) =>
    console.log(
      `    [season="${f.season}"] ${f.competition}: ${f.homeTeam} vs ${f.awayTeam}`,
    ),
  );

  // 8. Simulate the exact query the standings controller runs for "Serie A"
  const serieARows = await prisma.teamStat.findMany({
    where: {
      competition: { equals: 'Serie A', mode: 'insensitive' },
      season: '2025',
    },
    orderBy: [{ position: 'asc' }, { points: 'desc' }],
    select: { team: true, season: true, competition: true, position: true, points: true },
  });
  console.log('\n[8] Standings query simulation: Serie A, season=2025');
  if (serieARows.length === 0) {
    console.log('    ❌ Returns 0 rows — this is why the table is blank');
  } else {
    console.log(`    ✅ ${serieARows.length} rows found:`);
    serieARows.slice(0, 5).forEach((r) =>
      console.log(`    #${r.position} ${r.team} — ${r.points}pts`),
    );
  }

  // 9. Check the actual competition name stored for Italian league fixtures
  const italyFixtures = await prisma.fixture.groupBy({
    by: ['competition', 'season'],
    where: { country: { equals: 'Italy', mode: 'insensitive' } },
    _count: { competition: true },
  });
  console.log('\n[9] Italian league fixtures — competition names stored:');
  italyFixtures.forEach((f) =>
    console.log(`    "${f.competition}" season="${f.season}"  count=${f._count.competition}`),
  );

  console.log('\n========================================\n');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Debug script failed:', err);
  process.exit(1);
});