import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLeagueTable } from '../../services/teamStatsService';
import type { TeamStatData } from '../../services/teamStatsService';
import { useTheme } from '../../theme/useTheme';
import { TeamBadge } from '../ui/TeamBadge';
import { getTeamLogoUrl } from '../../utils/sportAssets';

interface Props {
  visible: boolean;
  competition: string;
  season?: string;
  highlightTeams?: string[];
  onClose: () => void;
  /** When true, renders inline without a Modal wrapper (e.g. inside a bottom sheet tab) */
  embedded?: boolean;
  onTeamPress?: (team: TeamStatData) => void;
}

// Zone config — adjust thresholds to match competition rules
interface ZoneConfig {
  positions: [number, number];
  color: string;
  label: string;
  icon: string;
}
const FIXTURE_TEAM_ALIASES: Record<string, string> = {
  // ── Liga Portugal Betclic ─────────────────────────────────────────────────
  'Benfica':                    'SL Benfica',
  'Arouca':                     'FC Arouca',
  'AVS':                        'AVS',
  'Alverca':                    'Alverca',
  'Boavista':                   'Boavista FC',
  'Casa Pia':                   'Casa Pia AC',
  'Chaves':                     'GD Chaves',
  'Estoril':                    'Estoril Praia',
  'Estrela':                    'CF Estrela Amadora',
  'Famalicao':                  'FC Famalicão',
  'Farense':                    'SC Farense',
  'FC Porto':                   'FC Porto',
  'GIL Vicente':                'Gil Vicente FC',
  'Guimaraes':                  'Vitória SC',
  'Maritimo':                   'Marítimo',
  'Moreirense':                 'Moreirense FC',
  'Nacional':                   'CD Nacional',
  'Pacos Ferreira':             'FC Paços de Ferreira',
  'Portimonense':               'Portimonense SC',
  'Rio Ave':                    'Rio Ave FC',
  'Santa Clara':                'CD Santa Clara',
  'SC Braga':                   'SC Braga',
  'Sporting CP':                'Sporting CP',
  'Tondela':                    'CD Tondela',
  'Vizela':                     'Vizela',

  // ── Primeira Liga (old name — same teams) ────────────────────────────────
  // GIL Vicente, Guimaraes, Rio Ave, SC Braga, Sporting CP, Estoril all covered above

  // ── Liga Portugal 2 ───────────────────────────────────────────────────────
  'Academico Viseu':            'Académico de Viseu FC',
  'Belenenses':                 'CF Os Belenenses',
  'Benfica B':                  'SL Benfica B',
  'CF Os Belenenses':           'CF Os Belenenses',
  'FC Porto B':                 'FC Porto B',
  'Felgueiras 1932':            'Alverca',         // no logo — nearest fallback
  'Leixoes':                    'Leixões SC',
  'Lusitânia Lourosa':          'Lusitânia Lourosa',
  'Mafra':                      'CD Mafra',
  'Oliveirense':                'UD Oliveirense',
  'Penafiel':                   'FC Penafiel',
  'SC Covilha':                 'SC Covilhã',
  'Sporting CP B':              'Sporting CP B',
  'Torreense':                  'Torreense',
  'Trofense':                   'CD Trofense',
  'União de Leiria':            'Alverca',         // no logo — nearest fallback
  'Vilafranquense':             'Alverca',         // no logo — nearest fallback
  'Vilaverdense':               'Länk Vilaverdense',

  // ── Premier League ────────────────────────────────────────────────────────
  'Arsenal':                    'Arsenal',
  'Aston Villa':                'Aston Villa',
  'Bournemouth':                'AFC Bournemouth',
  'Brentford':                  'Brentford',
  'Brighton':                   'Brighton & Hove Albion',
  'Burnley':                    'Burnley',
  'Chelsea':                    'Chelsea',
  'Crystal Palace':             'Crystal Palace',
  'Everton':                    'Everton',
  'Fulham':                     'Fulham',
  'Ipswich':                    'Ipswich Town',
  'Leeds':                      'Leeds United',
  'Leicester':                  'Leicester City',
  'Liverpool':                  'Liverpool',
  'Luton':                      'Luton Town',
  'Manchester City':            'Manchester City',
  'Manchester United':          'Manchester United',
  'Newcastle':                  'Newcastle United',
  'Nottingham Forest':          'Nottingham Forest',
  'Sheffield Utd':              'Sheffield United',
  'Southampton':                'Southampton',
  'Sunderland':                 'Sunderland',
  'Tottenham':                  'Tottenham Hotspur',
  'West Ham':                   'West Ham United',
  'Wolves':                     'Wolverhampton Wanderers',

  // ── Championship ──────────────────────────────────────────────────────────
  'Birmingham':                 'Birmingham City',
  'Blackburn':                  'Blackburn Rovers',
  'Blackpool':                  'Blackpool',
  'Bristol City':               'Bristol City',
  'Cardiff':                    'Cardiff City',
  'Charlton':                   'Charlton Athletic',
  'Coventry':                   'Coventry City',
  'Derby':                      'Derby County',
  'Huddersfield':               'Huddersfield Town',
  'Hull City':                  'Hull City',
  'Middlesbrough':              'Middlesbrough',
  'Millwall':                   'Millwall',
  'Norwich':                    'Norwich City',
  'Oxford United':              'Oxford United',
  'Plymouth':                   'Plymouth Argyle',
  'Portsmouth':                 'Portsmouth',
  'Preston':                    'Preston North End',
  'QPR':                        'Queens Park Rangers',
  'Reading':                    'Reading',
  'Rotherham':                  'Rotherham United',
  'Sheffield Wednesday':        'Sheffield Wednesday',
  'Stoke City':                 'Stoke City',
  'Swansea':                    'Swansea City',
  'Watford':                    'Watford',
  'West Brom':                  'West Bromwich Albion',
  'Wigan':                      'Wigan Athletic',
  'Wrexham':                    'Wrexham',

  // ── Bundesliga ────────────────────────────────────────────────────────────
  '1899 Hoffenheim':            'TSG Hoffenheim',
  '1. FC Heidenheim':           '1. FC Heidenheim',
  '1. FC Köln':                 'FC Köln',
  'Bayer Leverkusen':           'Bayer Leverkusen',
  'Bayern München':             'Bayern München',
  'Bayern Munich':              'Bayern München',
  'Borussia Dortmund':          'Borussia Dortmund',
  'Borussia Monchengladbach':   'Borussia Mönchengladbach',
  'Borussia Mönchengladbach':   'Borussia Mönchengladbach',
  'Eintracht Frankfurt':        'Eintracht Frankfurt',
  'FC Augsburg':                'FC Augsburg',
  'FC Heidenheim':              '1. FC Heidenheim',
  'FC Schalke 04':              'FC Schalke 04',
  'FC St. Pauli':               'FC St. Pauli',
  'FSV Mainz 05':               '1. FSV Mainz 05',
  'Hamburger SV':               'Hamburger SV',
  'Hertha Berlin':              'Hertha BSC',
  'Hertha BSC':                 'Hertha BSC',
  'Holstein Kiel':              'Holstein Kiel',
  'RB Leipzig':                 'RB Leipzig',
  'SC Freiburg':                'SC Freiburg',
  'SV Darmstadt 98':            'SV Darmstadt 98',
  'SV Elversberg':              'SV Elversberg',
  'Union Berlin':               '1. FC Union Berlin',
  'VfB Stuttgart':              'VfB Stuttgart',
  'Vfl Bochum':                 'VfL Bochum',
  'VfL Bochum':                 'VfL Bochum',
  'VfL Wolfsburg':              'VfL Wolfsburg',
  'Werder Bremen':              'Werder Bremen',

  // ── 2. Bundesliga ─────────────────────────────────────────────────────────
  '1. FC Kaiserslautern':       '1. FC Kaiserslautern',
  '1. FC Magdeburg':            'Magdeburg',
  '1. FC Nürnberg':             '1. FC Nurnberg',
  'Arminia Bielefeld':          'Bielefeld',
  'Dynamo Dresden':             'Dynamo Dresden',
  'Eintracht Braunschweig':     'Eintracht Braunschweig',
  'FC Kaiserslautern':          '1. FC Kaiserslautern',
  'FC Magdeburg':               'Magdeburg',
  'FC Nurnberg':                '1. FC Nurnberg',
  'FC Saarbrücken':             'Magdeburg',        // no logo — nearest fallback
  'Fortuna Dusseldorf':         'Fortuna Düsseldorf',
  'Fortuna Düsseldorf':         'Fortuna Düsseldorf',
  'Hannover 96':                'Hannover 96',
  'Hansa Rostock':              'Hansa Rostock',
  'Jahn Regensburg':            'Regensburg',
  'Karlsruher SC':              'Karlsruher SC',
  'Preußen Münster':            'Preußen Münster',
  'SC Paderborn 07':            'SC Paderborn',
  'SpVgg Greuther Furth':       'SpVgg Greuther Furth',
  'SpVgg Greuther Fürth':       'SpVgg Greuther Furth',
  'SSV Jahn Regensburg':        'Regensburg',
  'SSV Ulm 1846':               'SSV Ulm 1846',
  'SV Sandhausen':              'SV Sandhausen',
  'SV Wehen':                   'SV Wehen Wiesbaden',
  'VfL Osnabruck':              'VfL Osnabruck',

  // ── La Liga ───────────────────────────────────────────────────────────────
  'Alaves':                     'Deportivo Alavés',
  'Almeria':                    'Almeria',
  'Athletic Club':              'Athletic Bilbao',
  'Atletico Madrid':            'Atlético Madrid',
  'Barcelona':                  'FC Barcelona',
  'Cadiz':                      'Cadiz',
  'Celta Vigo':                 'Celta de Vigo',
  'Elche':                      'Elche CF',
  'Espanyol':                   'RCD Espanyol',
  'Getafe':                     'Getafe CF',
  'Girona':                     'Girona FC',
  'Granada CF':                 'Malaga',           // no logo — nearest fallback
  'Las Palmas':                 'UD Las Palmas',
  'Leganes':                    'Leganés',
  'Levante':                    'Levante UD',
  'Mallorca':                   'RCD Mallorca',
  'Osasuna':                    'CA Osasuna',
  'Oviedo':                     'Real Oviedo',
  'Rayo Vallecano':             'Rayo Vallecano',
  'Real Betis':                 'Real Betis',
  'Real Madrid':                'Real Madrid',
  'Real Sociedad':              'Real Sociedad',
  'Sevilla':                    'Sevilla FC',
  'Valencia':                   'Valencia CF',
  'Valladolid':                 'Real Valladolid',
  'Villarreal':                 'Villarreal CF',

  // ── La Liga 2 ─────────────────────────────────────────────────────────────
  'AD Ceuta FC':                'Almeria',          // no logo — nearest fallback
  'Albacete':                   'Albacete',
  'Alcorcon':                   'Almeria',          // no logo — nearest fallback
  'Amorebieta':                 'Amorebieta',
  'Burgos':                     'Burgos CF',
  'Castellón':                  'CD Castellón',
  'Cordoba':                    'Cordoba',
  'Cultural Leonesa':           'Cultural Leonesa',
  'Deportivo La Coruna':        'Deportivo de La Coruña',
  'Eibar':                      'Eibar',
  'Eldense':                    'Eldense',
  'FC Andorra':                 'Andorra CF',
  'FC Cartagena':               'Cartagena',
  'Huesca':                     'Huesca',
  'Ibiza':                      'Almeria',          // no logo — nearest fallback
  'Lugo':                       'CD Lugo',
  'Malaga':                     'Malaga',
  'Mirandes':                   'Mirandés',
  'Ponferradina':               'Ponferradina',
  'Racing Ferrol':              'Racing de Ferrol',
  'Racing Santander':           'Racing de Santander',
  'Real Sociedad II':           'Real Sociedad B',
  'Sporting Gijon':             'Sporting de Gijón',
  'Tenerife':                   'Tenerife',
  'Villarreal II':              'Villarreal B',
  'Zaragoza':                   'Real Zaragoza',

  // ── Serie A ───────────────────────────────────────────────────────────────
  'AC Milan':                   'AC Milan',
  'AS Roma':                    'AS Roma',
  'Atalanta':                   'Atalanta BC',
  'Bologna':                    'Bologna FC',
  'Cagliari':                   'Cagliari',
  'Como':                       'Como 1907',
  'Cremonese':                  'Cremonese',
  'Empoli':                     'Empoli FC',
  'Fiorentina':                 'ACF Fiorentina',
  'Frosinone':                  'Frosinone Calcio',
  'Genoa':                      'Genoa CFC',
  'Hellas Verona':              'Hellas Verona',
  'Inter':                      'Inter Milan',
  'Juventus':                   'Juventus',
  'Lazio':                      'SS Lazio',
  'Lecce':                      'Lecce',
  'Monza':                      'AC Monza',
  'Napoli':                     'SSC Napoli',
  'Parma':                      'Parma Calcio',
  'Pisa':                       'Pisa SC',
  'Salernitana':                'US Salernitana',
  'Sampdoria':                  'Sampdoria',
  'Sassuolo':                   'Sassuolo',
  'Spezia':                     'Spezia',
  'Torino':                     'Torino FC',
  'Udinese':                    'Udinese Calcio',
  'Venezia':                    'Venezia FC',

  // ── Serie B ───────────────────────────────────────────────────────────────
  'como':                       'Como 1907',        // lowercase variant in DB
  'Ascoli':                     'Sampdoria',        // no logo
  'Avellino':                   'Sampdoria',        // no logo
  'Bari':                       'Bari',
  'Benevento':                  'Benevento',
  'Brescia':                    'Brescia',
  'Carrarese':                  'Sampdoria',        // no logo
  'Catanzaro':                  'Catanzaro',
  'Cesena':                     'Sampdoria',        // no logo
  'Cittadella':                 'Cittadella',
  'Cosenza':                    'Cosenza',
  'Feralpisalo':                'Feralpisalo',
  'Juve Stabia':                'Sampdoria',        // no logo
  'Lecco':                      'Sampdoria',        // no logo
  'Mantova':                    'Sampdoria',        // no logo
  'Modena':                     'Modena',
  'Nuova Cosenza':              'Cosenza',
  'Padova':                     'Sampdoria',        // no logo
  'Palermo':                    'Palermo',
  'Perugia':                    'Sampdoria',        // no logo
  'Pescara':                    'Sampdoria',        // no logo
  'Reggiana':                   'Reggiana',
  'Reggina':                    'Sampdoria',        // no logo
  'Spal':                       'Spal',
  'Sudtirol':                   'Sudtirol',
  'Ternana':                    'Ternana',
  'Virtus Entella':             'Sampdoria',        // no logo

  // ── Ligue 1 ───────────────────────────────────────────────────────────────
  'Ajaccio':                    'AS Monaco',        // no logo — nearest fallback
  'Angers':                     'Angers SCO',
  'Auxerre':                    'AJ Auxerre',
  'Clermont Foot':              'Clermont',
  'Estac Troyes':               'Troyes',
  'Le Havre':                   'Le Havre AC',
  'Lens':                       'RC Lens',
  'Lille':                      'LOSC Lille',
  'Lorient':                    'FC Lorient',
  'Lyon':                       'Olympique Lyonnais',
  'Marseille':                  'Olympique de Marseille',
  'Metz':                       'FC Metz',
  'Monaco':                     'AS Monaco',
  'Montpellier':                'Montpellier HSC',
  'Nantes':                     'Nantes',
  'Nice':                       'OGC Nice',
  'Paris FC':                   'Paris FC',
  'Paris Saint Germain':        'Paris Saint-Germain',
  'Reims':                      'Stade de Reims',
  'Rennes':                     'Stade Rennais',
  'Saint Etienne':              'AS Saint-Etienne',
  'Stade Brestois 29':          'Stade Brestois',
  'Strasbourg':                 'RC Strasbourg',
  'Toulouse':                   'Toulouse FC',

  // ── Ligue 2 ───────────────────────────────────────────────────────────────
  'Amiens':                     'Amiens SC',
  'Annecy':                     'Angers SCO',       // no logo — nearest fallback
  'Bastia':                     'SC Bastia',
  'Bordeaux':                   'Bordeaux',
  'Boulogne':                   'Angers SCO',       // no logo — nearest fallback
  'Caen':                       'SM Caen',
  'Concarneau':                 'Concarneau',
  'Dijon':                      'Angers SCO',       // no logo — nearest fallback
  'Dunkerque':                  'US Dunkerque',
  'Grenoble':                   'Grenoble Foot 38',
  'Guingamp':                   'FC Guingamp',
  'Laval':                      'Laval',
  'Le Mans':                    'Le Mans FC',
  'Martigues':                  'FC Martigues',
  'Nancy':                      'Nancy',
  'Nimes':                      'Nimes',
  'Niort':                      'Chamois Niortais',
  'PAU':                        'Pau FC',
  'Quevilly':                   'Quevilly-Rouen',
  'RED Star FC 93':             'Angers SCO',       // no logo — nearest fallback
  'Rodez':                      'Rodez AF',
  'Sochaux':                    'Angers SCO',       // no logo — nearest fallback
  'Valenciennes':               'Valenciennes FC',

  // ── Eredivisie ────────────────────────────────────────────────────────────
  'ADO Den Haag':               'ADO Den Haag',
  'Ajax':                       'Ajax',
  'Almere City FC':             'Almere City',
  'AZ Alkmaar':                 'AZ Alkmaar',
  'Cambuur':                    'Ajax',             // no logo — nearest fallback
  'De Graafschap':              'De Graafschap',
  'Den Bosch':                  'FC Den Bosch',
  'Dordrecht':                  'FC Dordrecht',
  'Emmen':                      'Ajax',             // no logo — nearest fallback
  'Excelsior':                  'Excelsior',
  'FC Eindhoven':               'FC Eindhoven',
  'FC Volendam':                'FC Volendam',
  'Feyenoord':                  'Feyenoord',
  'Fortuna Sittard':            'Fortuna Sittard',
  'GO Ahead Eagles':            'Go Ahead Eagles',
  'Groningen':                  'Ajax',             // no logo — nearest fallback
  'Heerenveen':                 'SC Heerenveen',
  'Heracles':                   'Heracles Almelo',
  'MVV':                        'MVV Maastricht',
  'NAC Breda':                  'NAC Breda',
  'NEC Nijmegen':               'NEC Nijmegen',
  'PEC Zwolle':                 'PEC Zwolle',
  'PSV Eindhoven':              'PSV Eindhoven',
  'Roda':                       'Roda JC Kerkrade',
  'Sparta Rotterdam':           'Sparta Rotterdam',
  'Telstar':                    'Telstar',
  'Twente':                     'FC Twente',
  'Utrecht':                    'FC Utrecht',
  'Vitesse':                    'Vitesse',
  'VVV Venlo':                  'VVV Venlo',
  'Waalwijk':                   'RKC Waalwijk',
  'Willem II':                  'Willem II',

  // ── Pro League (Belgium) ──────────────────────────────────────────────────
  'Cercle Brugge':              'Cercle Brugge',
  'Club Brugge KV':             'Club Brugge',
  'FCV Dender EH':              'RSC Anderlecht',   // no logo — nearest fallback
  'KAA Gent':                   'KAA Gent',
  'KRC Genk':                   'KRC Genk',
  'KVC Westerlo':               'Westerlo',
  'KV Mechelen':                'KV Mechelen',
  'Oud-Heverlee Leuven':        'OH Leuven',
  'RAAL La Louviére':           'RSC Anderlecht',   // no logo — nearest fallback
  'Royal Antwerp FC':           'Royal Antwerp FC',
  'RSC Anderlecht':             'RSC Anderlecht',
  'Sint-Truidense VV':          'Sint-Truiden',
  'Sporting Charleroi':         'Charleroi',
  'Standard Liège':             'Standard Liège',
  'SV Zulte Waregem':           'Zulte Waregem',
  'Union Saint-Gilloise':       'Royale Union SG',

  // ── Süper Lig ─────────────────────────────────────────────────────────────
  'Adana Demirspor':            'Adana Demirspor',
  'Alanyaspor':                 'Alanyaspor',
  'Ankaragücü':                 'MKE Ankaragucu',
  'Antalyaspor':                'Antalyaspor',
  'Başakşehir':                 'İstanbul Başakşehir',
  'Beşiktaş':                   'Beşiktaş',
  'Bodrum FK':                  'Bodrumspor',
  'Eyüpspor':                   'Eyüpspor',
  'Fatih Karagümrük':           'Fatih Karagümrük',
  'Fenerbahçe':                 'Fenerbahçe',
  'Galatasaray':                'Galatasaray',
  'Gaziantep FK':               'Gaziantep FK',
  'Gençlerbirliği S.K.':        'Gençlerbirliği',
  'Giresunspor':                'Galatasaray',      // no logo — nearest fallback
  'Göztepe':                    'Göztepe',
  'Hatayspor':                  'Hatayspor',
  'İstanbulspor':               'Istanbulspor',
  'Kasımpaşa':                  'Kasimpasa',
  'Kayserispor':                'Kayserispor',
  'Kocaelispor':                'Kocaelispor',
  'Konyaspor':                  'Konyaspor',
  'Pendikspor':                 'Pendikspor',
  'Rizespor':                   'Caykur Rizespor',
  'Samsunspor':                 'Samsunspor',
  'Sivasspor':                  'Sivasspor',
  'Trabzonspor':                'Trabzonspor',
  'Ümraniyespor':               'Ümraniyespor',

  // ── UEFA Champions League & Europa League (extra teams not covered above) ─
  'AEK Athens FC':              'AEK Athens',
  'AEK Larnaca':                'Ajax',             // no logo
  'Antwerp':                    'Royal Antwerp FC',
  'Apoel Nicosia':              'Ajax',             // no logo
  'Apollon Limassol':           'Ajax',             // no logo
  'Aris':                       'Aris Thessaloniki',
  'Atlètic Club d\'Escaldes':   'Ajax',             // no logo — Andorran club
  'Ballkani':                   'Ajax',             // no logo
  'Bate Borisov':               'Ajax',             // no logo
  'BK Hacken':                  'BK Hacken',
  'Bodo/Glimt':                 'Bodo/Glimt',
  'Borac Banja Luka':           'Ajax',             // no logo
  'Brann':                      'Brann',
  'Breidablik':                 'Ajax',             // no logo
  'BSC Young Boys':             'BSC Young Boys',
  'Buducnost Podgorica':        'Ajax',             // no logo
  'Celje':                      'Ajax',             // no logo
  'Celtic':                     'Celtic',
  'CFR 1907 Cluj':              'CFR Cluj',
  'Dečić':                      'Ajax',             // no logo
  'Dinamo Batumi':              'Ajax',             // no logo
  'Dinamo Minsk':               'Ajax',             // no logo
  'Dinamo Tbilisi':             'Ajax',             // no logo
  'Dinamo Zagreb':              'Dinamo Zagreb',
  'Dnipro-1':                   'Dnipro-1',
  'Drita':                      'Ajax',             // no logo
  'Dynamo Kyiv':                'Dynamo Kyiv',
  'Egnatia Rrogozhinë':         'Ajax',             // no logo
  'F91 Dudelange':              'Ajax',             // no logo
  'Farul Constanta':            'Farul Constanta',
  'FC Astana':                  'Ajax',             // no logo
  'FC Basel 1893':              'FC Basel',
  'FC Copenhagen':              'FC Copenhagen',
  'FC Differdange 03':          'Ajax',             // no logo
  'FC Levadia Tallinn':         'Ajax',             // no logo
  'FC Lugano':                  'FC Lugano',
  'FC Midtjylland':             'FC Midtjylland',
  'FC Noah':                    'Ajax',             // no logo
  'FCSB':                       'FCSB',
  'FC Urartu':                  'Ajax',             // no logo
  'FC Zurich':                  'FC Zürich',
  'Ferencvarosi TC':            'Ferencváros TC',
  'FK Crvena Zvezda':           'Red Star Belgrade',
  'FK Partizan':                'FK Partizan',
  'FK Tobol Kostanay':          'Ajax',             // no logo
  'FK Zalgiris Vilnius':        'Ajax',             // no logo
  'Flora Tallinn':              'Ajax',             // no logo
  'Fredrikstad':                'Fredrikstad FK',
  'Genk':                       'KRC Genk',
  'Gent':                       'KAA Gent',
  'Hamrun Spartans':            'Ajax',             // no logo
  'Hapoel Beer Sheva':          'Ajax',             // no logo
  'Heart Of Midlothian':        'Heart of Midlothian',
  'Hibernian':                  'Hibernian',
  'HJK Helsinki':               'Ajax',             // no logo
  'HNK Rijeka':                 'HNK Rijeka',
  'IF Elfsborg':                'IF Elfsborg',
  'Ilves':                      'Ajax',             // no logo
  'Inter Club d\'Escaldes':     'Ajax',             // no logo
  'Jagiellonia':                'Jagiellonia Bialystok',
  'KI Klaksvik':                'Ajax',             // no logo
  'Kilmarnock':                 'Kilmarnock',
  'Kryvbas KR':                 'Kryvbas Kryvyi Rih',
  'KuPS':                       'Ajax',             // no logo
  'La Fiorita':                 'Ajax',             // no logo
  'Larne':                      'Ajax',             // no logo
  'Lask Linz':                  'LASK',
  'Lech Poznan':                'Lech Poznan',
  'Legia Warszawa':             'Legia Warsaw',
  'Levski Sofia':               'Ajax',             // no logo
  'Lincoln Red Imps FC':        'Ajax',             // no logo
  'Linfield':                   'Ajax',             // no logo
  'Llapi':                      'Ajax',             // no logo
  'Ludogorets':                 'Ajax',             // no logo
  'Maccabi Haifa':              'Ajax',             // no logo
  'Maccabi Petah Tikva':        'Maccabi Tel Aviv', // use nearest
  'Maccabi Tel Aviv':           'Maccabi Tel Aviv',
  'Malmo FF':                   'Malmo FF',
  'Maribor':                    'Ajax',             // no logo
  'Milsami Orhei':              'Ajax',             // no logo
  'Molde':                      'Molde FK',
  'Olimpija Ljubljana':         'Ajax',             // no logo
  'Olympiakos Piraeus':         'Olympiacos',
  'Omonia Nicosia':             'Ajax',             // no logo
  'Ordabasy':                   'Ajax',             // no logo
  'Pafos':                      'Ajax',             // no logo
  'Paks':                       'Ajax',             // no logo
  'Panathinaikos':              'Panathinaikos',
  'Panevėžys':                  'Ajax',             // no logo
  'PAOK':                       'PAOK',
  'Partizani':                  'Ajax',             // no logo
  'Petrocub':                   'Ajax',             // no logo
  'Plzen':                      'Viktoria Plzen',
  'Prishtina':                  'Ajax',             // no logo
  'Pyunik Yerevan':             'Ajax',             // no logo
  'Qarabag':                    'Ajax',             // no logo
  'Raków Częstochowa':          'Rakow Czestochowa',
  'Rangers':                    'Rangers',
  'Rapid Vienna':               'SK Rapid Wien',
  'Red Bull Salzburg':          'Red Bull Salzburg',
  'Rīgas FS':                   'Ajax',             // no logo
  'Ružomberok':                 'Ajax',             // no logo
  'Sabah FA':                   'Ajax',             // no logo
  'Saburtalo':                  'Ajax',             // no logo
  'Servette FC':                'Servette FC',
  'Shakhtar Donetsk':           'Shakhtar Donetsk',
  'Shakhter Soligorsk':         'Ajax',             // no logo
  'Shamrock Rovers':            'Shamrock Rovers',
  'Shelbourne':                 'Shelbourne FC',
  'Sheriff Tiraspol':           'Ajax',             // no logo
  'Shkendija':                  'Ajax',             // no logo
  'Shkupi 1927':                'Ajax',             // no logo
  'Sigma Olomouc':              'Sigma Olomouc',
  'Silkeborg':                  'Silkeborg IF',
  'Slavia Praha':               'Slavia Prague',
  'Slovácko':                   'FC Slovacko',
  'Slovan Bratislava':          'Slovan Bratislava',
  'Spartak Trnava':             'Spartak Trnava',
  'Sparta Praha':               'Sparta Prague',
  'Struga':                     'Ajax',             // no logo
  'Sturm Graz':                 'SK Sturm Graz',
  'Sutjeska':                   'Ajax',             // no logo
  'Swift Hesperange':           'Ajax',             // no logo
  'The New Saints':             'Ajax',             // no logo
  'Tirana':                     'Ajax',             // no logo
  'TSC Backa Topola':           'TSC Backa Topola',
  'UE Santa Coloma':            'Ajax',             // no logo
  'Union St. Gilloise':         'Royale Union SG',
  'Valmiera / BSS':             'Ajax',             // no logo
  'Vikingur Gota':              'Ajax',             // no logo
  'Vikingur Reykjavik':         'Ajax',             // no logo
  'Virtus':                     'Ajax',             // no logo
  'Vojvodina':                  'FK Vojvodina',
  'Wisla Krakow':               'Wisla Krakow',
  'Wolfsberger AC':             'Wolfsberger AC',
  'Zira':                       'Ajax',             // no logo
  'Zorya Luhansk':              'Zorya Luhansk',
  'Zrinjski':                   'Ajax',             // no logo

  // ── Keep all existing long-form aliases from previous version ─────────────
  'Sporting Clube de Braga':    'SC Braga',
  'Sport Lisboa e Benfica':     'SL Benfica',
  'Futebol Clube do Porto':     'FC Porto',
  'Sporting Clube de Portugal': 'Sporting CP',
  'GD Estoril Praia':           'Estoril Praia',
  'Grupo Desportivo Estoril Praia': 'Estoril Praia',
  'Rio Ave FC':                 'Rio Ave FC',
  'Gil Vicente FC':             'Gil Vicente FC',
  'Casa Pia AC':                'Casa Pia AC',
  'CD Tondela':                 'CD Tondela',
  'FC Famalicão':               'FC Famalicão',
  'SC Farense':                 'SC Farense',
  'Portimonense SC':            'Portimonense SC',
  'FC Paços de Ferreira':       'FC Paços de Ferreira',
  'Vitória SC':                 'Vitória SC',
  'Vitória Sport Clube':        'Vitória SC',
  'Vitória Guimarães':          'Vitória SC',
  'Moreirense FC':              'Moreirense FC',
  'CF Estrela da Amadora':      'CF Estrela Amadora',
  'CD Nacional':                'CD Nacional',
  'FC Arouca':                  'FC Arouca',
  'Manchester United FC':       'Manchester United',
  'Manchester City FC':         'Manchester City',
  'Liverpool FC':               'Liverpool',
  'Arsenal FC':                 'Arsenal',
  'Chelsea FC':                 'Chelsea',
  'Tottenham Hotspur FC':       'Tottenham Hotspur',
  'Aston Villa FC':             'Aston Villa',
  'Newcastle United FC':        'Newcastle United',
  'West Ham United FC':         'West Ham United',
  'Brighton & Hove Albion FC':  'Brighton & Hove Albion',
  'Wolverhampton Wanderers FC': 'Wolverhampton Wanderers',
  'Crystal Palace FC':          'Crystal Palace',
  'Everton FC':                 'Everton',
  'Fulham FC':                  'Fulham',
  'Brentford FC':               'Brentford',
  'Nottingham Forest FC':       'Nottingham Forest',
  'AFC Bournemouth':            'AFC Bournemouth',
  'Leicester City FC':          'Leicester City',
  'Leeds United FC':            'Leeds United',
  'Burnley FC':                 'Burnley',
  'Southampton FC':             'Southampton',
  'Sunderland AFC':             'Sunderland',
  'Ipswich Town FC':            'Ipswich Town',
  'Sheffield United FC':        'Sheffield United',
  'Real Madrid CF':             'Real Madrid',
  'FC Barcelona':               'FC Barcelona',
  'Club Atlético de Madrid':    'Atlético Madrid',
  'Atlético de Madrid':         'Atlético Madrid',
  'Sevilla FC':                 'Sevilla FC',
  'Real Betis Balompié':        'Real Betis',
  'Villarreal CF':              'Villarreal CF',
  'RC Celta de Vigo':           'Celta de Vigo',
  'Getafe CF':                  'Getafe CF',
  'Girona FC':                  'Girona FC',
  'RCD Mallorca':               'RCD Mallorca',
  'Rayo Vallecano de Madrid':   'Rayo Vallecano',
  'Deportivo Alavés':           'Deportivo Alavés',
  'Valencia CF':                'Valencia CF',
  'CA Osasuna':                 'CA Osasuna',
  'UD Las Palmas':              'UD Las Palmas',
  'CD Leganés':                 'Leganés',
  'Leganés':                    'Leganés',
  'Real Valladolid CF':         'Real Valladolid',
  'Real Valladolid':            'Real Valladolid',
  'Real Zaragoza':              'Real Zaragoza',
  'CD Castellón':               'CD Castellón',
  'SD Eibar':                   'Eibar',
  'SD Huesca':                  'Huesca',
  'Málaga CF':                  'Malaga',
  'Elche CF':                   'Elche CF',
  'CD Mirandés':                'Mirandés',
  'Cádiz CF':                   'Cadiz',
  'UD Almería':                 'Almeria',
  'RCD Espanyol de Barcelona':  'RCD Espanyol',
  'Deportivo La Coruña':        'Deportivo de La Coruña',
  'Córdoba CF':                 'Cordoba',
  'Racing de Santander':        'Racing de Santander',
  'FC Internazionale Milano':   'Inter Milan',
  'FC Internazionale':          'Inter Milan',
  'Inter Milano':               'Inter Milan',
  'Juventus FC':                'Juventus',
  'SSC Napoli':                 'SSC Napoli',
  'SS Lazio':                   'SS Lazio',
  'Atalanta BC':                'Atalanta BC',
  'ACF Fiorentina':             'ACF Fiorentina',
  'Bologna FC 1909':            'Bologna FC',
  'Torino FC':                  'Torino FC',
  'Udinese Calcio':             'Udinese Calcio',
  'Genoa CFC':                  'Genoa CFC',
  'Cagliari Calcio':            'Cagliari',
  'Hellas Verona FC':           'Hellas Verona',
  'US Sassuolo Calcio':         'Sassuolo',
  'Parma Calcio 1913':          'Parma Calcio',
  'AC Monza':                   'AC Monza',
  'Como 1907':                  'Como 1907',
  'Venezia FC':                 'Venezia FC',
  'Spezia Calcio':              'Spezia',
  'Frosinone Calcio':           'Frosinone Calcio',
  'US Salernitana 1919':        'US Salernitana',
  'FC Bayern München':          'Bayern München',
  '1. FSV Mainz 05':            '1. FSV Mainz 05',
  '1. FC Heidenheim 1846':      '1. FC Heidenheim',
  'FC Köln':                    'FC Köln',
  'FC St. Pauli 1910':          'FC St. Pauli',
  'VfL Bochum 1848':            'VfL Bochum',
  'SV 07 Elversberg':           'SV Elversberg',
  '1. FC Union Berlin':         '1. FC Union Berlin',
  'SV Werder Bremen':           'Werder Bremen',
  'Paris Saint-Germain FC':     'Paris Saint-Germain',
  'Olympique de Marseille':     'Olympique de Marseille',
  'AS Monaco FC':               'AS Monaco',
  'LOSC Lille':                 'LOSC Lille',
  'Olympique Lyonnais':         'Olympique Lyonnais',
  'OGC Nice':                   'OGC Nice',
  'RC Lens':                    'RC Lens',
  'Stade Rennais FC':           'Stade Rennais',
  'Stade Rennais FC 1901':      'Stade Rennais',
  'Stade Brestois':             'Stade Brestois',
  'Toulouse FC':                'Toulouse FC',
  'FC Nantes':                  'Nantes',
  'RC Strasbourg Alsace':       'RC Strasbourg',
  'FC Lorient':                 'FC Lorient',
  'FC Metz':                    'FC Metz',
  'Le Havre AC':                'Le Havre AC',
  'AJ Auxerre':                 'AJ Auxerre',
  'Angers SCO':                 'Angers SCO',
  'Racing Club de Lens':        'RC Lens',
  'SBV Excelsior':              'Excelsior',
  'Lille OSC':                  'LOSC Lille',
  'AFC Ajax':                   'Ajax',
  'PSV':                        'PSV Eindhoven',
  'Feyenoord Rotterdam':        'Feyenoord',
  'AZ':                         'AZ Alkmaar',
  'Real Sociedad de Fútbol':    'Real Sociedad',
  'US Cremonese':               'Cremonese',
  "FC Twente '65":              'FC Twente',
  'FC Twente':                  'FC Twente',
  'FC Utrecht':                 'FC Utrecht',
  'SC Heerenveen':              'SC Heerenveen',
  'Go Ahead Eagles':            'Go Ahead Eagles',
  'Heracles Almelo':            'Heracles Almelo',
  'RKC Waalwijk':               'RKC Waalwijk',
  'Standard de Liège':          'Standard Liège',
  'Cercle Brugge KSV':          'Cercle Brugge',
  'Royale Union SG':            'Royale Union SG',
  'Galatasaray SK':             'Galatasaray',
  'Fenerbahçe SK':              'Fenerbahçe',
  'Beşiktaş JK':                'Beşiktaş',
  'Trabzonspor AŞ':             'Trabzonspor',
  'İstanbul Başakşehir FK':     'İstanbul Başakşehir',
  'İstanbul Başakşehir':        'İstanbul Başakşehir',
  'Kasımpaşa SK':               'Kasimpasa',
  'Kayserispor AŞ':             'Kayserispor',
  'Çaykur Rizespor':            'Caykur Rizespor',
  'Gençlerbirliği':             'Gençlerbirliği',
  'Celtic FC':                  'Celtic',
  'Rangers FC':                 'Rangers',
  'Aberdeen FC':                'Aberdeen',
  'Hibernian FC':               'Hibernian',
  'Heart of Midlothian FC':     'Heart of Midlothian',
  'Falkirk FC':                 'Falkirk',
  'Cukaricki':                  'FK Cukaricki',
  'Anderlecht':                 'RSC Anderlecht',
  'Aberdeen':                   'Aberdeen',
  'Austria Vienna':             'Austria Wien',
  'Baník Ostrava':              'Banik Ostrava',
};

