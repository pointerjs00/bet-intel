import { create } from 'zustand';
import { apiClient } from '../services/apiClient';

/** Normalises a team/player name for lookups ("SL Benfica" → "sl benfica", accents stripped). */
export function assetKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

// Words that don't identify a club ("FC Porto" and "Porto" are the same team).
const GENERIC = new Set(['fc', 'sc', 'sl', 'cd', 'cf', 'ac', 'afc', 'sad', 'de', 'da', 'do', 'the', 'sk', 'bk', 'fk', 'ssc', 'as', 'us', 'cp', 'ud', 'rc', 'rcd', 'vfb', 'vfl', 'tsg', 'sv', 'club', 'clube', 'futebol', 'football', 'calcio']);

function tokens(name: string): string[] {
  return assetKey(name).split(' ').filter((t) => t.length >= 3 && !GENERIC.has(t));
}

/** Last name of a player ("Jannik Sinner" / "J. Sinner" → "sinner"), used when only an initial is stored. */
function surnameKey(name: string): string {
  const parts = assetKey(name).split(' ');
  return parts[parts.length - 1] ?? '';
}

interface Index {
  exact: Map<string, string>;
  /** Significant word → URLs of every name containing it. */
  byToken: Map<string, Set<string>>;
  /** URL → the significant words of its names. */
  tokensOf: Map<string, Set<string>>;
}

function buildIndex(entries: Record<string, string>): Index {
  const idx: Index = { exact: new Map(), byToken: new Map(), tokensOf: new Map() };
  for (const [name, url] of Object.entries(entries)) {
    idx.exact.set(assetKey(name), url);
    const ts = tokens(name);
    const own = idx.tokensOf.get(url) ?? new Set<string>();
    for (const t of ts) {
      own.add(t);
      idx.byToken.set(t, (idx.byToken.get(t) ?? new Set()).add(url));
    }
    idx.tokensOf.set(url, own);
  }
  return idx;
}

/**
 * Exact name first; otherwise the single image whose names contain every significant word of
 * the query ("SL Benfica" → "Benfica", "Lakers" → "Los Angeles Lakers"). Ambiguous → null.
 */
function findIn(idx: Index, name: string): string | null {
  const exact = idx.exact.get(assetKey(name));
  if (exact) return exact;
  const ts = tokens(name);
  if (ts.length === 0) return null;
  let candidates: string[] | null = null;
  for (const t of ts) {
    const urls = idx.byToken.get(t);
    if (!urls) return null;
    candidates = candidates === null ? [...urls] : candidates.filter((u: string) => urls.has(u));
    if (candidates.length === 0) return null;
  }
  return candidates && candidates.length === 1 ? candidates[0]! : null;
}

interface SportAssetsState {
  teams: Index;
  players: Index;
  playersBySurname: Map<string, string>;
  loaded: boolean;
  load: () => Promise<void>;
}

const EMPTY: Index = { exact: new Map(), byToken: new Map(), tokensOf: new Map() };

/**
 * Crest and player-photo URLs collected by the API from ESPN / WTA / Wikipedia (GET /sports/assets).
 * Loaded once per session; TeamBadge reads it before its static maps.
 */
export const useSportAssetsStore = create<SportAssetsState>((set, get) => ({
  teams: EMPTY,
  players: EMPTY,
  playersBySurname: new Map(),
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const res = await apiClient.get<{ data: { teams: Record<string, string>; players: Record<string, string> } }>('/sports/assets');
      const playersBySurname = new Map<string, string>();
      for (const [n, u] of Object.entries(res.data.data.players)) {
        const s = surnameKey(n);
        // Ambiguous surnames (two players named "Cerundolo") are dropped rather than guessed.
        playersBySurname.set(s, playersBySurname.has(s) ? '' : u);
      }
      set({ teams: buildIndex(res.data.data.teams), players: buildIndex(res.data.data.players), playersBySurname, loaded: true });
    } catch {
      // Images are optional; the badges fall back to static maps and initials.
    }
  },
}));

/** Remote image for a team or player name, or null. */
export function lookupSportAsset(
  state: Pick<SportAssetsState, 'teams' | 'players' | 'playersBySurname'>,
  name: string,
  kind: 'team' | 'player' | 'auto',
): string | null {
  if (!name) return null;
  if (kind !== 'player') {
    const t = findIn(state.teams, name);
    if (t) return t;
  }
  if (kind !== 'team') {
    const p = state.players.exact.get(assetKey(name)) ?? (state.playersBySurname.get(surnameKey(name)) || null);
    if (p) return p;
  }
  return null;
}
