import { recomputeTeamStats } from '../services/fixtureService';
 
async function main() {
  console.log('[backfill] Starting TeamStat recompute from finished fixtures…');
  const { teams, competitions } = await recomputeTeamStats();
  console.log(`[backfill] Done. ${teams} team-seasons written across ${competitions} competition-seasons.`);
  process.exit(0);
}
 
main().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});
 