/**
 * Portuguese → official team name alias table.
 *
 * Keys are lowercase Portuguese nicknames/abbreviations used by Betclic OCR.
 * Values are the official international team names.
 *
 * To add a new alias: add an entry in the TEAM_ALIASES map below.
 * Keys must be lowercased and accent-normalised for matching.
 */

const TEAM_ALIASES: Record<string, string> = {
  // ── Italy ─────────────────────────────────────────────────────────────────
  'bolonha': 'Bologna FC',
  'inter milão': 'Inter Milan',
  'inter de milão': 'Inter Milan',
  'inter': 'Inter Milan',
  'ac milão': 'AC Milan',
  'milão': 'AC Milan',
  'juventus': 'Juventus',
  'roma': 'AS Roma',
  'nápoles': 'Napoli',
  'lazio': 'SS Lazio',
  'fiorentina': 'Fiorentina',
  'atalanta': 'Atalanta',
  'a. bergamo': 'Atalanta',
  'torino': 'Torino FC',
  'venezia': 'Venezia FC',
  'génova': 'Genoa CFC',
  'lecce': 'US Lecce',
  'como': 'Como 1907',
  'monza': 'AC Monza',
  'cagliari': 'Cagliari',
  'parma': 'Parma',
  'verona': 'Hellas Verona',
  'empoli': 'Empoli',
  'udinese': 'Udinese',

  // ── Germany ───────────────────────────────────────────────────────────────
  'estugarda': 'VfB Stuttgart',
  'stuttgart': 'VfB Stuttgart',
  'hamburgo': 'Hamburger SV',
  'bayer leverkusen': 'Bayer Leverkusen',
  'leverkusen': 'Bayer Leverkusen',
  'borussia dortmund': 'Borussia Dortmund',
  'dortmund': 'Borussia Dortmund',
  'b. dortmund': 'Borussia Dortmund',
  'borussia m.gladbach': 'Borussia Mönchengladbach',
  'mönchengladbach': 'Borussia Mönchengladbach',
  'monchengladbach': 'Borussia Mönchengladbach',
  'baviera': 'Bayern Munich',
  'bayern': 'Bayern Munich',
  'b. munique': 'Bayern Munich',
  'leipzig': 'RB Leipzig',
  'rb leipzig': 'RB Leipzig',
  'union berlim': 'Union Berlin',
  'union berlin': 'Union Berlin',
  'herta berlim': 'Hertha Berlin',
  'hertha berlim': 'Hertha Berlin',
  'eintracht frankfurt': 'Eintracht Frankfurt',
  'frankfurt': 'Eintracht Frankfurt',
  'friburgo': 'SC Freiburg',
  'freiburg': 'SC Freiburg',
  'hoffenheim': 'TSG Hoffenheim',
  'mainz': 'FSV Mainz 05',
  'augsburg': 'FC Augsburg',
  'bochum': 'VfL Bochum',
  'wolfsburg': 'VfL Wolfsburg',
  'colônia': 'FC Köln',
  'colonia': 'FC Köln',
  'köln': 'FC Köln',
  'werder bremen': 'Werder Bremen',
  'bremen': 'Werder Bremen',
  'kaiserslautern': '1. FC Kaiserslautern',
  'düsseldorf': 'Fortuna Düsseldorf',
  'dusseldorf': 'Fortuna Düsseldorf',
  'hannover': 'Hannover 96',
  'schalke': 'FC Schalke 04',
  'paderborn': 'SC Paderborn 07',
  'heidenheim': 'FC Heidenheim',
  'holstein kiel': 'Holstein Kiel',
  'kiel': 'Holstein Kiel',
  'greuther furth': 'SpVgg Greuther Fürth',
  'nuremberga': '1. FC Nürnberg',
  'st. pauli': 'FC St. Pauli',

  // ── Spain ─────────────────────────────────────────────────────────────────
  'barcelona': 'FC Barcelona',
  'real madrid': 'Real Madrid',
  'atlético madrid': 'Atlético Madrid',
  'atletico madrid': 'Atlético Madrid',
  'atlético de madrid': 'Atlético Madrid',
  'sevilha': 'Sevilla FC',
  'valência': 'Valencia CF',
  'valencia': 'Valencia CF',
  'villarreal': 'Villarreal CF',
  'betis': 'Real Betis',
  'real sociedad': 'Real Sociedad',
  'athletic bilbau': 'Athletic Club',
  'athletic bilbao': 'Athletic Club',
  'athletic clube': 'Athletic Club',
  'getafe': 'Getafe CF',
  'celta vigo': 'Celta Vigo',
  'osasuna': 'CA Osasuna',
  'rayo vallecano': 'Rayo Vallecano',
  'mallorca': 'RCD Mallorca',
  'alavés': 'Deportivo Alavés',
  'alaves': 'Deportivo Alavés',
  'leganés': 'CD Leganés',
  'leganes': 'CD Leganés',
  'espanyol': 'RCD Espanyol',
  'las palmas': 'UD Las Palmas',
  'girona': 'Girona FC',
  'valladolid': 'Real Valladolid',
  'elche': 'Elche CF',

  // ── France ────────────────────────────────────────────────────────────────
  'paris sg': 'Paris Saint-Germain',
  'psg': 'Paris Saint-Germain',
  'paris saint-germain': 'Paris Saint-Germain',
  'marselha': 'Olympique Marseille',
  'marseille': 'Olympique Marseille',
  'lião': 'Olympique Lyon',
  'lion': 'Olympique Lyon',
  'lyon': 'Olympique Lyon',
  'mônaco': 'AS Monaco',
  'monaco': 'AS Monaco',
  'nantes': 'FC Nantes',
  'nice': 'OGC Nice',
  'rennes': 'Stade Rennais',
  'lens': 'RC Lens',
  'lille': 'LOSC Lille',
  'montpellier': 'Montpellier HSC',
  'estrasburgo': 'RC Strasbourg',
  'strasbourg': 'RC Strasbourg',
  'reims': 'Stade de Reims',
  'toulouse': 'Toulouse FC',
  'brest': 'Stade Brestois',
  'auxerre': 'AJ Auxerre',
  'angers': 'Angers SCO',
  'havre': 'Le Havre AC',
  'le havre': 'Le Havre AC',
  'saint-etienne': 'AS Saint-Étienne',
  'saint etienne': 'AS Saint-Étienne',
  'lorient': 'FC Lorient',
  'fc lorient': 'FC Lorient',
  'metz': 'FC Metz',
  'caen': 'SM Caen',
  'guingamp': 'EA Guingamp',

  // ── England ───────────────────────────────────────────────────────────────
  'manchester city': 'Manchester City',
  'man. city': 'Manchester City',
  'man city': 'Manchester City',
  'manchester united': 'Manchester United',
  'man. united': 'Manchester United',
  'man united': 'Manchester United',
  'liverpool': 'Liverpool FC',
  'arsenal': 'Arsenal FC',
  'chelsea': 'Chelsea FC',
  'tottenham': 'Tottenham Hotspur',
  'spurs': 'Tottenham Hotspur',
  'newcastle': 'Newcastle United',
  'west ham': 'West Ham United',
  'aston villa': 'Aston Villa',
  'everton': 'Everton FC',
  'leicester': 'Leicester City',
  'brighton': 'Brighton & Hove Albion',
  'wolves': 'Wolverhampton Wanderers',
  'wolverhampton': 'Wolverhampton Wanderers',
  'crystal palace': 'Crystal Palace',
  'brentford': 'Brentford FC',
  'fulham': 'Fulham FC',
  'nottingham': 'Nottingham Forest',
  'nottm forest': 'Nottingham Forest',
  'southampton': 'Southampton FC',
  'ipswich': 'Ipswich Town',
  'bournemouth': 'AFC Bournemouth',
  'luton': 'Luton Town',
  'burnley': 'Burnley FC',
  'sheffield united': 'Sheffield United',
  'leeds': 'Leeds United',

  // ── Portugal ──────────────────────────────────────────────────────────────
  'benfica': 'SL Benfica',
  'sl benfica': 'SL Benfica',
  'porto': 'FC Porto',
  'fc porto': 'FC Porto',
  'sporting': 'Sporting CP',
  'sporting cp': 'Sporting CP',
  'braga': 'SC Braga',
  'sc braga': 'SC Braga',
  'vitória guimarães': 'Vitória SC',
  'vitoria guimaraes': 'Vitória SC',
  'v. guimarães': 'Vitória SC',
  'guimarães': 'Vitória SC',
  'vitória sc': 'Vitória SC',
  'famalicão': 'FC Famalicão',
  'famalicao': 'FC Famalicão',
  'gil vicente': 'Gil Vicente FC',
  'moreirense': 'Moreirense FC',
  'boavista': 'Boavista FC',
  'estoril': 'Estoril Praia',
  'estoril praia': 'Estoril Praia',
  'rio ave': 'Rio Ave FC',
  'arouca': 'FC Arouca',
  'casa pia': 'Casa Pia AC',
  'chaves': 'GD Chaves',
  'farense': 'SC Farense',
  'nacional': 'CD Nacional',
  'cd nacional': 'CD Nacional',
  'santa clara': 'CD Santa Clara',
  'vizela': 'FC Vizela',
  'paços ferreira': 'FC Paços de Ferreira',
  'pacos ferreira': 'FC Paços de Ferreira',

  // ── Netherlands ───────────────────────────────────────────────────────────
  'ajax': 'AFC Ajax',
  'psv': 'PSV Eindhoven',
  'feyenoord': 'Feyenoord',
  'az alkmaar': 'AZ',
  'utrecht': 'FC Utrecht',
  'twente': 'FC Twente',
  'groningen': 'FC Groningen',
  'heerenveen': 'SC Heerenveen',

  // ── Belgium ───────────────────────────────────────────────────────────────
  'club brugge': 'Club Brugge',
  'anderlecht': 'RSC Anderlecht',
  'gent': 'KAA Gent',
  'antuérpia': 'Royal Antwerp FC',
  'antuérpia fc': 'Royal Antwerp FC',
  'antwerp': 'Royal Antwerp FC',
  'standard liège': 'Standard Liège',

  // ── Turkey ────────────────────────────────────────────────────────────────
  'galatasaray': 'Galatasaray SK',
  'fenerbahçe': 'Fenerbahçe SK',
  'fenerbache': 'Fenerbahçe SK',
  'besiktas': 'Beşiktaş JK',
  'beşiktaş': 'Beşiktaş JK',
  'trabzonspor': 'Trabzonspor',
  'başakşehir': 'İstanbul Başakşehir',
  'kocaelispor': 'Kocaelispor',

  // ── Scotland ──────────────────────────────────────────────────────────────
  'celtic': 'Celtic FC',
  'rangers': 'Rangers FC',

  // ── Russia ────────────────────────────────────────────────────────────────
  'cska moscovo': 'CSKA Moscow',
  'cska moscow': 'CSKA Moscow',
  'spartak moscovo': 'Spartak Moscow',
  'zenit': 'Zenit St. Petersburg',
  'lokomotiv': 'Lokomotiv Moscow',

  // ── Brazil ────────────────────────────────────────────────────────────────
  'flamengo': 'CR Flamengo',
  'palmeiras': 'SE Palmeiras',
  'são paulo': 'São Paulo FC',
  'corinthians': 'SC Corinthians',
  'santos': 'Santos FC',
  'grêmio': 'Grêmio',
  'internacional': 'Sport Club Internacional',
  'atletico mineiro': 'Atlético Mineiro',
  'atlético mineiro': 'Atlético Mineiro',
  'vasco': 'Club de Regatas Vasco da Gama',
  'cruzeiro': 'Cruzeiro EC',
  'fluminense': 'Fluminense FC',
  'botafogo': 'Botafogo FR',
};

