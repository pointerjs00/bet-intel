/**
 * In-memory model of one house's pt-vision feed (Placard / Solverde) and the plan of each sync.
 *
 * The widget replicates the whole catalogue as a columnar database: slices are applied in order (base → full
 * partitions → update-to-full → partials) as upserts by id, with the widget's own merge policy
 * (`pt-vision-memory-storage-handler/merge/resolve-merge-policy`):
 *  - catalogue tables (dictionary, structure, market types, odd map, additional values): the base slice and full
 *    partition 0 overwrite, the other full partitions only add, deltas (update-to-full, live, partials) overwrite;
 *  - operational tables (Event, Market, Result): snapshots (base / full) only add, deltas overwrite (never the parent);
 *  - `*Small` tables (flags, odd map id) patch an existing node on deltas only; for a node not seen yet they wait and
 *    win over its first complete row (the widget's "chunks"). Here they wait until the end of the sync at most.
 * There are no deletions in the feed: nodes are hidden (`is_displayed`) and gone at the next full index.
 *
 * Only football, basketball and tennis are kept (found by the sport's `SPORT_ID` additional value, since Structure
 * ids differ between houses: Futebol is 106 at Placard and 105 at Solverde); events of other sports and markets /
 * results without a kept parent are dropped while reading. `finishSync` removes hidden events and events that
 * started more than PRUNE_AFTER_MS ago, with their markets and results.
 */
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSport } from '../../types';
import type { Table, Tables } from './memory';

/** How a slice merges: base / full partition 0, other full partitions, or a delta. */
export type Policy = 'authoritative' | 'snapshot' | 'delta';

/** `SPORT_ID` additional value of the sports the comparator reads. */
export const SPORT_IDS: Record<string, OddsSport> = { soccer: 'FOOTBALL', basketball: 'BASKETBALL', tennis: 'TENNIS' };
/** Events that started longer ago than this leave the model (unless the feed still shows them, they are over). */
export const PRUNE_AFTER_MS = 12 * 3_600_000;
/** Partials fetched one by one at most (≈ 1 per second at both houses); beyond that the update-to-full is used. */
export const MAX_PARTIALS = 10;
/**
 * Market types not kept: player props and bet-builder bundles (scorers, player goals/assists/points, "PBBB" combos).
 * They are never compared (no canonical key in v1), their raw labels would key as scorer bets (so the mapper's
 * safety net would drop them anyway) and they are about half of all selections.
 */
export const SKIPPED_TYPES = /^(PB[A-Z]{2}|PSXG|PSX\d|LGSC|HATR|PSCN|PTS2|INXP|FGA[A-Z]|PSA[A-Z]|PSBH|POSO|FGSC|PAL[A-Z]|PLST|PLTA|PLPA|PLBL|TPL[A-Z]|SPAR|3POU)$/;
/** Markets are kept for events starting up to this far ahead of the rebuild (the comparator lists 48 h ahead). */
export const MARKET_HORIZON_MS = 50 * 3_600_000;
/** The model is rebuilt at least this often (the full index changes about every 10 minutes anyway). */
export const REBUILD_EVERY_MS = 60 * 60_000;
/** Full partitions accepted in a meta (5 observed). */
const MAX_FULL_PARTITIONS = 16;

