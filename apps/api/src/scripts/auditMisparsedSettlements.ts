// Read-only audit: settled football items whose market the old parseBet misread (halves written
// "1ª Parte"/"1º Tempo", corner/card results, minute ranges, team totals, quarter lines, margins,
// combos answered "Sim" read as one leg, "<equipa> marca" read as a scorer…),
// re-evaluated with the fixed parser. Prints the items whose result would change or that would now
// go to review. CHANGES NOTHING (only findMany); the user decides what to correct.
//
// The schema has no "settled automatically" flag, so every settled football item matching the
// patterns is checked; items settled by hand appear only if they disagree with the engine.
//
// Run locally against production:
//   cd apps/api && DATABASE_URL="postgresql://…" npm run audit:misparsed
// On the server (after a build that includes this file):
//   docker compose -f /opt/betintel/docker-compose.yml exec api node dist/scripts/auditMisparsedSettlements.js

import { prisma } from '../prisma';
import { teamNamesMatch } from '../services/marketResolutionEngine';
import { isSuspect, reauditItem, type AuditFixture } from '../services/settlementAudit';

const WINDOW_MS = 3 * 60 * 60 * 1000;

async function fixtureFor(item: { eventExternalId: string | null; kickoffAt: Date | null; homeTeam: string; awayTeam: string }): Promise<(AuditFixture & { id: string }) | null> {
  const select = { id: true, homeTeam: true, awayTeam: true, status: true, homeScore: true, awayScore: true, htHomeScore: true, htAwayScore: true } as const;
  const apiId = Number(item.eventExternalId);
  if (item.eventExternalId && Number.isFinite(apiId)) {
    const [f] = await prisma.fixture.findMany({ where: { apiFootballId: apiId }, select, take: 1 });
    if (f) return f;
  }
  if (!item.kickoffAt) return null;
  const t = item.kickoffAt.getTime();
  const candidates = await prisma.fixture.findMany({
    where: { kickoffAt: { gte: new Date(t - WINDOW_MS), lte: new Date(t + WINDOW_MS) } },
    select,
  });
  const hits = candidates.filter((f) => teamNamesMatch(f.homeTeam, item.homeTeam) && teamNamesMatch(f.awayTeam, item.awayTeam));
  return hits.length === 1 ? hits[0]! : null; // ambiguous: treat as not stored
}

async function main(): Promise<void> {
  const settled = await prisma.boletinItem.findMany({
    where: { sport: 'FOOTBALL', result: { not: 'PENDING' } },
    select: {
      id: true, boletinId: true, market: true, selection: true, result: true, homeTeam: true, awayTeam: true,
      kickoffAt: true, eventExternalId: true, boletin: { select: { name: true, status: true } },
    },
  });
  const suspects = settled.filter((i) => isSuspect(i.market, i.selection));

  const rows: string[][] = [];
  let same = 0;
  for (const item of suspects) {
    const fx = await fixtureFor(item);
    if (fx) {
      const [stats] = await prisma.fixtureStats.findMany({ where: { fixtureId: fx.id }, select: { homeCorners: true, awayCorners: true }, take: 1 });
      if (stats) Object.assign(fx, stats);
    }
    const out = reauditItem(item, fx);
    if (out.kind === 'SAME') { same++; continue; }
    const score = fx && fx.homeScore !== null ? `${fx.homeScore}-${fx.awayScore} (int. ${fx.htHomeScore ?? '?'}-${fx.htAwayScore ?? '?'})` : '—';
    rows.push([
      item.id, `${item.boletin.name ?? item.boletinId} [${item.boletin.status}]`, `${item.homeTeam} v ${item.awayTeam}`, score,
      item.market, item.selection, `${item.result} → ${out.kind === 'CHANGED' ? out.now : out.reason}`,
    ]);
  }

  console.log(`Itens de futebol liquidados: ${settled.length} · com mercado suspeito: ${suspects.length} · resultado mantém-se: ${same} · a ver: ${rows.length}`);
  console.log('Nota: o resultado guardado do jogo inclui o prolongamento (se houve). Em jogos a eliminar, confirmar à mão os mercados de tempo regulamentar.');
  if (!rows.length) return;
  const head = ['item', 'boletim', 'jogo', 'resultado', 'mercado', 'seleção', 'atual → novo'];
  const widths = head.map((h, c) => Math.min(48, Math.max(h.length, ...rows.map((r) => r[c]!.length))));
  const line = (r: string[]) => r.map((v, c) => (c === r.length - 1 ? v : v.slice(0, widths[c]).padEnd(widths[c]!))).join(' | ');
  console.log(['', line(head), widths.map((w) => '-'.repeat(w)).join('-+-'), ...rows.map(line)].join('\n'));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
