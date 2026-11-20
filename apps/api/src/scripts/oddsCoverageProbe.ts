/**
 * Diagnóstico de cobertura do comparador: corre o fluxo real (calendário de cada casa → emparelhamento
 * com a ESPN → chaves canónicas → lista do dia → detalhe) sobre um Redis em memória e mede:
 *   - eventos por casa, quantos emparelham com a ESPN e que tipo de chave recebem;
 *   - jogos que aparecem só numa casa (e se o mesmo jogo existe na outra com outra chave);
 *   - cartões da lista sem botões do mercado principal e se o detalhe os teria.
 *
 *   npm run odds:coverage -- [FOOTBALL|TENNIS|BASKETBALL] [houses]
 * Betano passa pelo sidecar quando BETANO_EGRESS_URL/TOKEN estão definidos. O Redis é em memória.
 */
import { writeFileSync } from 'fs';
import { createFakeRedis } from '../services/odds/fakeRedis';
import { createOddsStore } from '../services/odds/store';
import { createOddsService } from '../services/odds/service';
import { getSources } from '../services/odds/registry';
import { teamKey } from '../services/marketResolutionEngine';
import { createBetanoSource } from '../services/odds/sources/betano/index';
import { createBetanoSession, type LockStore } from '../services/odds/sources/betano/session';
import { createImpersonateTransport, createUndiciTransport } from '../services/odds/sources/betano/transport';
import type { OddsSource } from '../services/odds/types';
import type { OddsSport } from '../services/odds/types';

async function main(): Promise<void> {
  const sport = (process.argv[2] ?? 'FOOTBALL') as OddsSport;
  const mem = new Map<string, string>();
  const lock: LockStore = {
    get: async (k) => mem.get(k) ?? null,
    set: async (k, v, _m, _s, nx?) => { if (nx && mem.has(k)) return null; mem.set(k, v); return 'OK'; },
    del: async (k) => mem.delete(k),
  };
  const sources: OddsSource[] = (process.argv[3] ?? 'betclic,betano').split(',').map((h) => h === 'betano'
    ? createBetanoSource({ session: createBetanoSession({ transport: process.env.BETANO_EGRESS_URL ? createImpersonateTransport(process.env.BETANO_EGRESS_URL, process.env.BETANO_EGRESS_TOKEN ?? '') : createUndiciTransport(), redis: lock, log: { warn: (m) => console.log('  [betano]', m) } }) })
    : getSources(h)[0]!);
  const store = createOddsStore(createFakeRedis());
  const svc = createOddsService({ sources, store, track: (_p, fn) => fn() });
  for (const s of sources) {
    const t = Date.now();
    try {
      const n = await svc.refreshCatalogue(s, sport);
      const evs = (await store.getEvents(s.house, sport)) ?? [];
      console.log(`${s.house}: ${evs.length} eventos, ${n} com chave (${Date.now() - t} ms)`);
    } catch (e) {
      console.log(`${s.house}: FALHOU ${(e as Error).message}`);
    }
  }
  const report: Record<string, unknown> = {};
  for (const s of sources) {
    const evs = (await store.getEvents(s.house, sport)) ?? [];
    const kinds: Record<string, number> = {};
    let noMain = 0;
    for (const ev of evs) {
      const k = (await store.getLink(s.house, ev.houseEventId)) ?? 'none';
      const kind = k.split(':')[0]!;
      kinds[kind] = (kinds[kind] ?? 0) + 1;
      if (!ev.mainMarkets || ev.mainMarkets.length === 0) noMain++;
    }
    console.log(`  ${s.house} chaves:`, kinds, `sem mainMarkets no calendário: ${noMain}`);
  }
  const today = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const list = [...(await svc.listEvents(sport, today)), ...(await svc.listEvents(sport, tomorrow))];
  const byHouses: Record<string, number> = {};
  for (const i of list) byHouses[i.houses.join('+')] = (byHouses[i.houses.join('+')] ?? 0) + 1;
  console.log(`lista (hoje+amanhã): ${list.length} cartões`, byHouses);

  // Same game under two keys: one-house cards whose teams match another one-house card.
  const solo = list.filter((i) => i.houses.length === 1);
  const sig = (i: (typeof list)[number]) => `${teamKey(i.event.home).slice(0, 5)}|${teamKey(i.event.away).slice(0, 5)}`;
  const bySig = new Map<string, typeof list>();
  for (const i of solo) bySig.set(sig(i), [...(bySig.get(sig(i)) ?? []), i]);
  const split = [...bySig.values()].filter((g) => new Set(g.map((x) => x.houses[0])).size > 1);
  console.log(`jogos partidos em dois cartões (mesmas equipas, casas diferentes): ${split.length}`);
  for (const g of split.slice(0, 15)) console.log('   ', g.map((x) => `${x.houses[0]} ${x.eventKey} ${x.event.home} v ${x.event.away} ${x.event.startsAt}`).join('  ||  '));

  const empty = list.filter((i) => i.main.length === 0 || i.main.every((r) => Object.keys(r.prices).length === 0));
  console.log(`cartões sem odds no mercado principal: ${empty.length}`, Object.fromEntries(Object.entries(
    empty.reduce<Record<string, number>>((a, i) => ((a[i.houses.join('+')] = (a[i.houses.join('+')] ?? 0) + 1), a), {}))));
  const partial = list.filter((i) => i.houses.length > 1 && i.main.some((r) => Object.keys(r.prices).length < i.houses.length));
  console.log(`cartões com várias casas mas o principal só de parte delas: ${partial.length}`);
  for (const i of empty.slice(0, 4)) {
    const v = await svc.getEvent(i.eventKey);
    const main = v?.rows.filter((r) => r.key?.startsWith(sport === 'FOOTBALL' ? 'FT.1X2.' : sport === 'TENNIS' ? 'T.WIN.' : 'B.ML.')) ?? [];
    console.log(`   detalhe ${i.eventKey} (${i.event.home} v ${i.event.away}): ${v?.rows.length ?? 0} linhas, principal: ${main.map((r) => `${r.key}=${JSON.stringify(r.prices)}`).join(' ')}`);
    report[i.eventKey] = { list: i, mainRaw: (await Promise.all(i.houses.map(async (h) => (await store.getEvents(h, sport))?.find((e) => e.home === i.event.home)?.mainMarkets))) };
  }
  writeFileSync(process.env.PROBE_OUT ?? 'odds-coverage.json', JSON.stringify({ list, report }, null, 1));
  process.exit(0);
}

void main().catch((e) => { console.error(e); process.exit(1); });
