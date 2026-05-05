// apps/api/src/config/leagueManifest.ts

export const LEAGUE_MANIFEST = [
  // Portuguese (priority — core market)
  { name: 'Primeira Liga',     country: 'Portugal',     apiFootballId: 94,  fdCoUkCode: 'P'   },
  { name: 'Liga Portugal 2',   country: 'Portugal',     apiFootballId: 95,  fdCoUkCode: null  },

  // English
  { name: 'Premier League',   country: 'England',      apiFootballId: 39,  fdCoUkCode: 'E0'  },
  { name: 'Championship',     country: 'England',      apiFootballId: 40,  fdCoUkCode: 'E1'  },

  // Spanish
  { name: 'La Liga',          country: 'Spain',        apiFootballId: 140, fdCoUkCode: 'SP1' },
  { name: 'La Liga 2',        country: 'Spain',        apiFootballId: 141, fdCoUkCode: 'SP2' },

  // German
  { name: 'Bundesliga',       country: 'Germany',      apiFootballId: 78,  fdCoUkCode: 'D1'  },
  { name: '2. Bundesliga',    country: 'Germany',      apiFootballId: 79,  fdCoUkCode: 'D2'  },

  // Italian
  { name: 'Serie A',          country: 'Italy',        apiFootballId: 135, fdCoUkCode: 'I1'  },
  { name: 'Serie B',          country: 'Italy',        apiFootballId: 136, fdCoUkCode: 'I2'  },

  // French
  { name: 'Ligue 1',          country: 'France',       apiFootballId: 61,  fdCoUkCode: 'F1'  },
  { name: 'Ligue 2',          country: 'France',       apiFootballId: 62,  fdCoUkCode: 'F2'  },

  // Dutch
  { name: 'Eredivisie',       country: 'Netherlands',  apiFootballId: 88,  fdCoUkCode: 'N1'  },

  // Turkish
  { name: 'Süper Lig', country: 'Turkey', apiFootballId: 203, fdCoUkCode: null },

  // European
  { name: 'UEFA Champions League', country: 'Europe',  apiFootballId: 2,   fdCoUkCode: null  },
  { name: 'UEFA Europa League',    country: 'Europe',  apiFootballId: 3,   fdCoUkCode: null  },
] as const;

export type LeagueConfig = typeof LEAGUE_MANIFEST[number];

export const LEAGUE_BY_API_FOOTBALL_ID: Record<number, LeagueConfig> = Object.fromEntries(
  LEAGUE_MANIFEST.map(l => [l.apiFootballId, l])
);

export const LEAGUE_BY_FDCOUK_CODE: Record<string, LeagueConfig> = Object.fromEntries(
  LEAGUE_MANIFEST.filter(l => l.fdCoUkCode !== null).map(l => [l.fdCoUkCode!, l])
);
