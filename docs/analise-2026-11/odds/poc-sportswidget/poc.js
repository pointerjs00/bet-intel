// Proof of concept: Placard / Solverde "pt-vision" feed (sportswidget).
// Usage: node poc.js <placard|solverde> [--socket] [--event <id>]
// The feed is NOT pushed over Socket.IO: it is a replicated binary database downloaded by HTTP
// from the CDN (LZMA "alone" slices in the pt-vision memory format). The Socket.IO namespace
// /vws only broadcasts meta updates ({repositoryId, partialIndex, ...}) that tell the client
// which partial slices to fetch next. No subscriptions, no auth, no cookies.
const fs = require('fs');
const path = require('path');
const { parse } = require('./mo.js');

const HOUSE = process.argv[2] || 'placard';
const HOSTS = {
  placard: { api: 'https://sportswidget.placard.pt', cdn: 'https://sportswidget-cdn.placard.pt', origin: 'https://www.placard.pt' },
  solverde: { api: 'https://sportswidget.solverde.pt', cdn: 'https://sportswidget-cdn.solverde.pt', origin: 'https://www.solverde.pt' },
};
const H = HOSTS[HOUSE];
const LANG = 'pt';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = path.join(__dirname, 'out', HOUSE);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let requests = 0;
let last = 0;
async function get(url, kind = 'buf') {
  const wait = last + 2100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  requests++;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'pt-PT,pt;q=0.9', Origin: H.origin, Referer: H.origin + '/' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const ct = res.headers.get('content-type') || '';
  if (/text\/html/.test(ct)) throw new Error(`HTML (challenge?) at ${url}`);
  return kind === 'json' ? res.json() : new Uint8Array(await res.arrayBuffer());
}

// LZMA via the widget's own wasm (same call sequence as VisionMemoryDecoder.decodeInternal).
let lz;
let mem;
async function initLzma() {
  const wasmPath = path.join(__dirname, 'dl', 'lzma.wasm');
  const bytes = fs.existsSync(wasmPath) ? fs.readFileSync(wasmPath) : await get(`${H.cdn}/library/lzma.wasm`);
  mem = new WebAssembly.Memory({ initial: 10 });
  lz = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { memory: mem, abort: () => {} } }).exports;
}
function unlzma(input) {
  lz.reset();
  const p = lz.newU8Array(input.length);
  new Uint8Array(mem.buffer, p + 24, input.length).set(input);
  const rp = lz.decode(p);
  const [ok, , size, dp] = new Uint32Array(mem.buffer, rp, 4);
  if (!ok) throw new Error('lzma decode failed');
  return new Uint8Array(mem.buffer, dp + 24, size).slice();
}

// Merged in-memory model (keyed upserts; *Small tables patch odds / flags).
const M = { dict: new Map(), struct: new Map(), event: new Map(), market: new Map(), result: new Map(), odd: new Map(), mtype: new Map(), av: new Map(), avk: new Map() };
function ingest(raw) {
  const t = parse(raw);
  const each = (n, fn) => { if (t[n]) for (let i = 0; i < t[n].count; i++) fn(t[n].row(i)); };
  each('DictionaryEntry', r => M.dict.set(r.id, r.value));
  each('Structure', r => M.struct.set(r.node_id, r));
  each('Event', r => M.event.set(r.node_id, r));
  each('Market', r => M.market.set(r.node_id, r));
  each('Result', r => M.result.set(r.node_id, r));
  each('OddMap', r => M.odd.set(r.id, r));
  each('MarketType', r => M.mtype.set(r.id, r.market_type));
  each('AdditionalValueKey', r => M.avk.set(r.key_id, r.key));
  each('AdditionalValue', r => { const o = M.av.get(r.node_id) || {}; o[r.key_id] = r.dictionary_id; M.av.set(r.node_id, o); });
  each('EventSmall', r => { const e = M.event.get(r.node_id); if (e) Object.assign(e, { is_active: r.is_active, is_displayed: r.is_displayed }); });
  each('MarketSmall', r => { const m = M.market.get(r.node_id); if (m) Object.assign(m, { is_active: r.is_active, is_displayed: r.is_displayed }); });
  each('ResultSmall', r => { const x = M.result.get(r.node_id); if (x) x.odd_map_id = r.odd_map_id; });
  return t.RepoContentSlice ? t.RepoContentSlice.row(0) : null;
}
const d = id => M.dict.get(id);
const path3 = id => { const p = []; let s = M.struct.get(id); while (s) { p.unshift({ id: s.node_id, name: d(s.dictionary_id) }); s = M.struct.get(s.parent_node_id); } return p; };
const av = id => { const o = M.av.get(id) || {}; const r = {}; for (const k in o) r[M.avk.get(+k) || k] = d(o[k]); return r; };
// Result dictionary values look like "{0}||1|1|" or "Mais de|+|O|0|": label|sign|code|order|
const selLabel = (txt, home, away) => (txt || '').split('|')[0].replace('{0}', home).replace('{1}', away);
const odds = r => { const o = M.odd.get(r.odd_map_id); return o && o.dec ? o.dec / 1000 : null; };

