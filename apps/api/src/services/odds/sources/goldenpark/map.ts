/* eslint-disable @typescript-eslint/no-explicit-any -- GoldenPark JSON is untyped external data; `any` is confined to this boundary. */
/**
 * Pure mapping of the GoldenPark (Sportnco) page-tree JSON to `SourceEvent` / `SourceMarket`.
 *
 * Every answer is a component tree (`tree.components[]`); the useful data sits in the `data` of a
 * component found by `tree_compo_key`: `sport_page_all` (A-Z competitions), `prematch_event_list`
 * (events of a competition, with their main markets) and `event_market_list` (all markets of one event).
 *
 * Labels are already PT, but a few need rewriting to the text `canonicalKey` reads (1X2 selections are
 * team names, "Dupla Hipótese" selections are "A ou Empate", handicap selections are "(−1.5) A"). Rewriting
 * is done by the house's own market label, never by loose text. Markets that are not confidently
 * translated keep the house's label and show only for GoldenPark; if such a market would nevertheless get
 * a canonical key, it is dropped: a wrong key is worse than none (e.g. "Marítimo marca" read as "team
 * scores", or "Vencedor do jogo (2 golos de vantagem)" read as a 1X2).
 *
 * There is no BetRadar id: the internal `match_id` is not one and is never put in `extraIds`.
 */
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceEvent, SourceMarket } from '../../types';

/** GoldenPark sport ids. */
export const SPORT_ID: Record<OddsSport, number> = { FOOTBALL: 13, BASKETBALL: 4, TENNIS: 21 };

/** Page of each sport (the `url_key` of the request); it lists the competitions. */
export const SPORT_PAGE: Record<OddsSport, string> = {
  FOOTBALL: '/desporte/13-futebol',
  BASKETBALL: '/desporte/4-basquetebol',
  TENNIS: '/desporte/21-tenis',
};

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s: unknown) =>
  clean(s)
    .toLowerCase()
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Country names of the category (football, basketball) → ISO country. Unknown names give no country. */
const COUNTRY: Record<string, string> = {
  alemanha: 'DE', argentina: 'AR', australia: 'AU', austria: 'AT', belgica: 'BE', bielorrussia: 'BY', brasil: 'BR', bulgaria: 'BG', canada: 'CA',
  chile: 'CL', chipre: 'CY', colombia: 'CO', 'coreia do sul': 'KR', croacia: 'HR', dinamarca: 'DK', equador: 'EC', escocia: 'GB-SCT',
  eslovaquia: 'SK', eslovenia: 'SI', espanha: 'ES', 'estados unidos': 'US', franca: 'FR', grecia: 'GR', guatemala: 'GT', holanda: 'NL',
  honduras: 'HN', hungria: 'HU', india: 'IN', inglaterra: 'GB-ENG', 'irlanda do norte': 'GB-NIR', israel: 'IL', italia: 'IT', japao: 'JP',
  malaysia: 'MY', mexico: 'MX', montenegro: 'ME', nicaragua: 'NI', noruega: 'NO', panama: 'PA', paraguai: 'PY', peru: 'PE', polonia: 'PL',
  portugal: 'PT', qatar: 'QA', 'republica checa': 'CZ', romenia: 'RO', russia: 'RU', 'saudi arabia': 'SA', servia: 'RS', suecia: 'SE', suica: 'CH',
  tanzania: 'TZ', tunisia: 'TN', turquia: 'TR', ucrania: 'UA', venezuela: 'VE', vietnam: 'VN', 'macedonia do norte': 'MK', 'bosnia e herzegovina': 'BA',
};

// ─── Component tree ──────────────────────────────────────────────────────────

