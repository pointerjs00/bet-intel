/* eslint-disable @typescript-eslint/no-explicit-any -- Betano JSON is untyped external data; this is a diagnostic. */
/**
 * Diagnóstico da Parte G (docs/PLANO_BETANO.md): valida contra a Betano real as suposições que os
 * testes offline não cobrem, e guarda as respostas em bruto para corrigir o código se algo falhar.
 *
 * Verifica, por esta ordem:
 *   1. flag `betano:challenge` (se existir, não faz pedidos);
 *   2. warm-up (sessão no sidecar + cookies);
 *   3. shell → URL do calendário;
 *   4. calendário: forma da resposta, `totalCount`, se os eventos trazem `url` (pageUrl), ordenação
 *      por `startTime`, e numeração das páginas (páginas 1 e 2 comparadas com a 0);
 *   5. página de um evento: challenge?, regex do `initial_state`, mercados do próprio evento.
 *
 * ~6 pedidos à Betano no total, espaçados. Corre no contentor da API (usa o sidecar e o Redis dele):
 *   docker compose ... exec api node dist/scripts/betanoProbe.js [--sport FOOTBALL] [--event URL]
 * As respostas ficam em `BETANO_PROBE_DIR` (default /tmp/betano-probe dentro do contentor).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { redis } from '../utils/redis';
import { readBootstrap } from '../services/odds/sources/betano/bootstrap';
import { SPORT } from '../services/odds/sources/betano/endpoints';
import { calendarEvents, mapEvent, mapMarkets, marketsFromState, parseInitialState } from '../services/odds/sources/betano/map';
import { ORIGIN, navigationHeaders } from '../services/odds/sources/betano/profile';
import { CHALLENGE_KEY, createBetanoSession, isChallenge, type LockStore } from '../services/odds/sources/betano/session';
import { createImpersonateTransport, createUndiciTransport } from '../services/odds/sources/betano/transport';
import type { OddsSport } from '../services/odds/types';

const OUT = process.env.BETANO_PROBE_DIR ?? '/tmp/betano-probe';
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const save = (file: string, body: string) => writeFileSync(join(OUT, file), body);
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => console.log(`  ✗ ${m}`);
const info = (m: string) => console.log(`    ${m}`);

const eventsOf = calendarEvents;
const idOf = (e: any) => String((e?.event ?? e)?.id ?? '');
const startOf = (e: any) => Number((e?.event ?? e)?.startTime);

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const sport = (arg('--sport') ?? 'FOOTBALL') as OddsSport;
  const { code, slug } = SPORT[sport];
  const url = process.env.BETANO_EGRESS_URL;
  const token = process.env.BETANO_EGRESS_TOKEN;
  if (!url || !token) console.log('! BETANO_EGRESS_URL/TOKEN em falta: a usar fetch direto (sem fingerprint) — resultado não representativo');
  const transport = url && token ? createImpersonateTransport(url, token) : createUndiciTransport();
  const session = createBetanoSession({ transport, redis: redis as unknown as LockStore, log: { warn: (m) => console.log(`    [warn] ${m}`) } });

  console.log('\n1. Flag de challenge');
  const flag = await redis.get(CHALLENGE_KEY);
  if (flag) {
    bad(`betano:challenge ativo (${flag}). Corre o betano:solve ou espera o TTL (redis-cli TTL ${CHALLENGE_KEY}).`);
    return;
  }
  ok('sem flag');
  if (url && token) {
    const ping = await fetch(`${url}/ping`).then((r) => r.json()).catch(() => null);
    info(`/ping: ${JSON.stringify(ping)} · BETANO_BROWSER_MAJOR=${process.env.BETANO_BROWSER_MAJOR ?? '152 (default)'}`);
  }

  console.log('\n2. Warm-up');
  await session.warmUp();
  const jar = await session.jar.read();
  ok(`sessão quente; cookies: ${Object.keys(jar.cookies).join(', ') || '(nenhum)'}`);

  console.log('\n3. Shell e calendário');
  const boot = await readBootstrap(session, code, slug);
  ok(`calendário: ${boot.calendar}`);
  info(`ligas anunciadas no shell: ${boot.leagueIds.length}`);

  const p0 = await session.request(boot.calendar);
  save('calendar-p0.json', p0.text);
  if (p0.status !== 200) {
    bad(`calendário HTTP ${p0.status} (corpo em calendar-p0.json). O collector cai para as ligas em destaque.`);
    return;
  }
  const body0 = JSON.parse(p0.text);
  const ev0 = eventsOf(body0);
  info(`chaves de topo: ${Object.keys(body0 ?? {}).join(', ')} · data: ${Object.keys(body0?.data ?? {}).join(', ')}`);
  const total = Number(body0?.data?.totalCount ?? body0?.totalCount ?? 0);
  (ev0.length > 0 ? ok : bad)(`página 0: ${ev0.length} eventos em bruto; totalCount=${total || '(ausente)'}`);
  if (ev0.length === 0) return;
  const sample = ev0[0]?.event ?? ev0[0];
  info(`chaves de um evento: ${Object.keys(sample ?? {}).join(', ')}`);

  const mapped = ev0.map((e) => mapEvent(e, sport, Date.now())).filter((e): e is NonNullable<typeof e> => e != null);
  (mapped.length === ev0.length ? ok : bad)(`mapEvent: ${mapped.length}/${ev0.length} mapeados`);
  const withUrl = mapped.filter((e) => e.pageUrl).length;
  (withUrl === mapped.length ? ok : bad)(`pageUrl (campo url): ${withUrl}/${mapped.length}${withUrl ? ` · ex.: ${mapped.find((e) => e.pageUrl)?.pageUrl}` : ' — sem isto o comparador não abre mercados'}`);
  const starts = ev0.map(startOf);
  const sorted = starts.every((t, i) => i === 0 || t >= starts[i - 1]!);
  const grouped = Array.isArray(body0?.data?.blocks);
  info(`ordenado por startTime: ${sorted ? 'sim' : 'não'}${grouped ? ` (agrupado por liga em ${body0.data.blocks.length} blocks; a paragem por hora fica desligada)` : ''}`);

  console.log('\n4. Paginação');
  const ids0 = new Set(ev0.map(idOf));
  for (const p of [1, 2]) {
    await sleep(1200);
    const u = new URL(boot.calendar);
    u.searchParams.set('page', String(p));
    const r = await session.request(u.toString());
    save(`calendar-p${p}.json`, r.text);
    if (r.status !== 200) {
      info(`page=${p}: HTTP ${r.status}`);
      continue;
    }
    const evs = eventsOf(JSON.parse(r.text));
    const overlap = evs.filter((e) => ids0.has(idOf(e))).length;
    info(`page=${p}: ${evs.length} eventos, ${overlap} repetidos da página 0`);
    if (p === 1) {
      if (evs.length === 0) ok('page=1 vazia: o calendário vem todo de uma vez (ou a numeração começa em 1 — vê totalCount)');
      else if (overlap === evs.length) bad('page=1 igual à página 0: numeração começa em 1 ou o parâmetro é ignorado — o collector precisa de ajuste');
      else ok('page=1 traz eventos novos: numeração a partir de 0 confirmada');
    }
  }

  console.log('\n5. Página de evento');
  const target = arg('--event') ?? mapped.find((e) => e.pageUrl)?.pageUrl;
  if (!target) {
    bad('nenhum pageUrl para testar; passa um com --event https://www.betano.pt/odds/...');
    return;
  }
  const pageUrl = new URL(target, ORIGIN).toString();
  const eventId = mapped.find((e) => e.pageUrl === target)?.houseEventId ?? pageUrl.match(/\/(\d+)\/?(?:[?#]|$)/)?.[1];
  info(`${pageUrl} (id ${eventId ?? '?'})`);
  await sleep(1200);
  const res = await session.request(pageUrl, { headers: navigationHeaders(pageUrl, `${ORIGIN}/sport/futebol/`) });
  save('event.html', res.text);
  info(`HTTP ${res.status}, ${res.text.length} bytes, challenge=${isChallenge(res)}`);
  const state = parseInitialState(res.text);
  if (!state) {
    bad('regex do initial_state falhou. Ocorrências de "initial_state" no HTML:');
    let i = res.text.indexOf('initial_state');
    for (let n = 0; i >= 0 && n < 3; n++, i = res.text.indexOf('initial_state', i + 1)) {
      info(`… ${res.text.slice(Math.max(0, i - 60), i + 140).replace(/\s+/g, ' ')} …`);
    }
    return;
  }
  ok('initial_state extraído');
  save('event-state.json', JSON.stringify(state, null, 2));
  const scoped = marketsFromState(state, eventId);
  const whole = marketsFromState(state);
  const isScoped = !!eventId && scoped.markets.length !== whole.markets.length;
  info(`mercados: ${scoped.markets.length} (estado inteiro: ${whole.markets.length}) · scoped ao evento: ${isScoped ? 'sim' : 'não/igual'}`);
  const markets = mapMarkets(scoped.markets, scoped.selections, Date.now());
  (markets.length > 0 ? ok : bad)(`mapMarkets: ${markets.length} mercados mapeados`);
  for (const m of markets.slice(0, 5)) info(JSON.stringify(m).slice(0, 200));
}

main()
  .catch((err) => {
    console.error(`\nErro: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log(`\nRespostas em bruto em ${OUT}`);
    await redis.quit().catch(() => undefined);
  });
