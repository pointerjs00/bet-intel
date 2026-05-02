// apps/api/src/config/leagueManifest.ts

export const LEAGUE_MANIFEST = [
  // Portuguese (priority — core market)
  { name: 'Primeira Liga', country: 'Portugal', apiFootballId: 94,
    fdOrgCode: 'PPL', fdCoUkCode: 'P1', openfootballCode: 'pt.1',
    hasFreeStandings: true },
  { name: 'Liga Portugal 2', country: 'Portugal', apiFootballId: 95,
    fdOrgCode: null, fdCoUkCode: null, openfootballCode: 'pt.2',
    hasFreeStandings: false },

  // English
  { name: 'Premier League', country: 'England', apiFootballId: 39,
    fdOrgCode: 'PL', fdCoUkCode: 'E0', openfootballCode: 'en.1',
    hasFreeStandings: true },
  { name: 'Championship', country: 'England', apiFootballId: 40,
    fdOrgCode: 'ELC', fdCoUkCode: 'E1', openfootballCode: 'en.2',
    hasFreeStandings: true },

  // Spanish
  { name: 'La Liga', country: 'Spain', apiFootballId: 140,
    fdOrgCode: 'PD', fdCoUkCode: 'SP1', openfootballCode: 'es.1',
    hasFreeStandings: true },
  { name: 'La Liga 2', country: 'Spain', apiFootballId: 141,
    fdOrgCode: null, fdCoUkCode: 'SP2', openfootballCode: 'es.2',
    hasFreeStandings: false },

  // German
  { name: 'Bundesliga', country: 'Germany', apiFootballId: 78,
    fdOrgCode: 'BL1', fdCoUkCode: 'D1', openfootballCode: 'de.1',
    hasFreeStandings: true },
  { name: '2. Bundesliga', country: 'Germany', apiFootballId: 79,
    fdOrgCode: null, fdCoUkCode: 'D2', openfootballCode: 'de.2',
    hasFreeStandings: false },

  // Italian
  { name: 'Serie A', country: 'Italy', apiFootballId: 135,
    fdOrgCode: 'SA', fdCoUkCode: 'I1', openfootballCode: 'it.1',
    hasFreeStandings: true },
  { name: 'Serie B', country: 'Italy', apiFootballId: 136,
    fdOrgCode: null, fdCoUkCode: 'I2', openfootballCode: 'it.2',
    hasFreeStandings: false },

  // French
  { name: 'Ligue 1', country: 'France', apiFootballId: 61,
    fdOrgCode: 'FL1', fdCoUkCode: 'F1', openfootballCode: 'fr.1',
    hasFreeStandings: true },
  { name: 'Ligue 2', country: 'France', apiFootballId: 62,
    fdOrgCode: null, fdCoUkCode: 'F2', openfootballCode: 'fr.2',
    hasFreeStandings: false },

  // Dutch
  { name: 'Eredivisie', country: 'Netherlands', apiFootballId: 88,
    fdOrgCode: 'DED', fdCoUkCode: 'N1', openfootballCode: 'nl.1',
    hasFreeStandings: true },

  // European
  { name: 'UEFA Champions League', country: 'Europe', apiFootballId: 2,
    fdOrgCode: 'CL', fdCoUkCode: null, openfootballCode: 'cl',
    hasFreeStandings: true },
  { name: 'UEFA Europa League', country: 'Europe', apiFootballId: 3,
    fdOrgCode: null, fdCoUkCode: null, openfootballCode: 'el',
    hasFreeStandings: false },
] as const;

export type LeagueConfig = typeof LEAGUE_MANIFEST[number];

export const LEAGUE_BY_API_FOOTBALL_ID: Record<number, LeagueConfig> = Object.fromEntries(
  LEAGUE_MANIFEST.map(l => [l.apiFootballId, l])
);

export const LEAGUE_BY_FDCOUK_CODE: Record<string, LeagueConfig> = Object.fromEntries(
  LEAGUE_MANIFEST.filter(l => l.fdCoUkCode !== null).map(l => [l.fdCoUkCode!, l])
);
