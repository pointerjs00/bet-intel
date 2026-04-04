/**
 * Merges duplicate SportEvent records that arose from live-event date mismatch
 * (e.g. scraper used new Date() as eventDate for a live match, falling outside
 * the ±30 min matching window, creating a second record for the same match).
 *
 * Strategy per duplicate group:
 *  - Canonical = record with the MOST active odds (closest to a proper kickoff time)
 *  - Stale     = all other records in the group
 *  - Re-point every Odd and BoletinItem on the stale record to the canonical one
 *  - Delete the stale SportEvent rows
 *
 * Safe to run while the API is running.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FUZZY_NOISE_TOKENS = new Set([
  'club', 'atletico', 'atletica', 'atlético', 'atlética',
  'fc', 'cf', 'ac', 'sc', 'rc', 'rcd', 'ssd', 'asd', 'fk', 'sk', 'bk', 'csd',
  'sporting', 'association', 'associazione', 'calcio', 'football',
  'de', 'del', 'la', 'las', 'los', 'el', 'do', 'da', 'dos', 'das', 'van',
]);

const FUZZY_ALIASES = new Map<string, string>([
  ['guyana', 'guiana'],
  ['guiana', 'guiana'],
  ['cyprus', 'chipre'],
  ['chipre', 'chipre'],
  ['moldova', 'moldavia'],
  ['moldavia', 'moldavia'],
  ['sierra leone', 'serra leoa'],
  ['serra leoa', 'serra leoa'],
]);

function applyFuzzyAlias(name: string): string {
  return FUZZY_ALIASES.get(name) ?? name;
}

function normaliseNameFuzzy(name: string): string {
  const normalised = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return applyFuzzyAlias(normalised)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !FUZZY_NOISE_TOKENS.has(word))
    .join(' ')
    .trim();
}

function fuzzyNamesMatch(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  return left === right || left.includes(right) || right.includes(left);
}

function shouldGroupEvents(
  left: { sport: string; homeTeam: string; awayTeam: string; eventDate: Date },
  right: { sport: string; homeTeam: string; awayTeam: string; eventDate: Date },
): boolean {
  if (left.sport !== right.sport) {
    return false;
  }

  const twelveHoursMs = 12 * 60 * 60 * 1000;
  if (Math.abs(left.eventDate.getTime() - right.eventDate.getTime()) > twelveHoursMs) {
    return false;
  }

  const leftHome = normaliseNameFuzzy(left.homeTeam);
  const leftAway = normaliseNameFuzzy(left.awayTeam);
  const rightHome = normaliseNameFuzzy(right.homeTeam);
  const rightAway = normaliseNameFuzzy(right.awayTeam);

  return fuzzyNamesMatch(leftHome, rightHome) && fuzzyNamesMatch(leftAway, rightAway);
}

async function main(): Promise<void> {
  console.log('Finding duplicate SportEvent groups...\n');

  const events = await prisma.sportEvent.findMany({
    select: {
      id: true,
      homeTeam: true,
      awayTeam: true,
      sport: true,
      status: true,
      league: true,
      eventDate: true,
      _count: { select: { odds: { where: { isActive: true } } } },
    },
    orderBy: [{ homeTeam: 'asc' }, { awayTeam: 'asc' }],
  });

  const groups: typeof events[] = [];
  for (const ev of events) {
    const existingGroup = groups.find((group) =>
      group.some((candidate) => shouldGroupEvents(candidate, ev)),
    );

    if (existingGroup) {
      existingGroup.push(ev);
      continue;
    }

    groups.push([ev]);
  }

  let mergedCount = 0;
  let deletedCount = 0;

  for (const group of groups) {
    if (group.length < 2) continue;

    // Canonical = record with most active odds; ties broken by earliest eventDate
    const sorted = [...group].sort((a, b) => {
      const oddsDiff = b._count.odds - a._count.odds;
      if (oddsDiff !== 0) return oddsDiff;
      return a.eventDate.getTime() - b.eventDate.getTime();
    });

    const canonical = sorted[0];
    const stales = sorted.slice(1);

    console.log(`MERGE: ${canonical.homeTeam} vs ${canonical.awayTeam}`);
    console.log(`  Canonical: ${canonical.id} | ${canonical.league} | ${canonical.status} | odds=${canonical._count.odds}`);

    for (const stale of stales) {
      console.log(`  Stale:     ${stale.id} | ${stale.league} | ${stale.status} | odds=${stale._count.odds}`);

      // Re-point all Odds on the stale event to the canonical event.
      // If a (siteId, eventId, market, selection) combo already exists on the
      // canonical event, just delete the stale odd to avoid a unique constraint
      // violation. Otherwise reassign it.
      const staleOdds = await prisma.odd.findMany({
        where: { eventId: stale.id },
        select: { id: true, siteId: true, market: true, selection: true },
      });

      for (const odd of staleOdds) {
        const conflict = await prisma.odd.findFirst({
          where: {
            eventId: canonical.id,
            siteId:  odd.siteId,
            market:  odd.market,
            selection: odd.selection,
          },
          select: { id: true },
        });

        if (conflict) {
          // Canonical already has this odd — delete the stale duplicate
          await prisma.odd.delete({ where: { id: odd.id } });
        } else {
          // Safe to move
          await prisma.odd.update({
            where: { id: odd.id },
            data:  { eventId: canonical.id },
          });
          mergedCount++;
        }
      }

      // Re-point any BoletinItems that reference the stale event
      await prisma.boletinItem.updateMany({
        where: { eventId: stale.id },
        data:  { eventId: canonical.id },
      });

      // Now delete the stale event (all its odds have been moved/deleted)
      await prisma.sportEvent.delete({ where: { id: stale.id } });
      deletedCount++;
      console.log(`  → Merged odds, deleted stale event ${stale.id}`);
    }
  }

  console.log(`\nDone. Merged ${mergedCount} odds, deleted ${deletedCount} duplicate events.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
