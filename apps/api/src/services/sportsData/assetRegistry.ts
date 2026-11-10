// Team crests and tennis player photos collected from the ESPN payloads we already fetch.
// Stored in two Redis hashes (name → image URL) and served to the app by GET /api/sports/assets,
// so every screen that shows a team or a player can draw its crest/face without extra lookups.

// Loaded lazily so the pure ESPN mappers (and their tests) don't open a Redis connection on import.
function client(): typeof import('../../utils/redis').redis {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('../../utils/redis') as typeof import('../../utils/redis')).redis;
}

const TEAM_KEY = 'sports:assets:teams';
const PLAYER_KEY = 'sports:assets:players';

const ESPN_PLAYER_ID = /\/player\/_\/id\/(\d+)/;

/** ESPN headshot for a tennis athlete id (404s for players without a photo; the app falls back to initials). */
export function espnTennisHeadshot(athleteId: string): string {
  return `https://a.espncdn.com/i/headshots/tennis/players/full/${athleteId}.png`;
}

/** Athlete id from an ESPN tennis competitor's player-card link. */
export function espnAthleteIdFromLinks(links: Array<{ href?: string }> | undefined): string | null {
  for (const l of links ?? []) {
    const m = l.href ? ESPN_PLAYER_ID.exec(l.href) : null;
    if (m) return m[1];
  }
  return null;
}

/** Best-effort: never throws, never blocks the caller. */
export function recordAssets(teams: Record<string, string>, players: Record<string, string>): void {
  try {
    if (Object.keys(teams).length > 0) client().hset(TEAM_KEY, teams).catch(() => {});
    if (Object.keys(players).length > 0) client().hset(PLAYER_KEY, players).catch(() => {});
  } catch { /* no Redis: images are optional */ }
}

export async function getAssets(): Promise<{ teams: Record<string, string>; players: Record<string, string> }> {
  const [teams, players] = await Promise.all([
    client().hgetall(TEAM_KEY).catch(() => ({})),
    client().hgetall(PLAYER_KEY).catch(() => ({})),
  ]);
  return { teams: teams ?? {}, players: players ?? {} };
}
