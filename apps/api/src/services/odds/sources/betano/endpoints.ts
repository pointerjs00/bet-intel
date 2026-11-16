import { ORIGIN, SITE_API, LIVE_API } from './profile';

export const todayShell = (sportSlug: string) => `${SITE_API}/sport/${sportSlug}/jogos-de-hoje/?req=s,stnf,c,mb`;
export const trendingLeagues = (sportCode: string) => `${SITE_API}/sports/${sportCode}/hot/trending/leagues`;
export const leagueEvents = (sportCode: string, leagueId: string) =>
  `${SITE_API}/sports/${sportCode}/hot/trending/leagues/${leagueId}/events`;
/** Betano's own calendar path; `{sportId}` is the code (`FOOT`), not a number. */
export const calendarPath = (sportCode: string) => `${SITE_API}/sports/upcoming/calendar/${sportCode}/`;
export const liveOverview =
  `${LIVE_API}/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=7`;
export const eventPage = (slug: string, eventId: string) => `${ORIGIN}/odds/${slug}/${eventId}/`;

export const SPORT: Record<'FOOTBALL' | 'BASKETBALL' | 'TENNIS', { code: string; slug: string }> = {
  FOOTBALL: { code: 'FOOT', slug: 'futebol' },
  BASKETBALL: { code: 'BASK', slug: 'basquetebol' },
  TENNIS: { code: 'TENN', slug: 'tenis' },
};
