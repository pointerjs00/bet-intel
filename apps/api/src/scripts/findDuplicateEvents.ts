import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // Find all events, group by normalised team names to spot duplicates
  const events = await p.sportEvent.findMany({
    select: {
      id: true,
      homeTeam: true,
      awayTeam: true,
      status: true,
      league: true,
      eventDate: true,
      _count: { select: { odds: true } },
    },
    orderBy: [{ homeTeam: 'asc' }, { awayTeam: 'asc' }],
  });

  // Group by homeTeam+awayTeam (case-insensitive)
  const groups = new Map<string, typeof events>();
  for (const ev of events) {
    const key = `${ev.homeTeam.toLowerCase().trim()}|||${ev.awayTeam.toLowerCase().trim()}`;
    const arr = groups.get(key) ?? [];
    arr.push(ev);
    groups.set(key, arr);
  }

  // Print only groups with >1 entry (duplicates)
  let dupeCount = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    dupeCount++;
    console.log(`\nDUPLICATE: ${group[0].homeTeam} vs ${group[0].awayTeam}`);
    for (const ev of group) {
      console.log(`  id=${ev.id} | status=${ev.status} | league=${ev.league} | odds=${ev._count.odds} | date=${ev.eventDate.toISOString()}`);
    }
  }

  if (dupeCount === 0) {
    console.log('No duplicate events found.');
  } else {
    console.log(`\nTotal duplicate groups: ${dupeCount}`);
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