export interface EventNode {
  id: number;
  parent: number;
  /** Start, UTC seconds. */
  start: number;
  home: number;
  away: number;
  displayed: boolean;
  active: boolean;
  sport: OddsSport;
}
export interface MarketNode {
  id: number;
  event: number;
  type: number;
  dict: number;
  displayed: boolean;
  active: boolean;
}
export interface ResultNode {
  id: number;
  market: number;
  dict: number;
  /** Line dictionary id (0 = none). */
  hcp: number;
  odd: number;
}
interface StructNode {
  parent: number;
  type: number;
  dict: number;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const bool = (v: unknown) => v === true;

/** Reads the rows of one table, checking that the columns the model needs are there. */
function rows(tables: Tables, name: string, required: string[], fn: (get: (col: string) => unknown) => void): void {
  const t: Table | undefined = tables.get(name);
  if (!t || t.count === 0) return;
  for (const col of required) if (!t.has(col)) throw new ProviderFormatError(`sportswidget: table ${name} has no column ${col}`);
  for (let i = 0; i < t.count; i++) fn((col) => t.get(col, i));
}

export class SportsRepo {
  /**
   * @param marketsUntilSec markets (and their results) are kept only for events starting before this (UTC seconds):
   *   the comparator lists 48 h ahead, so the model built at a sync does not need the markets of later events. Those
   *   events come in at a later rebuild (every new full index, at most REBUILD_EVERY_MS apart).
   */
  constructor(private readonly marketsUntilSec = Number.POSITIVE_INFINITY) {}

  private readonly dict = new Map<number, string>();
  private readonly struct = new Map<number, StructNode>();
  private readonly mtype = new Map<number, string>();
  private readonly oddMap = new Map<number, number>();
  private readonly avKeys = new Map<number, string>();
  /** SPORT_ID / COUNTRY_ID dictionary ids of structure nodes. */
  private readonly nodeAv = new Map<number, { SPORT_ID?: number; COUNTRY_ID?: number }>();
  private readonly ev = new Map<number, EventNode>();
  private readonly mk = new Map<number, MarketNode>();
  private readonly mkByEvent = new Map<number, number[]>();
  /**
   * Results are the bulk (≈ 150 k per house): typed columns by slot, an id → slot index, and per market a linked
   * list (first slot by market, `rNext` to the next one, -1 at the end) instead of one array per market.
   */
  private readonly rsSlot = new Map<number, number>();
  private readonly rsHead = new Map<number, number>();
  private rNext = new Int32Array(1024);
  private rId = new Float64Array(1024);
  private rMarket = new Float64Array(1024);
  private rDict = new Uint32Array(1024);
  private rHcp = new Uint32Array(1024);
  private rOdd = new Uint32Array(1024);
  private rLength = 0;
  private readonly rFree: number[] = [];
  private readonly live = new Set<number>();
  /** Small rows of nodes not seen yet, by `E|M|R` + id; dropped at the end of the sync. */
  private readonly chunks = new Map<string, Record<string, unknown>>();

