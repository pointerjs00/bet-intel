/**
 * Scrape Timing Diagnostic
 *
 * Monitors the Odd table and logs how long it takes for each event's odds to
 * be refreshed by the scrapers. Requires the API (and its Bull queue) to be
 * running separately so that scrapers fire on their normal schedule.
 *
 * Usage (from apps/api/):
 *   node ../../node_modules/ts-node/dist/bin.js src/scripts/scrapeTimingTest.ts
 *
 * Observation window: 5 minutes by default (override with OBSERVE_MINUTES env var)
 * Poll interval: 10 seconds
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const OBSERVE_MS = parseInt(process.env.OBSERVE_MINUTES ?? '5') * 60_000;
const POLL_INTERVAL_MS = 10_000;

// Map of `${eventId}|${siteId}|${market}|${selection}` → last seen updatedAt (ms)
const lastSeen = new Map<string, number>();

interface TimingRecord {
  eventLabel: string;
  siteSlug: string;
  market: string;
  selection: string;
  gapMs: number;
}

const timings: TimingRecord[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function label(homeTeam: string, awayTeam: string): string {
  return `${homeTeam} vs ${awayTeam}`;
}

// ─── Snapshot + diff ──────────────────────────────────────────────────────────

async function snapshot(): Promise<void> {
  const odds = await prisma.odd.findMany({
    where: { isActive: true },
    select: {
      id: true,
      eventId: true,
      siteId: true,
      market: true,
      selection: true,
      updatedAt: true,
      event: { select: { homeTeam: true, awayTeam: true, status: true } },
      site:  { select: { slug: true } },
    },
  });

  const now = Date.now();
  let updatedCount = 0;

  for (const odd of odds) {
    const key = `${odd.eventId}|${odd.siteId}|${odd.market}|${odd.selection}`;
    const oddTs = odd.updatedAt.getTime();
    const prev  = lastSeen.get(key);

    if (prev !== undefined && oddTs > prev) {
      const gapMs = oddTs - prev;
      const rec: TimingRecord = {
        eventLabel: label(odd.event.homeTeam, odd.event.awayTeam),
        siteSlug:   odd.site.slug,
        market:     odd.market,
        selection:  odd.selection,
        gapMs,
      };
      timings.push(rec);
      updatedCount++;

      console.log(
        `[UPDATE] ${rec.siteSlug.padEnd(12)} | ${fmt(gapMs).padStart(6)} gap | ` +
        `${rec.eventLabel} — ${rec.market}/${rec.selection} (${odd.event.status})`,
      );
    }

    lastSeen.set(key, oddTs);
  }

  if (updatedCount === 0) {
    console.log(`[POLL ${new Date().toISOString()}] No odds updated this cycle. Tracking ${odds.length} active odds.`);
  } else {
    console.log(`[POLL ${new Date().toISOString()}] ${updatedCount} odds updated this cycle.`);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(): void {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  SCRAPE TIMING SUMMARY');
  console.log('══════════════════════════════════════════════════════════');

  if (timings.length === 0) {
    console.log('  No odds updates were detected during the observation window.');
    console.log('  → Ensure the API is running and scrapers are firing.');
    console.log('══════════════════════════════════════════════════════════\n');
    return;
  }

  // Per-site stats
  const bySite = new Map<string, number[]>();
  for (const t of timings) {
    const arr = bySite.get(t.siteSlug) ?? [];
    arr.push(t.gapMs);
    bySite.set(t.siteSlug, arr);
  }

  console.log('\n  Per-site gap stats (time between consecutive scrapes of the same odd):');
  console.log(`  ${'Site'.padEnd(14)} | ${'Updates'.padStart(7)} | ${'Min'.padStart(8)} | ${'Max'.padStart(8)} | ${'Avg'.padStart(8)}`);
  console.log(`  ${'-'.repeat(14)} | ${'-'.repeat(7)} | ${'-'.repeat(8)} | ${'-'.repeat(8)} | ${'-'.repeat(8)}`);

  for (const [site, gaps] of [...bySite.entries()].sort()) {
    const min = Math.min(...gaps);
    const max = Math.max(...gaps);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    console.log(
      `  ${site.padEnd(14)} | ${String(gaps.length).padStart(7)} | ${fmt(min).padStart(8)} | ${fmt(max).padStart(8)} | ${fmt(avg).padStart(8)}`,
    );
  }

  // Overall
  const allGaps = timings.map((t) => t.gapMs);
  const overallMin = Math.min(...allGaps);
  const overallMax = Math.max(...allGaps);
  const overallAvg = allGaps.reduce((a, b) => a + b, 0) / allGaps.length;

  console.log(`\n  Overall: ${timings.length} updates | min ${fmt(overallMin)} | max ${fmt(overallMax)} | avg ${fmt(overallAvg)}`);

  // Flag slow events (gap > 120s)
  const slow = timings.filter((t) => t.gapMs > 120_000);
  if (slow.length > 0) {
    const slowEvents = [...new Set(slow.map((t) => `${t.siteSlug}: ${t.eventLabel}`))];
    console.log(`\n  ⚠  Slow scrapes (gap > 2 min): ${slowEvents.length} event/site combos`);
    for (const e of slowEvents.slice(0, 10)) {
      console.log(`     - ${e}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n  BetIntel Scrape Timing Diagnostic`);
  console.log(`  Observation window : ${OBSERVE_MS / 60_000} minutes`);
  console.log(`  Poll interval      : ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`  Started at         : ${new Date().toISOString()}\n`);

  // Warm up — take first snapshot to populate lastSeen (no deltas reported)
  console.log('[INIT] Taking initial snapshot...');
  await snapshot();
  console.log('[INIT] Baseline captured. Watching for updates...\n');

  const endTime = Date.now() + OBSERVE_MS;

  await new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      try {
        await snapshot();
      } catch (err) {
        console.error('[ERROR]', err);
      }

      if (Date.now() >= endTime) {
        clearInterval(interval);
        resolve();
      }
    }, POLL_INTERVAL_MS);

    // Allow Ctrl+C to end early and still get the summary
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n[INFO] Interrupted — printing summary now.');
      resolve();
    });
  });

  printSummary();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
