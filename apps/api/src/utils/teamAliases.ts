// apps/api/src/utils/teamAliases.ts
// Keys and values are normalised (lowercase, no diacritics, no punctuation).
// Add new entries whenever linkMatchStats.ts reports unmatched clubs.

export const TEAM_ALIASES: Record<string, string> = {
  // Portuguese
  'sl benfica':              'benfica',
  'sport lisboa e benfica':  'benfica',
  'cf os belenenses':        'belenenses',
  'fc pacos de ferreira':    'pacos de ferreira',
  'gil vicente fc':          'gil vicente',
  // English
  'manchester united':       'man united',
  'manchester city':         'man city',
  'tottenham hotspur':       'tottenham',
  'spurs':                   'tottenham',
  'newcastle united':        'newcastle',
  'brighton and hove albion':'brighton',
  'sheffield united':        'sheffield utd',
  'wolverhampton wanderers': 'wolves',
  'west bromwich albion':    'west brom',
  'queens park rangers':     'qpr',
  // Spanish
  'atletico de madrid':      'atletico madrid',
  'real betis balompie':     'real betis',
  'deportivo alaves':        'alaves',
  'rcd espanyol':            'espanyol',
  // German
  'fc bayern munchen':       'bayern munich',
  'rasenballsport leipzig':  'rb leipzig',
  'bayer 04 leverkusen':     'bayer leverkusen',
  'borussia monchengladbach':'m gladbach',
  'fc koln':                 'koln',
  // Italian
  'fc internazionale milano':'inter',
  'inter milan':             'inter',
  'ac milan':                'milan',
  'ss lazio':                'lazio',
  'as roma':                 'roma',
  // French
  'olympique de marseille':  'marseille',
  'olympique lyonnais':      'lyon',
  'paris saint germain':     'psg',
  'paris sg':                'psg',
  // Dutch
  'afc ajax':                'ajax',
  'psv eindhoven':           'psv',
  'feyenoord rotterdam':     'feyenoord',
};

export function resolveAlias(normKey: string): string {
  return TEAM_ALIASES[normKey] ?? normKey;
}