  /** Merges one decoded slice. */
  apply(tables: Tables, policy: Policy): void {
    const overwriteCatalogue = policy !== 'snapshot';
    const overwrite = policy === 'delta';
    const upsert = <V>(map: Map<number, V>, id: number, value: V) => {
      if (overwriteCatalogue || !map.has(id)) map.set(id, value);
    };

    rows(tables, 'DictionaryEntry', ['id', 'value'], (g) => upsert(this.dict, num(g('id')), String(g('value') ?? '')));
    rows(tables, 'AdditionalValueKey', ['key_id', 'key'], (g) => upsert(this.avKeys, num(g('key_id')), String(g('key') ?? '')));
    rows(tables, 'AdditionalValue', ['node_id', 'key_id', 'dictionary_id'], (g) => {
      const key = this.avKeys.get(num(g('key_id')));
      if (key !== 'SPORT_ID' && key !== 'COUNTRY_ID') return;
      const id = num(g('node_id'));
      const av = this.nodeAv.get(id) ?? {};
      if (overwriteCatalogue || av[key] === undefined) av[key] = num(g('dictionary_id'));
      this.nodeAv.set(id, av);
    });
    rows(tables, 'MarketType', ['id', 'market_type'], (g) => upsert(this.mtype, num(g('id')), String(g('market_type') ?? '')));
    rows(tables, 'Structure', ['node_id', 'parent_node_id', 'node_type_id', 'dictionary_id'], (g) =>
      upsert(this.struct, num(g('node_id')), { parent: num(g('parent_node_id')), type: num(g('node_type_id')), dict: num(g('dictionary_id')) }),
    );

    // Events
    rows(tables, 'EventSmall', ['node_id', 'is_displayed', 'is_active'], (g) =>
      this.small('E', this.ev.get(num(g('node_id'))), num(g('node_id')), overwrite, { displayed: bool(g('is_displayed')), active: bool(g('is_active')) }),
    );
    rows(tables, 'Event', ['node_id', 'parent_node_id', 'start_date', 'participant_home_dictionary_id', 'participant_away_dictionary_id', 'is_displayed', 'is_active'], (g) => {
      const id = num(g('node_id'));
      const fields = {
        start: num(g('start_date')),
        home: num(g('participant_home_dictionary_id')),
        away: num(g('participant_away_dictionary_id')),
        displayed: bool(g('is_displayed')),
        active: bool(g('is_active')),
      };
      const existing = this.ev.get(id);
      if (existing) {
        if (overwrite) Object.assign(existing, fields);
        return;
      }
      const parent = num(g('parent_node_id'));
      const sport = this.sportOf(parent);
      const chunk = this.takeChunk('E', id);
      if (!sport) return;
      this.ev.set(id, { id, parent, sport, ...fields, ...chunk });
    });

    // Markets
    rows(tables, 'MarketSmall', ['node_id', 'is_active', 'is_displayed'], (g) =>
      this.small('M', this.mk.get(num(g('node_id'))), num(g('node_id')), overwrite, { displayed: bool(g('is_displayed')), active: bool(g('is_active')) }),
    );
    rows(tables, 'Market', ['node_id', 'parent_node_id', 'market_type_id', 'dictionary_id', 'is_active', 'is_displayed'], (g) => {
      const id = num(g('node_id'));
      const fields = { type: num(g('market_type_id')), dict: num(g('dictionary_id')), displayed: bool(g('is_displayed')), active: bool(g('is_active')) };
      const existing = this.mk.get(id);
      if (existing) {
        if (overwrite) Object.assign(existing, fields);
        return;
      }
      const event = num(g('parent_node_id'));
      const chunk = this.takeChunk('M', id);
      const parent = this.ev.get(event);
      if (!parent || parent.start > this.marketsUntilSec || SKIPPED_TYPES.test(this.mtype.get(fields.type) ?? '')) return;
      this.mk.set(id, { id, event, ...fields, ...chunk });
      this.link(this.mkByEvent, event, id);
    });

    // Results (selections)
    rows(tables, 'ResultSmall', ['node_id', 'odd_map_id'], (g) => {
      const id = num(g('node_id'));
      const slot = this.rsSlot.get(id);
      if (slot === undefined) this.chunks.set('R' + id, { odd: num(g('odd_map_id')) });
      else if (overwrite) this.rOdd[slot] = num(g('odd_map_id'));
    });
    rows(tables, 'Result', ['node_id', 'parent_node_id', 'dictionary_id', 'handicap_dictionary_id', 'odd_map_id'], (g) => {
      const id = num(g('node_id'));
      const existing = this.rsSlot.get(id);
      if (existing !== undefined) {
        if (overwrite) this.writeResult(existing, id, this.rMarket[existing]!, g);
        return;
      }
      const market = num(g('parent_node_id'));
      const chunk = this.takeChunk('R', id);
      if (!this.mk.has(market)) return;
      const slot = this.newSlot();
      this.writeResult(slot, id, market, g);
      if (chunk && typeof chunk.odd === 'number') this.rOdd[slot] = chunk.odd;
      this.rsSlot.set(id, slot);
      this.rNext[slot] = this.rsHead.get(market) ?? -1;
      this.rsHead.set(market, slot);
    });

    rows(tables, 'OddMap', ['id', 'dec'], (g) => upsert(this.oddMap, num(g('id')), num(g('dec'))));
    rows(tables, 'NodesInPlayDetail', ['node_id', 'data'], (g) => {
      const id = num(g('node_id'));
      if (!this.ev.has(id)) return;
      if (isInPlay(g('data'))) this.live.add(id);
      else this.live.delete(id);
    });
  }

