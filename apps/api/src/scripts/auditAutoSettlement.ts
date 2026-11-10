// Read-only audit: re-evaluates items settled by the old auto-settlement engine with the new
// marketResolutionEngine and prints every disagreement. Changes nothing.
//
// Run on the server:  docker compose -f /opt/betintel/docker-compose.yml exec api node dist/scripts/auditAutoSettlement.js
// Run locally:        node -r ../../node_modules/ts-node/register/transpile-only src/scripts/auditAutoSettlement.ts

import { prisma } from '../prisma';
import { resolveMarket } from '../services/marketResolutionEngine';

async function main(): Promise<void> {
  const items = await prisma.boletinItem.findMany({
    where: { eventExternalId: { not: null }, result: { not: 'PENDING' } },
    include: { boletin: { select: { id: true, name: true, status: true, stake: true } } },
  });

  const fixtureIds = [...new Set(items.map((i) => Number(i.eventExternalId)).filter(Number.isFinite))];
  const fixtures = await prisma.fixture.findMany({ where: { apiFootballId: { in: fixtureIds } } });
  const byApiId = new Map(fixtures.map((f) => [String(f.apiFootballId), f]));
  const stats = await prisma.fixtureStats.findMany({
    where: { fixtureId: { in: fixtures.map((f) => f.id) } },
    select: { fixtureId: true, homeCorners: true, awayCorners: true },
  });
  const corners = new Map(stats.map((s) => [s.fixtureId, s]));

  let same = 0;
  const differ: string[] = [];
  const review: string[] = [];
  for (const item of items) {
    const f = byApiId.get(item.eventExternalId!);
    if (!f || f.homeScore === null || f.awayScore === null) continue;
    const c = corners.get(f.id);
    const now = resolveMarket(item.market, item.selection, {
      homeScore: f.homeScore, awayScore: f.awayScore, htHomeScore: f.htHomeScore, htAwayScore: f.htAwayScore,
      statusShort: f.status === 'CANCELLED' ? 'CANC' : 'FT', homeCorners: c?.homeCorners ?? null, awayCorners: c?.awayCorners ?? null,
    }, { homeNames: [item.homeTeam, f.homeTeam], awayNames: [item.awayTeam, f.awayTeam] });

    const line = `${item.boletin.name ?? item.boletinId} | ${item.homeTeam} v ${item.awayTeam} ${f.homeScore}-${f.awayScore} | ${item.market} / ${item.selection} | guardado=${item.result} novo=${now ?? 'REVER'} | boletim ${item.boletin.status}`;
    if (now === null) review.push(line);
    else if (now === item.result) same++;
    else differ.push(line);
  }

  console.log(`Itens liquidados automaticamente: ${items.length} · iguais: ${same} · diferentes: ${differ.length} · a rever: ${review.length}`);
  if (differ.length) console.log('\n== Resultado diferente (provavelmente errado no motor antigo) ==\n' + differ.join('\n'));
  if (review.length) console.log('\n== O motor novo não decide sozinho (confirmar à mão) ==\n' + review.join('\n'));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
