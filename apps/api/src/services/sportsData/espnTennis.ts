// ESPN public site API adapter for tennis (ATP and WTA: 250, 500, 1000/Masters, Grand Slams).
//   https://site.api.espn.com/apis/site/v2/sports/tennis/{atp|wta}/scoreboard?dates=YYYYMMDD
// ESPN only gives set scores (no live points, no per-match stats). See ESTUDO_FONTES_DADOS.md.

import type { TennisResult, TennisSet } from '../tennisMarketEngine';
import { espnAthleteIdFromLinks, espnTennisHeadshot, recordAssets } from './assetRegistry';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/tennis';

export type TennisStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'RETIRED' | 'WALKOVER' | 'CANCELLED' | 'POSTPONED' | 'SUSPENDED';

export interface TennisMatch {
  provider: 'espn';
  providerMatchId: string;
  tour: 'atp' | 'wta';
  tournament: { providerId: string; name: string };
  round: string;
  startAt: string;
  status: TennisStatus;
  statusDetail: string;
  doubles: boolean;
  playerA: string;
  playerB: string;
  sets: TennisSet[];
  winner: 'A' | 'B' | null;
}

interface EspnCompetitor {
  homeAway?: string;
  order?: number;
  winner?: boolean;
  athlete?: { displayName?: string; links?: Array<{ href?: string }> };
  roster?: { athletes?: Array<{ displayName?: string }> };
  linescores?: Array<{ value?: number }>;
}
interface EspnTennisCompetition {
  id?: string;
  date?: string;
  round?: { displayName?: string };
  type?: { slug?: string; text?: string };
  status?: { type?: { name?: string; state?: string; completed?: boolean; shortDetail?: string } };
  competitors?: EspnCompetitor[];
}
interface EspnTennisScoreboard {
  events?: Array<{ id?: string; name?: string; groupings?: Array<{ grouping?: { displayName?: string }; competitions?: EspnTennisCompetition[] }> }>;
}

export function mapEspnTennisStatus(t: { name?: string; state?: string; completed?: boolean } | undefined): TennisStatus {
  const name = t?.name ?? '';
  if (/RETIRED/.test(name)) return 'RETIRED';
  if (/WALKOVER|W\/O/.test(name)) return 'WALKOVER';
  if (/CANCEL/.test(name)) return 'CANCELLED';
  if (/POSTPONED/.test(name)) return 'POSTPONED';
  if (/SUSPENDED|DELAYED/.test(name)) return 'SUSPENDED';
  if (t?.state === 'in') return 'LIVE';
  if (t?.state === 'post') return t.completed === false ? 'SUSPENDED' : 'FINISHED';
  return 'SCHEDULED';
}

function nameOf(c: EspnCompetitor | undefined): string {
  if (!c) return '';
  if (c.athlete?.displayName) return c.athlete.displayName;
  return (c.roster?.athletes ?? []).map((a) => a.displayName).filter(Boolean).join(' / ');
}

export function mapEspnTennisScoreboard(json: EspnTennisScoreboard, tour: 'atp' | 'wta'): TennisMatch[] {
  const out: TennisMatch[] = [];
  for (const ev of json.events ?? []) {
    for (const g of ev.groupings ?? []) {
      const doubles = /doubles/i.test(g.grouping?.displayName ?? '');
      for (const c of g.competitions ?? []) {
        if (!c.id) continue;
        const a = c.competitors?.find((x) => x.homeAway === 'home') ?? c.competitors?.[0];
        const b = c.competitors?.find((x) => x.homeAway === 'away') ?? c.competitors?.[1];
        const la = a?.linescores ?? [];
        const lb = b?.linescores ?? [];
        const sets: TennisSet[] = la.map((s, i) => ({ a: s.value ?? 0, b: lb[i]?.value ?? 0 })).filter((s) => s.a + s.b > 0);
        out.push({
          provider: 'espn',
          providerMatchId: c.id,
          tour,
          tournament: { providerId: ev.id ?? '', name: ev.name ?? '' },
          round: c.round?.displayName ?? '',
          startAt: new Date(c.date ?? '').toISOString(),
          status: mapEspnTennisStatus(c.status?.type),
          statusDetail: c.status?.type?.shortDetail ?? '',
          doubles,
          playerA: nameOf(a),
          playerB: nameOf(b),
          sets,
          winner: a?.winner ? 'A' : b?.winner ? 'B' : null,
        });
      }
    }
  }
  return out;
}

export async function fetchEspnTennisDay(tour: 'atp' | 'wta', date: string): Promise<TennisMatch[]> {
  const res = await fetch(`${BASE}/${tour}/scoreboard?dates=${date.replace(/-/g, '')}`, {
    headers: { 'User-Agent': 'BetIntel/1.0 (personal use)', Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ESPN tennis ${res.status}`);
  const json = (await res.json()) as EspnTennisScoreboard;
  const photos: Record<string, string> = {};
  for (const ev of json.events ?? []) {
    for (const g of ev.groupings ?? []) {
      for (const c of g.competitions ?? []) {
        for (const p of c.competitors ?? []) {
          const id = espnAthleteIdFromLinks(p.athlete?.links);
          if (p.athlete?.displayName && id) photos[p.athlete.displayName] = espnTennisHeadshot(id);
        }
      }
    }
  }
  recordAssets({}, photos);
  return mapEspnTennisScoreboard(json, tour);
}

/** Engine input for a match that ended (or null while it is still to be played/in play). */
export function toTennisResult(m: TennisMatch): TennisResult | null {
  if (m.status === 'FINISHED' || m.status === 'RETIRED' || m.status === 'WALKOVER' || m.status === 'CANCELLED') {
    return { status: m.status, sets: m.sets, winner: m.winner };
  }
  return null;
}