/** First component of the tree with this `tree_compo_key`, or null. */
export function findComponent(body: any, key: string): any | null {
  const walk = (node: any): any | null => {
    if (!node || typeof node !== 'object') return null;
    if (node.tree_compo_key === key) return node;
    for (const c of Array.isArray(node.components) ? node.components : []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(body?.tree);
}

/** A competition listed in the A-Z of a sport page. */
export interface Competition {
  id: number;
  /** Page path, `/competicao/<id>-<slug>`. */
  url: string;
  label: string;
  events: number;
  pinned: boolean;
}

/** Competitions of a sport page with events, most events first (pinned ones first among equals). */
export function parseCompetitions(body: any): Competition[] {
  const cats: any[] = findComponent(body, 'sport_page_all')?.data?.a_z?.categories ?? [];
  const out: Competition[] = [];
  const seen = new Set<number>();
  for (const cat of Array.isArray(cats) ? cats : []) {
    for (const l of Array.isArray(cat?.links) ? cat.links : []) {
      const id = Number(l?.id);
      const url = clean(l?.url);
      const events = Number(l?.nb_events);
      if (l?.identifier !== 'competition' || !Number.isInteger(id) || seen.has(id)) continue;
      if (!/^\/competicao\/\d+-[a-z0-9-]+$/.test(url) || !(events > 0)) continue;
      seen.add(id);
      out.push({ id, url, label: clean(l?.label), events, pinned: l?.is_pinned === true });
    }
  }
  return out.sort((a, b) => b.events - a.events || Number(b.pinned) - Number(a.pinned));
}

/** `url_key` of an event: the calendar's page when it is that event's own path, else the bare id (the site resolves it). */
export function eventUrlKey(houseEventId: string, pageUrl?: string): string | null {
  if (!/^\d+$/.test(houseEventId)) return null;
  const own = pageUrl?.match(/^\/evento\/(\d+)-[a-z0-9-]+$/);
  return own && own[1] === houseEventId ? pageUrl! : `/evento/${houseEventId}`;
}

// ─── Roles and helpers ───────────────────────────────────────────────────────

interface Roles {
  home: string;
  away: string;
  homeNames: Set<string>;
  awayNames: Set<string>;
}

function rolesOf(event: any): Roles | null {
  const actors: any[] = Array.isArray(event?.actors) ? event.actors : [];
  const h = actors.find((a) => a?.type === 'home');
  const a = actors.find((x) => x?.type === 'away');
  const home = clean(h?.label);
  const away = clean(a?.label);
  if (!home || !away) return null;
  const names = (p: any) => new Set([norm(p?.label), norm(p?.abrev)].filter(Boolean));
  return { home, away, homeNames: names(h), awayNames: names(a) };
}

/** Side named by a selection or market text: exact team/player name only. */
function sideOf(text: string, r: Roles): 'H' | 'A' | null {
  const n = norm(text);
  if (!n) return null;
  const h = r.homeNames.has(n);
  const a = r.awayNames.has(n);
  return h !== a ? (h ? 'H' : 'A') : null;
}

const nameOfSide = (s: 'H' | 'A', r: Roles) => (s === 'H' ? r.home : r.away);
const num = (s: string): number | null => {
  const n = Number(clean(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number) => String(n);
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const isHalfLine = (n: number) => Math.abs(n % 1) === 0.5;

interface Sel {
  label: string;
  odds: number;
  line?: number | null;
}
type Rows = { label: string; selections: Sel[] };
type Pick = (label: string) => { label: string; line?: number | null } | null;

/** A bet's selections → rows; selections the translator could not read, or without a usable price, are dropped. */
function rows(bet: any, label: string, pick: Pick): Rows {
  const selections: Sel[] = [];
  for (const s of Array.isArray(bet?.selections) ? bet.selections : []) {
    const odds = Number(s?.odds);
    if (!Number.isFinite(odds) || odds <= 1 || clean(s?.odds_display) === '-') continue;
    const p = pick(clean(s?.label));
    if (!p) continue;
    selections.push({ label: p.label, odds, ...(p.line !== undefined ? { line: p.line } : {}) });
  }
  return { label, selections };
}

/** "Mais de 2.5" / "Menos de 2.5" → label and line. */
const overUnder: Pick = (l) => {
  const m = l.match(/^(mais|menos) de (\d+(?:\.\d+)?)$/i);
  const line = m ? num(m[2]!) : null;
  return m && line !== null ? { label: `${/^mais/i.test(m[1]!) ? 'Mais' : 'Menos'} de ${fmt(line)}`, line } : null;
};

/** "(−1.5) Team" → team and line. */
function handicapSelection(l: string, r: Roles): { name: string; line: number } | null {
  const m = l.match(/^\(([+-]?\d+(?:\.\d+)?)\)\s*(.+)$/);
  const line = m ? num(m[1]!) : null;
  const side = m ? sideOf(m[2]!, r) : null;
  return m && line !== null && side ? { name: nameOfSide(side, r), line } : null;
}

// ─── Football ────────────────────────────────────────────────────────────────

function footballBet(type: string, bet: any, r: Roles): Rows | null {
  const n = norm(bet?.label);
  const oneXTwo: Pick = (l) => {
    if (norm(l) === 'empate') return { label: 'X' };
    const s = sideOf(l, r);
    return s ? { label: s === 'H' ? '1' : '2' } : null;
  };

  if (type === '1x2') {
    if (n === 'resultado do jogo') return rows(bet, 'Resultado Final', oneXTwo);
    if (n === '1a parte - resultado') return rows(bet, 'Resultado da 1ª Parte', oneXTwo);
    return null;
  }

  if (type === 'double_chance') {
    const label = n === 'dupla hipotese' ? 'Hipótese Dupla' : n === '1a parte - dupla hipotese' ? '1ª Parte - Hipótese Dupla' : null;
    if (!label) return null;
    const combos: [string, string][] = [
      [`${r.home} ou Empate`, '1X'],
      [`Empate ou ${r.away}`, 'X2'],
      [`${r.home} ou ${r.away}`, '12'],
    ];
    return rows(bet, label, (l) => {
      const hit = combos.find(([text]) => norm(text) === norm(l));
      return hit ? { label: hit[1] } : null;
    });
  }

  if (type === 'yes_no' && n === 'ambas as equipas marcam') {
    return rows(bet, 'Ambas as Equipas Marcam', (l) => (l === 'Sim' || l === 'Não' ? { label: l } : null));
  }

  if (type === 'over_under') {
    const m = n.match(/^(?:(1a parte) - )?mais\/menos de \d+(?:\.\d+)? golos$/);
    if (m) return rows(bet, `${m[1] ? '1ª Parte - ' : ''}Total de Golos Mais/Menos`, overUnder);
    const t = clean(bet?.label).match(/^(.+?) - mais\/menos de \d+(?:\.\d+)? golos$/i);
    const side = t ? sideOf(t[1]!, r) : null;
    if (side) return rows(bet, `Total de Golos Mais/Menos - ${nameOfSide(side, r)}`, overUnder);
    return null;
  }

  if (type === 'moneyline' && n === 'vencedor (empate anula aposta)') {
    return rows(bet, 'Empate Anula Aposta', (l) => {
      const s = sideOf(l, r);
      return s ? { label: nameOfSide(s, r) } : null;
    });
  }

  // Two-way handicap, full time, half lines only (whole and quarter lines are asian/push markets).
  if (type === 'handicap_2ways' && /^handicap \([+-]?\d+(?:\.\d+)?\) - resultado do jogo$/.test(n)) {
    return rows(bet, 'Handicap', (l) => {
      const h = handicapSelection(l, r);
      return h && isHalfLine(h.line) ? { label: `${h.name} ${signed(h.line)}`, line: h.line } : null;
    });
  }

  if (type === 'ht_ft' && n === 'intervalo / final do jogo') {
    const one = (t: string): string | null => (norm(t) === 'empate' ? 'X' : sideOf(t, r) === 'H' ? '1' : sideOf(t, r) === 'A' ? '2' : null);
    const options = [r.home, 'Empate', r.away];
    return rows(bet, 'Intervalo/Final', (l) => {
      for (const a of options) {
        for (const b of options) {
          if (norm(`${a} / ${b}`) === norm(l)) {
            const ht = one(a);
            const ft = one(b);
            return ht && ft ? { label: `${ht}/${ft}` } : null;
          }
        }
      }
      return null;
    });
  }

  if (type === 'correct_score_3way' && n === 'resultado correto') {
    return rows(bet, 'Resultado Exato', (l) => {
      const m = l.match(/^(.+?) (\d+)-(\d+) (.+)$/);
      return m && sideOf(m[1]!, r) === 'H' && sideOf(m[4]!, r) === 'A' ? { label: `${m[2]}-${m[3]}` } : null;
    });
  }
  return null;
}

// ─── Basketball ──────────────────────────────────────────────────────────────

/** "1ª Parte" / "2º Quarto" → label prefix; null when not a recognised scope. */
function basketballScope(s: string | undefined): string | null {
  if (!s) return '';
  const t = norm(s);
  if (t === '1a parte' || t === '2a parte') return `${t[0]}ª Parte - `;
  const q = t.match(/^([1-4])o quarto$/);
  return q ? `${q[1]}º Quarto - ` : null;
}

const SCOPE = '(?:(1ª parte|2ª parte|[1-4]º quarto) - )?';

function basketballBet(type: string, bet: any, r: Roles): Rows | null {
  const label = clean(bet?.label);
  const side: Pick = (l) => {
    const s = sideOf(l, r);
    return s ? { label: nameOfSide(s, r) } : null;
  };

  if (type === 'moneyline' && norm(label) === 'vencedor (inc. prolongamento)') return rows(bet, 'Vencedor (incl. prolongamento)', side);

  if (type === 'over_under') {
    // Full game and team totals include overtime; quarter and half totals have none.
    const m = label.match(new RegExp(`^${SCOPE}(?:(.+?) - )?mais/menos de \\d+(?:\\.\\d+)? pontos( \\(inc\\. prolongamento\\))?$`, 'i'));
    if (!m) return null;
    const scope = basketballScope(m[1]);
    if (scope === null) return null;
    if (scope === '' && !m[3]) return null; // a full-game total that does not say overtime is included: not translated
    if (scope !== '' && m[3]) return null;
    if (!m[2]) return rows(bet, `${scope}Total de Pontos Mais/Menos`, overUnder);
    const team = sideOf(m[2], r);
    return team ? rows(bet, `${scope}Total de Pontos Mais/Menos - ${nameOfSide(team, r)}`, overUnder) : null;
  }

  if (type === 'handicap_2ways') {
    const m = label.match(new RegExp(`^${SCOPE}handicap \\(([+-]?\\d+(?:\\.\\d+)?)\\) - (resultado do jogo \\(inc\\. prolongamento\\)|resultado|vencedor)$`, 'i'));
    if (!m) return null;
    const scope = basketballScope(m[1]);
    if (scope === null) return null;
    const withOt = /prolongamento/i.test(m[3]!);
    if ((scope === '') !== withOt) return null;
    return rows(bet, `${scope}Handicap`, (l) => {
      const h = handicapSelection(l, r);
      return h ? { label: `${h.name} ${signed(h.line)}`, line: h.line } : null;
    });
  }
  return null;
}

// ─── Tennis ──────────────────────────────────────────────────────────────────

function tennisBet(type: string, bet: any, r: Roles): Rows | null {
  const n = norm(bet?.label);
  const player: Pick = (l) => {
    const s = sideOf(l, r);
    return s ? { label: nameOfSide(s, r) } : null;
  };

  if (type === 'moneyline') {
    if (n === 'resultado do jogo') return rows(bet, 'Vencedor', player);
    const set = n.match(/^set ([1-5]) - vencedor$/);
    if (set) return rows(bet, `${set[1]}º Set - Vencedor`, player);
    return null;
  }
  if (type === 'over_under' && /^mais\/menos de \d+(?:\.\d+)? jogos$/.test(n)) return rows(bet, 'Total de Jogos Mais/Menos', overUnder);
  if (type === 'handicap_2ways' && /^handicap de jogos \([+-]?\d+(?:\.\d+)?\) - resultado$/.test(n)) {
    return rows(bet, 'Handicap de Jogos', (l) => {
      const h = handicapSelection(l, r);
      return h ? { label: `${h.name} ${signed(h.line)}`, line: h.line } : null;
    });
  }
  if (type === 'correct_score_2way' && n === 'resultado correto') {
    return rows(bet, 'Resultado Exato em Sets', (l) => {
      const m = l.match(/^(.+?) (\d)-(\d) (.+)$/);
      return m && sideOf(m[1]!, r) === 'H' && sideOf(m[4]!, r) === 'A' ? { label: `${m[2]}-${m[3]}` } : null;
    });
  }
  return null;
}

// ─── Markets of an event ─────────────────────────────────────────────────────

const MAIN_LABELS = new Set(['Resultado Final', 'Vencedor (incl. prolongamento)', 'Vencedor']);

/** The markets of an event (calendar entry or event page) → `SourceMarket[]`. */
function mapEventMarkets(event: any, sport: OddsSport): SourceMarket[] {
  const r = rolesOf(event);
  if (!r) return [];
  const ctx = { home: r.home, away: r.away };
  const out: SourceMarket[] = [];
  for (const m of Array.isArray(event?.markets) ? event.markets : []) {
    const type = clean(m?.selection_order_type);
    for (const bet of Array.isArray(m?.bets) ? m.bets : []) {
      const translate = sport === 'FOOTBALL' ? footballBet : sport === 'BASKETBALL' ? basketballBet : tennisBet;
      let handled = translate(type, bet, r);
      if (!handled) {
        // Not translated: the house's own label. Drop it if that label alone would get a canonical key.
        handled = rows(bet, clean(bet?.label), (l) => (l ? { label: l } : null));
        if (handled.selections.some((s) => canonicalKey(sport, handled!.label, s.label, ctx) !== null)) continue;
      }
      for (const s of handled.selections) {
        out.push({ marketLabel: handled.label, selectionLabel: s.label, line: s.line ?? null, odds: s.odds, suspended: false });
      }
    }
  }
  return out;
}

/** Body of an event page → sport and markets; null when it is not an event of the covered sports. */
export function mapEventPage(body: any): { sport: OddsSport; markets: SourceMarket[] } | null {
  const event = findComponent(body, 'event_market_list')?.data?.event;
  const sport = (Object.keys(SPORT_ID) as OddsSport[]).find((s) => SPORT_ID[s] === Number(event?.sport?.id));
  if (!event || !sport) return null;
  return { sport, markets: mapEventMarkets(event, sport) };
}

// ─── Events ──────────────────────────────────────────────────────────────────

/** One event of a competition list → `SourceEvent`; null when it is not a two-sided, open, pre-match game of `sport`. */
export function mapEvent(e: any, sport: OddsSport): SourceEvent | null {
  const id = clean(e?.id);
  const t = Number(e?.ts_start) * 1000;
  if (!/^\d+$/.test(id) || !Number.isFinite(t) || t <= 0 || e?.is_canceled === true || clean(e?.state) !== 'pm') return null;
  if (Number(e?.sport?.id) !== SPORT_ID[sport]) return null;
  const r = rolesOf(e);
  if (!r) return null;
  const category = clean(e?.category?.label);
  const label = clean(e?.competition?.label);
  const competition = sport === 'TENNIS' && category && label ? `${category} - ${label}` : label;
  const countryCode = sport === 'TENNIS' ? undefined : COUNTRY[norm(category)];
  const marketCount = Number(e?.nb_bets);
  const page = clean(e?.url);
  const mainMarkets = mapEventMarkets(e, sport).filter((m) => MAIN_LABELS.has(m.marketLabel));
  return {
    house: 'goldenpark',
    houseEventId: id,
    sport,
    competition,
    home: r.home,
    away: r.away,
    startsAt: new Date(t).toISOString(),
    live: false,
    ...(/^\/evento\/\d+-[a-z0-9-]+$/.test(page) ? { pageUrl: page } : {}),
    ...(Number.isFinite(marketCount) && marketCount > 0 ? { marketCount } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(mainMarkets.length ? { mainMarkets } : {}),
  };
}

/** A competition page → its pre-match events of `sport`. */
export function mapCompetitionEvents(body: any, sport: OddsSport): SourceEvent[] {
  const out: SourceEvent[] = [];
  for (const e of findComponent(body, 'prematch_event_list')?.data?.events ?? []) {
    const ev = mapEvent(e, sport);
    if (ev) out.push(ev);
  }
  return out;
}