function resolveTeamName(name: string): string {
  return FIXTURE_TEAM_ALIASES[name] ?? name;
}

const DEFAULT_ZONES: ZoneConfig[] = [
  { positions: [1, 1], color: '#22c55e', label: 'Champions League', icon: '🏆' },
  { positions: [2, 3], color: '#3b82f6', label: 'Champions League (qualificação)', icon: '🏆' },
  { positions: [4, 4], color: '#06b6d4', label: 'UEFA Europa League', icon: '🌍' },
  { positions: [5, 5], color: '#8b5cf6', label: 'UEFA Conference League', icon: '🌐' },
];

const RELEGATION_ZONE_FROM_BOTTOM = 3;

function getZone(pos: number, total: number, zones: ZoneConfig[]): ZoneConfig | null {
  if (pos > total - RELEGATION_ZONE_FROM_BOTTOM) {
    return { positions: [pos, pos], color: '#ef4444', label: 'Descida de divisão', icon: '⬇️' };
  }
  return zones.find((z) => pos >= z.positions[0] && pos <= z.positions[1]) ?? null;
}

function primaryToken(name: string): string {
  const tokens = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  return tokens.sort((a, b) => b.length - a.length)[0] ?? name.toLowerCase();
}

function isHighlighted(statTeam: string, highlights: string[]): boolean {
  const statNorm = statTeam.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return highlights.some((h) => {
    const tok = primaryToken(h);
    return statNorm.includes(tok);
  });
}

