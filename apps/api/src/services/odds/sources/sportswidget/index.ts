/**
 * Placard and Solverde `OddsSource`: both run the same widget ("dbx" sportsbook with the pt-vision data engine),
 * each with its own CDN, repository and odds. One adapter, two hosts; each house has its own state.
 *
 * The widget does not subscribe to anything: it replicates the house's whole catalogue (every event, market and price)
 * as a binary columnar database downloaded by plain GETs from the CDN (study: docs/analise-2026-11/odds/placard.md):
 *   `GET /v2/getmeta` → indexes; `GET /v2/getslice/{repo}_{type}_pt_{index}_{partition}.bin` → LZMA slices (base 8,
 *   full 2 × 5 partitions, update-to-full 3, partials 1), decoded with the house's own `/library/lzma.wasm`.
 * The Socket.IO channel only announces new indexes; `getmeta` is enough for a 10-minute calendar.
 *
 * Sync (at most once per SYNC_TTL_MS; `listEvents` / `getMarkets` read the in-memory model): first time base + full
 * + update-to-full + the last partial (≈ 10 requests, ≈ 2 MB). Then, on the same full index, only the missing partials
 * or the new update-to-full; on a new full index (about every 10 minutes) a rebuild from the full partitions, with the
 * base kept in memory (`repo.ts`, `planSync`). A rebuild is made on a new model and swapped in only when complete.
 *
 * Pacing and blocking: requests are serialised and ≥ REQUEST_GAP_MS apart per house. A 429/403 or an HTML answer
 * (possible anti-bot page) aborts the sync and the house then fails fast, with no request at all, for BLOCK_MS.
 * It is never something to get around. A changed format is a `ProviderFormatError`.
 *
 * The I/O takes injectable `fetch`/`sleep`/`now`/`loadDecoder`, so tests run on synthetic slices without the wasm.
 * Health is recorded by the odds service around every call.
 */
