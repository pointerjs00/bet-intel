/**
 * Lists the odds selections that do not line up across houses, from the real catalogue, so the
 * label normalisation (parseBet / canonical.ts) can be extended with evidence instead of guesses.
 *
 * Two kinds:
 *   1. "Sem chave": selections no canonical key was found for (shown only for their own house).
 *   2. "Só numa casa": keyed selections priced by one house only, in events that two or more houses
 *      price — usually the other house names the same bet differently.
 *
 * Reads at most `--limit` events (default 8) per run, because each event view may fetch that event's
 * markets from every house. Run in the API container:
 *   docker exec betintel-api-1 node dist/scripts/oddsUnmatched.js [--sport FOOTBALL] [--limit 8]
 * The full result is also written to /tmp/odds-unmatched.json.
 */
import { writeFileSync } from 'fs';
import { getOddsService } from '../services/odds/service';
import type { OddsSport } from '../services/odds/types';
import { redis } from '../utils/redis';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const LISBON = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });

type Bucket = Map<string, { count: number; samples: Set<string> }>;
const add = (b: Bucket, house: string, market: string, selection: string) => {
  const k = `${house} · ${market}`;
  const e = b.get(k) ?? { count: 0, samples: new Set<string>() };
  e.count++;
  if (e.samples.size < 6) e.samples.add(selection);
  b.set(k, e);
};
const dump = (title: string, b: Bucket) => {
  console.log(`\n== ${title} (${b.size} mercados) ==`);
  for (const [k, v] of [...b].sort((a, z) => z[1].count - a[1].count)) {
    console.log(`${String(v.count).padStart(4)}  ${k}  →  ${[...v.samples].join(' | ')}`);
  }
};

async function main(): Promise<void> {
  const sport = (arg('--sport') ?? 'FOOTBALL') as OddsSport;
  const limit = Number(arg('--limit') ?? 8);
  const svc = getOddsService();
  const now = Date.now();
  const days = [0, 1].map((d) => LISBON.format(new Date(now + d * 86_400_000)));
  const list = (await Promise.all(days.map((d) => svc.listEvents(sport, d)))).flat();
  const multi = list.filter((e) => e.houseCount >= 2).slice(0, limit);
  console.log(`${list.length} eventos; a ler ${multi.length} com 2+ casas`);

  const noKey: Bucket = new Map();
  const oneHouse: Bucket = new Map();
  for (const item of multi) {
    const view = await svc.getEvent(item.eventKey);
    if (!view || view.houses.length < 2) continue;
    for (const row of view.rows) {
      const houses = Object.keys(row.prices);
      for (const h of houses) {
        const l = row.labels?.[h as keyof typeof row.labels];
        const market = l?.market ?? row.market;
        const selection = l?.selection ?? row.label;
        if (row.key === null) add(noKey, h, market, selection);
        else if (houses.length === 1) add(oneHouse, h, market, `${selection} [${row.key}]`);
      }
    }
  }
  dump('Sem chave', noKey);
  dump('Só numa casa', oneHouse);
  const toJson = (b: Bucket) => Object.fromEntries([...b].map(([k, v]) => [k, { count: v.count, samples: [...v.samples] }]));
  writeFileSync('/tmp/odds-unmatched.json', JSON.stringify({ sport, events: multi.length, noKey: toJson(noKey), oneHouse: toJson(oneHouse) }, null, 2));
  console.log('\nResultado completo em /tmp/odds-unmatched.json');
}

main()
  .catch((err) => {
    console.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit().catch(() => undefined);
    process.exit();
  });