  /** End of a sync: pending small rows are dropped; hidden and long-started events leave the model. */
  finishSync(nowMs: number): void {
    this.chunks.clear();
    const cutoff = (nowMs - PRUNE_AFTER_MS) / 1000;
    for (const e of [...this.ev.values()]) {
      if (e.displayed && e.start >= cutoff) continue;
      for (const m of this.mkByEvent.get(e.id) ?? []) {
        for (let slot = this.rsHead.get(m) ?? -1; slot !== -1; slot = this.rNext[slot]!) {
          this.rsSlot.delete(this.rId[slot]!);
          this.rFree.push(slot);
        }
        this.rsHead.delete(m);
        this.mk.delete(m);
      }
      this.mkByEvent.delete(e.id);
      this.live.delete(e.id);
      this.ev.delete(e.id);
    }
  }

  private small<T extends object>(kind: string, node: T | undefined, id: number, overwrite: boolean, fields: Partial<T>): void {
    if (node) {
      if (overwrite) Object.assign(node, fields);
      return;
    }
    this.chunks.set(kind + id, { ...this.chunks.get(kind + id), ...fields });
  }

  private takeChunk(kind: string, id: number): Record<string, unknown> | undefined {
    const c = this.chunks.get(kind + id);
    if (c) this.chunks.delete(kind + id);
    return c;
  }

  private link(index: Map<number, number[]>, parent: number, child: number): void {
    const list = index.get(parent);
    if (list) list.push(child);
    else index.set(parent, [child]);
  }

  private newSlot(): number {
    const free = this.rFree.pop();
    if (free !== undefined) return free;
    if (this.rLength === this.rId.length) {
      const n = this.rLength * 2;
      const grow64 = (a: Float64Array) => {
        const b = new Float64Array(n);
        b.set(a);
        return b;
      };
      const grow32 = (a: Uint32Array) => {
        const b = new Uint32Array(n);
        b.set(a);
        return b;
      };
      const next = new Int32Array(n);
      next.set(this.rNext);
      this.rNext = next;
      this.rId = grow64(this.rId);
      this.rMarket = grow64(this.rMarket);
      this.rDict = grow32(this.rDict);
      this.rHcp = grow32(this.rHcp);
      this.rOdd = grow32(this.rOdd);
    }
    return this.rLength++;
  }

  private writeResult(slot: number, id: number, market: number, g: (col: string) => unknown): void {
    this.rId[slot] = id;
    this.rMarket[slot] = market;
    this.rDict[slot] = num(g('dictionary_id'));
    this.rHcp[slot] = num(g('handicap_dictionary_id')) || 0;
    this.rOdd[slot] = num(g('odd_map_id'));
  }

  /** Sport of a structure node: the `SPORT_ID` of its top (type 1) ancestor, when it is one of ours. */
  private sportOf(structId: number): OddsSport | null {
    let id = structId;
    for (let depth = 0; depth < 8; depth++) {
      const s = this.struct.get(id);
      if (!s) return null;
      if (s.type === 1) {
        const sid = this.nodeAv.get(id)?.SPORT_ID;
        return sid === undefined ? null : (SPORT_IDS[this.dict.get(sid) ?? ''] ?? null);
      }
      id = s.parent;
    }
    return null;
  }

  // ─── Reading ───────────────────────────────────────────────────────────────

