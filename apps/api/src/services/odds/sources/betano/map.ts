/* eslint-disable @typescript-eslint/no-explicit-any -- Betano JSON is untyped external data; `any` is confined to this boundary. */
import type { SourceEvent, SourceMarket, OddsSport } from '../../types';

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Suspended when priced at 1 or less, or when the market's close time has passed. */
const closed = (market: any, price: number, now: number): boolean => {
  const t = Number(market?.marketCloseTimeMillis ?? 0);
  return !Number.isFinite(price) || price <= 1 || (t > 0 && t < now);
};

/** One market (either shape) → selections. Live markets name their selections by id list. */
export function mapMarkets(markets: any[], selections: any[] | undefined, now: number): SourceMarket[] {
  const byId = new Map<string, any>((selections ?? []).map((s) => [String(s.id), s]));
  const out: SourceMarket[] = [];
  for (const market of markets ?? []) {
    const label = clean(market?.name);
    if (!label) continue;
    const rows: any[] = Array.isArray(market.selections)
      ? market.selections
      : (market.selectionIdList ?? []).map((id: any) => byId.get(String(id))).filter(Boolean);
    for (const sel of rows) {
      const selectionLabel = clean(sel?.name) || clean(sel?.fullName);
      const price = Number(sel?.price);
      if (!selectionLabel || !Number.isFinite(price)) continue;
      const line = Number(sel?.handicap);
      out.push({
        marketLabel: label,
        selectionLabel,
        line: Number.isFinite(line) && line !== 0 ? line : null,
        odds: price,
        suspended: closed(market, price, now),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((m) => {
    const k = `${m.marketLabel}\u0000${m.selectionLabel}\u0000${m.line ?? ''}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/**
 * Raw events of a calendar or league page. The real calendar groups them by league in
 * `data.blocks[].events` (sorted by league, not time); older/flat shapes use `data.events` or `data`.
 */
export function calendarEvents(body: any): any[] {
  const blocks = body?.data?.blocks;
  if (Array.isArray(blocks)) return blocks.flatMap((b: any) => (Array.isArray(b?.events) ? b.events : []));
  const flat = body?.data?.events ?? body?.events ?? body?.data ?? [];
  return Array.isArray(flat) ? flat : [];
}

/** Prematch ("Casa - Fora" in `name`) or live (participants with `isHome`) → `SourceEvent`. */
export function mapEvent(raw: any, sport: OddsSport, now: number): SourceEvent | null {
  const ev = raw?.event ?? raw;
  const id = clean(ev?.id);
  const start = Number(ev?.startTime);
  if (!id || !Number.isFinite(start) || start <= 0) return null;

  let home: string;
  let away: string;
  const parts = clean(ev.name).split(/\s+[-–]\s+/);
  const duo = Array.isArray(ev.participants) && ev.participants.length === 2 ? ev.participants : null;
  const h = duo?.find((p: any) => p?.isHome === true);
  if (duo && h) {
    // Live: `isHome` marks the home side.
    home = clean(h.name);
    away = clean(duo.find((p: any) => p !== h)?.name);
  } else if (parts.length === 2) {
    // Prematch: "Casa - Fora" (the calendar also lists participants, without `isHome`).
    [home, away] = [parts[0]!, parts[1]!];
  } else if (duo) {
    [home, away] = [clean(duo[0]?.name), clean(duo[1]?.name)];
  } else {
    return null;
  }
  if (!home || !away) return null;

  const radar = clean(ev.betRadarId ?? ev.betradarMatchId) || null;
  const mainMarkets = Array.isArray(raw?.markets) ? mapMarkets(raw.markets, raw.selections, now) : [];
  const pageUrl = clean(ev.url) || undefined;
  return {
    house: 'betano',
    houseEventId: id,
    sport,
    competition: clean(ev.leagueName ?? ev.leagueId),
    home,
    away,
    startsAt: new Date(start).toISOString(),
    live: ev.liveData != null,
    ...(pageUrl ? { pageUrl } : {}),
    ...(radar ? { extraIds: { betRadarId: radar } } : {}),
    ...(mainMarkets.length ? { mainMarkets } : {}),
  };
}

/** Extracts `window["initial_state"]` from an event page. */
export function parseInitialState(html: string): any | null {
  const m = html.match(/initial_state"?\]?\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

/**
 * Walks an `initial_state` for the market arrays, whichever branch holds them. With `eventId`, only
 * subtrees whose `id` matches and that carry a `markets` array are collected (related/carousel events
 * are ignored); with no match the whole state is walked.
 */
export function marketsFromState(state: any, eventId?: string): { markets: any[]; selections: any[] } {
  const collect = (roots: any[]) => {
    const seen = new Set<any>();
    const out = { markets: [] as any[], selections: [] as any[] };
    const walk = (node: any, depth: number) => {
      if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node.markets)) out.markets.push(...node.markets.filter((m: any) => m?.type && m?.name));
      if (Array.isArray(node.selections)) out.selections.push(...node.selections.filter((s: any) => s?.id != null));
      for (const v of Object.values(node)) walk(v, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  };
  if (eventId) {
    const roots: any[] = [];
    const seen = new Set<any>();
    const find = (node: any, depth: number) => {
      if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return;
      seen.add(node);
      if (String(node.id) === eventId && Array.isArray(node.markets)) {
        roots.push(node);
        return;
      }
      for (const v of Object.values(node)) find(v, depth + 1);
    };
    find(state, 0);
    if (roots.length > 0) return collect(roots);
  }
  return collect([state]);
}