import { logger } from '../../../../utils/logger';
import { BlockError, ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { loadLzma, type Decode } from './lzma';
import { mapEvent, mapMarkets } from './map';
import { readMemory } from './memory';
import { MARKET_HORIZON_MS, SportsRepo, parseMeta, planSync, type Applied, type SliceRef } from './repo';

export type SportsWidgetHouse = 'placard' | 'solverde';

/** CDN and site origin of each house (the CDN answers with `Access-Control-Allow-Origin` for that origin). */
export const HOSTS: Record<SportsWidgetHouse, { cdn: string; origin: string }> = {
  placard: { cdn: 'https://sportswidget-cdn.placard.pt', origin: 'https://www.placard.pt' },
  solverde: { cdn: 'https://sportswidget-cdn.solverde.pt', origin: 'https://www.solverde.pt' },
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Spacing between two requests to one house (the study ran at ≥ 2 s; the slices are served by the CDN cache). */
export const REQUEST_GAP_MS = 1000;
/** The model is synced at most this often; calls in between read it as it is. */
export const SYNC_TTL_MS = 5 * 60_000;
/** After a 429/403/HTML answer the house makes no request for this long. */
export const BLOCK_MS = 10 * 60_000;
/** A live event that started this long before `from` is still listed. */
export const LIVE_LOOKBACK_MS = 6 * 3_600_000;
const TIMEOUT_MS = 60_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SportsWidgetDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  /** Compiles the house's wasm into a factory of decoders (default: `loadLzma`). */
  loadDecoder?: (wasm: Uint8Array) => () => Decode;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** HTTP status error. */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** The house is in its fail-fast period; nothing was sent. */
class BlockedError extends Error {}

const isBlock = (err: unknown): boolean =>
  (err instanceof HttpError && (err.status === 429 || err.status === 403)) || err instanceof BlockError;

const looksLikeHtml = (bytes: Uint8Array): boolean => /^\s*</.test(new TextDecoder().decode(bytes.subarray(0, 64)));

interface Model {
  repo: SportsRepo;
  applied: Applied;
  syncedAt: number;
}

/** Builds the adapter of one house, with its own model, pacing and block state. */
export function createSportsWidgetSource(house: SportsWidgetHouse, deps: SportsWidgetDeps = {}): OddsSource {
  const { cdn, origin } = HOSTS[house];
  const name = house === 'placard' ? 'Placard' : 'Solverde';
  const doFetch = deps.fetch ?? (fetch as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const loadDecoder = deps.loadDecoder ?? loadLzma;

  let blockedUntil = 0;
  let gate: Promise<void> = Promise.resolve();
  let started = false;
  const blockedMessage = (what: string) => `${name} ${what}: skipped, blocked until ${new Date(blockedUntil).toISOString()}`;

  /** Runs one request at a time (the turn lasts until its body is read) and keeps ≥ REQUEST_GAP_MS between them. */
  async function turn<T>(what: string, fn: () => Promise<T>): Promise<T> {
    const previous = gate;
    let release!: () => void;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (now() < blockedUntil) throw new BlockedError(blockedMessage(what));
      if (started) await sleep(REQUEST_GAP_MS);
      started = true;
      if (now() < blockedUntil) throw new BlockedError(blockedMessage(what));
      return await fn();
    } finally {
      release();
    }
  }

  /** One paced GET returning the body bytes; HTML (possible anti-bot page) and 429/403 start the block. */
  async function get(path: string, what: string, accept: string): Promise<Uint8Array> {
    return turn(what, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
      try {
        const res = await doFetch(`${cdn}${path}`, {
          method: 'GET',
          headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'pt-PT,pt;q=0.9', origin, referer: `${origin}/` },
          signal: controller.signal,
        });
        if (!res.ok) throw new HttpError(res.status, `${name} ${what}: HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (/text\/html/i.test(res.headers.get('content-type') ?? '') || looksLikeHtml(bytes)) {
          throw new BlockError(`${name} ${what}: HTML page instead of data (possible challenge)`);
        }
        return bytes;
      } catch (err) {
        if (controller.signal.aborted) throw new Error(`${name} ${what}: timeout`);
        if (isBlock(err)) blockedUntil = now() + BLOCK_MS;
        throw err;
      } finally {
        clearTimeout(timer);
      }
    });
  }

  let decoders: Promise<() => Decode> | null = null;
  /** The house's lzma.wasm, downloaded and compiled once (again only after a failure). */
  function getDecoders(): Promise<() => Decode> {
    decoders ??= get('/library/lzma.wasm', 'lzma.wasm', 'application/wasm,*/*').then(loadDecoder);
    decoders.catch(() => {
      decoders = null;
    });
    return decoders;
  }

  let model: Model | null = null;
  /** Compressed base slice of the model's repository (constant per repository and base index). */
  let baseBytes: Uint8Array | null = null;
  let pending: Promise<SportsRepo> | null = null;

  async function sync(): Promise<SportsRepo> {
    const meta = parseMeta(parseJson(await get('/v2/getmeta', 'getmeta', 'application/json'), `${name} getmeta`));
    const t = now();
    const plan = planSync(meta, model && baseBytes ? model.applied : null, t);
    if (plan.slices.length === 0 && model) {
      model.syncedAt = t;
      return model.repo;
    }
    const newDecoder = await getDecoders();
    const decode = newDecoder(); // a fresh wasm memory per sync, released with it
    const repo = plan.rebuild ? new SportsRepo((t + MARKET_HORIZON_MS) / 1000) : model!.repo;
    const apply = (bytes: Uint8Array, slice: SliceRef) => repo.apply(readMemory(decode(bytes)), slice.policy);
    let requests = 1;
    let bytesIn = 0;
    if (plan.rebuild && plan.reuseBase) apply(baseBytes!, { path: 'base', policy: 'authoritative' });
    for (const slice of plan.slices) {
      const bytes = await get(`/v2/getslice/${slice.path}`, `slice ${slice.path}`, '*/*');
      requests++;
      bytesIn += bytes.length;
      apply(bytes, slice);
      if (/_8_/.test(slice.path)) baseBytes = bytes;
    }
    repo.finishSync(now());
    model = {
      repo,
      applied: {
        repositoryId: meta.repositoryId,
        baseIndex: meta.baseIndex,
        fullIndex: meta.fullIndex,
        index: plan.index,
        builtAt: plan.rebuild ? t : model!.applied.builtAt,
      },
      syncedAt: now(),
    };
    const size = repo.size();
    logger.info(`[odds] ${name} feed ${plan.rebuild ? 'rebuilt' : 'updated'}: ${requests} requests, ${(bytesIn / 1e6).toFixed(2)} MB`, {
      fullIndex: meta.fullIndex,
      index: plan.index,
      ...size,
    });
    return repo;
  }

  /** The model, synced when older than SYNC_TTL_MS; concurrent callers share one sync. */
  function current(what: string): Promise<SportsRepo> {
    if (now() < blockedUntil) return Promise.reject(new BlockedError(blockedMessage(what)));
    if (model && now() - model.syncedAt < SYNC_TTL_MS) return Promise.resolve(model.repo);
    pending ??= sync().finally(() => {
      pending = null;
    });
    return pending;
  }

  async function listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const repo = await current(`${sport} calendar`);
    const out: SourceEvent[] = [];
    for (const e of repo.eventsOf(sport)) {
      const ev = mapEvent(repo, e, house);
      if (!ev) continue;
      const t = Date.parse(ev.startsAt);
      if (t > to || (t < from && !(ev.live && t >= from - LIVE_LOOKBACK_MS))) continue;
      out.push(ev);
    }
    return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.houseEventId.localeCompare(b.houseEventId));
  }

  async function getMarkets(houseEventId: string): Promise<SourceMarket[]> {
    if (!/^\d+$/.test(houseEventId)) throw new ProviderFormatError(`${name}: bad event id ${houseEventId}`);
    const repo = await current(`event ${houseEventId}`);
    return mapMarkets(repo, Number(houseEventId));
  }

  return { house, listEvents, getMarkets };
}

function parseJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ProviderFormatError(`${what}: response is not JSON`);
  }
}

const shared = new Map<SportsWidgetHouse, OddsSource>();

/**
 * Production instance of a house: one per process, so the catalogue job (which builds its sources on every run) and
 * the API share one model, one request pacing and one block state per house. Placard and Solverde never share state.
 */
export function sharedSportsWidgetSource(house: SportsWidgetHouse): OddsSource {
  let src = shared.get(house);
  if (!src) shared.set(house, (src = createSportsWidgetSource(house)));
  return src;
}