  text(id: number): string | undefined {
    return this.dict.get(id);
  }
  /** Decimal odds of an odd map id (`dec` = odds × 1000), null when unknown or 0. */
  odds(oddMapId: number): number | null {
    const dec = this.oddMap.get(oddMapId);
    return dec ? dec / 1000 : null;
  }
  marketType(id: number): string | undefined {
    return this.mtype.get(id);
  }
  event(id: number): EventNode | undefined {
    return this.ev.get(id);
  }
  eventsOf(sport: OddsSport): EventNode[] {
    return [...this.ev.values()].filter((e) => e.sport === sport);
  }
  marketsOf(eventId: number): MarketNode[] {
    return (this.mkByEvent.get(eventId) ?? []).map((id) => this.mk.get(id)!).filter(Boolean);
  }
  resultsOf(marketId: number): ResultNode[] {
    const out: ResultNode[] = [];
    for (let slot = this.rsHead.get(marketId) ?? -1; slot !== -1; slot = this.rNext[slot]!) {
      out.push({ id: this.rId[slot]!, market: this.rMarket[slot]!, dict: this.rDict[slot]!, hcp: this.rHcp[slot]!, odd: this.rOdd[slot]! });
    }
    return out.reverse(); // arrival order
  }
  isLive(eventId: number): boolean {
    return this.live.has(eventId);
  }
  /** Structure path from the sport down to `structId`. */
  path(structId: number): { id: number; type: number; name: string }[] {
    const out: { id: number; type: number; name: string }[] = [];
    let id = structId;
    for (let depth = 0; depth < 8; depth++) {
      const s = this.struct.get(id);
      if (!s) break;
      out.unshift({ id, type: s.type, name: this.dict.get(s.dict) ?? '' });
      if (s.type === 1) break;
      id = s.parent;
    }
    return out;
  }
  /** Raw `COUNTRY_ID` ("PT|Portugal") of the nearest structure node that has one. */
  country(structId: number): string | undefined {
    let id = structId;
    for (let depth = 0; depth < 8; depth++) {
      const c = this.nodeAv.get(id)?.COUNTRY_ID;
      if (c !== undefined) return this.dict.get(c);
      const s = this.struct.get(id);
      if (!s || s.type === 1) return undefined;
      id = s.parent;
    }
    return undefined;
  }
  size(): { events: number; markets: number; results: number } {
    return { events: this.ev.size, markets: this.mk.size, results: this.rsSlot.size };
  }
}

function isInPlay(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    return (JSON.parse(data) as { inPlay?: unknown } | null)?.inPlay === true;
  } catch {
    return false;
  }
}

// ─── Meta and sync plan ──────────────────────────────────────────────────────

/** `GET /v2/getmeta`: the repository and its slice indexes. */
export interface Meta {
  repositoryId: number;
  baseIndex: number;
  fullIndex: number;
  partialIndex: number;
  upd2fullIndex: number;
  fullPartitions: number;
  cultures: string[];
}

/** Validates the meta like the widget does (`feed-downloader/utils.validateMeta`). */
export function parseMeta(body: unknown): Meta {
  const fail = (why: string): never => {
    throw new ProviderFormatError(`sportswidget getmeta: ${why}`);
  };
  if (typeof body !== 'object' || body === null) fail('not an object');
  const b = body as Record<string, unknown>;
  const int = (k: string, nonZero: boolean) => {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || (nonZero && v === 0)) fail(`${k} is not valid`);
    return v as number;
  };
  const meta: Meta = {
    repositoryId: int('repositoryId', true),
    baseIndex: int('baseIndex', true),
    fullIndex: int('fullIndex', true),
    partialIndex: int('partialIndex', false),
    upd2fullIndex: int('upd2fullIndex', false),
    fullPartitions: int('fullPartitions', true),
    cultures: Array.isArray(b.cultures) ? b.cultures.filter((c): c is string => typeof c === 'string' && c.length > 0) : [],
  };
  if (meta.cultures.length === 0) fail('cultures are not valid');
  if (meta.fullPartitions > MAX_FULL_PARTITIONS) fail(`${meta.fullPartitions} full partitions`);
  if (meta.upd2fullIndex > meta.partialIndex) fail(`upd2fullIndex ${meta.upd2fullIndex} > partialIndex ${meta.partialIndex}`);
  return meta;
}