/**
 * Maps resolved official team names → their primary domestic league competition.
 * Used by inferCompetition() to auto-detect the competition when both teams
 * share the same entry.
 *
 * Keys must exactly match the values produced by resolveTeamAlias().
 * Competition name values must exactly match the seed competition names.
 */
const TEAM_COMPETITION: Record<string, string> = {
  // ── Liga Portugal Betclic ────────────────────────────────────────────────
  'SL Benfica':        'Liga Portugal Betclic',
  'FC Porto':          'Liga Portugal Betclic',
  'Sporting CP':       'Liga Portugal Betclic',
  'SC Braga':          'Liga Portugal Betclic',
  'Vitória SC':        'Liga Portugal Betclic',
  'Estoril Praia':     'Liga Portugal Betclic',
  'Rio Ave FC':        'Liga Portugal Betclic',
  'FC Arouca':         'Liga Portugal Betclic',
  'Casa Pia AC':       'Liga Portugal Betclic',
  'Gil Vicente FC':    'Liga Portugal Betclic',
  'Moreirense FC':     'Liga Portugal Betclic',
  'CD Nacional':       'Liga Portugal Betclic',
  'CD Santa Clara':    'Liga Portugal Betclic',
  'FC Famalicão':      'Liga Portugal Betclic',

  // ── Liga Portugal 2 ─────────────────────────────────────────────────────
  'Boavista FC':             'Liga Portugal 2',
  'SC Farense':              'Liga Portugal 2',
  'FC Vizela':               'Liga Portugal 2',
  'FC Paços de Ferreira':    'Liga Portugal 2',
  'GD Chaves':               'Liga Portugal 2',

  // ── Premier League ──────────────────────────────────────────────────────
  'Arsenal FC':               'Premier League',
  'Chelsea FC':               'Premier League',
  'Liverpool FC':             'Premier League',
  'Manchester City':          'Premier League',
  'Manchester United':        'Premier League',
  'Tottenham Hotspur':        'Premier League',
  'Aston Villa':              'Premier League',
  'Newcastle United':         'Premier League',
  'West Ham United':          'Premier League',
  'Brighton & Hove Albion':   'Premier League',
  'Everton FC':               'Premier League',
  'Fulham FC':                'Premier League',
  'Brentford FC':             'Premier League',
  'Crystal Palace':           'Premier League',
  'Wolverhampton Wanderers':  'Premier League',
  'AFC Bournemouth':          'Premier League',
  'Nottingham Forest':        'Premier League',
  'Leicester City':           'Premier League',
  'Ipswich Town':             'Premier League',
  'Southampton FC':           'Premier League',

  // ── Championship ────────────────────────────────────────────────────────
  'Leeds United':     'Championship',
  'Luton Town':       'Championship',
  'Burnley FC':       'Championship',
  'Sheffield United': 'Championship',

  // ── La Liga ─────────────────────────────────────────────────────────────
  'FC Barcelona':       'La Liga',
  'Real Madrid':        'La Liga',
  'Atlético Madrid':    'La Liga',
  'Sevilla FC':         'La Liga',
  'Valencia CF':        'La Liga',
  'Villarreal CF':      'La Liga',
  'Real Betis':         'La Liga',
  'Real Sociedad':      'La Liga',
  'Athletic Club':      'La Liga',
  'Getafe CF':          'La Liga',
  'Celta Vigo':         'La Liga',
  'CA Osasuna':         'La Liga',
  'Rayo Vallecano':     'La Liga',
  'RCD Mallorca':       'La Liga',
  'Deportivo Alavés':   'La Liga',
  'CD Leganés':         'La Liga',
  'RCD Espanyol':       'La Liga',
  'UD Las Palmas':      'La Liga',
  'Girona FC':          'La Liga',
  'Real Valladolid':    'La Liga',
  'Elche CF':           'La Liga',

  // ── Serie A ─────────────────────────────────────────────────────────────
  'Bologna FC':    'Serie A',
  'Inter Milan':   'Serie A',
  'AC Milan':      'Serie A',
  'Juventus':      'Serie A',
  'AS Roma':       'Serie A',
  'Napoli':        'Serie A',
  'SS Lazio':      'Serie A',
  'Fiorentina':    'Serie A',
  'Atalanta':      'Serie A',
  'Torino FC':     'Serie A',
  'Venezia FC':    'Serie A',
  'Genoa CFC':     'Serie A',
  'US Lecce':      'Serie A',
  'Como 1907':     'Serie A',
  'AC Monza':      'Serie A',
  'Cagliari':      'Serie A',
  'Parma':         'Serie A',
  'Hellas Verona': 'Serie A',
  'Empoli':        'Serie A',
  'Udinese':       'Serie A',

  // ── Bundesliga ──────────────────────────────────────────────────────────
  'VfB Stuttgart':            'Bundesliga',
  'Bayer Leverkusen':         'Bundesliga',
  'Borussia Dortmund':        'Bundesliga',
  'Borussia Mönchengladbach': 'Bundesliga',
  'Bayern Munich':            'Bundesliga',
  'RB Leipzig':               'Bundesliga',
  'Union Berlin':             'Bundesliga',
  'Eintracht Frankfurt':      'Bundesliga',
  'SC Freiburg':              'Bundesliga',
  'TSG Hoffenheim':           'Bundesliga',
  'FSV Mainz 05':             'Bundesliga',
  'FC Augsburg':              'Bundesliga',
  'VfL Wolfsburg':            'Bundesliga',
  'Werder Bremen':            'Bundesliga',
  'FC Heidenheim':            'Bundesliga',
  'FC St. Pauli':             'Bundesliga',

  // ── 2. Bundesliga ───────────────────────────────────────────────────────
  'Hamburger SV':          '2. Bundesliga',
  '1. FC Kaiserslautern':  '2. Bundesliga',
  'Fortuna Düsseldorf':    '2. Bundesliga',
  'Hannover 96':           '2. Bundesliga',
  'FC Schalke 04':         '2. Bundesliga',
  'SC Paderborn 07':       '2. Bundesliga',
  'SpVgg Greuther Fürth':  '2. Bundesliga',
  '1. FC Nürnberg':        '2. Bundesliga',
  'VfL Bochum':            '2. Bundesliga',
  'FC Köln':               '2. Bundesliga',
  'Hertha Berlin':         '2. Bundesliga',
  'Holstein Kiel':         '2. Bundesliga',

  // ── Ligue 1 ─────────────────────────────────────────────────────────────
  'Paris Saint-Germain': 'Ligue 1',
  'Olympique Marseille': 'Ligue 1',
  'Olympique Lyon':      'Ligue 1',
  'AS Monaco':           'Ligue 1',
  'FC Nantes':           'Ligue 1',
  'OGC Nice':            'Ligue 1',
  'Stade Rennais':       'Ligue 1',
  'RC Lens':             'Ligue 1',
  'LOSC Lille':          'Ligue 1',
  'Montpellier HSC':     'Ligue 1',
  'RC Strasbourg':       'Ligue 1',
  'Stade de Reims':      'Ligue 1',
  'Toulouse FC':         'Ligue 1',
  'Stade Brestois':      'Ligue 1',
  'AJ Auxerre':          'Ligue 1',
  'Angers SCO':          'Ligue 1',
  'Le Havre AC':         'Ligue 1',
  'AS Saint-Étienne':    'Ligue 1',
  'FC Lorient':          'Ligue 1',
  'FC Metz':             'Ligue 2',
  'SM Caen':             'Ligue 2',
  'EA Guingamp':         'Ligue 2',

  // ── Eredivisie ──────────────────────────────────────────────────────────
  'AFC Ajax':       'Eredivisie',
  'PSV Eindhoven':  'Eredivisie',
  'Feyenoord':      'Eredivisie',
  'AZ':             'Eredivisie',
  'FC Utrecht':     'Eredivisie',
  'FC Twente':      'Eredivisie',
  'FC Groningen':   'Eredivisie',
  'SC Heerenveen':  'Eredivisie',

  // ── Jupiler Pro League ───────────────────────────────────────────────────
  'Club Brugge':      'Jupiler Pro League',
  'RSC Anderlecht':   'Jupiler Pro League',
  'KAA Gent':         'Jupiler Pro League',
  'Royal Antwerp FC': 'Jupiler Pro League',
  'Standard Liège':   'Jupiler Pro League',

  // ── Süper Lig ────────────────────────────────────────────────────────────
  'Galatasaray SK':      'Süper Lig',
  'Fenerbahçe SK':       'Süper Lig',
  'Beşiktaş JK':         'Süper Lig',
  'Trabzonspor':         'Süper Lig',
  'İstanbul Başakşehir': 'Süper Lig',

  // ── Scottish Premiership ────────────────────────────────────────────────
  'Celtic FC':   'Scottish Premiership',
  'Rangers FC':  'Scottish Premiership',

  // ── Russian Premier League ──────────────────────────────────────────────
  'CSKA Moscow':          'Russian Premier League',
  'Spartak Moscow':       'Russian Premier League',
  'Zenit St. Petersburg': 'Russian Premier League',
  'Lokomotiv Moscow':     'Russian Premier League',

  // ── Brasileirão Série A ─────────────────────────────────────────────────
  'CR Flamengo':                    'Brasileirão Série A',
  'SE Palmeiras':                   'Brasileirão Série A',
  'São Paulo FC':                   'Brasileirão Série A',
  'SC Corinthians':                 'Brasileirão Série A',
  'Santos FC':                      'Brasileirão Série A',
  'Grêmio':                         'Brasileirão Série A',
  'Sport Club Internacional':       'Brasileirão Série A',
  'Atlético Mineiro':               'Brasileirão Série A',
  'Club de Regatas Vasco da Gama':  'Brasileirão Série A',
  'Cruzeiro EC':                    'Brasileirão Série A',
  'Fluminense FC':                  'Brasileirão Série A',
  'Botafogo FR':                    'Brasileirão Série A',
};

