import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Switch,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, } from 'react-native-reanimated';
import { Sport } from '@betintel/shared';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { CompetitionBadge } from '../../components/ui/CompetitionBadge';
import { PressableScale } from '../../components/ui/PressableScale';
import { useTheme } from '../../theme/useTheme';
import { useUpcomingFixtures, useRecentFixtures, useFixturesByDate } from '../../services/referenceService';
import type { Fixture } from '../../services/referenceService';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import type { BoletinBuilderItem } from '../../stores/boletinBuilderStore';
import {
  getCountryFlagEmoji,
  getCountryFlagUrl,
  getLeagueLogoUrl,
  getTeamLogoUrl,
} from '../../utils/sportAssets';
import { hapticLight, hapticSelection, hapticSuccess } from '../../utils/haptics';
import { useQueryClient } from '@tanstack/react-query';
import { BoletinItem as BoletinSelectionRow } from '../../components/boletins/BoletinItem';
import { ItemResult } from '@betintel/shared';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { useToast } from '../../components/ui/Toast';
import { BETTING_SITES } from '../../utils/sportAssets';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { NumericInput } from '../../components/ui/NumericInput';
import { useMarkets } from '../../services/referenceService';
import { isSelfDescribing, humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { Input } from '../../components/ui/Input';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFavourites, useToggleFavouriteMutation, useBulkSetFavouritesMutation } from '../../services/favouritesService';
import { FavouriteType } from '@betintel/shared';
import { useWatchedFixtures, useToggleFixtureWatchMutation } from '../../services/fixtureAlertService';
import { LeagueTableModal } from '../../components/fixtures/LeagueTableModal';
import { useFixtureInsight, useLeagueTable } from '../../services/teamStatsService';
import type { TeamStatData } from '../../services/teamStatsService';

// ─── Country name mapping: English (fixture feed) → Portuguese (asset keys) ──

const COUNTRY_EN_TO_PT: Record<string, string> = {
  Portugal: 'Portugal',
  England: 'Inglaterra',
  Scotland: 'Escócia',
  Spain: 'Espanha',
  Italy: 'Itália',
  Germany: 'Alemanha',
  France: 'França',
  Netherlands: 'Holanda',
  Belgium: 'Bélgica',
  Turkey: 'Turquia',
  Austria: 'Áustria',
  Switzerland: 'Suíça',
  Greece: 'Grécia',
  Canada: 'Canadá',
  Monaco: 'Mónaco',
  Mexico: 'México',
  Chile: 'Chile',
  China: 'China',
  Japan: 'Japão',
  'New Zealand': 'Nova Zelândia',
  'United Arab Emirates': 'Emirados Árabes Unidos',
  Qatar: 'Qatar',
  Croatia: 'Croácia',
  Kazakhstan: 'Cazaquistão',
  Sweden: 'Suécia',
  Brazil: 'Brasil',
  Argentina: 'Argentina',
  USA: 'EUA',
  'United States': 'EUA',
  Australia: 'Austrália',
  International: 'Internacional',
  Europe: 'Internacional',
  Russia: 'Rússia',
  Ukraine: 'Ucrânia',
  Poland: 'Polónia',
  Romania: 'Roménia',
  Serbia: 'Sérvia',
  Hungary: 'Hungria',
  'Czech Republic': 'República Checa',
  Czechia: 'República Checa',
  Slovakia: 'Eslováquia',
  Norway: 'Noruega',
  Denmark: 'Dinamarca',
  Ireland: 'Irlanda',
  Colombia: 'Colômbia',
  Peru: 'Peru',
  Uruguay: 'Uruguai',
  'South Korea': 'Coreia do Sul',
  'Saudi Arabia': 'Arábia Saudita',
  Morocco: 'Marrocos',
  'South Africa': 'África do Sul',
  Nigeria: 'Nigéria',
};

// Add this map near the top of FixturesScreen.tsx alongside FIXTURE_TEAM_ALIASES
const COMPETITION_ALIASES: Record<string, string> = {
  'Primeira Liga':     'Liga Portugal Betclic',
  'Liga NOS':          'Liga Portugal Betclic',
  'Champions League':  'UEFA Champions League',
  'Europa League':     'UEFA Europa League',
  'Conference League': 'UEFA Conference League',
};

function resolveCompetition(name: string): string {
  return COMPETITION_ALIASES[name] ?? name;
}

function resolveCountry(country: string): string {
  return COUNTRY_EN_TO_PT[country] ?? country;
}

// ─── Team name mapping ────────────────────────────────────────────────────────

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

function resolveFixtureTeamName(name: string): string {
  return FIXTURE_TEAM_ALIASES[name] ?? name;
}

function getFixtureTeamLogoUrl(teamName: string): string | null {
  return getTeamLogoUrl(resolveFixtureTeamName(teamName));
}

// ─── Extended market list ─────────────────────────────────────────────────────

const EXTENDED_MARKETS: Array<{
  category: string;
  items: Array<{
    chip: string;
    market: string;
    selections: Array<{ label: string; sub: string; value: string }>;
  }>;
}> = [
  {
    category: 'Resultado',
    items: [
      {
        chip: '1X2',
        market: 'Resultado Final (1X2)',
        selections: [
          { label: 'Casa', sub: '1', value: '1' },
          { label: 'Empate', sub: 'X', value: 'X' },
          { label: 'Fora', sub: '2', value: '2' },
        ],
      },
      {
        chip: 'Dupla Chance',
        market: 'Dupla Chance',
        selections: [
          { label: '1X', sub: 'Casa ou Empate', value: '1X' },
          { label: '12', sub: 'Casa ou Fora', value: '12' },
          { label: 'X2', sub: 'Empate ou Fora', value: 'X2' },
        ],
      },
    ],
  },
  {
    category: 'Golos',
    items: [
      {
        chip: 'Over 0.5',
        market: 'Golos - Mais de 0.5',
        selections: [
          { label: 'Over 0.5', sub: '≥ 1 golo', value: 'Over 0.5' },
          { label: 'Under 0.5', sub: '0 golos', value: 'Under 0.5' },
        ],
      },
      {
        chip: 'Over 1.5',
        market: 'Golos - Mais de 1.5',
        selections: [
          { label: 'Over 1.5', sub: '≥ 2 golos', value: 'Over 1.5' },
          { label: 'Under 1.5', sub: '≤ 1 golo', value: 'Under 1.5' },
        ],
      },
      {
        chip: 'Over 2.5',
        market: 'Golos - Mais de 2.5',
        selections: [
          { label: 'Over 2.5', sub: '≥ 3 golos', value: 'Over 2.5' },
          { label: 'Under 2.5', sub: '≤ 2 golos', value: 'Under 2.5' },
        ],
      },
      {
        chip: 'Over 3.5',
        market: 'Golos - Mais de 3.5',
        selections: [
          { label: 'Over 3.5', sub: '≥ 4 golos', value: 'Over 3.5' },
          { label: 'Under 3.5', sub: '≤ 3 golos', value: 'Under 3.5' },
        ],
      },
      {
        chip: 'Over 4.5',
        market: 'Golos - Mais de 4.5',
        selections: [
          { label: 'Over 4.5', sub: '≥ 5 golos', value: 'Over 4.5' },
          { label: 'Under 4.5', sub: '≤ 4 golos', value: 'Under 4.5' },
        ],
      },
      {
        chip: 'BTTS',
        market: 'Ambas as Equipas Marcam',
        selections: [
          { label: 'Sim', sub: 'Ambas marcam', value: 'Sim' },
          { label: 'Não', sub: 'Uma não marca', value: 'Não' },
        ],
      },
    ],
  },
  {
    category: 'Intervalo',
    items: [
      {
        chip: '1X2 HT',
        market: 'Resultado ao Intervalo',
        selections: [
          { label: 'Casa', sub: '1', value: '1' },
          { label: 'Empate', sub: 'X', value: 'X' },
          { label: 'Fora', sub: '2', value: '2' },
        ],
      },
      {
        chip: 'Over 0.5 HT',
        market: 'Golos ao Intervalo - Mais de 0.5',
        selections: [
          { label: 'Over 0.5', sub: '≥ 1 golo', value: 'Over 0.5' },
          { label: 'Under 0.5', sub: '0 golos', value: 'Under 0.5' },
        ],
      },
      {
        chip: 'Over 1.5 HT',
        market: 'Golos ao Intervalo - Mais de 1.5',
        selections: [
          { label: 'Over 1.5', sub: '≥ 2 golos', value: 'Over 1.5' },
          { label: 'Under 1.5', sub: '≤ 1 golo', value: 'Under 1.5' },
        ],
      },
    ],
  },
  {
    category: 'Cantos',
    items: [
      {
        chip: 'Over 7.5 Cantos',
        market: 'Cantos - Mais de 7.5',
        selections: [
          { label: 'Over 7.5', sub: '≥ 8 cantos', value: 'Over 7.5' },
          { label: 'Under 7.5', sub: '≤ 7 cantos', value: 'Under 7.5' },
        ],
      },
      {
        chip: 'Over 9.5 Cantos',
        market: 'Cantos - Mais de 9.5',
        selections: [
          { label: 'Over 9.5', sub: '≥ 10 cantos', value: 'Over 9.5' },
          { label: 'Under 9.5', sub: '≤ 9 cantos', value: 'Under 9.5' },
        ],
      },
    ],
  },
  {
    category: 'Cartões',
    items: [
      {
        chip: 'Over 1.5 Cartões',
        market: 'Cartões - Mais de 1.5',
        selections: [
          { label: 'Over 1.5', sub: '≥ 2 cartões', value: 'Over 1.5' },
          { label: 'Under 1.5', sub: '≤ 1 cartão', value: 'Under 1.5' },
        ],
      },
      {
        chip: 'Over 3.5 Cartões',
        market: 'Cartões - Mais de 3.5',
        selections: [
          { label: 'Over 3.5', sub: '≥ 4 cartões', value: 'Over 3.5' },
          { label: 'Under 3.5', sub: '≤ 3 cartões', value: 'Under 3.5' },
        ],
      },
    ],
  },
];

const ALL_MARKET_ITEMS = EXTENDED_MARKETS.flatMap((cat) => cat.items);

