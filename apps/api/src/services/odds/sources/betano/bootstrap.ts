/* eslint-disable @typescript-eslint/no-explicit-any -- Betano JSON is untyped external data; `any` is confined to this boundary. */
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { calendarPath, todayShell, trendingLeagues } from './endpoints';
import { ORIGIN } from './profile';
import type { BetanoSession } from './session';

export interface Bootstrap {
  calendar: string;
  /** League ids the shell itself advertised (may be empty). */
  leagueIds: string[];
  /** Lazily fetches the trending leagues; only call when the calendar yielded nothing. */
  trendingLeagueIds(): Promise<string[]>;
}

const abs = (u: string) => (u.startsWith('http') ? u : new URL(u, ORIGIN).toString());

/**
 * Reads the page shell and extracts the calendar and trending-league URLs it advertises, so an
 * endpoint rename does not need a release here. A shell with none of them is a format problem.
 */
export async function readBootstrap(session: BetanoSession, sportCode: string, sportSlug: string): Promise<Bootstrap> {
  const res = await session.request(todayShell(sportSlug));
  if (res.status !== 200) throw new ProviderFormatError(`Betano shell ${sportSlug}: HTTP ${res.status}`);

  let body: any; // external JSON boundary
  try {
    body = JSON.parse(res.text);
  } catch {
    throw new ProviderFormatError(`Betano shell ${sportSlug}: JSON inválido`);
  }

  const data = body?.data ?? {};
  const urls: string[] = [];
  for (const segment of data.segments ?? []) {
    for (const component of segment.components ?? []) if (component?.url) urls.push(String(component.url));
  }
  const declared = typeof data.calendarDataUrl === 'string' ? data.calendarDataUrl : null;
  const fromPayload = urls.find((u) => u.includes('/upcoming/calendar/')) ?? calendarPath(sportCode);
  const calendar = abs((declared ?? fromPayload).replace('{sportId}', sportCode));

  const leagueIds: string[] = [];
  for (const u of urls) {
    const m = u.match(/\/hot\/trending\/leagues\/(\d+)\/events/);
    if (m) leagueIds.push(m[1]!);
  }
  const trendingLeagueIds = async (): Promise<string[]> => {
    const ids: string[] = [];
    const leagues = await session.request(abs(trendingLeagues(sportCode)));
    if (leagues.status === 200) {
      try {
        for (const l of JSON.parse(leagues.text)?.data ?? []) if (l?.id != null) ids.push(String(l.id));
      } catch {
        /* the caller treats an empty list as no events */
      }
    }
    return ids;
  };
  return { calendar, leagueIds, trendingLeagueIds };
}
