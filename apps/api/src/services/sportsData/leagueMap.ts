// Maps the competition names stored on boletim items to ESPN league slugs (tracker and result lookup).

import { ESPN_FOOTBALL_LEAGUES } from './espnFootball';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Maps a competition name as stored on a boletim item to an ESPN league slug. */
export function espnLeagueFor(competition: string): string | null {
  const c = norm(competition);
  if (/\b(2\.?|ii)\b|liga 2|segunda|serie b|ligue 2|championship|primera rfef/.test(c)) return null;
  if (/liga portugal|primeira liga|liga betclic/.test(c)) return 'por.1';
  if (/premier league/.test(c) && !/russian|scottish|ukrain/.test(c)) return 'eng.1';
  if (/^la ?liga|laliga/.test(c)) return 'esp.1';
  if (/^bundesliga/.test(c)) return 'ger.1';
  if (/^serie a$|serie a italia|italian serie a/.test(c)) return 'ita.1';
  if (/^ligue 1/.test(c)) return 'fra.1';
  if (/eredivisie/.test(c)) return 'ned.1';
  if (/super lig/.test(c)) return 'tur.1';
  if (/champions league|liga dos campeoes/.test(c)) return 'uefa.champions';
  if (/europa league|liga europa/.test(c)) return 'uefa.europa';
  if (/conference league|liga conferencia/.test(c)) return 'uefa.europa.conf';
  // National teams
  if (/nations league|liga das nacoes/.test(c)) return 'uefa.nations';
  if (/amigav|friendl/.test(c) && !/club|clube/.test(c)) return 'fifa.friendly';
  if (/(mundial|world cup|campeonato do mundo)/.test(c)) {
    if (/qualif|apuramento/.test(c)) return /conmebol|sul.?americ/.test(c) ? 'fifa.worldq.conmebol' : 'fifa.worldq.uefa';
    return 'fifa.world';
  }
  if (/euro/.test(c) && !/europa/.test(c)) return /qualif|apuramento/.test(c) ? 'uefa.euroq' : 'uefa.euro';
  if (/copa america/.test(c)) return 'conmebol.america';
  const exact = ESPN_FOOTBALL_LEAGUES[competition];
  return exact ?? null;
}