// Top 7 leagues by competition name — these are shown expanded even without a favourite
const TOP_7_LEAGUES = new Set([
  'Primeira Liga',        // Portugal
  'Premier League',       // England
  'La Liga',              // Spain
  'Serie A',              // Italy
  'Bundesliga',           // Germany
  'Ligue 1',              // France
  'Champions League',     // UEFA
]);

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toLocalDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function stripTime(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function humanDateLabel(d: Date): string {
  const today = stripTime(new Date());
  const target = stripTime(d);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  if (diff === 1) return 'Amanhã';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function fullDateLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ─── Timezone helpers ─────────────────────────────────────────────────────────

/**
 * Country-to-UTC-offset map for converting feed times to Lisbon time.
 *
 * The feed stores kickoff times as UTC+1 (Western Europe / Lisbon standard)
 * without a timezone marker. So for Portugal & England (UTC+0/UTC+1 → same
 * as feed) we apply 0 correction. For Central European countries (UTC+1/UTC+2)
 * we subtract 1 hour. For Eastern Europe (UTC+2/UTC+3) we subtract 2 hours.
 *
 * Only applies when the fixture has a valid, non-midnight time.
 */
const COUNTRY_LISBON_OFFSET: Record<string, number> = {
  // No correction — feed time IS Lisbon time
  Portugal: 0,
  England: 0,
  Scotland: 0,
  Ireland: 0,

  // Central Europe (UTC+1 standard / UTC+2 summer) → -1h vs feed
  Spain: -1,
  Germany: -1,
  France: -1,
  Italy: -1,
  Netherlands: -1,
  Belgium: -1,
  Austria: -1,
  Switzerland: -1,
  Norway: -1,
  Sweden: -1,
  Denmark: -1,
  'Czech Republic': -1,
  Czechia: -1,
  Slovakia: -1,
  Hungary: -1,
  Poland: -1,
  Croatia: -1,
  Serbia: -1,
  Romania: -1, // UTC+2 but close enough for display
  Monaco: -1,

  // Eastern Europe (UTC+2 standard / UTC+3 summer) → -2h vs feed
  Ukraine: -2,
  Russia: -2,
  Kazakhstan: -2,
  Turkey: -2,
  Greece: -2,

  // Non-European — leave as-is (feed origin unknown, don't adjust)
};

/**
 * Returns false only when the time is exactly 00:00 local in the ISO string itself.
 * We check the raw string rather than the parsed Date to avoid UTC confusion.
 * Strings like "2025-05-02T00:00:00" or ending in "T00:00:00.000Z" are placeholders.
 */
function hasValidTime(iso: string): boolean {
  // Match T00:00 at the start of the time component
  return !/T00:00/.test(iso);
}

/**
 * Parse the feed ISO string and apply a per-country Lisbon correction.
 * If the country is unknown or the time is 00:00, returns the raw Date.
 */
function adjustKickoff(iso: string, country?: string): Date {
  const d = new Date(iso);
  if (!hasValidTime(iso)) return d; // midnight placeholder — don't touch
  const offset = country !== undefined ? (COUNTRY_LISBON_OFFSET[country] ?? 0) : 0;
  d.setHours(d.getHours() + offset);
  return d;
}

function formatKickoff(iso: string, country?: string): string {
  if (!hasValidTime(iso)) return '--:--';
  const d = adjustKickoff(iso, country);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(iso: string, country?: string): string {
  return fullDateLabel(adjustKickoff(iso, country));
}

function adjustedDateKey(iso: string, country?: string): string {
  return toLocalDateKey(adjustKickoff(iso, country));
}

// ─── Grouping helpers ─────────────────────────────────────────────────────────

interface Section {
  title: string;
  competition: string;
  country: string;
  totalCount: number;
  data: Fixture[];
}

function groupByCompetition(fixtures: Fixture[]): Section[] {
  const map = new Map<string, { fixtures: Fixture[]; country: string }>();
  for (const f of fixtures) {
    if (!map.has(f.competition)) map.set(f.competition, { fixtures: [], country: f.country });
    map.get(f.competition)!.fixtures.push(f);
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.fixtures.length - a.fixtures.length)
    .map(([competition, { fixtures: data, country }]) => ({
      title: competition,
      competition,
      country,
      totalCount: data.length,
      data,
    }));
}

// ─── Calendar picker modal ────────────────────────────────────────────────────

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DAYS_OF_WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

interface CalendarPickerProps {
  visible: boolean;
  selectedDate: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
  colors: Record<string, string>;
}

function CalendarPicker({ visible, selectedDate, onSelect, onClose, colors }: CalendarPickerProps) {
  const [viewYear, setViewYear] = useState<number>(() => selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => selectedDate.getMonth());

  const today = stripTime(new Date());
  const monthLabel = MONTHS_PT[viewMonth] ?? '';
  const capitalised = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const firstDowSun = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = (firstDowSun + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: Array<number | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const gridRows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) gridRows.push(cells.slice(i, i + 7));

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function isSelected(day: number) {
    return selectedDate.getFullYear() === viewYear && selectedDate.getMonth() === viewMonth && selectedDate.getDate() === day;
  }

  function isToday(day: number) {
    return today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={calStyles.overlay} onPress={onClose}>
        <Pressable style={[calStyles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
          <View style={calStyles.monthRow}>
            <Pressable hitSlop={14} onPress={prevMonth} style={[calStyles.navBtn, { borderColor: colors.border }]}>
              <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
            </Pressable>
            <Text style={[calStyles.monthLabel, { color: colors.textPrimary }]}>{capitalised} {viewYear}</Text>
            <Pressable hitSlop={14} onPress={nextMonth} style={[calStyles.navBtn, { borderColor: colors.border }]}>
              <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
          <View style={calStyles.dowRow}>
            {DAYS_OF_WEEK.map((l) => (
              <Text key={l} style={[calStyles.dowLabel, { color: colors.textMuted }]}>{l}</Text>
            ))}
          </View>
          <View style={calStyles.grid}>
            {gridRows.map((row, rowIdx) => (
              <View key={rowIdx} style={calStyles.gridRow}>
                {row.map((day, colIdx) => {
                  if (day === null) return <View key={`e-${rowIdx}-${colIdx}`} style={calStyles.cell} />;
                  const sel = isSelected(day);
                  const tod = isToday(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => { onSelect(new Date(viewYear, viewMonth, day)); onClose(); }}
                      style={[
                        calStyles.cell,
                        sel && [calStyles.cellSelected, { backgroundColor: colors.primary }],
                        !sel && tod && [calStyles.cellToday, { borderColor: colors.primary }],
                      ]}
                    >
                      <Text style={[calStyles.cellText, { color: sel ? '#fff' : tod ? colors.primary : colors.textPrimary }, sel && { fontWeight: '800' }]}>
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <View style={[calStyles.footer, { borderTopColor: colors.border }]}>
            <Pressable onPress={onClose} style={calStyles.cancelBtn}>
              <Text style={[calStyles.cancelText, { color: colors.textSecondary }]}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => { onSelect(today); onClose(); }} style={[calStyles.todayBtn, { borderColor: colors.border }]}>
              <Text style={[calStyles.todayText, { color: colors.textPrimary }]}>Hoje</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const calStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 360, borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { borderWidth: 1, borderRadius: 8, padding: 4 },
  monthLabel: { fontSize: 16, fontWeight: '700' },
  dowRow: { flexDirection: 'row' },
  dowLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingBottom: 4 },
  grid: { gap: 2 },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSelected: { borderRadius: 999 },
  cellToday: { borderRadius: 999, borderWidth: 1.5 },
  cellText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelText: { fontSize: 14, fontWeight: '600' },
  todayBtn: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderRadius: 8 },
  todayText: { fontSize: 14, fontWeight: '700' },
});

// ─── Day filter bar ───────────────────────────────────────────────────────────

interface DayFilterBarProps {
  selectedDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onOpenCalendar: () => void;
  colors: Record<string, string>;
}

function DayFilterBar({ selectedDate, onPrev, onNext, onOpenCalendar, colors }: DayFilterBarProps) {
  const label = humanDateLabel(selectedDate);
  const isToday = toLocalDateKey(selectedDate) === toLocalDateKey(stripTime(new Date()));
  const full = fullDateLabel(selectedDate);

  return (
    <View style={[dayBarStyles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <Pressable hitSlop={14} onPress={onPrev} style={dayBarStyles.arrow}>
        <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
      </Pressable>
      <Pressable onPress={onOpenCalendar} style={dayBarStyles.center}>
        <Ionicons name="calendar-outline" size={14} color={colors.primary} style={{ marginRight: 5 }} />
        <Text style={[dayBarStyles.label, { color: colors.textPrimary }]}>{label}</Text>
        {!isToday && <Text style={[dayBarStyles.sublabel, { color: colors.textMuted }]}>  {full}</Text>}
        <Ionicons name="chevron-down" size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />
      </Pressable>
      <Pressable hitSlop={14} onPress={onNext} style={dayBarStyles.arrow}>
        <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const dayBarStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  arrow: { padding: 6 },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700' },
  sublabel: { fontSize: 12, fontWeight: '400' },
});

// ─── Country flag ─────────────────────────────────────────────────────────────

function CountryFlag({ country, size = 16 }: { country: string; size?: number }) {
  const ptCountry = resolveCountry(country);
  const flagUrl = getCountryFlagUrl(ptCountry);
  const emoji = getCountryFlagEmoji(ptCountry);

  if (flagUrl) {
    return <Image source={{ uri: flagUrl }} style={{ width: size * 1.4, height: size, borderRadius: 2 }} resizeMode="cover" />;
  }
  return <Text style={{ fontSize: size * 0.75 }}>{emoji}</Text>;
}

// ─── Add-to-boletim bottom sheet ──────────────────────────────────────────────
interface AddSheetProps {
  fixture: Fixture | null;
  onClose: () => void;
  onAdded: () => void;
}

const SHEET_SNAP_COLLAPSED = 0.45; // fraction of screen height when partially open

// ─── Insight Tab (new full-screen design) ────────────────────────────────────

function InsightTab({ fixture }: { fixture: Fixture }) {
  const { colors } = useTheme();
  const { data: insight, isLoading, isError } = useFixtureInsight(fixture.id);

  if (isLoading) {
    return (
      <View style={newInsightStyles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[newInsightStyles.loadingText, { color: colors.textMuted }]}>A carregar análise…</Text>
      </View>
    );
  }

  if (isError || !insight) {
    return (
      <View style={newInsightStyles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
        <Text style={[newInsightStyles.loadingText, { color: colors.textMuted }]}>
          Sem dados suficientes para este jogo.
        </Text>
      </View>
    );
  }

  const home = insight.homeTeamAtHome ?? null;
  const away = insight.awayTeamAway ?? null;

  function pct(n: number | null | undefined): string {
    if (n == null || !isFinite(n)) return '—';
    return `${Math.round(n)}%`;
  }
  function fmt1(n: number | null | undefined): string {
    if (n == null || !isFinite(n)) return '—';
    return n.toFixed(1);
  }

  const FORM_COLOR: Record<string, string> = { W: '#22c55e', D: '#6b7280', L: '#ef4444' };
  const FORM_LABEL: Record<string, string> = { W: 'V', D: 'E', L: 'D' };

  function StandingsCard() {
    const hs  = insight!.standings?.home  ?? null;
    const as_ = insight!.standings?.away  ?? null;
    if (!hs && !as_) return null;

    function StatRow({ stat, teamName, isHome }: { stat: TeamStatData; teamName: string; isHome: boolean }) {
      const gd     = stat.goalsFor - stat.goalsAgainst;
      const gdStr  = gd >= 0 ? `+${gd}` : String(gd);
      const color  = isHome ? '#22c55e' : '#ef4444';
      return (
        <View style={newInsightStyles.standingsRow}>
          <View style={[newInsightStyles.standingsPosBox, { backgroundColor: `${color}20` }]}>
            <Text style={[newInsightStyles.standingsPosText, { color }]}>{stat.position ?? '—'}</Text>
          </View>
          <Text style={newInsightStyles.standingsVenueIcon}>{isHome ? '🏠' : '✈️'}</Text>
          <Text style={[newInsightStyles.standingsTeamName, { color: colors.textPrimary }]} numberOfLines={1}>{teamName}</Text>
          {[stat.played, stat.won, stat.drawn, stat.lost].map((v, i) => (
            <Text key={i} style={[newInsightStyles.standingsStat, { color: colors.textSecondary }]}>{v}</Text>
          ))}
          <Text style={[newInsightStyles.standingsStat, { color: gd >= 0 ? '#22c55e' : '#ef4444' }]}>{gdStr}</Text>
          <Text style={[newInsightStyles.standingsStat, { color: colors.textPrimary, fontWeight: '800' }]}>{stat.points}</Text>
        </View>
      );
    }

    return (
      <View style={[newInsightStyles.standingsCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={newInsightStyles.sectionHeaderRow}>
          <Ionicons name="trophy-outline" size={14} color={colors.primary} />
          <Text style={[newInsightStyles.sectionHeaderTitle, { color: colors.primary }]}>CLASSIFICAÇÃO</Text>
        </View>
        <View style={newInsightStyles.standingsHeaderRow}>
          {(['#', '', 'J', 'V', 'E', 'D', 'DG', 'Pts'] as const).map((c, i) => (
            <Text
              key={i}
              style={[
                i === 0 ? newInsightStyles.standingsHeaderPos
                  : i === 1 ? newInsightStyles.standingsHeaderTeam
                  : newInsightStyles.standingsHeaderCol,
                { color: colors.textMuted },
              ]}
            >{c}</Text>
          ))}
        </View>
        {hs  && <StatRow stat={hs}  teamName={fixture.homeTeam} isHome={true}  />}
        {as_ && <StatRow stat={as_} teamName={fixture.awayTeam} isHome={false} />}
      </View>
    );
  }

  function TeamCard({
    team,
    teamName,
    venue,
    venueLabel,
    data,
    injuries,
    topScorers,
  }: {
    team: 'home' | 'away';
    teamName: string;
    venue: string;
    venueLabel: string;
    data: typeof home;
    injuries: NonNullable<typeof insight>['homeInjuries'];
    topScorers: NonNullable<typeof insight>['homeTopScorers'];
  }) {
    if (!data) return null;

    const stats6 = [
      { label: '+1.5',     value: pct(data.over15Pct) },
      { label: '+2.5',     value: pct(data.over25Pct) },
      { label: '+3.5',     value: pct(data.over35Pct) },
      { label: 'BTTS',     value: pct(data.bttsPct) },
      { label: 'B. ZERO',  value: pct(data.cleanSheetPct) },
      { label: 'N. MARCOU',value: pct(data.failedToScorePct) },
    ];

    return (
      <View style={[newInsightStyles.teamCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {/* Header */}
        <View style={newInsightStyles.teamCardHeader}>
          <Text style={newInsightStyles.teamCardVenueIcon}>{venue}</Text>
          <Text style={[newInsightStyles.teamCardName, { color: colors.textPrimary }]}>{teamName}</Text>
          <View style={[newInsightStyles.teamCardVenueBadge, { backgroundColor: colors.background }]}>
            <Text style={[newInsightStyles.teamCardVenueText, { color: colors.textSecondary }]}>{venueLabel}</Text>
          </View>
        </View>

        {/* Form last 5 */}
        <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted }]}>ÚLTIMOS 5 JOGOS</Text>
        <View style={newInsightStyles.formRow}>
          {data.formLast5.map((r: string, i: number) => (
            <View key={i} style={[newInsightStyles.formPill, { backgroundColor: FORM_COLOR[r] ?? colors.border }]}>
              <Text style={newInsightStyles.formPillText}>{FORM_LABEL[r] ?? r}</Text>
            </View>
          ))}
        </View>
        <View style={newInsightStyles.formLegend}>
          {[{ color: '#22c55e', label: 'Vitória' }, { color: '#6b7280', label: 'Empate' }, { color: '#ef4444', label: 'Derrota' }].map((l) => (
            <View key={l.label} style={newInsightStyles.legendItem}>
              <View style={[newInsightStyles.legendDot, { backgroundColor: l.color }]} />
              <Text style={[newInsightStyles.legendText, { color: colors.textMuted }]}>{l.label}</Text>
            </View>
          ))}
        </View>

        {/* Key metrics row */}
        <View style={[newInsightStyles.metricsRow, { borderColor: colors.border }]}>
          {[
            { value: fmt1(data.avgGoalsFor),     label: 'MÉD. GM',    color: colors.textPrimary },
            { value: fmt1(data.avgGoalsAgainst), label: 'MÉD. GS',    color: colors.textPrimary },
            { value: fmt1(data.avgCornersFor),   label: 'MÉD. CANTOS',color: colors.textPrimary },
            { value: fmt1(data.avgYellowCards),  label: 'MÉD. AMA.',  color: '#f59e0b' },
          ].map((m, i) => (
            <React.Fragment key={m.label}>
              {i > 0 && <View style={[newInsightStyles.metricDivider, { backgroundColor: colors.border }]} />}
              <View style={newInsightStyles.metricItem}>
                <Text style={[newInsightStyles.metricValue, { color: m.color }]}>{m.value}</Text>
                <Text style={[newInsightStyles.metricLabel, { color: colors.textMuted }]}>{m.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* 6-stat grid */}
        <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted }]}>MERCADOS POPULARES</Text>
        <View style={newInsightStyles.statsGrid}>
          {stats6.map((s) => (
            <View key={s.label} style={[newInsightStyles.statGridItem, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
              <Text style={[newInsightStyles.statGridValue, { color: colors.primary }]}>{s.value}</Text>
              <Text style={[newInsightStyles.statGridLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Injuries / suspensions */}
        {injuries.length > 0 && (
          <>
            <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted }]}>BAIXAS</Text>
            <View style={newInsightStyles.chipsRow}>
              {injuries.slice(0, 6).map((inj, i) => (
                <View key={i} style={[newInsightStyles.injuryChip, { backgroundColor: '#ef444418', borderColor: '#ef444435' }]}>
                  <Ionicons
                    name={inj.type === 'suspension' ? 'card-outline' : 'bandage-outline'}
                    size={11} color="#ef4444"
                  />
                  <Text style={[newInsightStyles.injuryChipText, { color: '#ef4444' }]} numberOfLines={1}>
                    {inj.playerName}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Top scorers */}
        {topScorers.length > 0 && (
          <>
            <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted }]}>MARCADORES</Text>
            {topScorers.slice(0, 4).map((s, i) => (
              <View key={i} style={[newInsightStyles.scorerRow, { borderTopColor: colors.border }]}>
                <Text style={[newInsightStyles.scorerRank, { color: colors.textMuted }]}>{i + 1}</Text>
                <Text style={[newInsightStyles.scorerName, { color: colors.textPrimary }]} numberOfLines={1}>{s.playerName}</Text>
                <View style={[newInsightStyles.scorerBadge, { backgroundColor: `${colors.primary}15` }]}>
                  <Ionicons name="football-outline" size={11} color={colors.primary} />
                  <Text style={[newInsightStyles.scorerGoals, { color: colors.primary }]}>{s.goals}</Text>
                </View>
                {(s.assists ?? 0) > 0 && (
                  <View style={[newInsightStyles.scorerBadge, { backgroundColor: `${colors.textMuted}15` }]}>
                    <Ionicons name="arrow-redo-outline" size={11} color={colors.textMuted} />
                    <Text style={[newInsightStyles.scorerGoals, { color: colors.textMuted }]}>{s.assists}</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        <Text style={[newInsightStyles.sampleNote, { color: colors.textMuted }]}>
          Baseado em {data.sampleSize} jogos {team === 'home' ? 'em casa' : 'fora'} esta época
        </Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={newInsightStyles.scroll}>

      {/* Season hint */}
      <View style={[newInsightStyles.hintBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}25` }]}>
        <Ionicons name="bulb-outline" size={15} color={colors.primary} />
        <Text style={[newInsightStyles.hintText, { color: colors.textSecondary }]}>
          Dados desta época. As percentagens referem-se ao desempenho em casa (equipa da casa) e fora (equipa visitante).
        </Text>
      </View>

      {/* Combined probability */}
      {(insight.combinedOver25 != null || insight.combinedBtts != null) && (
        <View style={[newInsightStyles.probCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` }]}>
          <View style={newInsightStyles.probCardHeader}>
            <Ionicons name="trending-up" size={14} color={colors.primary} />
            <Text style={[newInsightStyles.probCardTitle, { color: colors.primary }]}>PROBABILIDADE COMBINADA</Text>
          </View>
          <Text style={[newInsightStyles.probCardSub, { color: colors.textSecondary }]}>
            Estimativa baseada nos dados de ambas as equipas
          </Text>
          <View style={newInsightStyles.probRow}>
            {insight.combinedOver25 != null && (
              <View style={newInsightStyles.probItem}>
                <Text style={[newInsightStyles.probValue, { color: colors.primary }]}>{pct(insight.combinedOver25)}</Text>
                <Text style={[newInsightStyles.probLabel, { color: colors.textPrimary }]}>Over 2.5 Golos</Text>
                <Text style={[newInsightStyles.probSubLabel, { color: colors.textMuted }]}>3+ golos no jogo</Text>
              </View>
            )}
            {insight.combinedOver25 != null && insight.combinedBtts != null && (
              <View style={[newInsightStyles.probDivider, { backgroundColor: colors.border }]} />
            )}
            {insight.combinedBtts != null && (
              <View style={newInsightStyles.probItem}>
                <Text style={[newInsightStyles.probValue, { color: colors.primary }]}>{pct(insight.combinedBtts)}</Text>
                <Text style={[newInsightStyles.probLabel, { color: colors.textPrimary }]}>Ambas marcam</Text>
                <Text style={[newInsightStyles.probSubLabel, { color: colors.textMuted }]}>as duas equipas marcam</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Standings */}
      <StandingsCard />

      {/* Home team card */}
      {home != null && (
        <TeamCard
          team="home"
          teamName={fixture.homeTeam}
          venue="🏠"
          venueLabel="Em casa"
          data={home}
          injuries={insight.homeInjuries ?? []}
          topScorers={insight.homeTopScorers ?? []}
        />
      )}

      {/* Away team card */}
      {away != null && (
        <TeamCard
          team="away"
          teamName={fixture.awayTeam}
          venue="✈️"
          venueLabel="Fora"
          data={away}
          injuries={insight.awayInjuries ?? []}
          topScorers={insight.awayTopScorers ?? []}
        />
      )}

      {/* H2H */}
      {insight.h2h && insight.h2h.total > 0 && (
        <View>
          <View style={newInsightStyles.sectionHeaderRow}>
            <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
            <Text style={[newInsightStyles.sectionHeaderTitle, { color: colors.primary }]}>HEAD-TO-HEAD</Text>
          </View>
          <Text style={[newInsightStyles.sectionHeaderSub, { color: colors.textMuted }]}>
            Histórico dos últimos {insight.h2h.total} confrontos directos
          </Text>

          <View style={[newInsightStyles.h2hCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={newInsightStyles.h2hBarRow}>
              <Text style={[newInsightStyles.h2hTeamName, { color: colors.textPrimary }]}>{fixture.homeTeam}</Text>
              <View style={[newInsightStyles.h2hTrack, { backgroundColor: colors.border }]}>
                <View style={[newInsightStyles.h2hSeg, { flex: insight.h2h.homeWins || 0.01, backgroundColor: '#22c55e' }]} />
                <View style={[newInsightStyles.h2hSeg, { flex: insight.h2h.draws    || 0.01, backgroundColor: '#6b7280' }]} />
                <View style={[newInsightStyles.h2hSeg, { flex: insight.h2h.awayWins || 0.01, backgroundColor: '#ef4444' }]} />
              </View>
              <Text style={[newInsightStyles.h2hTeamName, { color: colors.textPrimary, textAlign: 'right' }]}>{fixture.awayTeam}</Text>
            </View>
            <View style={newInsightStyles.formLegend}>
              {[
                { color: '#22c55e', label: 'Vitória casa' },
                { color: '#6b7280', label: 'Empate' },
                { color: '#ef4444', label: 'Vitória fora' },
              ].map((l) => (
                <View key={l.label} style={newInsightStyles.legendItem}>
                  <View style={[newInsightStyles.legendDot, { backgroundColor: l.color }]} />
                  <Text style={[newInsightStyles.legendText, { color: colors.textMuted }]}>{l.label}</Text>
                </View>
              ))}
            </View>

            <View style={[newInsightStyles.h2hStatsRow, { borderTopColor: colors.border }]}>
              {[
                { value: String(insight.h2h.homeWins), label: 'V casa',     color: '#22c55e' },
                { value: String(insight.h2h.draws),    label: 'Empates',    color: colors.textPrimary },
                { value: String(insight.h2h.awayWins), label: 'V fora',     color: '#ef4444' },
                { value: fmt1(insight.h2h.avgGoalsPerGame), label: 'Golos/jogo', color: colors.textPrimary },
                { value: pct(insight.h2h.over25Pct),   label: '+2.5',       color: colors.primary },
                { value: pct(insight.h2h.bttsPct),     label: 'BTTS',       color: colors.primary },
              ].map((s) => (
                <View key={s.label} style={newInsightStyles.h2hStatCol}>
                  <Text style={[newInsightStyles.h2hStatValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={[newInsightStyles.h2hStatLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted, marginTop: 12 }]}>ÚLTIMOS RESULTADOS</Text>
            {insight.h2h.recentMatches.slice(0, 5).map((m: any, i: number) => (
              <View key={i} style={[newInsightStyles.h2hRow, { borderTopColor: colors.border }]}>
                <Text style={[newInsightStyles.h2hDate, { color: colors.textMuted }]}>
                  {new Date(m.date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </Text>
                <Text numberOfLines={1} style={[newInsightStyles.h2hTeam, { color: colors.textSecondary }]}>{m.homeTeam}</Text>
                <View style={[newInsightStyles.h2hScoreBadge, { backgroundColor: colors.background }]}>
                  <Text style={[newInsightStyles.h2hScoreText, { color: colors.textPrimary }]}>
                    {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
                  </Text>
                </View>
                <Text numberOfLines={1} style={[newInsightStyles.h2hTeam, { color: colors.textSecondary, textAlign: 'right' }]}>{m.awayTeam}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Pinnacle odds */}
      {insight.sharpOdds?.pinnacleHome != null && (
        <View>
          <View style={newInsightStyles.sectionHeaderRow}>
            <Ionicons name="trending-up" size={16} color={colors.primary} />
            <Text style={[newInsightStyles.sectionHeaderTitle, { color: colors.primary }]}>ODDS PINNACLE (SHARP)</Text>
          </View>
          <Text style={[newInsightStyles.sectionHeaderSub, { color: colors.textMuted }]}>
            Probabilidades implícitas do mercado de referência mundial
          </Text>
          <View style={[newInsightStyles.pinnacleCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={newInsightStyles.pinnacleRow}>
              {[
                { label: '1 — Casa', odd: insight.sharpOdds.pinnacleHome, implied: insight.sharpOdds.impliedHome },
                { label: 'X — Empate', odd: insight.sharpOdds.pinnacleDraw, implied: insight.sharpOdds.impliedDraw },
                { label: '2 — Fora', odd: insight.sharpOdds.pinnacleAway, implied: insight.sharpOdds.impliedAway },
              ].map(({ label, odd, implied }) => odd != null ? (
                <View key={label} style={newInsightStyles.pinnacleCol}>
                  <Text style={[newInsightStyles.pinnacleLabel, { color: colors.textMuted }]}>{label}</Text>
                  <Text style={[newInsightStyles.pinnacleOdd, { color: colors.textPrimary }]}>{odd.toFixed(2)}</Text>
                  {implied != null && (
                    <View style={[newInsightStyles.impliedBadge, { backgroundColor: `${colors.primary}20` }]}>
                      <Text style={[newInsightStyles.impliedText, { color: colors.primary }]}>{pct(implied * 100)} prob.</Text>
                    </View>
                  )}
                </View>
              ) : null)}
            </View>
            {insight.sharpOdds.matchLabel && (
              <Text style={[newInsightStyles.pinnacleNote, { color: colors.textMuted, borderTopColor: colors.border }]}>
                ⓘ Pinnacle closing odds — {insight.sharpOdds.matchLabel}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Timestamp */}
      <Text style={[newInsightStyles.timestamp, { color: colors.textMuted }]}>
        ⏱ Análise calculada em {new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}, {new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
      </Text>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Add-to-boletim sheet (mirrors boletim create screen) ─────────────────────

type AddSheetTab = 'bet' | 'insight' | 'table';

function AddSheet({ fixture, onClose, onAdded }: AddSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AddSheetTab>('bet');

  useEffect(() => {
    if (fixture) {
      translateY.value = 0;
      setActiveTab('bet');
    }
  }, [fixture?.id]);

  // ── Store (unchanged) ──
  const storeItems       = useBoletinBuilderStore((s) => s.items);
  const storeStake       = useBoletinBuilderStore((s) => s.stake);
  const storeName        = useBoletinBuilderStore((s) => s.name);
  const storeNotes       = useBoletinBuilderStore((s) => s.notes);
  const storeIsPublic    = useBoletinBuilderStore((s) => s.isPublic);
  const storeIsFreebet   = useBoletinBuilderStore((s) => s.isFreebet);
  const storeSiteSlug    = useBoletinBuilderStore((s) => s.siteSlug);
  const storeTotalOdds   = useBoletinBuilderStore((s) => s.totalOdds);
  const storePotential   = useBoletinBuilderStore((s) => s.potentialReturn);
  const addItem          = useBoletinBuilderStore((s) => s.addItem);
  const removeItem       = useBoletinBuilderStore((s) => s.removeItem);
  const setStake         = useBoletinBuilderStore((s) => s.setStake);
  const setName          = useBoletinBuilderStore((s) => s.setName);
  const setNotes         = useBoletinBuilderStore((s) => s.setNotes);
  const setPublic        = useBoletinBuilderStore((s) => s.setPublic);
  const setFreebet       = useBoletinBuilderStore((s) => s.setFreebet);
  const setSiteSlug      = useBoletinBuilderStore((s) => s.setSiteSlug);
  const setBetDate       = useBoletinBuilderStore((s) => s.setBetDate);
  const storeBetDate     = useBoletinBuilderStore((s) => s.betDate);
  const save             = useBoletinBuilderStore((s) => s.save);
  const setItemEventDate = useBoletinBuilderStore((s) => s.setItemEventDate);

  const [useCustom, setUseCustom]               = useState(false);
  const [market, setMarket]                     = useState('');
  const [useCustomMarket, setUseCustomMarket]   = useState(false);
  const [selection, setSelection]               = useState('');
  const [odds, setOdds]                         = useState('');
  const [isSaving, setIsSaving]                 = useState(false);
  const [showSites, setShowSites]               = useState(false);
  const [showMarkets, setShowMarkets]           = useState(false);

  const marketsQuery = useMarkets(Sport.FOOTBALL);
  const marketSections = useMemo(() => {
    const data = marketsQuery.data ?? [];
    const grouped = new Map<string, typeof data>();
    for (const m of data) {
      const cat = m.category ?? 'Outro';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(m);
    }
    const ORDER = MARKET_CATEGORY_ORDER;
    const sortedCats = [...grouped.keys()].sort(
      (a, b) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)),
    );
    const fHome = fixture?.homeTeam ?? '';
    const fAway = fixture?.awayTeam ?? '';
    return sortedCats.map((cat) => ({
      title: cat,
      data: (grouped.get(cat) ?? []).map((m) => ({
        label: fHome && fAway ? humanizeMarket(m.name, fHome, fAway) : m.name,
        value: m.name,
      })),
    }));
  }, [marketsQuery.data, fixture]);

  useEffect(() => {
    if (!useCustomMarket && isSelfDescribing(market) && fixture) {
      setSelection(humanizeMarket(market, fixture.homeTeam, fixture.awayTeam));
    } else if (!useCustomMarket) {
      setSelection('');
    }
  }, [market, useCustomMarket, fixture]);

  const translateY = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  function dismiss() { onClose(); }

  const dragGesture = Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) translateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withTiming(800, { duration: 200 }, () => runOnJS(dismiss)());
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  function resetSelectionForm() { setMarket(''); setUseCustomMarket(false); setSelection(''); setOdds(''); }

  const parsedOdds = parseFloat(odds.replace(',', '.'));
  const canAddSelection = !!fixture && !!market.trim() && !!selection.trim() && parsedOdds >= 1.01;

  const defaultName = useMemo(() => {
    if (!fixture) return '';
    if (storeItems.length === 0) return `${fixture.homeTeam} vs ${fixture.awayTeam}`;
    if (storeItems.length === 1) return `${storeItems[0]!.homeTeam} vs ${storeItems[0]!.awayTeam}`;
    return `${storeItems[0]!.homeTeam} vs ${storeItems[0]!.awayTeam} + ${storeItems.length - 1}`;
  }, [fixture, storeItems]);

  const handleAddSelection = () => {
    if (!fixture || !canAddSelection) return;
    Keyboard.dismiss();
    addItem({
      id: `${fixture.id}-${market}-${selection}-${Date.now()}`,
      homeTeam: fixture.homeTeam,
      homeTeamImageUrl: getFixtureTeamLogoUrl(fixture.homeTeam),
      awayTeam: fixture.awayTeam,
      awayTeamImageUrl: getFixtureTeamLogoUrl(fixture.awayTeam),
      competition: fixture.competition,
      sport: Sport.FOOTBALL,
      market: humanizeMarket(market, fixture.homeTeam, fixture.awayTeam),
      selection,
      oddValue: parsedOdds,
      eventDate: fixture.kickoffAt,
    } as BoletinBuilderItem);
    hapticSuccess();
    resetSelectionForm();
    showToast('Seleção adicionada.', 'success');
  };

  const handleSave = async () => {
    if (storeItems.length === 0) { showToast('Adiciona pelo menos uma seleção.', 'error'); return; }
    try {
      setIsSaving(true);
      const created = await save();
      await queryClient.invalidateQueries({ queryKey: ['boletins'] });
      hapticSuccess();
      showToast('Boletim criado com sucesso.', 'success');
      translateY.value = 0;
      onClose();
      onAdded();
      router.push(`/boletins/${created.id}`);
    } catch { showToast('Não foi possível guardar o boletim.', 'error'); }
    finally { setIsSaving(false); }
  };

  if (!fixture) return null;
  const kickoffTime = formatKickoff(fixture.kickoffAt, fixture.country);

  const TABS: { key: AddSheetTab; label: string; icon: string }[] = [
    { key: 'bet', label: 'Apostar', icon: 'add-circle-outline' },
    { key: 'insight', label: 'Análise', icon: 'bar-chart-outline' },
    { key: 'table', label: 'Tabela', icon: 'trophy-outline' },
  ];

  const SCREEN_HEIGHT = Dimensions.get('window').height;

  return (
    <Modal visible={!!fixture} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={bsStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            <Animated.View style={[
              bsStyles.sheet, 
              { 
                backgroundColor: colors.background, 
                height: '96%',
                overflow: 'visible',  // ← explicitly override
              }, 
              animatedStyle
            ]}>
            {/* Drag handle */}
            <GestureDetector gesture={dragGesture}>
              <View style={bsStyles.dragArea}>
                <View style={[bsStyles.handle, { backgroundColor: colors.border }]} />
                <View style={bsStyles.headerRow}>
                  <Pressable hitSlop={12} onPress={onClose} style={bsStyles.closeBtn}>
                    <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
                  </Pressable>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[bsStyles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {fixture.homeTeam} vs {fixture.awayTeam}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                      {fixture.competition} · {kickoffTime}
                    </Text>
                  </View>
                  <View style={{ width: 34 }} />
                </View>
              </View>
            </GestureDetector>

            {/* Tab bar */}
            <View style={[tabStyles.bar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => { hapticLight(); setActiveTab(tab.key); }}
                    style={[tabStyles.tab, active && [tabStyles.tabActive, { borderBottomColor: colors.primary }]]}
                  >
                    <Ionicons name={tab.icon as any} size={15} color={active ? colors.primary : colors.textMuted} />
                    <Text style={[tabStyles.tabText, { color: active ? colors.primary : colors.textMuted }]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Tab content */}
            {activeTab === 'insight' && <InsightTab fixture={fixture} />}

            {activeTab === 'table' && (
              <View style={{ height: SCREEN_HEIGHT * 0.96 - 120 }}>
                <LeagueTableModal
                  visible={true}
                  competition={resolveCompetition(fixture.competition)}
                  highlightTeams={[fixture.homeTeam, fixture.awayTeam]}
                  onClose={() => setActiveTab('bet')}
                  embedded
                />
              </View>
            )}

            {activeTab === 'bet' && (
              <>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[bsStyles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
                >
                  {/* ══ 1. SELEÇÃO ══ */}
                  <Text style={[bsStyles.sectionDivider, { color: colors.textSecondary }]}>1. SELEÇÃO</Text>
                  <View style={[bsStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <Text style={[bsStyles.cardTitle, { color: colors.textPrimary }]}>Adicionar seleção</Text>
                    {useCustomMarket ? (
                      <Input label="Mercado personalizado" placeholder="Ex: Resultado ao Intervalo..." value={market} onChangeText={setMarket} />
                    ) : (
                      <PressableScale onPress={() => setShowMarkets(true)} style={[bsStyles.fieldBtn, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[bsStyles.fieldLabel, { color: colors.textSecondary }]}>MERCADO</Text>
                          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: market ? colors.textPrimary : colors.textMuted }}>
                            {market ? humanizeMarket(market, fixture.homeTeam, fixture.awayTeam) : 'Selecionar mercado'}
                          </Text>
                        </View>
                        {market ? (
                          <Pressable hitSlop={8} onPress={() => { setMarket(''); setSelection(''); }}>
                            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                          </Pressable>
                        ) : <Ionicons name="chevron-down" size={16} color={colors.textMuted} />}
                      </PressableScale>
                    )}
                    <Pressable onPress={() => { setUseCustomMarket((v) => !v); setMarket(''); setSelection(''); }} style={bsStyles.customToggle}>
                      <Ionicons name={useCustomMarket ? 'list-outline' : 'create-outline'} size={13} color={colors.primary} />
                      <Text style={[bsStyles.customToggleText, { color: colors.primary }]}>
                        {useCustomMarket ? 'Escolher da lista de mercados' : 'Escrever mercado personalizado'}
                      </Text>
                    </Pressable>
                    {(useCustomMarket || !isSelfDescribing(market)) && (
                      <>
                        <Text style={[bsStyles.fieldLabel, { color: colors.textSecondary, marginTop: 4 }]}>SELEÇÃO</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[bsStyles.chips, { marginBottom: 6 }]}>
                          {['Sim', 'Não', 'Acima de 0,5', 'Acima de 1,5', 'Acima de 2,5', 'Acima de 3,5', 'Abaixo de 1,5', 'Abaixo de 2,5', 'Abaixo de 3,5', '1', 'X', '2', '1X', 'X2', '12'].map((q) => (
                            <PressableScale key={q} onPress={() => setSelection(q)} style={[bsStyles.chip, { backgroundColor: selection === q ? colors.primary : colors.background, borderColor: selection === q ? colors.primary : colors.border }]}>
                              <Text style={[bsStyles.chipText, { color: selection === q ? '#fff' : colors.textSecondary }]}>{q}</Text>
                            </PressableScale>
                          ))}
                        </ScrollView>
                        <View style={[bsStyles.textBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <TextInput style={[bsStyles.textBoxInput, { color: colors.textPrimary }]} placeholder="Ex: Over 2.5, Casa, Empate…" placeholderTextColor={colors.textMuted} value={selection} onChangeText={setSelection} />
                        </View>
                      </>
                    )}
                    <Text style={[bsStyles.fieldLabel, { color: colors.textSecondary, marginTop: 8 }]}>ODD</Text>
                    <NumericInput allowDecimal maxLength={6} placeholder="1.85" value={odds} onChangeText={setOdds} />
                    <Pressable onPress={handleAddSelection} disabled={!canAddSelection} style={[bsStyles.addSelBtn, { borderColor: canAddSelection ? colors.primary : colors.border, opacity: canAddSelection ? 1 : 0.45 }]}>
                      <Ionicons name="add-circle-outline" size={18} color={canAddSelection ? colors.primary : colors.textMuted} />
                      <Text style={[bsStyles.addSelBtnText, { color: canAddSelection ? colors.primary : colors.textMuted }]}>Adicionar ao boletim</Text>
                    </Pressable>
                  </View>

                  {/* ══ 2. APOSTA ══ */}
                  <Text style={[bsStyles.sectionDivider, { color: colors.textSecondary }]}>2. APOSTA</Text>
                  <View style={[bsStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, flexDirection: 'row' }]}>
                    {[
                      { label: 'Odds totais', value: Number(storeTotalOdds).toFixed(2), color: colors.textPrimary },
                      { label: 'Retorno potencial', value: `${Number(storePotential).toFixed(2)} €`, color: colors.primary },
                      { label: 'ROI estimado', value: storeStake > 0 ? `${(((Number(storePotential) - Number(storeStake)) / Number(storeStake)) * 100).toFixed(1)}%` : '0.0%', color: colors.primary },
                    ].map((col, i) => (
                      <View key={i} style={{ flex: 1, alignItems: i === 1 ? 'center' : i === 2 ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>{col.label}</Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: col.color }}>{col.value}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[bsStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>Valor da aposta</Text>
                    <NumericInput allowDecimal maxLength={8} placeholder="0,00" suffix="€" value={storeStake > 0 ? String(storeStake) : ''} onChangeText={(v) => setStake(parseFloat(v.replace(',', '.')) || 0)} />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      {[5, 10, 20, 50].map((amt) => (
                        <Pressable key={amt} onPress={() => { hapticLight(); setStake(amt); }} style={[bsStyles.quickStake, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{amt},00 €</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* ══ 3. DETALHES ══ */}
                  <Text style={[bsStyles.sectionDivider, { color: colors.textSecondary }]}>3. DETALHES</Text>
                  <View style={[bsStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, gap: 12 }]}>
                    <View style={[bsStyles.textBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <TextInput style={[bsStyles.textBoxInput, { color: colors.textPrimary }]} placeholder={defaultName || 'Nome'} placeholderTextColor={colors.textMuted} value={storeName} onChangeText={setName} />
                    </View>
                    <View style={[bsStyles.textBox, { backgroundColor: colors.background, borderColor: colors.border, minHeight: 80 }]}>
                      <TextInput style={[bsStyles.textBoxInput, { color: colors.textPrimary }]} placeholder="Notas" placeholderTextColor={colors.textMuted} value={storeNotes} onChangeText={setNotes} multiline />
                    </View>
                    <DatePickerField label="Data da aposta" maxDate={new Date()} placeholder="DD/MM/AAAA (opcional)"
                      value={(() => { if (!storeBetDate || storeBetDate.length < 10) return null; const [dd, mm, yyyy] = storeBetDate.split('/'); const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd)); return isNaN(d.getTime()) ? null : d; })()}
                      onChange={(date) => { const dd = String(date.getDate()).padStart(2, '0'); const mm = String(date.getMonth() + 1).padStart(2, '0'); setBetDate(`${dd}/${mm}/${date.getFullYear()}`); }}
                      onClear={() => setBetDate('')}
                    />
                    <PressableScale onPress={() => setShowSites(true)} style={[bsStyles.fieldBtn, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[bsStyles.fieldLabel, { color: colors.textSecondary }]}>SITE DE APOSTAS</Text>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: storeSiteSlug ? colors.textPrimary : colors.textMuted }}>
                          {BETTING_SITES.find((s) => s.slug === storeSiteSlug)?.name ?? 'Selecionar site (opcional)'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </PressableScale>
                    {[
                      { label: 'Tornar boletim público', sub: 'Permite mostrar este boletim no teu perfil e em futuras partilhas.', value: storeIsPublic, onChange: setPublic },
                      { label: 'Aposta gratuita (freebet)', sub: 'A stake era um freebet — não tens dinheiro real em risco.', value: storeIsFreebet, onChange: setFreebet },
                    ].map((row) => (
                      <View key={row.label} style={[bsStyles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>{row.label}</Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>{row.sub}</Text>
                        </View>
                        <Switch value={row.value} onValueChange={row.onChange} />
                      </View>
                    ))}
                  </View>

                  {storeItems.length > 0 && (
                    <>
                      <Text style={[bsStyles.sectionTitle, { color: colors.textPrimary }]}>Seleções ({storeItems.length})</Text>
                      {storeItems.map((item) => (
                        <View key={item.id}>
                          <BoletinSelectionRow item={{ homeTeam: item.homeTeam, homeTeamImageUrl: item.homeTeamImageUrl, awayTeam: item.awayTeam, awayTeamImageUrl: item.awayTeamImageUrl, competition: item.competition, market: item.market, oddValue: String(item.oddValue), result: ItemResult.PENDING, selection: item.selection, sport: item.sport }} onRemove={() => removeItem(item.id)} />
                          <Pressable onPress={() => { const d = item.eventDate ? new Date(item.eventDate) : new Date(); setItemEventDate(item.id, d.toISOString()); }} style={[bsStyles.kickoffBtn, { borderColor: item.eventDate ? colors.primary : colors.border, backgroundColor: item.eventDate ? `${colors.primary}12` : colors.surfaceRaised }]}>
                            <Ionicons name="time-outline" size={13} color={item.eventDate ? colors.primary : colors.textMuted} />
                            <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: item.eventDate ? colors.primary : colors.textMuted }}>
                              {item.eventDate ? (() => { const d = new Date(item.eventDate); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })() : 'Definir hora do jogo'}
                            </Text>
                            {item.eventDate && (<Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setItemEventDate(item.id, null); }}><Ionicons name="close-circle" size={14} color={colors.textMuted} /></Pressable>)}
                          </Pressable>
                        </View>
                      ))}
                    </>
                  )}
                </ScrollView>

                <View style={[bsStyles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16, backgroundColor: colors.background }]}>
                  <Pressable onPress={handleSave} disabled={isSaving || storeItems.length === 0} style={[bsStyles.saveBtn, { backgroundColor: storeItems.length > 0 ? colors.primary : colors.surfaceRaised, opacity: storeItems.length === 0 ? 0.5 : 1 }]}>
                    {isSaving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark-circle-outline" size={20} color={storeItems.length > 0 ? '#fff' : colors.textMuted} />}
                    <Text style={[bsStyles.saveBtnText, { color: storeItems.length > 0 ? '#fff' : colors.textMuted }]}>Guardar boletim</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </GestureHandlerRootView>

      <SearchableDropdown visible={showMarkets} onClose={() => setShowMarkets(false)} title="Mercado" sections={marketSections} onSelect={(val) => { setMarket(val); }} isLoading={marketsQuery.isLoading} initialVisibleCount={8} />
      <SearchableDropdown visible={showSites} onClose={() => setShowSites(false)} title="Site de apostas" items={BETTING_SITES.map((s) => ({ label: s.name, value: s.slug }))} onSelect={(val) => setSiteSlug(val)} />
    </Modal>
  );
}

// ─── Fixture card ─────────────────────────────────────────────────────────────

const FixtureCard = React.memo(function FixtureCard({
  fixture,
  onPress,
  isLast,
  showDate,
  isWatched,
  onToggleWatch,
}: {
  fixture: Fixture;
  onPress: (fixture: Fixture) => void;
  isLast: boolean;
  showDate: boolean;
  isWatched?: boolean;
  onToggleWatch?: (fixture: Fixture) => void;
}) {
  const { colors } = useTheme();
  const isFinished = fixture.homeScore !== null && fixture.awayScore !== null;
  const isLive = fixture.status === 'live' || fixture.status === 'inprogress';
  const kickoffTime = formatKickoff(fixture.kickoffAt, fixture.country);
  const kickoffDate = formatDate(fixture.kickoffAt, fixture.country);
  const isToday = adjustedDateKey(fixture.kickoffAt, fixture.country) === toLocalDateKey(stripTime(new Date()));

  return (
    <PressableScale
      onPress={() => { hapticLight(); onPress(fixture); }}
      style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: isLast ? 'transparent' : colors.border }]}
    >
      <View style={styles.cardTimeCol}>
        {isLive ? (
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, { backgroundColor: colors.danger ?? '#ef4444' }]} />
            <Text style={[styles.liveText, { color: colors.danger ?? '#ef4444' }]}>AO VIVO</Text>
          </View>
        ) : isFinished ? (
          <>
            <Text style={[styles.ftLabel, { color: colors.textMuted }]}>FT</Text>
            {(showDate || !isToday) && <Text style={[styles.cardDateSmall, { color: colors.textMuted }]}>{kickoffDate}</Text>}
          </>
        ) : (
          <>
            <Text style={[styles.kickoffTimeSmall, { color: colors.primary }]}>{kickoffTime}</Text>
            {(showDate || !isToday) && <Text style={[styles.cardDateSmall, { color: colors.textMuted }]}>{kickoffDate}</Text>}
          </>
        )}
      </View>

      <View style={styles.cardTeamsCol}>
        <View style={styles.teamRow}>
          <TeamBadge name={fixture.homeTeam} imageUrl={getFixtureTeamLogoUrl(fixture.homeTeam)} size={18} />
          <Text
            style={[styles.teamNameSmall, { color: colors.textPrimary }, isFinished && fixture.homeScore! > fixture.awayScore! && { fontWeight: '800' }]}
            numberOfLines={1}
          >
            {fixture.homeTeam}
          </Text>
          {isFinished && (
            <Text style={[styles.scoreSmall, { color: fixture.homeScore! > fixture.awayScore! ? colors.textPrimary : colors.textMuted, fontWeight: fixture.homeScore! > fixture.awayScore! ? '800' : '500' }]}>
              {fixture.homeScore}
            </Text>
          )}
        </View>
        <View style={[styles.teamRow, { marginTop: 6 }]}>
          <TeamBadge name={fixture.awayTeam} imageUrl={getFixtureTeamLogoUrl(fixture.awayTeam)} size={18} />
          <Text
            style={[styles.teamNameSmall, { color: colors.textPrimary }, isFinished && fixture.awayScore! > fixture.homeScore! && { fontWeight: '800' }]}
            numberOfLines={1}
          >
            {fixture.awayTeam}
          </Text>
          {isFinished && (
            <Text style={[styles.scoreSmall, { color: fixture.awayScore! > fixture.homeScore! ? colors.textPrimary : colors.textMuted, fontWeight: fixture.awayScore! > fixture.homeScore! ? '800' : '500' }]}>
              {fixture.awayScore}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.cardRight}>
        {!isFinished && onToggleWatch && (
          <Pressable
            onPress={() => { hapticSelection(); onToggleWatch(fixture); }}
            hitSlop={10}
            style={[styles.bellBtn, isWatched && { backgroundColor: `${colors.primary}20` }]}
          >
            <Ionicons
              name={isWatched ? 'notifications' : 'notifications-outline'}
              size={16}
              color={isWatched ? colors.primary : colors.textMuted}
            />
          </Pressable>
        )}
        {!isFinished && (
          <View style={[styles.addHint, { backgroundColor: `${colors.primary}14` }]}>
            <Ionicons name="add" size={14} color={colors.primary} />
          </View>
        )}
      </View>
    </PressableScale>
  );
});

// ─── Competition section header ───────────────────────────────────────────────

function CompetitionHeader({
  section,
  isExpanded,
  onToggle,
  isFavourite,
  onToggleFavourite,
}: {
  section: Section;
  isExpanded: boolean;
  onToggle: () => void;
  isFavourite: boolean;
  onToggleFavourite: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.competitionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <CompetitionBadge name={section.competition} country={section.country} size={28} />
      <View style={styles.competitionTextWrap}>
        <Text style={[styles.competitionName, { color: colors.textPrimary }]} numberOfLines={1}>
          {section.competition}
        </Text>
        <View style={styles.competitionCountryRow}>
          <CountryFlag country={section.country} size={11} />
          <Text style={[styles.competitionCountry, { color: colors.textSecondary }]}>{section.country}</Text>
        </View>
      </View>
      <View style={[styles.competitionCountBadge, { backgroundColor: colors.surfaceRaised }]}>
        <Text style={[styles.competitionCountText, { color: colors.textSecondary }]}>
          {section.data.length}/{section.totalCount}
        </Text>
      </View>
      {/* Favourite star */}
      <Pressable
        hitSlop={12}
        onPress={(e) => { e.stopPropagation(); hapticSelection(); onToggleFavourite(); }}
        style={{ padding: 4 }}
      >
        <Ionicons
          name={isFavourite ? 'star' : 'star-outline'}
          size={16}
          color={isFavourite ? '#f59e0b' : colors.textMuted}
        />
      </Pressable>
      <Ionicons
        name={isExpanded ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={colors.textMuted}
        style={{ marginLeft: 2 }}
      />
    </Pressable>
  );
}

// ─── Manage Favourites Modal ──────────────────────────────────────────────────

interface ManageFavouritesModalProps {
  visible: boolean;
  onClose: () => void;
  favouriteKeys: string[];           // ordered list of competition targetKeys
  onReorder: (newOrder: string[]) => void;
  onRemove: (key: string) => void;
  colors: Record<string, string>;
}

function ManageFavouritesModal({
  visible, onClose, favouriteKeys, onReorder, onRemove, colors,
}: ManageFavouritesModalProps) {
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  useEffect(() => {
    if (visible) setLocalOrder(favouriteKeys);
  }, [visible, favouriteKeys]);

  function moveUp(index: number) {
    if (index === 0) return;
    hapticLight();
    const next = [...localOrder];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setLocalOrder(next);
  }

  function moveDown(index: number) {
    if (index === localOrder.length - 1) return;
    hapticLight();
    const next = [...localOrder];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    setLocalOrder(next);
  }

  function handleSave() {
    onReorder(localOrder);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mgStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[mgStyles.sheet, { backgroundColor: colors.background }]}>
          <View style={[mgStyles.header, { borderBottomColor: colors.border }]}>
            <Text style={[mgStyles.title, { color: colors.textPrimary }]}>Competições favoritas</Text>
            <Pressable hitSlop={12} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {localOrder.length === 0 ? (
            <View style={mgStyles.empty}>
              <Ionicons name="star-outline" size={40} color={colors.textMuted} />
              <Text style={[mgStyles.emptyText, { color: colors.textMuted }]}>
                Toca na estrela ⭐ em qualquer competição para a adicionar aos favoritos.
              </Text>
            </View>
          ) : (
            <View style={mgStyles.listContainer}>
              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                {localOrder.map((key, index) => (
                  <View
                    key={key}
                    style={[mgStyles.row, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}
                  >
                    <View style={mgStyles.rowLeft}>
                      <Ionicons name="menu" size={18} color={colors.textMuted} />
                      <Text style={[mgStyles.rowText, { color: colors.textPrimary }]} numberOfLines={1}>
                        {key}
                      </Text>
                    </View>
                    <View style={mgStyles.rowActions}>
                      <Pressable
                        hitSlop={10}
                        onPress={() => moveUp(index)}
                        style={[mgStyles.arrowBtn, { opacity: index === 0 ? 0.3 : 1 }]}
                      >
                        <Ionicons name="chevron-up" size={18} color={colors.textPrimary} />
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        onPress={() => moveDown(index)}
                        style={[mgStyles.arrowBtn, { opacity: index === localOrder.length - 1 ? 0.3 : 1 }]}
                      >
                        <Ionicons name="chevron-down" size={18} color={colors.textPrimary} />
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          hapticLight();
                          onRemove(key);
                          setLocalOrder((prev) => prev.filter((k) => k !== key));
                        }}
                      >
                        <Ionicons name="close-circle" size={20} color={colors.danger ?? '#ef4444'} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={[mgStyles.footer, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={handleSave}
              style={[mgStyles.saveBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={mgStyles.saveBtnText}>Guardar ordem</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const mgStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: { 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  listContainer: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, fontSize: 14, fontWeight: '600' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrowBtn: { padding: 4 },
  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  saveBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FixturesScreen() {
  const { colors } = useTheme();

  const [search, setSearch] = useState('');
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showManageFavourites, setShowManageFavourites] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => stripTime(new Date()));
  const slideAnim = useRef(new RNAnimated.Value(0)).current;
  const SCREEN_WIDTH = Dimensions.get('window').width;

  const [showWatchedOnly, setShowWatchedOnly] = useState(false);

  // ── Fixture alerts ───────────────────────────────────────────────────────────
  const watchedQuery = useWatchedFixtures();
  const toggleWatchMutation = useToggleFixtureWatchMutation();
  const watchedSet = useMemo(() => new Set(watchedQuery.data ?? []), [watchedQuery.data]);

  const handleToggleWatch = useCallback((fixture: Fixture) => {
    toggleWatchMutation.mutate({ fixtureId: fixture.id, watching: watchedSet.has(fixture.id) });
  }, [toggleWatchMutation, watchedSet]);

  // ── Favourites ──────────────────────────────────────────────────────────────
  const favouritesQuery = useFavourites(Sport.FOOTBALL);
  const toggleFavMutation = useToggleFavouriteMutation();
  const bulkSetFavMutation = useBulkSetFavouritesMutation();

  // Ordered list of favourite competition names
  const favouriteKeys = useMemo<string[]>(() => {
    const favs = (favouritesQuery.data ?? [])
      .filter((f) => f.type === FavouriteType.COMPETITION && f.sport === Sport.FOOTBALL);
    // Sort by sortOrder if present, otherwise by createdAt
    favs.sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0));
    return favs.map((f) => f.targetKey);
  }, [favouritesQuery.data]);

  const favouriteSet = useMemo(() => new Set(favouriteKeys), [favouriteKeys]);

  const handleToggleFavourite = useCallback((competition: string) => {
    toggleFavMutation.mutate({
      type: FavouriteType.COMPETITION,
      sport: Sport.FOOTBALL,
      targetKey: competition,
    });
  }, [toggleFavMutation]);

  const handleReorderFavourites = useCallback((newOrder: string[]) => {
    bulkSetFavMutation.mutate({
      sport: Sport.FOOTBALL,
      favourites: newOrder.map((key, index) => ({
        type: FavouriteType.COMPETITION,
        targetKey: key,
        sortOrder: index,
      })),
    });
  }, [bulkSetFavMutation]);

  const handleRemoveFavourite = useCallback((key: string) => {
    toggleFavMutation.mutate({
      type: FavouriteType.COMPETITION,
      sport: Sport.FOOTBALL,
      targetKey: key,
    });
  }, [toggleFavMutation]);

  const animateDay = useCallback((direction: 'left' | 'right', nextDate: Date) => {
    // Slide current content out
    RNAnimated.timing(slideAnim, {
      toValue: direction === 'left' ? -SCREEN_WIDTH : SCREEN_WIDTH,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      // Snap to opposite side instantly, then slide in
      slideAnim.setValue(direction === 'left' ? SCREEN_WIDTH : -SCREEN_WIDTH);
      setSelectedDate(nextDate);
      RNAnimated.timing(slideAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  }, [slideAnim]);

  const upcomingQuery = useUpcomingFixtures(14);
  const recentQuery   = useRecentFixtures(3);

  // Dates outside the upcoming/recent window need a dedicated fetch
  const needsByDateFetch = useMemo(() => {
    const todayMs = stripTime(new Date()).getTime();
    return (
      selectedDate.getTime() < todayMs - 3 * 24 * 60 * 60 * 1000 ||
      selectedDate.getTime() > todayMs + 14 * 24 * 60 * 60 * 1000
    );
  }, [selectedDate]);

  const byDateQuery = useFixturesByDate(selectedDate, needsByDateFetch);

  const isLoading = needsByDateFetch
    ? byDateQuery.isLoading
    : upcomingQuery.isLoading || recentQuery.isLoading;

  const rawFixtures = useMemo<Fixture[]>(() => {
    if (needsByDateFetch) {
      return byDateQuery.data ?? [];
    }
    const all = [...(upcomingQuery.data ?? []), ...(recentQuery.data ?? [])];
    const seen = new Set<string>();
    return all.filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });
  }, [needsByDateFetch, byDateQuery.data, upcomingQuery.data, recentQuery.data]);

  const isSearching = search.trim().length > 0;

  const filtered = useMemo(() => {
    let list = rawFixtures;
    if (!isSearching) {
      const key = toLocalDateKey(selectedDate);
      list = list.filter((f) => adjustedDateKey(f.kickoffAt, f.country) === key);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) =>
        f.homeTeam.toLowerCase().includes(q) ||
        f.awayTeam.toLowerCase().includes(q) ||
        f.competition.toLowerCase().includes(q),
      );
    }
    if (showWatchedOnly) {
      list = list.filter((f) => watchedSet.has(f.id));
    }
    return list;
  }, [rawFixtures, search, selectedDate, isSearching, showWatchedOnly, watchedSet]);

  const allSections = useMemo(() => {
    const raw = groupByCompetition(filtered);

    // 1. Favourites first, in user-defined order
    const favourited = favouriteKeys
      .map((key) => raw.find((s) => s.competition === key))
      .filter((s): s is Section => !!s);

    // 2. Non-favourite top-7 leagues next
    const top7NonFav = raw.filter(
      (s) => !favouriteSet.has(s.competition) && TOP_7_LEAGUES.has(s.competition),
    );

    // 3. Everything else
    const rest = raw.filter(
      (s) => !favouriteSet.has(s.competition) && !TOP_7_LEAGUES.has(s.competition),
    );

    return { favourited, top7NonFav, rest };
  }, [filtered, favouriteKeys, favouriteSet]);

  // Auto-collapse non-favourite, non-top-7 sections on new date
  useEffect(() => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      // Collapse all "rest" sections by default
      for (const s of allSections.rest) {
        if (!next.has(s.competition)) next.add(s.competition);
      }
      return next;
    });
  }, [allSections.rest]);

  const sections = useMemo(() => {
    const all = [...allSections.favourited, ...allSections.top7NonFav, ...allSections.rest];
    return all.map((s) =>
      collapsedSections.has(s.competition) ? { ...s, data: [] as Fixture[] } : s,
    );
  }, [allSections, collapsedSections]);

  const handleToggleSection = useCallback((competition: string) => {
    hapticLight();
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(competition)) next.delete(competition);
      else next.add(competition);
      return next;
    });
  }, []);

  const handlePrevDay = useCallback(() => {
    hapticLight();
    const next = addDays(selectedDate, -1);
    animateDay('right', next);
  }, [selectedDate, animateDay]);

  const handleNextDay = useCallback(() => {
    hapticLight();
    const next = addDays(selectedDate, 1);
    animateDay('left', next);
  }, [selectedDate, animateDay]);

  // Swipe left/right on the list to change day
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  const animateDayRef = useRef(animateDay);
  useEffect(() => { animateDayRef.current = animateDay; }, [animateDay]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 25 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) {
          hapticLight();
          animateDayRef.current('left', addDays(selectedDateRef.current, 1));
        } else if (g.dx > 40) {
          hapticLight();
          animateDayRef.current('right', addDays(selectedDateRef.current, -1));
        }
      },
    }),
  ).current;

  const handleRefresh = useCallback(() => { upcomingQuery.refetch(); recentQuery.refetch(); }, [upcomingQuery, recentQuery]);
  const isRefreshing = upcomingQuery.isFetching || recentQuery.isFetching;

  const renderItem = useCallback(
    ({ item, index, section }: { item: Fixture; index: number; section: Section }) => (
      <FixtureCard
        fixture={item}
        onPress={setSelectedFixture}
        isLast={index === section.data.length - 1}
        showDate={isSearching}
        isWatched={watchedSet.has(item.id)}
        onToggleWatch={handleToggleWatch}
      />
    ),
    [isSearching, watchedSet, handleToggleWatch],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <CompetitionHeader
        section={section}
        isExpanded={!collapsedSections.has(section.competition)}
        onToggle={() => handleToggleSection(section.competition)}
        isFavourite={favouriteSet.has(section.competition)}
        onToggleFavourite={() => handleToggleFavourite(section.competition)}
      />
    ),
    [collapsedSections, handleToggleSection, favouriteSet, handleToggleFavourite],
  );

  const keyExtractor = useCallback((item: Fixture) => item.id, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Jogos',
          headerLargeTitle: false,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 4 }}>
              <Pressable
                onPress={() => { hapticLight(); setShowWatchedOnly(v => !v); }}
                hitSlop={12}
              >
                <Ionicons
                  name={showWatchedOnly ? 'notifications' : 'notifications-outline'}
                  size={20}
                  color={showWatchedOnly ? colors.primary : colors.textSecondary}
                />
              </Pressable>
              <Pressable
                onPress={() => setShowManageFavourites(true)}
                hitSlop={12}
              >
                <Ionicons name="star" size={20} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Search bar */}
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInner, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Pesquisar equipa ou competição…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && Platform.OS !== 'ios' && (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {!isSearching && (
          <DayFilterBar selectedDate={selectedDate} onPrev={handlePrevDay} onNext={handleNextDay} onOpenCalendar={() => setShowCalendar(true)} colors={colors} />
        )}

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>A carregar jogos…</Text>
          </View>
        ) : sections.length === 0 ? (
          <RNAnimated.View style={[styles.center, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
            <Ionicons name="calendar-outline" size={52} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{search ? 'Sem resultados' : 'Sem jogos neste dia'}</Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{search ? 'Tenta outra pesquisa.' : 'Desliza para navegar entre dias.'}</Text>
          </RNAnimated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1 }} {...panResponder.panHandlers}>
            <RNAnimated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
            <SectionList
              sections={sections}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={null}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
              showsVerticalScrollIndicator={false}
            />
            </RNAnimated.View>
          </Animated.View>
        )}
      </View>

      <ManageFavouritesModal
        visible={showManageFavourites}
        onClose={() => setShowManageFavourites(false)}
        favouriteKeys={favouriteKeys}
        onReorder={handleReorderFavourites}
        onRemove={handleRemoveFavourite}
        colors={colors}
      />

      <CalendarPicker
        visible={showCalendar}
        selectedDate={selectedDate}
        onSelect={(d) => setSelectedDate(stripTime(d))}
        onClose={() => setShowCalendar(false)}
        colors={colors}
      />

      <AddSheet
        fixture={selectedFixture}
        onClose={() => setSelectedFixture(null)}
        onAdded={() => setSelectedFixture(null)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  listContent: { paddingBottom: 32 },
  competitionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  competitionTextWrap: { flex: 1 },
  competitionName: { fontSize: 13, fontWeight: '700' },
  competitionCountryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  competitionCountry: { fontSize: 11, fontWeight: '500' },
  competitionCountBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  competitionCountText: { fontSize: 11, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  cardTimeCol: { width: 56, alignItems: 'center', gap: 1 },
  kickoffTimeSmall: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cardDateSmall: { fontSize: 10, fontWeight: '500', textAlign: 'center', marginTop: 1 },
  ftLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  liveIndicator: { alignItems: 'center', gap: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  cardTeamsCol: { flex: 1 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamNameSmall: { flex: 1, fontSize: 13, fontWeight: '600' },
  scoreSmall: { fontSize: 14, minWidth: 16, textAlign: 'right' },
  cardRight: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  bellBtn: { borderRadius: 8, padding: 4 },
  addHint: { borderRadius: 8, padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 14, marginTop: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Bottom sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
  // Drag handle area — taller hit target makes swipe-to-close easier to trigger
  sheetDragArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetCompetitionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 12 },
  sheetCompetition: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  sheetTeams: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTeamCol: { flex: 1, alignItems: 'center', gap: 8 },
  sheetTeamName: { fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  sheetVsCol: { alignItems: 'center', gap: 2, minWidth: 48 },
  sheetTime: { fontSize: 20, fontWeight: '800' },
  sheetVs: { fontSize: 12, fontWeight: '500' },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 8 },
  sheetSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 8, marginBottom: 8 },
  marketChips: { gap: 8, paddingBottom: 2 },
  marketChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  marketChipText: { fontSize: 13, fontWeight: '600' },
  selectionRow: { flexDirection: 'row', gap: 8 },
  selectionBtn: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5, gap: 3 },
  selectionLabel: { fontSize: 14, fontWeight: '700' },
  selectionSub: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  oddsInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  oddsInput: { flex: 1, fontSize: 18, fontWeight: '700', padding: 0 },
  sheetFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  addBtnText: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
});

// ─── Sheet extension styles ───────────────────────────────────────────────────

const bsStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '96%',
    overflow: 'hidden',
  },

  dragArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 18, paddingBottom: 8 },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },

  sectionDivider: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginTop: 4 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800' },

  // Fixture preview
  fixturePreview: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
  fixturePreviewInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fixturePreviewText: { flex: 1, fontSize: 12, fontWeight: '700' },
  fixturePreviewVs: { fontSize: 11, fontWeight: '500' },
  fixturePreviewMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fixturePreviewComp: { flex: 1, fontSize: 11, fontWeight: '500' },
  fixturePreviewTime: { fontSize: 12, fontWeight: '700' },

  // Mode toggle
  modeToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, gap: 3 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  modeBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  // Chips
  chips: { gap: 8, paddingBottom: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },

  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Selection buttons
  selectionRow: { flexDirection: 'row', gap: 8 },
  selBtn: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5, gap: 4 },
  selBtnLabel: { fontSize: 15, fontWeight: '700' },
  selBtnSub: { fontSize: 10, fontWeight: '500', textAlign: 'center' },

  // Text inputs
  textBox: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14 },
  textBoxInput: { fontSize: 14, fontWeight: '500', paddingVertical: 12 },

  // Odds
  oddsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  oddsInput: { flex: 1, fontSize: 18, fontWeight: '700', padding: 0 },

  // Add selection button
  addSelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  addSelBtnText: { fontSize: 15, fontWeight: '700' },

  // Stake
  stakeInput: { fontSize: 22, fontWeight: '700', borderBottomWidth: 1, paddingBottom: 6, paddingHorizontal: 0 },
  quickStake: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },

  // Details
  fieldBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12, borderWidth: 1, padding: 14 },

  // Kickoff time
  kickoffBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6 },

  // Save
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 17, borderRadius: 16 },
  saveBtnText: { fontSize: 17, fontWeight: '800' },
  customToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
  },
  customToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {},
  tabText: { fontSize: 13, fontWeight: '700' },
});


const newInsightStyles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },

  hintBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 10,
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 17 },

  // Combined probability
  probCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  probCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  probCardTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  probCardSub: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  probRow: { flexDirection: 'row', alignItems: 'flex-start' },
  probItem: { flex: 1, alignItems: 'center', gap: 3 },
  probValue: { fontSize: 40, fontWeight: '900', lineHeight: 48 },
  probLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  probSubLabel: { fontSize: 11, textAlign: 'center' },
  probDivider: { width: StyleSheet.hairlineWidth, height: 60, marginTop: 8 },

  // Standings mini-card
  standingsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  standingsHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  standingsHeaderPos: { width: 28, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  standingsHeaderTeam: { flex: 1, fontSize: 10, fontWeight: '700', marginLeft: 4 },
  standingsHeaderCol: { width: 30, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  standingsRow: { flexDirection: 'row', alignItems: 'center' },
  standingsPosBox: { width: 28, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  standingsPosText: { fontSize: 12, fontWeight: '800' },
  standingsVenueIcon: { fontSize: 14, marginHorizontal: 4 },
  standingsTeamName: { flex: 1, fontSize: 12, fontWeight: '700' },
  standingsStat: { width: 30, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  // Team card
  teamCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  teamCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamCardVenueIcon: { fontSize: 16 },
  teamCardName: { flex: 1, fontSize: 16, fontWeight: '800' },
  teamCardVenueBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  teamCardVenueText: { fontSize: 12, fontWeight: '600' },

  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },

  formRow: { flexDirection: 'row', gap: 5 },
  formPill: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  formPillText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  formLegend: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 11, fontWeight: '500' },

  // Key metrics (avg goals, corners, yellow cards)
  metricsRow: {
    flexDirection: 'row', borderRadius: 10, borderWidth: 1,
    paddingVertical: 10, overflow: 'hidden',
  },
  metricItem: { flex: 1, alignItems: 'center', gap: 3 },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },
  metricDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },

  // 6-stat grid (2 rows × 3 cols)
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statGridItem: {
    width: '30.5%', borderRadius: 10, borderWidth: 1,
    alignItems: 'center', paddingVertical: 10, gap: 3,
  },
  statGridValue: { fontSize: 20, fontWeight: '900' },
  statGridLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // Injuries
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  injuryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
    maxWidth: 160,
  },
  injuryChipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },

  // Top scorers
  scorerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth,
  },
  scorerRank: { fontSize: 13, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  scorerName: { flex: 1, fontSize: 13, fontWeight: '600' },
  scorerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  scorerGoals: { fontSize: 13, fontWeight: '800' },

  sampleNote: { fontSize: 10, fontWeight: '500' },

  // Section headers (H2H, Pinnacle)
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, marginTop: 4 },
  sectionHeaderTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  sectionHeaderSub: { fontSize: 12, marginBottom: 8 },

  // H2H
  h2hCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  h2hBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  h2hTeamName: { flex: 1, fontSize: 11, fontWeight: '700' },
  h2hTrack: { flex: 2, height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden' },
  h2hSeg: { height: '100%' },
  h2hStatsRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  h2hStatCol: { flex: 1, alignItems: 'center', gap: 3 },
  h2hStatValue: { fontSize: 16, fontWeight: '800' },
  h2hStatLabel: { fontSize: 9, fontWeight: '600' },
  h2hRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  h2hDate: { fontSize: 10, fontWeight: '500', minWidth: 50 },
  h2hTeam: { flex: 1, fontSize: 12, fontWeight: '600' },
  h2hScoreBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, minWidth: 44, alignItems: 'center' },
  h2hScoreText: { fontSize: 13, fontWeight: '800' },

  // Pinnacle
  pinnacleCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  pinnacleRow: { flexDirection: 'row' },
  pinnacleCol: { flex: 1, alignItems: 'center', gap: 4 },
  pinnacleLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  pinnacleOdd: { fontSize: 26, fontWeight: '900' },
  impliedBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  impliedText: { fontSize: 11, fontWeight: '700' },
  pinnacleNote: {
    fontSize: 10, fontStyle: 'italic', textAlign: 'center',
    marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },

  timestamp: { fontSize: 11, textAlign: 'center' },

  // Loading/error states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { fontSize: 14, textAlign: 'center' },
});