/**
 * Infer a competition name from two resolved team names.
 * Returns the competition string if both teams are mapped to the same one,
 * otherwise returns an empty string (no default).
 *
 * @example
 * inferCompetition('SL Benfica', 'FC Arouca')  // → 'Liga Portugal Betclic'
 * inferCompetition('Real Madrid', 'SL Benfica') // → ''  (different leagues)
 */
export function inferCompetition(homeTeam: string, awayTeam: string): string {
  if (!homeTeam || !awayTeam) return '';
  const homeCmp = TEAM_COMPETITION[homeTeam];
  const awayCmp = TEAM_COMPETITION[awayTeam];
  // Both teams in same league — definitive match
  if (homeCmp && awayCmp && homeCmp === awayCmp) return homeCmp;
  // Away team unknown — use home team's competition as best guess
  if (homeCmp && !awayCmp) return homeCmp;
  // Home team unknown — use away team's competition as best guess
  if (!homeCmp && awayCmp) return awayCmp;
  // Both known but different leagues (cup game) — no reliable inference
  return '';
}

// Normalise a string for lookup: lowercase, strip accents
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Pre-build a normalised lookup table once at module load
const NORMALISED_ALIASES: Record<string, string> = {};
for (const [alias, official] of Object.entries(TEAM_ALIASES)) {
  NORMALISED_ALIASES[normalise(alias)] = official;
}

/**
 * Resolve a Portuguese team name/alias to its official international name.
 * Returns the official name if a mapping exists, otherwise returns the input unchanged.
 *
 * @example
 * resolveTeamAlias('Bolonha')    // → 'Bologna FC'
 * resolveTeamAlias('Estugarda')  // → 'VfB Stuttgart'
 * resolveTeamAlias('FC Porto')   // → 'FC Porto'  (no alias needed)
 */
export function resolveTeamAlias(name: string): string {
  if (!name) return name;
  const key = normalise(name);
  return NORMALISED_ALIASES[key] ?? name;
}