/** What the model holds: the repository, base and full it was built from, and the last stream index applied. */
export interface Applied {
  repositoryId: number;
  baseIndex: number;
  fullIndex: number;
  index: number;
  /** When the model was last rebuilt (ms). */
  builtAt: number;
}

export interface SliceRef {
  /** Path under `/v2/getslice/`. */
  path: string;
  policy: Policy;
  /** The repository's base slice (kept in memory and re-applied on rebuilds of the same base). */
  base?: boolean;
}

export interface SyncPlan {
  /** Start from an empty model (new full index, base or repository). */
  rebuild: boolean;
  /** The base slice already held can be re-applied (same repository and base index): it is not downloaded. */
  reuseBase: boolean;
  slices: SliceRef[];
  /** Stream index the model is at once the slices are applied. */
  index: number;
}

/** Slice language: `pt` when offered, else the first culture (the widget's `adaptLangCode`). */
const languageOf = (cultures: string[]) => (cultures.map((c) => c.replace(/-/g, '_')).find((c) => c === 'pt') ?? cultures[0]!.replace(/-/g, '_'));

/**
 * Slices to download for `meta`, given what the model holds. A new full index means a rebuild: the changes between
 * the model's last index and the new full are not in the new update-to-full (it starts at the full), and replaying
 * hundreds of partials is not reasonable (the widget itself rebuilds beyond 50).
 */
export function planSync(meta: Meta, applied: Applied | null, nowMs: number): SyncPlan {
  const lang = languageOf(meta.cultures);
  const repo = meta.repositoryId;
  const partial = (i: number): SliceRef => ({ path: `${repo}_1_${lang}_${i}_0.bin`, policy: 'delta' });
  const u2f: SliceRef = { path: `${repo}_3_${lang}_${meta.upd2fullIndex}_0.bin`, policy: 'delta' };
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => partial(from + k));

  const sameBase = applied !== null && applied.repositoryId === repo && applied.baseIndex === meta.baseIndex;
  // A model older than REBUILD_EVERY_MS is rebuilt even on the same full index: it holds markets only up to the horizon
  // it was built with (see SportsRepo).
  if (sameBase && applied.fullIndex === meta.fullIndex && nowMs - applied.builtAt < REBUILD_EVERY_MS) {
    if (meta.partialIndex <= applied.index) return { rebuild: false, reuseBase: true, slices: [], index: applied.index };
    if (meta.partialIndex - applied.index <= MAX_PARTIALS) {
      return { rebuild: false, reuseBase: true, slices: range(applied.index + 1, meta.partialIndex), index: meta.partialIndex };
    }
    if (meta.upd2fullIndex > applied.index) {
      const tail = meta.partialIndex - meta.upd2fullIndex <= MAX_PARTIALS;
      return {
        rebuild: false,
        reuseBase: true,
        slices: [u2f, ...(tail ? range(meta.upd2fullIndex + 1, meta.partialIndex) : [])],
        index: tail ? meta.partialIndex : meta.upd2fullIndex,
      };
    }
    // The stream moved on without a newer update-to-full: rebuild.
  }

  const slices: SliceRef[] = [];
  if (!sameBase) slices.push({ path: `${repo}_8_${lang}_${meta.baseIndex}_0.bin`, policy: 'authoritative', base: true });
  for (let p = 0; p < meta.fullPartitions; p++) slices.push({ path: `${repo}_2_${lang}_${meta.fullIndex}_${p}.bin`, policy: p === 0 ? 'authoritative' : 'snapshot' });
  const hasU2f = meta.upd2fullIndex > meta.fullIndex;
  slices.push(hasU2f ? u2f : { path: `live/${repo}/${lang}.bin`, policy: 'delta' });
  const from = Math.max(meta.upd2fullIndex, meta.fullIndex);
  const tail = meta.partialIndex - from <= MAX_PARTIALS;
  if (tail) slices.push(...range(from + 1, meta.partialIndex));
  return { rebuild: true, reuseBase: sameBase, slices, index: tail ? Math.max(meta.partialIndex, from) : from };
}