async function syncFeed() {
  const meta = await get(`${H.cdn}/v2/getmeta`, 'json');
  console.log('meta', meta);
  const { repositoryId: repo, baseIndex, fullIndex, upd2fullIndex, partialIndex, fullPartitions } = meta;
  const S = `${H.cdn}/v2/getslice/`;
  const urls = [`${S}${repo}_8_${LANG}_${baseIndex}_0.bin`];
  for (let p = 0; p < fullPartitions; p++) urls.push(`${S}${repo}_2_${LANG}_${fullIndex}_${p}.bin`);
  if (upd2fullIndex > fullIndex) urls.push(`${S}${repo}_3_${LANG}_${upd2fullIndex}_0.bin`);
  else urls.push(`${H.cdn}/v2/getslice/live/${repo}/${LANG}.bin`);
  const lastPartial = partialIndex ?? upd2fullIndex;
  const firstPartial = Math.max((upd2fullIndex ?? fullIndex) + 1, lastPartial - 20); // modest: at most 20 partials
  for (let i = firstPartial; i <= lastPartial; i++) urls.push(`${S}${repo}_1_${LANG}_${i}_0.bin`);
  let bytes = 0;
  for (const u of urls) {
    const b = await get(u);
    bytes += b.length;
    ingest(unlzma(b));
  }
  console.log(`slices ${urls.length}, ${(bytes / 1e6).toFixed(2)} MB compressed; events ${M.event.size}, markets ${M.market.size}, selections ${M.result.size}`);
  return meta;
}

const SPORTS = { FOOTBALL: 'Futebol', BASKETBALL: 'Basquetebol', TENNIS: 'Ténis' };
const MAIN = { FOOTBALL: ['MRES'], BASKETBALL: ['H2HT', 'HHOP', 'MRES'], TENNIS: ['HTOH', 'HHOP', 'H2H1'] };
function listEvents(sport, fromMs, toMs) {
  const out = [];
  for (const e of M.event.values()) {
    if (!e.is_displayed) continue;
    const p = path3(e.parent_node_id);
    if (!p[0] || p[0].name !== SPORTS[sport]) continue;
    const t = e.start_date.getTime();
    if (t < fromMs || t > toMs) continue;
    const home = d(e.participant_home_dictionary_id), away = d(e.participant_away_dictionary_id);
    const ms = (M.byEv.get(e.node_id) || []).filter(m => m.is_displayed);
    const main = MAIN[sport].map(c => ms.find(m => M.mtype.get(m.market_type_id) === c)).find(Boolean);
    const a = av(e.node_id);
    out.push({
      houseEventId: String(e.node_id), sport, region: p[1]?.name, competition: p[2]?.name, home, away,
      startsAt: e.start_date.toISOString(), live: t < Date.now(), marketCount: ms.length,
      statscoreId: (a.VISUALISATION || '').startsWith('SS|') ? a.VISUALISATION.slice(3) : undefined,
      main: main ? { type: M.mtype.get(main.market_type_id), label: d(main.dictionary_id), sel: (M.byM.get(main.node_id) || []).map(r => ({ s: selLabel(d(r.dictionary_id), home, away), o: odds(r) })) } : null,
    });
  }
  return out.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}
