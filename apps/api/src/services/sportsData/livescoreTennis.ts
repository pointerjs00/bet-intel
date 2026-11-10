// LiveScore public API — live tennis points (plan #59). ESPN only has set scores; LiveScore adds
// the points of the game in progress and who is serving (see ESTUDO_FONTES_DADOS.md).
// Endpoint: GET https://prod-public-api.livescore.com/v1/api/app/live/tennis/0?MD=1 (no key).

const LIVE_URL = 'https://prod-public-api.livescore.com/v1/api/app/live/tennis/0?MD=1';

interface LsPlayer { Nm?: string }
interface LsEvent {
  Eid?: string;
  T1?: LsPlayer[];
  T2?: LsPlayer[];
  Tr1G?: string;
  Tr2G?: string;
  Esrv?: number;
  [setKey: string]: unknown;
}
interface LsResponse { Stages?: Array<{ Events?: LsEvent[] }> }

/** Live state of one tennis match from LiveScore. */
export interface LiveTennisPoints {
  playerA: string;
  playerB: string;
  /** Points of the game in progress, e.g. "40" / "AD"; null between games. */
  pointsA: string | null;
  pointsB: string | null;
  server: 'A' | 'B' | null;
  /** Games per set, oldest first. */
  sets: Array<{ a: number; b: number }>;
}

function names(players: LsPlayer[] | undefined): string {
  return (players ?? []).map((p) => p.Nm ?? '').filter(Boolean).join(' / ');
}

/** Maps the raw LiveScore response (exported for tests). */
export function mapLiveScoreTennis(json: LsResponse): LiveTennisPoints[] {
  const out: LiveTennisPoints[] = [];
  for (const stage of json.Stages ?? []) {
    for (const e of stage.Events ?? []) {
      const sets: Array<{ a: number; b: number }> = [];
      for (let i = 1; i <= 5; i++) {
        const a = e[`Tr1S${i}`];
        const b = e[`Tr2S${i}`];
        if (a === undefined || b === undefined) break;
        sets.push({ a: Number(a), b: Number(b) });
      }
      out.push({
        playerA: names(e.T1),
        playerB: names(e.T2),
        pointsA: e.Tr1G ?? null,
        pointsB: e.Tr2G ?? null,
        server: e.Esrv === 1 ? 'A' : e.Esrv === 2 ? 'B' : null,
        sets,
      });
    }
  }
  return out;
}

/** All live tennis matches with points; empty list on any error (it is only an enrichment). */
export async function fetchLiveTennisPoints(): Promise<LiveTennisPoints[]> {
  try {
    const res = await fetch(LIVE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    return mapLiveScoreTennis((await res.json()) as LsResponse);
  } catch {
    return [];
  }
}

function surname(name: string): string {
  const parts = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s/-]/g, ' ').split('/')[0]!.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/**
 * Finds the LiveScore entry for an ESPN match by player surnames (either order).
 * Returns the points oriented to the ESPN player order.
 */
export function findLivePoints(list: LiveTennisPoints[], playerA: string, playerB: string): LiveTennisPoints | null {
  const a = surname(playerA);
  const b = surname(playerB);
  if (!a || !b) return null;
  for (const m of list) {
    const ma = surname(m.playerA);
    const mb = surname(m.playerB);
    if (ma === a && mb === b) return m;
    if (ma === b && mb === a) {
      return {
        playerA: m.playerB, playerB: m.playerA, pointsA: m.pointsB, pointsB: m.pointsA,
        server: m.server === 'A' ? 'B' : m.server === 'B' ? 'A' : null,
        sets: m.sets.map((s) => ({ a: s.b, b: s.a })),
      };
    }
  }
  return null;
}
