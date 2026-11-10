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

/** Last name of a player ("Jannik Sinner" / "J. Sinner" → "sinner"), used when only an initial is stored. */
function surnameKey(name: string): string {
  const parts = assetKey(name).split(' ');
  return parts[parts.length - 1] ?? '';
}

interface SportAssetsState {
  teams: Map<string, string>;
  players: Map<string, string>;
  playersBySurname: Map<string, string>;
  loaded: boolean;
  load: () => Promise<void>;
}

/**
 * Crest and player-photo URLs collected by the API from ESPN (GET /sports/assets).
 * Loaded once per session; TeamBadge reads it before its static maps.
 */
export const useSportAssetsStore = create<SportAssetsState>((set, get) => ({
  teams: new Map(),
  players: new Map(),
  playersBySurname: new Map(),
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const res = await apiClient.get<{ data: { teams: Record<string, string>; players: Record<string, string> } }>('/sports/assets');
      const teams = new Map<string, string>();
      const players = new Map<string, string>();
      const playersBySurname = new Map<string, string>();
      for (const [n, u] of Object.entries(res.data.data.teams)) teams.set(assetKey(n), u);
      for (const [n, u] of Object.entries(res.data.data.players)) {
        players.set(assetKey(n), u);
        const s = surnameKey(n);
        // Ambiguous surnames (two players named "Cerundolo") are dropped rather than guessed.
        if (playersBySurname.has(s)) playersBySurname.set(s, '');
        else playersBySurname.set(s, u);
      }
      set({ teams, players, playersBySurname, loaded: true });
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
  const key = assetKey(name);
  if (kind !== 'player') {
    const t = state.teams.get(key);
    if (t) return t;
  }
  if (kind !== 'team') {
    const p = state.players.get(key) ?? (state.playersBySurname.get(surnameKey(name)) || undefined);
    if (p) return p;
  }
  return null;
}