function eventMarkets(id) {
  const e = M.event.get(+id);
  const home = d(e.participant_home_dictionary_id), away = d(e.participant_away_dictionary_id);
  return (M.byEv.get(+id) || []).filter(m => m.is_displayed).map(m => ({
    type: M.mtype.get(m.market_type_id), market: selLabel(d(m.dictionary_id), home, away), active: m.is_active,
    selections: (M.byM.get(m.node_id) || []).map(r => ({ sel: selLabel(d(r.dictionary_id), home, away), line: r.handicap_dictionary_id ? d(r.handicap_dictionary_id) : null, odds: odds(r) })),
  }));
}

async function socketCheck(seconds = 40) {
  const { io } = require('socket.io-client');
  // Exactly what the widget does: io(`${apiUrl}/vws`, { path: '/vws', transports: ['websocket','polling'] })
  // => Engine.IO v4 at wss://<api>/vws/?EIO=4&transport=websocket, Socket.IO CONNECT to namespace "/vws" ("40/vws,").
  const s = io(`${H.api}/vws`, { path: '/vws', transports: ['websocket', 'polling'], extraHeaders: { Origin: H.origin, 'User-Agent': UA } });
  const msgs = [];
  s.on('connect', () => console.log('socket connected', s.id));
  s.on('connect_error', e => console.log('connect_error', e.message));
  s.onAny((ev, payload) => { msgs.push({ ev, payload, at: new Date().toISOString() }); console.log('socket <-', ev, JSON.stringify(payload)); });
  await sleep(seconds * 1000);
  s.disconnect();
  return msgs;
}

(async () => {
  await initLzma();
  const meta = await syncFeed();
  M.byEv = new Map(); for (const m of M.market.values()) { if (!M.byEv.has(m.parent_node_id)) M.byEv.set(m.parent_node_id, []); M.byEv.get(m.parent_node_id).push(m); }
  M.byM = new Map(); for (const r of M.result.values()) { if (!M.byM.has(r.parent_node_id)) M.byM.set(r.parent_node_id, []); M.byM.get(r.parent_node_id).push(r); }
  const now = Date.now();
  const summary = { house: HOUSE, meta, at: new Date(now).toISOString(), counts: {} };
  for (const sport of Object.keys(SPORTS)) {
    const evs = listEvents(sport, now - 3 * 3600e3, now + 48 * 3600e3);
    const today = evs.filter(e => e.startsAt.slice(0, 10) === new Date(now).toISOString().slice(0, 10)).length;
    const withMain = evs.filter(e => e.main && e.main.sel.every(s => s.o)).length;
    const avgMk = evs.length ? Math.round(evs.reduce((a, e) => a + e.marketCount, 0) / evs.length) : 0;
    summary.counts[sport] = { next48h: evs.length, todayUtc: today, withMainOdds: withMain, avgMarkets: avgMk };
    fs.writeFileSync(path.join(OUT, `events-${sport}.json`), JSON.stringify(evs, null, 1));
    console.log(`\n${sport}: ${evs.length} events (48h), ${today} today, main odds on ${withMain}, avg markets ${avgMk}`);
    for (const e of evs.slice(0, 5)) console.log(' ', e.startsAt, e.competition, '|', e.home, '-', e.away, '|', e.main ? e.main.sel.map(s => `${s.s} ${s.o}`).join(' / ') : 'no main', `(${e.marketCount} mk)`);
  }
  const evArg = process.argv.indexOf('--event');
  for (const sport of Object.keys(SPORTS)) {
    const evs = JSON.parse(fs.readFileSync(path.join(OUT, `events-${sport}.json`)));
    const pick = evArg > 0 && sport === 'FOOTBALL' ? { houseEventId: process.argv[evArg + 1] } : evs.sort((a, b) => b.marketCount - a.marketCount)[0];
    if (!pick) continue;
    const mk = eventMarkets(pick.houseEventId);
    fs.writeFileSync(path.join(OUT, `markets-${sport}-${pick.houseEventId}.json`), JSON.stringify({ event: pick, markets: mk }, null, 1));
    console.log(`\n${sport} event ${pick.houseEventId} ${pick.home} - ${pick.away}: ${mk.length} markets, types: ${[...new Set(mk.map(m => m.type))].join(' ')}`);
  }
  if (process.argv.includes('--socket')) summary.socket = await socketCheck();
  summary.httpRequests = requests;
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log('\nHTTP requests:', requests);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
