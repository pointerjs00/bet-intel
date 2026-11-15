export type NotificationRoute =
  | string
  | { pathname: '/jogo/[id]' | '/jogo/nba/[id]' | '/jogo/tenis/[id]'; params: Record<string, string> };

const LIVE_MATCH_NOTIF_TYPES = new Set([
  'GOAL_SCORED', 'HALF_TIME', 'SECOND_HALF_START', 'MATCH_FINISHED', 'RED_CARD', 'MATCH_STARTING',
]);

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Decides where tapping a push notification goes. Live-match notifications open
 * the match when the payload has every param its screen needs; otherwise the
 * boletim (or the notification centre for social ones). Returns null if unknown.
 */
export function notificationRoute(data: Record<string, unknown>): NotificationRoute | null {
  const type = str(data.type);
  const boletinId = str(data.boletinId);
  const boletimRoute = boletinId ? `/boletins/${boletinId}` : null;

  if (type === 'KICKOFF_REMINDER' && boletimRoute) return boletimRoute;

  const matchId = str(data.espnMatchId);
  if (matchId && type && LIVE_MATCH_NOTIF_TYPES.has(type)) {
    const sport = str(data.sport)?.toLowerCase();
    if (sport === 'football') {
      const league = str(data.league);
      if (league) return { pathname: '/jogo/[id]', params: { id: matchId, league } };
    } else if (sport === 'basketball') {
      return { pathname: '/jogo/nba/[id]', params: { id: matchId } };
    } else if (sport === 'tennis') {
      const date = str(data.date);
      if (date) return { pathname: '/jogo/tenis/[id]', params: { id: matchId, date } };
    }
  }

  if (boletimRoute) return boletimRoute;
  if (type === 'FRIEND_REQUEST' || type === 'FRIEND_ACCEPTED') return '/notifications';
  if (data.notificationId) return '/notifications';
  return null;
}
