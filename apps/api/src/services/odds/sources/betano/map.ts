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
    const k = `${m.marketLabel}\u0000${m.selectionLabel}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/** Prematch ("Casa - Fora" in `name`) or live (participants with `isHome`) → `SourceEvent`. */
export function mapEvent(raw: any, sport: OddsSport, now: number): SourceEvent | null {
  const ev = raw?.event ?? raw;
  const id = clean(ev?.id);
  const start = Number(ev?.startTime);
  if (!id || !Number.isFinite(start) || start <= 0) return null;

  let home: string;
  let away: string;
  if (Array.isArray(ev.participants) && ev.participants.length === 2) {
    const h = ev.participants.find((p: any) => p?.isHome === true);
    const a = ev.participants.find((p: any) => p?.isHome !== true);
    if (!h || !a) return null;
    home = clean(h.name);
    away = clean(a.name);
  } else {
    const parts = clean(ev.name).split(/\s+[-–]\s+/);
    if (parts.length !== 2) return null;
    [home, away] = [parts[0]!, parts[1]!];
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

/** Walks an `initial_state` for the market arrays, whichever branch holds them. */
export function marketsFromState(state: any): { markets: any[]; selections: any[] } {
  const seen = new Set<any>();
  const out = { markets: [] as any[], selections: [] as any[] };
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node.markets)) out.markets.push(...node.markets.filter((m: any) => m?.type && m?.name));
    if (Array.isArray(node.selections)) out.selections.push(...node.selections.filter((s: any) => s?.id != null));
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(state, 0);
  return out;
}