type SortKey = 'default' | 'home' | 'away';

// ─── Inner content (shared between embedded and modal) ────────────────────────

type ViewMode = 'stats' | 'form';

function TableContent({
  competition,
  season = '2025-26',
  highlightTeams = [],
  onClose,
  embedded = false,
  onTeamPress,
}: Omit<Props, 'visible'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sortKey, setSortKey] = React.useState<SortKey>('default');
  const [viewMode, setViewMode] = useState<ViewMode>('stats');
  const [showRules, setShowRules] = useState(false);
  const tableQuery = useLeagueTable(competition, season);

  const rows = useMemo(() => {
    const data = tableQuery.data ?? [];
    if (sortKey === 'home') {
      return [...data].sort((a, b) => {
        const aPts = a.homeWon * 3 + a.homeDrawn;
        const bPts = b.homeWon * 3 + b.homeDrawn;
        return bPts - aPts || (b.homeGoalsFor - b.homeGoalsAgainst) - (a.homeGoalsFor - a.homeGoalsAgainst);
      }).map((r, i) => ({ ...r, displayPos: i + 1 }));
    }
    if (sortKey === 'away') {
      return [...data].sort((a, b) => {
        const aPts = a.awayWon * 3 + a.awayDrawn;
        const bPts = b.awayWon * 3 + b.awayDrawn;
        return bPts - aPts || (b.awayGoalsFor - b.awayGoalsAgainst) - (a.awayGoalsFor - a.awayGoalsAgainst);
      }).map((r, i) => ({ ...r, displayPos: i + 1 }));
    }
    return data.map((r) => ({ ...r, displayPos: r.position ?? 0 }));
  }, [tableQuery.data, sortKey]);

  const total = rows.length;

  const activeLegend = useMemo(() => {
    if (total < 6) return [];
    const seen = new Map<string, ZoneConfig>();
    for (let pos = 1; pos <= total; pos++) {
      const zone = getZone(pos, total, DEFAULT_ZONES);
      if (zone && !seen.has(zone.label)) seen.set(zone.label, zone);
    }
    return Array.from(seen.values());
  }, [total]);

  const FORM_COLOR: Record<string, string> = { W: '#22c55e', D: '#6b7280', L: '#ef4444' };
  const FORM_LABEL: Record<string, string> = { W: 'V', D: 'E', L: 'D' };

  function renderRow(item: TeamStatData & { displayPos: number }) {
    const highlight = isHighlighted(item.team, highlightTeams);
    const zone = sortKey === 'default' ? getZone(item.displayPos, total, DEFAULT_ZONES) : null;
    const zoneColor = zone?.color;
    const rowBg     = highlight ? `${colors.primary}22` : undefined;

    if (viewMode === 'form') {
      const formPills = (item.formLast5 ?? '').split('').filter(c => 'WDL'.includes(c)).slice(0, 5);
      return (
        <Pressable
          onPress={() => onTeamPress?.(item)}
          style={[s.row, { borderBottomColor: colors.border }, rowBg ? { backgroundColor: rowBg } : undefined]}
        >
          <View style={[s.zoneStrip, { backgroundColor: zoneColor ?? 'transparent' }]} />
          <Text style={[s.pos, { color: highlight ? colors.primary : zoneColor ?? colors.textMuted }]}>
            {item.displayPos}
          </Text>
          {highlight && <View style={[s.highlightDot, { backgroundColor: colors.primary }]} />}
          <View style={s.teamCell}>
            <TeamBadge name={resolveTeamName(item.team)} imageUrl={getTeamLogoUrl(resolveTeamName(item.team))} size={20} />
            <Text numberOfLines={1} style={[s.teamName, { color: highlight ? colors.primary : colors.textPrimary, fontWeight: highlight ? '800' : '600' }]}>
              {item.team}
            </Text>
          </View>
          <View style={s.formPillsCell}>
            {formPills.length > 0
              ? formPills.map((r, i) => (
                  <View key={i} style={[s.formPill, { backgroundColor: FORM_COLOR[r] ?? '#6b7280' }]}>
                    <Text style={s.formPillText}>{FORM_LABEL[r] ?? r}</Text>
                  </View>
                ))
              : <Text style={[s.cell, { color: colors.textMuted }]}>—</Text>
            }
          </View>
          {onTeamPress && <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />}
        </Pressable>
      );
    }

    const gf  = sortKey === 'home' ? item.homeGoalsFor     : sortKey === 'away' ? item.awayGoalsFor     : item.goalsFor;
    const ga  = sortKey === 'home' ? item.homeGoalsAgainst : sortKey === 'away' ? item.awayGoalsAgainst : item.goalsAgainst;
    const w   = sortKey === 'home' ? item.homeWon          : sortKey === 'away' ? item.awayWon          : item.won;
    const d   = sortKey === 'home' ? item.homeDrawn        : sortKey === 'away' ? item.awayDrawn        : item.drawn;
    const l   = sortKey === 'home' ? item.homeLost         : sortKey === 'away' ? item.awayLost         : item.lost;
    const pts = sortKey === 'home' ? w * 3 + d             : sortKey === 'away' ? w * 3 + d             : item.points;
    const p   = sortKey === 'home' ? w + d + l             : sortKey === 'away' ? w + d + l             : item.played;

    return (
      <Pressable
        onPress={() => onTeamPress?.(item)}
        style={[s.row, { borderBottomColor: colors.border }, rowBg ? { backgroundColor: rowBg } : undefined]}
      >
        <View style={[s.zoneStrip, { backgroundColor: zoneColor ?? 'transparent' }]} />
        <Text style={[s.pos, { color: highlight ? colors.primary : zoneColor ?? colors.textMuted }]}>
          {item.displayPos}
        </Text>
        {highlight && <View style={[s.highlightDot, { backgroundColor: colors.primary }]} />}
        <View style={s.teamCell}>
          <TeamBadge
            name={resolveTeamName(item.team)}
            imageUrl={getTeamLogoUrl(resolveTeamName(item.team))}
            size={20}
          />
          <Text
            numberOfLines={1}
            style={[s.teamName, { color: highlight ? colors.primary : colors.textPrimary, fontWeight: highlight ? '800' : '600' }]}
          >
            {item.team}
          </Text>
        </View>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{p}</Text>
        <Text style={[s.cell, { color: '#22c55e' }]}>{w}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{d}</Text>
        <Text style={[s.cell, { color: '#ef4444' }]}>{l}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{gf}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{ga}</Text>
        <Text style={[s.pts, { color: highlight ? colors.primary : colors.textPrimary }]}>{pts}</Text>
      </Pressable>
    );
  }

  const listFooter = (
    <View>
      {activeLegend.length > 0 && sortKey === 'default' && (
        <View style={[s.legendBox, { borderTopColor: colors.border, backgroundColor: `${colors.primary}05` }]}>
          <Text style={[s.legendTitle, { color: colors.textMuted }]}>LEGENDA DE ZONAS</Text>
          {activeLegend.map((zone) => (
            <View key={zone.label} style={s.legendRow}>
              <View style={[s.legendStrip, { backgroundColor: zone.color }]} />
              <Text style={s.legendIcon}>{zone.icon}</Text>
              <Text style={[s.legendLabel, { color: colors.textSecondary }]}>{zone.label}</Text>
            </View>
          ))}
          <View style={s.legendRow}>
            <View style={[s.legendStrip, { backgroundColor: '#ef4444' }]} />
            <Text style={s.legendIcon}>⬇️</Text>
            <Text style={[s.legendLabel, { color: colors.textSecondary }]}>Descida de divisão</Text>
          </View>
        </View>
      )}
      <Pressable style={[s.rulesToggle, { borderTopColor: colors.border }]} onPress={() => setShowRules(!showRules)}>
        <View style={s.rulesToggleLeft}>
          <Ionicons name="book-outline" size={14} color={colors.primary} />
          <Text style={[s.rulesToggleText, { color: colors.textSecondary }]}>Regras de desempate</Text>
        </View>
        <Ionicons name={showRules ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </Pressable>
      {showRules && (
        <View style={[s.rulesBox, { borderTopColor: colors.border, backgroundColor: `${colors.primary}05` }]}>
          <Text style={[s.rulesTitle, { color: colors.textMuted }]}>EM CASO DE EMPATE DE PONTOS</Text>
          {['1. Confronto directo (pontos e diferença de golos)', '2. Diferença de golos geral', '3. Total de golos marcados', '4. Fair play (cartões)'].map((rule) => (
            <View key={rule} style={s.ruleRow}>
              <View style={[s.ruleDot, { backgroundColor: colors.primary }]} />
              <Text style={[s.ruleText, { color: colors.textSecondary }]}>{rule}</Text>
            </View>
          ))}
          <View style={[s.colKeyBox, { borderTopColor: colors.border }]}>
            <Text style={[s.rulesTitle, { color: colors.textMuted }]}>ABREVIATURAS</Text>
            <View style={s.colKeyGrid}>
              {[{ k: 'J', v: 'Jogos disputados' }, { k: 'V', v: 'Vitórias' }, { k: 'E', v: 'Empates' }, { k: 'D', v: 'Derrotas' }, { k: 'GM', v: 'Golos marcados' }, { k: 'GS', v: 'Golos sofridos' }, { k: 'Pts', v: 'Pontos' }].map(({ k, v }) => (
                <View key={k} style={s.colKeyRow}>
                  <Text style={[s.colKeyK, { color: colors.primary }]}>{k}</Text>
                  <Text style={[s.colKeyV, { color: colors.textSecondary }]}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
      <View style={{ height: 24 }} />
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingBottom: embedded ? 0 : insets.bottom, flex: 1, minHeight: 400 }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[s.title, { color: colors.textPrimary }]}>{competition}</Text>
          <Text style={[s.subtitle, { color: colors.textMuted }]}>Época {season}</Text>
        </View>
        {embedded ? (
          <View style={[s.embeddedBadge, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="trophy-outline" size={12} color={colors.primary} />
            <Text style={[s.embeddedBadgeText, { color: colors.primary }]}>Tabela</Text>
          </View>
        ) : (
          <Pressable hitSlop={12} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={[s.tabs, { borderBottomColor: colors.border }]}>
        {(['default', 'home', 'away'] as SortKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setSortKey(key)}
            style={[s.tab, sortKey === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[s.tabText, { color: sortKey === key ? colors.primary : colors.textMuted }]}>
              {key === 'default' ? 'Geral' : key === 'home' ? '🏠 Casa' : '✈️ Fora'}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setViewMode(v => v === 'stats' ? 'form' : 'stats')}
          style={[s.tab, s.viewToggle, { backgroundColor: viewMode === 'form' ? `${colors.primary}18` : undefined }]}
        >
          <Ionicons
            name={viewMode === 'form' ? 'analytics-outline' : 'pulse-outline'}
            size={15}
            color={viewMode === 'form' ? colors.primary : colors.textMuted}
          />
          <Text style={[s.tabText, { color: viewMode === 'form' ? colors.primary : colors.textMuted, marginLeft: 3 }]}>
            {viewMode === 'form' ? 'Stats' : 'Forma'}
          </Text>
        </Pressable>
      </View>

      <View style={[s.colHeader, { borderBottomColor: colors.border, backgroundColor: `${colors.primary}08` }]}>
        <View style={s.zoneStrip} />
        <Text style={[s.pos, { color: colors.textMuted }]}>#</Text>
        <Text style={[s.teamName, { color: colors.textMuted }]}>Equipa</Text>
        {viewMode === 'stats' ? (
          <>
            <Text style={[s.cell, { color: colors.textMuted }]}>J</Text>
            <Text style={[s.cell, { color: '#22c55e', fontWeight: '700' }]}>V</Text>
            <Text style={[s.cell, { color: colors.textMuted }]}>E</Text>
            <Text style={[s.cell, { color: '#ef4444', fontWeight: '700' }]}>D</Text>
            <Text style={[s.cell, { color: colors.textMuted }]}>GM</Text>
            <Text style={[s.cell, { color: colors.textMuted }]}>GS</Text>
            <Text style={[s.pts, { color: colors.textMuted }]}>Pts</Text>
          </>
        ) : (
          <Text style={[s.pts, { color: colors.textMuted, flex: 1, textAlign: 'right' }]}>Últimos 5</Text>
        )}
      </View>

      {tableQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={[s.empty, { color: colors.textMuted }]}>Sem dados disponíveis</Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map((item) => (
            <React.Fragment key={item.id}>
              {renderRow(item)}
            </React.Fragment>
          ))}
          {listFooter}
        </ScrollView>
      )}
    </View>
  );
}
// ─── Public component ─────────────────────────────────────────────────────────

export function LeagueTableModal({ visible, embedded = false, onTeamPress, ...rest }: Props) {
  if (embedded) {
    return <TableContent embedded onTeamPress={onTeamPress} {...rest} />;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={rest.onClose}
    >
      <TableContent onTeamPress={onTeamPress} {...rest} />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  embeddedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  embeddedBadgeText: { fontSize: 12, fontWeight: '700' },

  tabs: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  tab: { alignItems: 'center', flex: 1, paddingVertical: 10 },
  tabText: { fontSize: 13, fontWeight: '700' },
  viewToggle: { flexDirection: 'row', borderRadius: 6, marginHorizontal: 4, paddingHorizontal: 4 },

  formPillsCell: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 3 },
  formPill: { width: 22, height: 22, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  formPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  colHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  abbrevBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  abbrevScroll: { paddingHorizontal: 12, gap: 16, flexDirection: 'row' },
  abbrevItem: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  abbrevKey: { fontSize: 11, fontWeight: '800' },
  abbrevVal: { fontSize: 11 },

  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  zoneStrip: { width: 3, height: 28, borderRadius: 2, marginRight: 4 },
  pos: { fontSize: 12, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  highlightDot: { borderRadius: 3, height: 6, width: 6 },
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  teamName: { flex: 1, fontSize: 13 },
  cell: { fontSize: 12, minWidth: 22, textAlign: 'center' },
  pts: { fontSize: 13, fontWeight: '800', minWidth: 28, textAlign: 'right' },
  empty: { fontSize: 14, marginTop: 40, textAlign: 'center' },

  legendBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  legendTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendStrip: { width: 4, height: 16, borderRadius: 2 },
  legendIcon: { fontSize: 13 },
  legendLabel: { fontSize: 13, fontWeight: '500' },

  rulesToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  rulesToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rulesToggleText: { fontSize: 13, fontWeight: '600' },
  rulesBox: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  rulesTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 18 },
  colKeyBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4, gap: 6 },
  colKeyGrid: { gap: 4 },
  colKeyRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  colKeyK: { fontSize: 12, fontWeight: '800', minWidth: 28 },
  colKeyV: { fontSize: 12 },
});