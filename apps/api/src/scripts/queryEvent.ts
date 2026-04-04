import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // Find the França Sub-21 event and which sites have odds
  const events = await p.sportEvent.findMany({
    where: {
      homeTeam: { contains: 'Fran', mode: 'insensitive' },
      awayTeam: { contains: 'Isl', mode: 'insensitive' },
    },
    select: {
      id: true, homeTeam: true, awayTeam: true, status: true, league: true,
      eventDate: true,
      odds: {
        where: { isActive: true },
        select: {
          site: { select: { slug: true } },
          market: true, selection: true, value: true,
        },
      },
    },
  });

  for (const ev of events) {
    const sites = [...new Set(ev.odds.map((o) => o.site.slug))];
    console.log(`\n${ev.homeTeam} vs ${ev.awayTeam}`);
    console.log(`  id      : ${ev.id}`);
    console.log(`  league  : ${ev.league}`);
    console.log(`  status  : ${ev.status}`);
    console.log(`  date    : ${ev.eventDate.toISOString()}`);
    console.log(`  sites   : ${sites.join(', ') || 'NONE'}`);
    console.log(`  odds cnt: ${ev.odds.length}`);
  }

  if (events.length === 0) {
    console.log('No matching events found.');
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
