// apps/api/src/jobs/currentSeasonMatchStatSyncJob.ts

import { runJob } from '../utils/runJob';
import { fdCoUkCodeToCanonical } from '../utils/seasonUtils';
import { LEAGUE_BY_FDCOUK_CODE } from '../config/leagueManifest';
import { fetchAndParseCsv, upsertMatchStat } from '../services/bulkHistoricalImportService';

const FDCOUK_BASE = 'https://www.football-data.co.uk/mmz4281';

export async function currentSeasonMatchStatSyncJob() {
  await runJob('currentSeasonCSVSync', async () => {
    const now  = new Date();
    const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonCode = `${String(year).slice(2)}${String(year + 1).slice(2)}`;
    const canonical  = fdCoUkCodeToCanonical(seasonCode);
    let totalUpserted = 0, totalRows = 0;

    for (const [code, league] of Object.entries(LEAGUE_BY_FDCOUK_CODE)) {
      const url  = `${FDCOUK_BASE}/${seasonCode}/${code}.csv`;
      const rows = await fetchAndParseCsv(url);
      if (!rows) continue;
      totalRows += rows.length;
      for (const row of rows) {
        const ok = await upsertMatchStat(row, league, canonical);
        if (ok) totalUpserted++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return { recordsProcessed: totalRows, recordsUpserted: totalUpserted };
  });
}
