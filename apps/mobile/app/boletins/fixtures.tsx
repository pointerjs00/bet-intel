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
import { apiClient } from '../../services/apiClient';
import { isSelfDescribing, humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { Input } from '../../components/ui/Input';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFavourites, useToggleFavouriteMutation, useBulkSetFavouritesMutation } from '../../services/favouritesService';
import { FavouriteType } from '@betintel/shared';
import { useWatchedFixtures, useToggleFixtureWatchMutation } from '../../services/fixtureAlertService';
import { LeagueTableModal } from '../../components/fixtures/LeagueTableModal';
import {
  useFixtureInsight,
  useLeagueTable,
  useFixtureMatchStats,
  useFixtureEvents,
  useFixtureLineups,
  useFixturePrediction,
  useTeamPlayerStats,
} from '../../services/teamStatsService';
import type {
  TeamStatData,
  FixtureMatchStats,
  FixtureEvent as FixtureEventData,
  FixtureLineup as FixtureLineupData,
  FixturePrediction as FixturePredictionData,
  PlayerStatData,
} from '../../services/teamStatsService';

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

const LISBON_TZ = 'Europe/Lisbon';

/**
 * Returns false when the ISO string's time component is exactly T00:00,
 * which API-Football uses as a "time unknown" placeholder.
 */
function hasValidTime(iso: string): boolean {
  return !/T00:00/.test(iso);
}

/** Format a UTC ISO string as HH:MM in Europe/Lisbon, regardless of fixture country. */
function formatKickoff(iso: string): string {
  if (!hasValidTime(iso)) return '--:--';
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: LISBON_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** Format a UTC ISO string as DD/MM/YYYY in Europe/Lisbon. */
function formatDate(iso: string): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso)).split('-');
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-DD key for a UTC ISO string expressed in Europe/Lisbon (for date grouping). */
function adjustedDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
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
  activeDates?: Set<string>;
}

function CalendarPicker({ visible, selectedDate, onSelect, onClose, colors, activeDates }: CalendarPickerProps) {
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

  function hasMatch(day: number) {
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return activeDates?.has(key) ?? false;
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
                  const dot = hasMatch(day);
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
                      {dot && <View style={[calStyles.dot, { backgroundColor: sel ? '#fff' : colors.primary }]} />}
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
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cellSelected: { borderRadius: 999 },
  dot: { width: 4, height: 4, borderRadius: 2 },
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

// ─── Stat drill modal ────────────────────────────────────────────────────────

interface DrillMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  isHome?: boolean;
}

function StatDrillModal({
  visible, label, matches, matchFilter, onClose,
}: {
  visible: boolean;
  label: string;
  matches: DrillMatch[];
  matchFilter: (m: DrillMatch) => boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const matched = matches.filter(matchFilter).length;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={drillStyles.overlay}>
        <View style={[drillStyles.sheet, { backgroundColor: colors.background }]}>
          <View style={[drillStyles.header, { borderBottomColor: colors.border }]}>
            <Pressable hitSlop={12} onPress={onClose} style={drillStyles.closeBtn}>
              <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[drillStyles.title, { color: colors.textPrimary }]}>{label}</Text>
              <Text style={[drillStyles.subtitle, { color: colors.textMuted }]}>
                {matched}/{matches.length} jogos correspondem
              </Text>
            </View>
            <View style={{ width: 34 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={drillStyles.list}>
            {matches.map((m, i) => {
              const hit = matchFilter(m);
              return (
                <View
                  key={i}
                  style={[
                    drillStyles.row,
                    { borderColor: colors.border, backgroundColor: hit ? `${colors.primary}18` : colors.surface },
                    hit && { borderColor: `${colors.primary}50` },
                  ]}
                >
                  <Text style={[drillStyles.rowDate, { color: colors.textMuted }]}>
                    {new Date(m.date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </Text>
                  <View style={drillStyles.rowTeamCell}>
                    <Image source={{ uri: getFixtureTeamLogoUrl(m.homeTeam) ?? undefined }} style={drillStyles.rowBadge} resizeMode="contain" />
                    <Text numberOfLines={1} style={[drillStyles.rowTeam, { color: colors.textSecondary }]}>
                      {m.homeTeam}
                    </Text>
                  </View>
                  <View style={[drillStyles.scoreBox, { backgroundColor: hit ? colors.primary : colors.surfaceRaised }]}>
                    <Text style={[drillStyles.scoreText, { color: hit ? '#fff' : colors.textPrimary }]}>
                      {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
                    </Text>
                  </View>
                  <View style={[drillStyles.rowTeamCell, { justifyContent: 'flex-end' }]}>
                    <Text numberOfLines={1} style={[drillStyles.rowTeam, { color: colors.textSecondary, textAlign: 'right' }]}>
                      {m.awayTeam}
                    </Text>
                    <Image source={{ uri: getFixtureTeamLogoUrl(m.awayTeam) ?? undefined }} style={drillStyles.rowBadge} resizeMode="contain" />
                  </View>
                  {hit
                    ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    : <View style={{ width: 16 }} />}
                </View>
              );
            })}
            {matches.length === 0 && (
              <Text style={[drillStyles.empty, { color: colors.textMuted }]}>Sem jogos disponíveis</Text>
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const drillStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  closeBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, padding: 10 },
  rowDate: { fontSize: 11, fontWeight: '600', minWidth: 42 },
  rowTeamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowTeam: { flex: 1, fontSize: 12, fontWeight: '600' },
  rowBadge: { width: 16, height: 16, flexShrink: 0 },
  scoreBox: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  scoreText: { fontSize: 13, fontWeight: '800' },
  empty: { textAlign: 'center', fontSize: 13, marginTop: 32 },
});

// ─── Insight sub-tab types ────────────────────────────────────────────────────

const FORM_COLOR: Record<string, string> = { W: '#22c55e', D: '#6b7280', L: '#ef4444' };
const FORM_LABEL: Record<string, string> = { W: 'V', D: 'E', L: 'D' };
const OVER_THRESHOLDS = [0.5, 1.5, 2.5, 3.5, 4.5];

type InsightSubTab = 'overview' | 'home' | 'away' | 'h2h';

const INSIGHT_SUB_TABS: { key: InsightSubTab; label: string }[] = [
  { key: 'overview', label: 'Geral' },
  { key: 'home',     label: 'Casa' },
  { key: 'away',     label: 'Fora' },
  { key: 'h2h',      label: 'H2H' },
];

// ─── Insight Tab ──────────────────────────────────────────────────────────────

function InsightTab({ fixture }: { fixture: Fixture }) {
  const { colors } = useTheme();
  const { data: insight, isLoading, isError } = useFixtureInsight(fixture.id);
  const { data: prediction } = useFixturePrediction(fixture.id);
  const [subTab, setSubTab] = useState<InsightSubTab>('overview');
  const [drillStat, setDrillStat] = useState<{
    label: string;
    matches: DrillMatch[];
    matchFilter: (m: DrillMatch) => boolean;
  } | null>(null);
  const [homeThresh, setHomeThresh] = useState<[number, number, number]>([1.5, 2.5, 3.5]);
  const [awayThresh, setAwayThresh] = useState<[number, number, number]>([1.5, 2.5, 3.5]);

  useEffect(() => { setSubTab('overview'); setDrillStat(null); setHomeThresh([1.5, 2.5, 3.5]); setAwayThresh([1.5, 2.5, 3.5]); }, [fixture.id]);

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
    onStatPress,
    thresholds,
    onThresholdChange,
  }: {
    team: 'home' | 'away';
    teamName: string;
    venue: string;
    venueLabel: string;
    data: typeof home;
    injuries: NonNullable<typeof insight>['homeInjuries'];
    topScorers: NonNullable<typeof insight>['homeTopScorers'];
    onStatPress: (label: string, filter: (m: DrillMatch) => boolean) => void;
    thresholds: [number, number, number];
    onThresholdChange: (idx: 0 | 1 | 2, val: number) => void;
  }) {
    if (!data) return null;
    const teamIsHome = team === 'home';

    function overPct(threshold: number): string {
      const ms = data!.recentMatches;
      if (!ms.length) return '—';
      const n = ms.filter(m => ((m.homeScore ?? 0) + (m.awayScore ?? 0)) > threshold).length;
      return `${Math.round((n / ms.length) * 100)}%`;
    }

    function cycleThreshold(idx: 0 | 1 | 2) {
      const cur = thresholds[idx];
      const next = OVER_THRESHOLDS[(OVER_THRESHOLDS.indexOf(cur) + 1) % OVER_THRESHOLDS.length];
      hapticLight();
      onThresholdChange(idx, next);
    }

    const stats6 = [
      {
        label: `+${thresholds[0]}`, value: overPct(thresholds[0]),
        filter: (m: DrillMatch) => ((m.homeScore ?? 0) + (m.awayScore ?? 0)) > thresholds[0],
        cycleIdx: 0 as 0 | 1 | 2,
      },
      {
        label: `+${thresholds[1]}`, value: overPct(thresholds[1]),
        filter: (m: DrillMatch) => ((m.homeScore ?? 0) + (m.awayScore ?? 0)) > thresholds[1],
        cycleIdx: 1 as 0 | 1 | 2,
      },
      {
        label: `+${thresholds[2]}`, value: overPct(thresholds[2]),
        filter: (m: DrillMatch) => ((m.homeScore ?? 0) + (m.awayScore ?? 0)) > thresholds[2],
        cycleIdx: 2 as 0 | 1 | 2,
      },
      {
        label: 'BTTS', value: pct(data.bttsPct),
        filter: (m: DrillMatch) => (m.homeScore ?? 0) > 0 && (m.awayScore ?? 0) > 0,
        cycleIdx: undefined,
      },
      {
        label: 'B. ZERO', value: pct(data.cleanSheetPct),
        filter: (m: DrillMatch) => (teamIsHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0)) === 0,
        cycleIdx: undefined,
      },
      {
        label: 'N. MARCOU', value: pct(data.failedToScorePct),
        filter: (m: DrillMatch) => (teamIsHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0)) === 0,
        cycleIdx: undefined,
      },
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

        {/* 6-stat grid — tap value to drill, tap ↕ label to cycle threshold */}
        <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted }]}>MERCADOS POPULARES</Text>
        <View style={newInsightStyles.statsGrid}>
          {stats6.map((s) => (
            <Pressable
              key={s.label}
              onPress={() => { hapticLight(); onStatPress(s.label, s.filter); }}
              style={[newInsightStyles.statGridItem, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}
            >
              <Text style={[newInsightStyles.statGridValue, { color: colors.primary }]}>{s.value}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={[newInsightStyles.statGridLabel, { color: colors.textSecondary }]}>{s.label}</Text>
                {s.cycleIdx !== undefined && (
                  <Pressable hitSlop={8} onPress={() => cycleThreshold(s.cycleIdx!)}>
                    <Ionicons name="swap-vertical-outline" size={11} color={`${colors.primary}90`} />
                  </Pressable>
                )}
              </View>
              <Ionicons name="chevron-forward" size={9} color={`${colors.primary}80`} />
            </Pressable>
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
    <View style={{ flex: 1 }}>
      {/* Sub-tab bar */}
      <View style={[insightSubStyles.bar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        {INSIGHT_SUB_TABS.map((t) => {
          const active = subTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => { hapticLight(); setSubTab(t.key); }}
              style={[insightSubStyles.tab, active && [insightSubStyles.tabActive, { borderBottomColor: colors.primary }]]}
            >
              <Text style={[insightSubStyles.tabText, { color: active ? colors.primary : colors.textMuted }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={newInsightStyles.scroll}>

        {/* ── Geral ── */}
        {subTab === 'overview' && (
          <>
            {/* Prediction */}
            {prediction && (
              <View style={[newInsightStyles.probCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}20` }]}>
                <View style={newInsightStyles.probCardHeader}>
                  <Ionicons name="analytics-outline" size={14} color={colors.primary} />
                  <Text style={[newInsightStyles.probCardTitle, { color: colors.primary }]}>PREVISÃO API-FOOTBALL</Text>
                </View>
                {prediction.advice ? (
                  <Text style={[newInsightStyles.probCardSub, { color: colors.textSecondary, marginBottom: 10 }]}>
                    {prediction.advice}
                  </Text>
                ) : null}
                <View style={newInsightStyles.probRow}>
                  {prediction.winPctHome != null && (
                    <View style={newInsightStyles.probItem}>
                      <Text style={[newInsightStyles.probValue, { color: colors.primary }]}>{Math.round(prediction.winPctHome)}%</Text>
                      <Text style={[newInsightStyles.probLabel, { color: colors.textPrimary }]}>{fixture.homeTeam.split(' ')[0]}</Text>
                      <Text style={[newInsightStyles.probSubLabel, { color: colors.textMuted }]}>vitória casa</Text>
                    </View>
                  )}
                  {prediction.winPctDraw != null && (
                    <View style={newInsightStyles.probItem}>
                      <Text style={[newInsightStyles.probValue, { color: colors.primary }]}>{Math.round(prediction.winPctDraw)}%</Text>
                      <Text style={[newInsightStyles.probLabel, { color: colors.textPrimary }]}>Empate</Text>
                      <Text style={[newInsightStyles.probSubLabel, { color: colors.textMuted }]}>resultado</Text>
                    </View>
                  )}
                  {prediction.winPctAway != null && (
                    <View style={newInsightStyles.probItem}>
                      <Text style={[newInsightStyles.probValue, { color: colors.primary }]}>{Math.round(prediction.winPctAway)}%</Text>
                      <Text style={[newInsightStyles.probLabel, { color: colors.textPrimary }]}>{fixture.awayTeam.split(' ')[0]}</Text>
                      <Text style={[newInsightStyles.probSubLabel, { color: colors.textMuted }]}>vitória fora</Text>
                    </View>
                  )}
                </View>
                <View style={[newInsightStyles.probDivider, { backgroundColor: colors.border, marginVertical: 10, width: '100%', height: 1 }]} />
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {prediction.overUnder && (
                    <View style={[newInsightStyles.impliedBadge, { backgroundColor: `${colors.primary}18` }]}>
                      <Text style={[newInsightStyles.impliedText, { color: colors.primary }]}>{prediction.overUnder}</Text>
                    </View>
                  )}
                  {prediction.btts != null && (
                    <View style={[newInsightStyles.impliedBadge, { backgroundColor: `${colors.primary}18` }]}>
                      <Text style={[newInsightStyles.impliedText, { color: colors.primary }]}>
                        {prediction.btts ? 'Ambas marcam ✓' : 'Ambas NÃO marcam ✗'}
                      </Text>
                    </View>
                  )}
                  {prediction.goalsHome != null && prediction.goalsAway != null && (
                    <View style={[newInsightStyles.impliedBadge, { backgroundColor: `${colors.primary}18` }]}>
                      <Text style={[newInsightStyles.impliedText, { color: colors.primary }]}>
                        Golos previstos: {prediction.goalsHome.toFixed(1)} – {prediction.goalsAway.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Combined probability */}
            {(insight.combinedOver25 != null || insight.combinedBtts != null) && (
              <View style={[newInsightStyles.probCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` }]}>
                <View style={newInsightStyles.probCardHeader}>
                  <Ionicons name="trending-up" size={14} color={colors.primary} />
                  <Text style={[newInsightStyles.probCardTitle, { color: colors.primary }]}>PROBABILIDADE COMBINADA</Text>
                </View>
                <Text style={[newInsightStyles.probCardSub, { color: colors.textSecondary }]}>
                  Estimativa baseada nos dados de ambas as equipas esta época
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

            {/* Form face-off */}
            {(home || away) && (
              <View style={[newInsightStyles.probCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={newInsightStyles.probCardHeader}>
                  <Ionicons name="pulse-outline" size={14} color={colors.primary} />
                  <Text style={[newInsightStyles.probCardTitle, { color: colors.primary }]}>FORMA RECENTE</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[overviewStyles.faceoffTeam, { color: colors.textPrimary }]} numberOfLines={1}>{fixture.homeTeam}</Text>
                    <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>em casa · {home?.sampleSize ?? '—'} jogos</Text>
                    <View style={newInsightStyles.formRow}>
                      {(home?.formLast5 ?? []).slice(0, 5).map((r, i) => (
                        <View key={i} style={[newInsightStyles.formPill, { backgroundColor: FORM_COLOR[r] ?? colors.border }]}>
                          <Text style={newInsightStyles.formPillText}>{FORM_LABEL[r] ?? r}</Text>
                        </View>
                      ))}
                      {!home && <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>sem dados</Text>}
                    </View>
                    {home && (
                      <Text style={[overviewStyles.faceoffSub, { color: colors.textMuted }]}>
                        {fmt1(home.avgGoalsFor)} gm · {fmt1(home.avgGoalsAgainst)} gs por jogo
                      </Text>
                    )}
                  </View>
                  <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border, alignSelf: 'stretch' }} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={[overviewStyles.faceoffTeam, { color: colors.textPrimary, textAlign: 'right' }]} numberOfLines={1}>{fixture.awayTeam}</Text>
                    <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>fora · {away?.sampleSize ?? '—'} jogos</Text>
                    <View style={[newInsightStyles.formRow, { justifyContent: 'flex-end' }]}>
                      {(away?.formLast5 ?? []).slice(0, 5).map((r, i) => (
                        <View key={i} style={[newInsightStyles.formPill, { backgroundColor: FORM_COLOR[r] ?? colors.border }]}>
                          <Text style={newInsightStyles.formPillText}>{FORM_LABEL[r] ?? r}</Text>
                        </View>
                      ))}
                      {!away && <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>sem dados</Text>}
                    </View>
                    {away && (
                      <Text style={[overviewStyles.faceoffSub, { color: colors.textMuted, textAlign: 'right' }]}>
                        {fmt1(away.avgGoalsFor)} gm · {fmt1(away.avgGoalsAgainst)} gs por jogo
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* Key metrics face-off */}
            {(home || away) && (() => {
              const metrics = [
                { label: 'Golos marcados/jogo', hv: home?.avgGoalsFor,       av: away?.avgGoalsFor,       fmt: (v: number) => v.toFixed(1),        better: 1 },
                { label: 'Golos sofridos/jogo', hv: home?.avgGoalsAgainst,   av: away?.avgGoalsAgainst,   fmt: (v: number) => v.toFixed(1),        better: -1 },
                { label: 'Over 2.5 golos',      hv: home?.over25Pct,         av: away?.over25Pct,         fmt: (v: number) => `${Math.round(v)}%`, better: 0 },
                { label: 'Ambas marcam',         hv: home?.bttsPct,           av: away?.bttsPct,           fmt: (v: number) => `${Math.round(v)}%`, better: 0 },
                { label: 'Baliza a zero',        hv: home?.cleanSheetPct,     av: away?.cleanSheetPct,     fmt: (v: number) => `${Math.round(v)}%`, better: 1 },
                { label: 'Não marcou',           hv: home?.failedToScorePct,  av: away?.failedToScorePct,  fmt: (v: number) => `${Math.round(v)}%`, better: -1 },
                { label: 'Cantos/jogo',          hv: home?.avgCornersFor,     av: away?.avgCornersFor,     fmt: (v: number) => v.toFixed(1),        better: 0 },
              ].filter(m => m.hv != null || m.av != null);
              if (!metrics.length) return null;
              return (
                <View style={[newInsightStyles.probCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <View style={newInsightStyles.probCardHeader}>
                    <Ionicons name="stats-chart-outline" size={14} color={colors.primary} />
                    <Text style={[newInsightStyles.probCardTitle, { color: colors.primary }]}>MÉTRICAS FACE A FACE</Text>
                  </View>
                  <View style={{ marginTop: 6 }}>
                    {metrics.map((m, idx) => {
                      const homeLeads = m.hv != null && m.av != null && m.better !== 0 && (m.better === 1 ? m.hv > m.av : m.hv < m.av);
                      const awayLeads = m.hv != null && m.av != null && m.better !== 0 && (m.better === 1 ? m.av > m.hv : m.av < m.hv);
                      return (
                        <View
                          key={m.label}
                          style={[overviewStyles.metricRow, idx % 2 === 0 && { backgroundColor: `${colors.textMuted}08` }, { borderRadius: 6 }]}
                        >
                          <Text style={[overviewStyles.metricVal, { color: homeLeads ? colors.primary : colors.textSecondary }]}>
                            {m.hv != null ? m.fmt(m.hv) : '—'}
                          </Text>
                          <Text style={[overviewStyles.metricLabel, { color: colors.textMuted }]}>{m.label}</Text>
                          <Text style={[overviewStyles.metricVal, { color: awayLeads ? colors.primary : colors.textSecondary, textAlign: 'right' }]}>
                            {m.av != null ? m.fmt(m.av) : '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={[newInsightStyles.sampleNote, { color: colors.textMuted, marginTop: 6 }]}>
                    {fixture.homeTeam} em casa · {fixture.awayTeam} fora · época atual
                  </Text>
                </View>
              );
            })()}

            {/* H2H mini-snapshot */}
            {insight.h2h && insight.h2h.total > 0 && (
              <View style={[newInsightStyles.probCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={newInsightStyles.probCardHeader}>
                  <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
                  <Text style={[newInsightStyles.probCardTitle, { color: colors.primary }]}>CONFRONTO DIRECTO (H2H)</Text>
                </View>
                <Text style={[newInsightStyles.probCardSub, { color: colors.textSecondary }]}>
                  Últimos {insight.h2h.total} jogos entre estas equipas
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Text style={[overviewStyles.h2hCount, { color: '#22c55e' }]}>{insight.h2h.homeWins}</Text>
                  <View style={[newInsightStyles.h2hTrack, { flex: 1 }]}>
                    <View style={[newInsightStyles.h2hSeg, { flex: insight.h2h.homeWins || 0.01, backgroundColor: '#22c55e' }]} />
                    <View style={[newInsightStyles.h2hSeg, { flex: insight.h2h.draws    || 0.01, backgroundColor: '#6b7280' }]} />
                    <View style={[newInsightStyles.h2hSeg, { flex: insight.h2h.awayWins || 0.01, backgroundColor: '#ef4444' }]} />
                  </View>
                  <Text style={[overviewStyles.h2hCount, { color: '#ef4444' }]}>{insight.h2h.awayWins}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                  <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]} numberOfLines={1}>{fixture.homeTeam}</Text>
                  <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>{insight.h2h.draws} empates</Text>
                  <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]} numberOfLines={1}>{fixture.awayTeam}</Text>
                </View>
                <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted, marginTop: 10 }]}>ÚLTIMOS RESULTADOS</Text>
                {insight.h2h.recentMatches.slice(0, 3).map((m: any, i: number) => (
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
            )}

            {/* Key players face-off */}
            {((insight.homeTopScorers?.length ?? 0) > 0 || (insight.awayTopScorers?.length ?? 0) > 0) && (
              <View style={[newInsightStyles.probCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={newInsightStyles.probCardHeader}>
                  <Ionicons name="person-outline" size={14} color={colors.primary} />
                  <Text style={[newInsightStyles.probCardTitle, { color: colors.primary }]}>JOGADORES CHAVE</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[overviewStyles.faceoffTeam, { color: colors.textPrimary }]} numberOfLines={1}>{fixture.homeTeam}</Text>
                    {(insight.homeTopScorers ?? []).slice(0, 4).map((s, i) => (
                      <View key={i} style={[overviewStyles.scorerRow, { borderTopColor: colors.border }]}>
                        <Text style={[overviewStyles.scorerName, { color: colors.textPrimary }]} numberOfLines={1}>{s.playerName}</Text>
                        <View style={[overviewStyles.scorerBadge, { backgroundColor: `${colors.primary}15` }]}>
                          <Text style={[overviewStyles.scorerStat, { color: colors.primary }]}>⚽ {s.goals}</Text>
                        </View>
                        {(s.assists ?? 0) > 0 && (
                          <View style={[overviewStyles.scorerBadge, { backgroundColor: `${colors.textMuted}15` }]}>
                            <Text style={[overviewStyles.scorerStat, { color: colors.textMuted }]}>🅰 {s.assists}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                    {(insight.homeTopScorers?.length ?? 0) === 0 && (
                      <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>sem dados</Text>
                    )}
                  </View>
                  <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[overviewStyles.faceoffTeam, { color: colors.textPrimary }]} numberOfLines={1}>{fixture.awayTeam}</Text>
                    {(insight.awayTopScorers ?? []).slice(0, 4).map((s, i) => (
                      <View key={i} style={[overviewStyles.scorerRow, { borderTopColor: colors.border }]}>
                        <Text style={[overviewStyles.scorerName, { color: colors.textPrimary }]} numberOfLines={1}>{s.playerName}</Text>
                        <View style={[overviewStyles.scorerBadge, { backgroundColor: `${colors.primary}15` }]}>
                          <Text style={[overviewStyles.scorerStat, { color: colors.primary }]}>⚽ {s.goals}</Text>
                        </View>
                        {(s.assists ?? 0) > 0 && (
                          <View style={[overviewStyles.scorerBadge, { backgroundColor: `${colors.textMuted}15` }]}>
                            <Text style={[overviewStyles.scorerStat, { color: colors.textMuted }]}>🅰 {s.assists}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                    {(insight.awayTopScorers?.length ?? 0) === 0 && (
                      <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>sem dados</Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* Injuries face-off */}
            {((insight.homeInjuries?.length ?? 0) > 0 || (insight.awayInjuries?.length ?? 0) > 0) && (
              <View style={[newInsightStyles.probCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={newInsightStyles.probCardHeader}>
                  <Ionicons name="bandage-outline" size={14} color="#ef4444" />
                  <Text style={[newInsightStyles.probCardTitle, { color: '#ef4444' }]}>BAIXAS E SUSPENSOS</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[overviewStyles.faceoffTeam, { color: colors.textPrimary }]} numberOfLines={1}>{fixture.homeTeam}</Text>
                    {(insight.homeInjuries ?? []).slice(0, 5).map((inj, i) => (
                      <View key={i} style={overviewStyles.injuryRow}>
                        <Ionicons name={inj.type === 'suspension' ? 'card-outline' : 'bandage-outline'} size={11} color="#ef4444" />
                        <Text style={[overviewStyles.injuryName, { color: colors.textSecondary }]} numberOfLines={1}>{inj.playerName}</Text>
                      </View>
                    ))}
                    {(insight.homeInjuries?.length ?? 0) === 0 && (
                      <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>sem baixas</Text>
                    )}
                  </View>
                  <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[overviewStyles.faceoffTeam, { color: colors.textPrimary }]} numberOfLines={1}>{fixture.awayTeam}</Text>
                    {(insight.awayInjuries ?? []).slice(0, 5).map((inj, i) => (
                      <View key={i} style={overviewStyles.injuryRow}>
                        <Ionicons name={inj.type === 'suspension' ? 'card-outline' : 'bandage-outline'} size={11} color="#ef4444" />
                        <Text style={[overviewStyles.injuryName, { color: colors.textSecondary }]} numberOfLines={1}>{inj.playerName}</Text>
                      </View>
                    ))}
                    {(insight.awayInjuries?.length ?? 0) === 0 && (
                      <Text style={[overviewStyles.faceoffVenue, { color: colors.textMuted }]}>sem baixas</Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            <StandingsCard />

            {insight.sharpOdds?.pinnacleHome != null && (
              <View>
                <View style={newInsightStyles.sectionHeaderRow}>
                  <Ionicons name="trending-up" size={16} color={colors.primary} />
                  <Text style={[newInsightStyles.sectionHeaderTitle, { color: colors.primary }]}>ODDS PINNACLE (SHARP)</Text>
                </View>
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
                </View>
              </View>
            )}

            <Text style={[newInsightStyles.timestamp, { color: colors.textMuted }]}>
              ⏱ {new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}, {new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </>
        )}

        {/* ── Casa ── */}
        {subTab === 'home' && (
          home != null
            ? <TeamCard
                team="home" teamName={fixture.homeTeam} venue="🏠" venueLabel="Em casa"
                data={home} injuries={insight.homeInjuries ?? []} topScorers={insight.homeTopScorers ?? []}
                onStatPress={(label, filter) => setDrillStat({ label, matches: home.recentMatches, matchFilter: filter })}
                thresholds={homeThresh}
                onThresholdChange={(i, v) => setHomeThresh(p => { const n = [...p] as [number,number,number]; n[i] = v; return n; })}
              />
            : <View style={newInsightStyles.center}>
                <Text style={{ color: colors.textMuted }}>Sem dados para esta equipa.</Text>
              </View>
        )}

        {/* ── Fora ── */}
        {subTab === 'away' && (
          away != null
            ? <TeamCard
                team="away" teamName={fixture.awayTeam} venue="✈️" venueLabel="Fora"
                data={away} injuries={insight.awayInjuries ?? []} topScorers={insight.awayTopScorers ?? []}
                onStatPress={(label, filter) => setDrillStat({ label, matches: away.recentMatches, matchFilter: filter })}
                thresholds={awayThresh}
                onThresholdChange={(i, v) => setAwayThresh(p => { const n = [...p] as [number,number,number]; n[i] = v; return n; })}
              />
            : <View style={newInsightStyles.center}>
                <Text style={{ color: colors.textMuted }}>Sem dados para esta equipa.</Text>
              </View>
        )}

        {/* ── H2H ── */}
        {subTab === 'h2h' && (
          insight.h2h && insight.h2h.total > 0
            ? (
              <View>
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
                      { value: String(insight.h2h.homeWins),       label: 'V casa',     color: '#22c55e' },
                      { value: String(insight.h2h.draws),           label: 'Empates',    color: colors.textPrimary },
                      { value: String(insight.h2h.awayWins),        label: 'V fora',     color: '#ef4444' },
                      { value: fmt1(insight.h2h.avgGoalsPerGame),   label: 'Golos/jogo', color: colors.textPrimary },
                      { value: pct(insight.h2h.over25Pct),          label: '+2.5',       color: colors.primary },
                      { value: pct(insight.h2h.bttsPct),            label: 'BTTS',       color: colors.primary },
                    ].map((s) => (
                      <View key={s.label} style={newInsightStyles.h2hStatCol}>
                        <Text style={[newInsightStyles.h2hStatValue, { color: s.color }]}>{s.value}</Text>
                        <Text style={[newInsightStyles.h2hStatLabel, { color: colors.textMuted }]}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={[newInsightStyles.sectionLabel, { color: colors.textMuted, marginTop: 12 }]}>ÚLTIMOS RESULTADOS</Text>
                  {insight.h2h.recentMatches.slice(0, 10).map((m: any, i: number) => (
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
            )
            : (
              <View style={newInsightStyles.center}>
                <Ionicons name="swap-horizontal" size={40} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: 8 }}>Sem dados de confrontos directos.</Text>
              </View>
            )
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {drillStat && (
        <StatDrillModal
          visible={true}
          label={drillStat.label}
          matches={drillStat.matches}
          matchFilter={drillStat.matchFilter}
          onClose={() => setDrillStat(null)}
        />
      )}
    </View>
  );
}

// ─── Pitch layout helpers ─────────────────────────────────────────────────────

const pitchStyles = StyleSheet.create({
  formBar:        { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  formSide:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  formBadge:      { width: 36, height: 36 },
  formTeamName:   { fontSize: 13, fontWeight: '700' },
  formFormation:  { fontSize: 20, fontWeight: '900', marginTop: 2 },
  formDivider:    { width: StyleSheet.hairlineWidth, height: 44 },
  pitch:          { backgroundColor: '#1b4d30', paddingVertical: 12 },
  halfPitch:      { paddingVertical: 6, gap: 8 },
  pitchRow:       { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 8 },
  dot:            { alignItems: 'center', width: 60, gap: 4 },
  circle:         { width: 42, height: 42, borderRadius: 21, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playerPhoto:    { width: 42, height: 42 },
  circleInner:    { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  circleInitial:  { fontSize: 15, fontWeight: '800' },
  dotLabel:       { fontSize: 9, fontWeight: '600', color: '#e5e7eb', textAlign: 'center' },
  centerZone:     { alignItems: 'center', paddingVertical: 8 },
  centerDash:     { width: '80%', borderTopWidth: 1, borderStyle: 'dashed' },
  subsSection:    { padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
  subsTitle:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  subRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  subPos:         { fontSize: 10, fontWeight: '700', width: 24 },
  subName:        { flex: 1, fontSize: 12 },
  coachSection:   { flexDirection: 'row', alignItems: 'center', padding: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  coachLabel:     { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center' },
  coachName:      { fontSize: 12, fontWeight: '600', flex: 1 },
});

type PitchPlayer = FixtureLineupData['startingXI'][number];

const apfPlayerPhoto = (id: number) => `https://media.api-sports.io/football/players/${id}.png`;

function PitchPlayerDot({ p, accent }: { p: PitchPlayer; accent: string }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUri = p.player?.id ? apfPlayerPhoto(p.player.id) : null;
  const parts = (p.player?.name ?? '').trim().split(' ');
  const label = parts.length > 1 ? parts[parts.length - 1] : (p.player?.name ?? '');

  return (
    <View style={pitchStyles.dot}>
      <View style={[pitchStyles.circle, { borderColor: accent }]}>
        {photoUri && !photoFailed ? (
          <Image
            source={{ uri: photoUri }}
            style={pitchStyles.playerPhoto}
            resizeMode="cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <View style={[pitchStyles.circleInner, { backgroundColor: accent + '35' }]}>
            <Text style={[pitchStyles.circleInitial, { color: '#fff' }]}>
              {(p.player?.name ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={pitchStyles.dotLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * Groups startingXI players into formation rows.
 * Prefers the API-provided `grid` field (row:col). When `grid` is absent or
 * invalid (API-Football omits it for many matches), falls back to parsing the
 * formation string — e.g. "4-3-3" → rows of [1, 4, 3, 3].
 */
function groupByFormation(
  players: PitchPlayer[],
  formation: string | null,
): Record<number, PitchPlayer[]> {
  const hasGrid = players.some((p) => p.grid && !/^0/.test(p.grid));
  if (hasGrid) {
    const groups: Record<number, PitchPlayer[]> = {};
    for (const p of players) {
      const row = p.grid ? parseInt(p.grid.split(':')[0], 10) : 99;
      if (!groups[row]) groups[row] = [];
      groups[row].push(p);
    }
    return groups;
  }

  // Formation-string fallback: "4-3-3" → lineSizes = [1,4,3,3]
  const lineSizes = formation
    ? [1, ...formation.split('-').map(Number)]
    : [players.length];

  const groups: Record<number, PitchPlayer[]> = {};
  let idx = 0;
  lineSizes.forEach((count, i) => {
    groups[i + 1] = players.slice(idx, idx + count);
    idx += count;
  });
  return groups;
}

// ─── LineupsTab ───────────────────────────────────────────────────────────────

function LineupsTab({ fixture }: { fixture: Fixture }) {
  const { colors } = useTheme();
  const { data: lineups = [], isLoading } = useFixtureLineups(fixture.id);

  if (isLoading) {
    return (
      <View style={newInsightStyles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[newInsightStyles.loadingText, { color: colors.textMuted }]}>A carregar escalações…</Text>
      </View>
    );
  }

  if (lineups.length === 0) {
    return (
      <View style={newInsightStyles.center}>
        <Ionicons name="people-outline" size={44} color={colors.textMuted} />
        <Text style={[newInsightStyles.loadingText, { color: colors.textMuted, marginTop: 10 }]}>
          Escalações ainda não disponíveis.
        </Text>
      </View>
    );
  }

  const home = lineups.find((l) => l.isHome);
  const away = lineups.find((l) => !l.isHome);

  const homeGroups = groupByFormation(home?.startingXI ?? [], home?.formation ?? null);
  const awayGroups = groupByFormation(away?.startingXI ?? [], away?.formation ?? null);
  const homeRows = Object.keys(homeGroups).map(Number).sort((a, b) => a - b);
  const awayRows = Object.keys(awayGroups).map(Number).sort((a, b) => b - a); // reversed = attack on top

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Formation header */}
      <View style={[pitchStyles.formBar, { backgroundColor: colors.surfaceRaised, borderBottomColor: colors.border }]}>
        <View style={pitchStyles.formSide}>
          <Image source={{ uri: getTeamLogoUrl(fixture.homeTeam) ?? undefined }} style={pitchStyles.formBadge} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={[pitchStyles.formTeamName, { color: colors.textPrimary }]} numberOfLines={1}>{fixture.homeTeam}</Text>
            <Text style={[pitchStyles.formFormation, { color: '#60a5fa' }]}>{home?.formation ?? '?'}</Text>
          </View>
        </View>
        <View style={[pitchStyles.formDivider, { backgroundColor: colors.border }]} />
        <View style={[pitchStyles.formSide, { flexDirection: 'row-reverse' }]}>
          <Image source={{ uri: getTeamLogoUrl(fixture.awayTeam) ?? undefined }} style={pitchStyles.formBadge} resizeMode="contain" />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={[pitchStyles.formTeamName, { color: colors.textPrimary }]} numberOfLines={1}>{fixture.awayTeam}</Text>
            <Text style={[pitchStyles.formFormation, { color: '#f97316' }]}>{away?.formation ?? '?'}</Text>
          </View>
        </View>
      </View>

      {/* Pitch */}
      <View style={pitchStyles.pitch}>
        <View style={pitchStyles.halfPitch}>
          {homeRows.map((row) => (
            <View key={`h${row}`} style={pitchStyles.pitchRow}>
              {(homeGroups[row] ?? []).map((p, i) => (
                <PitchPlayerDot key={`${p.player?.id ?? i}`} p={p} accent="#60a5fa" />
              ))}
            </View>
          ))}
        </View>
        <View style={pitchStyles.centerZone}>
          <View style={[pitchStyles.centerDash, { borderColor: 'rgba(255,255,255,0.2)' }]} />
        </View>
        <View style={pitchStyles.halfPitch}>
          {awayRows.map((row) => (
            <View key={`a${row}`} style={pitchStyles.pitchRow}>
              {(awayGroups[row] ?? []).map((p, i) => (
                <PitchPlayerDot key={`${p.player?.id ?? i}`} p={p} accent="#f97316" />
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Substitutes */}
      <View style={[pitchStyles.subsSection, { borderTopColor: colors.border }]}>
        <Text style={[pitchStyles.subsTitle, { color: colors.textMuted }]}>SUPLENTES</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            {(home?.substitutes ?? []).map((p, i) => (
              <View key={i} style={[pitchStyles.subRow, { borderBottomColor: colors.border }]}>
                <Text style={[pitchStyles.subPos, { color: '#60a5fa' }]}>{p.pos}</Text>
                <Text style={[pitchStyles.subName, { color: colors.textSecondary }]} numberOfLines={1}>{p.player?.name}</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {(away?.substitutes ?? []).map((p, i) => (
              <View key={i} style={[pitchStyles.subRow, { borderBottomColor: colors.border, flexDirection: 'row-reverse' }]}>
                <Text style={[pitchStyles.subPos, { color: '#f97316' }]}>{p.pos}</Text>
                <Text style={[pitchStyles.subName, { color: colors.textSecondary, textAlign: 'right' }]} numberOfLines={1}>{p.player?.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Coaches */}
      {(home?.coachName || away?.coachName) && (
        <View style={[pitchStyles.coachSection, { borderTopColor: colors.border }]}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="person-outline" size={12} color="#60a5fa" />
            <Text style={[pitchStyles.coachName, { color: colors.textSecondary }]} numberOfLines={1}>{home?.coachName ?? '—'}</Text>
          </View>
          <Text style={[pitchStyles.coachLabel, { color: colors.textMuted }]}>TREINADORES</Text>
          <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
            <Ionicons name="person-outline" size={12} color="#f97316" />
            <Text style={[pitchStyles.coachName, { color: colors.textSecondary, textAlign: 'right' }]} numberOfLines={1}>{away?.coachName ?? '—'}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── EventsTab ────────────────────────────────────────────────────────────────

function EvtIcon({ type, detail }: { type: string; detail: string | null }) {
  const dl = detail?.toLowerCase() ?? '';
  if (type === 'Goal') {
    if (dl.includes('own goal')) return <Text style={{ fontSize: 12, lineHeight: 14 }}>🔴</Text>;
    if (dl.includes('penalty'))  return <Text style={{ fontSize: 12, lineHeight: 14 }}>⚽P</Text>;
    return <Text style={{ fontSize: 12, lineHeight: 14 }}>⚽</Text>;
  }
  if (type === 'Card') {
    const isRed = dl.includes('red card') || dl.includes('second yellow');
    return <View style={{ width: 9, height: 13, backgroundColor: isRed ? '#ef4444' : '#f59e0b', borderRadius: 2 }} />;
  }
  if (type === 'subst' || type === 'Subst') return <Ionicons name="swap-vertical-outline" size={13} color="#60a5fa" />;
  if (type === 'Var')  return <Ionicons name="tv-outline" size={13} color="#a78bfa" />;
  return <Ionicons name="ellipse" size={7} color="#9ca3af" />;
}

function EventsTab({ fixture }: { fixture: Fixture }) {
  const { colors } = useTheme();
  const { data: events = [], isLoading } = useFixtureEvents(fixture.id);
  const { data: matchStats }             = useFixtureMatchStats(fixture.id);

  if (isLoading) {
    return (
      <View style={newInsightStyles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[newInsightStyles.loadingText, { color: colors.textMuted }]}>A carregar eventos…</Text>
      </View>
    );
  }

  const hasScore = fixture.homeScore != null && fixture.awayScore != null;
  const finished = fixture.status === 'FINISHED';

  // Sort chronologically for score tracking
  const sorted = [...events].sort((a, b) =>
    (a.minute * 100 + (a.extraMinute ?? 0)) - (b.minute * 100 + (b.extraMinute ?? 0))
  );

  // Build running score after each goal event
  const scoreAfter: Record<string, { home: number; away: number }> = {};
  let hg = 0, ag = 0;
  for (const ev of sorted) {
    if (ev.type === 'Goal' && !ev.detail?.toLowerCase().includes('missed')) {
      const own = ev.detail?.toLowerCase().includes('own goal');
      if (own) { if (ev.isHome) ag++; else hg++; }
      else      { if (ev.isHome) hg++; else ag++; }
    }
    scoreAfter[ev.id] = { home: hg, away: ag };
  }

  const firstHalf  = sorted.filter(e => e.minute <= 45);
  const secondHalf = sorted.filter(e => e.minute > 45);

  // HT score
  let htH = 0, htA = 0;
  for (const ev of firstHalf) {
    if (ev.type === 'Goal' && !ev.detail?.toLowerCase().includes('missed')) {
      const own = ev.detail?.toLowerCase().includes('own goal');
      if (own) { if (ev.isHome) htA++; else htH++; }
      else      { if (ev.isHome) htH++; else htA++; }
    }
  }

  function renderSep(label: string, score?: string) {
    return (
      <View style={evtStyles.sepRow}>
        <View style={[evtStyles.sepLine, { backgroundColor: colors.border }]} />
        <View style={[evtStyles.sepBadge, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Text style={[evtStyles.sepLabel, { color: colors.textMuted }]}>{label}</Text>
          {score != null && <Text style={[evtStyles.sepScore, { color: colors.textPrimary }]}>{score}</Text>}
        </View>
        <View style={[evtStyles.sepLine, { backgroundColor: colors.border }]} />
      </View>
    );
  }

  function renderEvent(ev: FixtureEventData) {
    const isGoal  = ev.type === 'Goal' && !ev.detail?.toLowerCase().includes('missed');
    const score   = isGoal ? scoreAfter[ev.id] : null;
    const minLabel = `${ev.minute}${ev.extraMinute ? `+${ev.extraMinute}` : ''}'`;
    const label   = ev.playerName ?? (ev.detail !== ev.type ? ev.detail : null) ?? ev.type;

    return (
      <View key={ev.id}>
        <View style={evtStyles.eventRow}>
          {/* Home side (left) */}
          <View style={evtStyles.leftCol}>
            {ev.isHome && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, paddingRight: 4 }}>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[evtStyles.evtPlayer, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
                  {ev.assistName && (
                    <Text style={[evtStyles.evtAssist, { color: colors.textMuted }]} numberOfLines={1}>ass. {ev.assistName}</Text>
                  )}
                </View>
                <EvtIcon type={ev.type} detail={ev.detail} />
              </View>
            )}
          </View>

          {/* Center minute */}
          <View style={evtStyles.centerCol}>
            <Text style={[evtStyles.minute, { color: colors.textMuted }]}>{minLabel}</Text>
          </View>

          {/* Away side (right) */}
          <View style={evtStyles.rightCol}>
            {!ev.isHome && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 5, paddingLeft: 4 }}>
                <EvtIcon type={ev.type} detail={ev.detail} />
                <View style={{ flex: 1 }}>
                  <Text style={[evtStyles.evtPlayer, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
                  {ev.assistName && (
                    <Text style={[evtStyles.evtAssist, { color: colors.textMuted }]} numberOfLines={1}>ass. {ev.assistName}</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Score badge after goal */}
        {isGoal && score != null && (
          <View style={{ alignItems: 'center', marginBottom: 2 }}>
            <View style={[evtStyles.scoreChip, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}40` }]}>
              <Text style={[evtStyles.scoreChipText, { color: colors.primary }]}>{score.home} – {score.away}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14 }}>

      {/* Match stats bars */}
      {matchStats && (
        <View style={[evtStyles.statsCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {[
            { label: 'Posse de bola', home: matchStats.homePossession,    away: matchStats.awayPossession,    fmt: (v: number) => `${v.toFixed(0)}%` },
            { label: 'Remates',       home: matchStats.homeShotsTotal,     away: matchStats.awayShotsTotal,     fmt: (v: number) => String(v) },
            { label: 'No alvo',       home: matchStats.homeShotsOnTarget,  away: matchStats.awayShotsOnTarget,  fmt: (v: number) => String(v) },
            { label: 'xG',            home: matchStats.homeXg,             away: matchStats.awayXg,             fmt: (v: number) => v.toFixed(2) },
            { label: 'Cantos',        home: matchStats.homeCorners,        away: matchStats.awayCorners,        fmt: (v: number) => String(v) },
            { label: 'Faltas',        home: matchStats.homeFouls,          away: matchStats.awayFouls,          fmt: (v: number) => String(v) },
          ].filter(r => r.home != null && r.away != null).map((row) => {
            const total = (row.home as number) + (row.away as number) || 1;
            const homePct = ((row.home as number) / total) * 100;
            return (
              <View key={row.label} style={evtStyles.statBarRow}>
                <Text style={[evtStyles.statBarVal, { color: colors.textPrimary }]}>{row.fmt(row.home as number)}</Text>
                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <Text style={[evtStyles.statBarLabel, { color: colors.textMuted }]}>{row.label}</Text>
                  <View style={[evtStyles.statBarTrack, { backgroundColor: colors.border }]}>
                    <View style={[evtStyles.statBarFill, { width: `${homePct}%` as any, backgroundColor: colors.primary }]} />
                  </View>
                </View>
                <Text style={[evtStyles.statBarVal, { color: colors.textPrimary, textAlign: 'right' }]}>{row.fmt(row.away as number)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {events.length === 0 ? (
        finished ? (
          <View style={newInsightStyles.center}>
            <Ionicons name="list-outline" size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8 }}>Sem eventos disponíveis.</Text>
          </View>
        ) : (
          <View style={[evtStyles.emptyBox, { borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={22} color={colors.textMuted} />
            <Text style={[evtStyles.emptyText, { color: colors.textMuted }]}>Eventos disponíveis após o jogo.</Text>
          </View>
        )
      ) : (
        <View style={{ marginTop: 4 }}>
          {/* Column headers */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={[evtStyles.colHeader, { flex: 1, color: colors.textMuted, textAlign: 'right' }]} numberOfLines={1}>{fixture.homeTeam}</Text>
            <View style={evtStyles.centerCol} />
            <Text style={[evtStyles.colHeader, { flex: 1, color: colors.textMuted }]} numberOfLines={1}>{fixture.awayTeam}</Text>
          </View>

          {/* FT separator */}
          {finished && hasScore && renderSep('FIM', `${fixture.homeScore} – ${fixture.awayScore}`)}

          {[...secondHalf].reverse().map(renderEvent)}

          {/* HT separator — only if both halves have events */}
          {firstHalf.length > 0 && secondHalf.length > 0 && renderSep('INTERVALO', `${htH} – ${htA}`)}

          {[...firstHalf].reverse().map(renderEvent)}

          {renderSep('INÍCIO')}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const evtStyles = StyleSheet.create({
  statsCard:     { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12, gap: 10 },
  statBarRow:    { flexDirection: 'row', alignItems: 'center' },
  statBarLabel:  { fontSize: 10, textAlign: 'center', marginBottom: 3 },
  statBarVal:    { width: 40, fontSize: 13, fontWeight: '700' },
  statBarTrack:  { height: 6, borderRadius: 3, overflow: 'hidden' },
  statBarFill:   { height: 6, borderRadius: 3 },
  colHeader:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 4 },
  eventRow:      { flexDirection: 'row', alignItems: 'center', minHeight: 32, paddingVertical: 3 },
  leftCol:       { flex: 1 },
  centerCol:     { width: 44, alignItems: 'center' },
  rightCol:      { flex: 1 },
  evtPlayer:     { fontSize: 12, fontWeight: '600' },
  evtAssist:     { fontSize: 11 },
  minute:        { fontSize: 11, fontWeight: '700' },
  scoreChip:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 2, marginBottom: 2 },
  scoreChipText: { fontSize: 12, fontWeight: '800' },
  sepRow:        { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  sepLine:       { flex: 1, height: StyleSheet.hairlineWidth },
  sepBadge:      { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 8, alignItems: 'center' },
  sepLabel:      { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  sepScore:      { fontSize: 14, fontWeight: '800' },
  emptyBox:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 12 },
  emptyText:     { fontSize: 13 },
});

// ─── Team Profile Sheet ────────────────────────────────────────────────────────

const TEAM_FORM_COLOR: Record<string, string> = { W: '#22c55e', D: '#6b7280', L: '#ef4444' };
const TEAM_FORM_LABEL: Record<string, string> = { W: 'V', D: 'E', L: 'D' };

function TeamProfileSheet({ team, onClose }: { team: TeamStatData; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const formPills = (team.formLast5 ?? '').split('').filter((c) => 'WDL'.includes(c)).slice(0, 5);
  const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
  const avg = (n: number, d: number) => (d === 0 ? '—' : (n / d).toFixed(2));

  const HomeRow = () => (
    <View style={[tpStyles.splitRow, { borderBottomColor: colors.border }]}>
      <Text style={[tpStyles.splitLabel, { color: colors.textSecondary }]}>🏠 Casa</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.homeWon + team.homeDrawn + team.homeLost}</Text>
      <Text style={[tpStyles.splitCell, { color: '#22c55e' }]}>{team.homeWon}</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.homeDrawn}</Text>
      <Text style={[tpStyles.splitCell, { color: '#ef4444' }]}>{team.homeLost}</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.homeGoalsFor}</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.homeGoalsAgainst}</Text>
      <Text style={[tpStyles.splitPts, { color: colors.textPrimary }]}>{team.homeWon * 3 + team.homeDrawn}</Text>
    </View>
  );
  const AwayRow = () => (
    <View style={[tpStyles.splitRow, { borderBottomColor: colors.border }]}>
      <Text style={[tpStyles.splitLabel, { color: colors.textSecondary }]}>✈️ Fora</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.awayWon + team.awayDrawn + team.awayLost}</Text>
      <Text style={[tpStyles.splitCell, { color: '#22c55e' }]}>{team.awayWon}</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.awayDrawn}</Text>
      <Text style={[tpStyles.splitCell, { color: '#ef4444' }]}>{team.awayLost}</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.awayGoalsFor}</Text>
      <Text style={[tpStyles.splitCell, { color: colors.textSecondary }]}>{team.awayGoalsAgainst}</Text>
      <Text style={[tpStyles.splitPts, { color: colors.textPrimary }]}>{team.awayWon * 3 + team.awayDrawn}</Text>
    </View>
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[tpStyles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={[tpStyles.header, { borderBottomColor: colors.border }]}>
          <Pressable hitSlop={12} onPress={onClose}>
            <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Image
              source={{ uri: getTeamLogoUrl(team.team) ?? undefined }}
              style={tpStyles.headerBadge}
              resizeMode="contain"
            />
            <Text style={[tpStyles.teamName, { color: colors.textPrimary }]}>{team.team}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {getLeagueLogoUrl(team.competition) ? (
                <Image
                  source={{ uri: getLeagueLogoUrl(team.competition) ?? undefined }}
                  style={tpStyles.metaLeagueLogo}
                  resizeMode="contain"
                />
              ) : null}
              <Text style={[tpStyles.meta, { color: colors.textMuted }]}>{team.competition} · {team.season}</Text>
            </View>
          </View>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={tpStyles.scroll}>
          {/* Position + points hero row */}
          <View style={[tpStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={tpStyles.heroRow}>
              {[
                { label: 'Posição', value: team.position != null ? `#${team.position}` : '—' },
                { label: 'Pontos', value: String(team.points) },
                { label: 'J', value: String(team.played) },
                { label: 'DG', value: `${team.goalDifference >= 0 ? '+' : ''}${team.goalDifference}` },
              ].map((item, i) => (
                <React.Fragment key={item.label}>
                  {i > 0 && <View style={[tpStyles.vDivider, { backgroundColor: colors.border }]} />}
                  <View style={tpStyles.heroCell}>
                    <Text style={[tpStyles.heroVal, { color: colors.primary }]}>{item.value}</Text>
                    <Text style={[tpStyles.heroLabel, { color: colors.textMuted }]}>{item.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* W/D/L record bar */}
          {team.played > 0 && (() => {
            const wPct = team.won / team.played;
            const dPct = team.drawn / team.played;
            const lPct = team.lost / team.played;
            return (
              <View style={[tpStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={tpStyles.recordRow}>
                  <View style={tpStyles.recordCell}>
                    <Text style={[tpStyles.recordVal, { color: '#22c55e' }]}>{team.won}</Text>
                    <Text style={[tpStyles.recordLabel, { color: colors.textMuted }]}>V</Text>
                  </View>
                  <View style={tpStyles.recordCell}>
                    <Text style={[tpStyles.recordVal, { color: colors.textSecondary }]}>{team.drawn}</Text>
                    <Text style={[tpStyles.recordLabel, { color: colors.textMuted }]}>E</Text>
                  </View>
                  <View style={tpStyles.recordCell}>
                    <Text style={[tpStyles.recordVal, { color: '#ef4444' }]}>{team.lost}</Text>
                    <Text style={[tpStyles.recordLabel, { color: colors.textMuted }]}>D</Text>
                  </View>
                  <View style={[tpStyles.vDivider, { backgroundColor: colors.border, marginHorizontal: 8 }]} />
                  <View style={tpStyles.recordCell}>
                    <Text style={[tpStyles.recordVal, { color: colors.textPrimary }]}>{team.goalsFor}</Text>
                    <Text style={[tpStyles.recordLabel, { color: colors.textMuted }]}>GM</Text>
                  </View>
                  <View style={tpStyles.recordCell}>
                    <Text style={[tpStyles.recordVal, { color: colors.textPrimary }]}>{team.goalsAgainst}</Text>
                    <Text style={[tpStyles.recordLabel, { color: colors.textMuted }]}>GS</Text>
                  </View>
                </View>
                <View style={tpStyles.wdlBar}>
                  {wPct > 0 && <View style={[tpStyles.wdlSegW, { flex: wPct }]} />}
                  {dPct > 0 && <View style={[tpStyles.wdlSegD, { flex: dPct }]} />}
                  {lPct > 0 && <View style={[tpStyles.wdlSegL, { flex: lPct }]} />}
                </View>
              </View>
            );
          })()}

          {/* Form */}
          {formPills.length > 0 && (
            <View style={[tpStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[tpStyles.sectionTitle, { color: colors.textMuted }]}>FORMA RECENTE</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {formPills.map((r, i) => (
                  <View key={i} style={[tpStyles.formPill, { backgroundColor: TEAM_FORM_COLOR[r] ?? '#6b7280' }]}>
                    <Text style={tpStyles.formPillText}>{TEAM_FORM_LABEL[r] ?? r}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Home/Away split */}
          <View style={[tpStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Text style={[tpStyles.sectionTitle, { color: colors.textMuted }]}>CASA vs FORA</Text>
            <View style={[tpStyles.splitHeader, { borderBottomColor: colors.border }]}>
              <Text style={[tpStyles.splitLabel, { color: colors.textMuted }]} />
              {['J', 'V', 'E', 'D', 'GM', 'GS', 'Pts'].map((h) => (
                <Text key={h} style={[tpStyles.splitCell, { color: colors.textMuted, fontWeight: '700' }]}>{h}</Text>
              ))}
            </View>
            <HomeRow />
            <AwayRow />
          </View>

          {/* Key rates */}
          <View style={[tpStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Text style={[tpStyles.sectionTitle, { color: colors.textMuted }]}>MÉTRICAS</Text>
            <View style={tpStyles.metricsGrid}>
              {[
                { label: 'BTTS', value: pct(team.bttsCount, team.played) },
                { label: '+1.5', value: pct(team.over15Count, team.played) },
                { label: '+2.5', value: pct(team.over25Count, team.played) },
                { label: 'B. ZERO', value: pct(team.cleanSheets, team.played) },
                { label: 'N. MARCOU', value: pct(team.failedToScore, team.played) },
                { label: 'Méd. GM', value: avg(team.goalsFor, team.played) },
                { label: 'Méd. GS', value: avg(team.goalsAgainst, team.played) },
                { label: 'Comebacks', value: String(team.comebacks) },
              ].map((m) => (
                <View key={m.label} style={[tpStyles.metricItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[tpStyles.metricVal, { color: colors.primary }]}>{m.value}</Text>
                  <Text style={[tpStyles.metricLabel, { color: colors.textMuted }]}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Half-time record */}
          <View style={[tpStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Text style={[tpStyles.sectionTitle, { color: colors.textMuted }]}>AO INTERVALO</Text>
            <View style={tpStyles.htRow}>
              {[
                { label: 'Vitórias', value: team.htWon, color: '#22c55e' },
                { label: 'Empates', value: team.htDrawn, color: colors.textSecondary },
                { label: 'Derrotas', value: team.htLost, color: '#ef4444' },
              ].map((item, i) => (
                <React.Fragment key={item.label}>
                  {i > 0 && <View style={[tpStyles.vDivider, { backgroundColor: colors.border }]} />}
                  <View style={tpStyles.heroCell}>
                    <Text style={[tpStyles.heroVal, { color: item.color }]}>{item.value}</Text>
                    <Text style={[tpStyles.heroLabel, { color: colors.textMuted }]}>{item.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const tpStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  headerBadge: { width: 56, height: 56 },
  metaLeagueLogo: { width: 14, height: 14 },
  teamName: { fontSize: 17, fontWeight: '800', marginTop: 6 },
  meta: { fontSize: 12 },
  recordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 },
  recordCell: { alignItems: 'center', gap: 2 },
  recordVal: { fontSize: 20, fontWeight: '900' },
  recordLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  wdlBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  wdlSegW: { backgroundColor: '#22c55e' },
  wdlSegD: { backgroundColor: '#6b7280' },
  wdlSegL: { backgroundColor: '#ef4444' },
  scroll: { padding: 16, gap: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 2 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  heroCell: { alignItems: 'center', flex: 1 },
  heroVal: { fontSize: 22, fontWeight: '900' },
  heroLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  vDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  formPill: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  formPillText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  splitHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  splitRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  splitLabel: { width: 60, fontSize: 12, fontWeight: '600' },
  splitCell: { flex: 1, fontSize: 12, textAlign: 'center' },
  splitPts: { width: 30, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  metricItem: { width: '22%', flexGrow: 1, borderRadius: 8, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  metricVal: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },
  htRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
});

// ─── Add-to-boletim sheet (mirrors boletim create screen) ─────────────────────

type AddSheetTab = 'bet' | 'insight' | 'lineups' | 'events' | 'table';
const TAB_KEYS: AddSheetTab[] = ['bet', 'insight', 'lineups', 'events', 'table'];

function AddSheet({ fixture, onClose, onAdded }: AddSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AddSheetTab>('bet');
  const activeTabRef = useRef<AddSheetTab>(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const tabSwipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 25 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderRelease: (_, g) => {
        const idx = TAB_KEYS.indexOf(activeTabRef.current);
        if (g.dx < -50 && idx < TAB_KEYS.length - 1) {
          hapticLight(); setActiveTab(TAB_KEYS[idx + 1]);
        } else if (g.dx > 50 && idx > 0) {
          hapticLight(); setActiveTab(TAB_KEYS[idx - 1]);
        }
      },
    })
  ).current;

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
  const [teamProfile, setTeamProfile]           = useState<TeamStatData | null>(null);

  const { data: insightForProfile } = useFixtureInsight(fixture?.id ?? null);

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
  const kickoffTime = formatKickoff(fixture.kickoffAt);

  const TABS: { key: AddSheetTab; label: string }[] = [
    { key: 'bet',     label: 'Apostar' },
    { key: 'insight', label: 'Análise' },
    { key: 'lineups', label: 'Escalações' },
    { key: 'events',  label: 'Eventos' },
    { key: 'table',   label: 'Tabela' },
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
            {/* Drag handle + fixture hero */}
            <GestureDetector gesture={dragGesture}>
              <View style={bsStyles.dragArea}>
                <View style={[bsStyles.handle, { backgroundColor: colors.border }]} />
                {/* Top controls */}
                <View style={bsStyles.heroControls}>
                  <Pressable hitSlop={12} onPress={onClose} style={bsStyles.closeBtn}>
                    <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
                  </Pressable>
                  <View style={{ flex: 1 }} />
                </View>
                {/* Hero: logos + date/time */}
                <View style={bsStyles.heroRow}>
                  <Pressable
                    style={bsStyles.heroTeamCol}
                    onPress={() => { const t = insightForProfile?.standings?.home; if (t) setTeamProfile(t); }}
                    hitSlop={4}
                  >
                    <Image
                      source={{ uri: getTeamLogoUrl(fixture.homeTeam) ?? undefined }}
                      style={bsStyles.heroLogo}
                      resizeMode="contain"
                    />
                    <Text style={[bsStyles.heroTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {fixture.homeTeam}
                    </Text>
                  </Pressable>
                  <View style={bsStyles.heroCenterCol}>
                    {fixture.status === 'FINISHED' && fixture.homeScore != null ? (
                      <>
                        <Text style={[bsStyles.heroStatusLabel, { color: colors.textMuted }]}>FT</Text>
                        <Text style={[bsStyles.heroScore, { color: colors.textPrimary }]}>
                          {fixture.homeScore} – {fixture.awayScore}
                        </Text>
                        <Text style={[bsStyles.heroDate, { color: colors.textMuted, fontSize: 11, marginTop: 2 }]}>
                          {formatDate(fixture.kickoffAt)}
                        </Text>
                      </>
                    ) : fixture.status === 'LIVE' && fixture.homeScore != null ? (
                      <>
                        <View style={bsStyles.liveRow}>
                          <View style={[bsStyles.liveDot, { backgroundColor: '#ef4444' }]} />
                          <Text style={[bsStyles.liveLabel, { color: '#ef4444' }]}>AO VIVO</Text>
                        </View>
                        <Text style={[bsStyles.heroScore, { color: '#ef4444' }]}>
                          {fixture.homeScore} – {fixture.awayScore}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={[bsStyles.heroDate, { color: colors.textPrimary }]}>
                          {formatDate(fixture.kickoffAt)}
                        </Text>
                        <Text style={[bsStyles.heroTime, { color: colors.textSecondary }]}>{kickoffTime}</Text>
                      </>
                    )}
                  </View>
                  <Pressable
                    style={bsStyles.heroTeamCol}
                    onPress={() => { const t = insightForProfile?.standings?.away; if (t) setTeamProfile(t); }}
                    hitSlop={4}
                  >
                    <Image
                      source={{ uri: getTeamLogoUrl(fixture.awayTeam) ?? undefined }}
                      style={bsStyles.heroLogo}
                      resizeMode="contain"
                    />
                    <Text style={[bsStyles.heroTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {fixture.awayTeam}
                    </Text>
                  </Pressable>
                </View>
                {/* Competition strip */}
                <View style={[bsStyles.competitionStrip, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                  {getLeagueLogoUrl(fixture.competition) ? (
                    <Image
                      source={{ uri: getLeagueLogoUrl(fixture.competition) ?? undefined }}
                      style={bsStyles.competitionLogo}
                      resizeMode="contain"
                    />
                  ) : null}
                  <Text style={[bsStyles.competitionStripText, { color: colors.textMuted }]}>
                    {fixture.competition}{fixture.round ? ` · ${fixture.round}` : ''}
                  </Text>
                </View>
              </View>
            </GestureDetector>

            {/* Tab bar */}
            <View style={[tabStyles.bar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tabStyles.scrollContent}>
                {TABS.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => { hapticLight(); setActiveTab(tab.key); }}
                      style={tabStyles.tab}
                    >
                      <Text style={[tabStyles.tabText, {
                        color: active ? colors.textPrimary : colors.textMuted,
                        fontWeight: active ? '700' : '500',
                      }]}>
                        {tab.label}
                      </Text>
                      <View style={[tabStyles.underline, { backgroundColor: active ? colors.textPrimary : 'transparent' }]} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Tab content — horizontal swipe changes tabs */}
            <View style={{ flex: 1 }} {...tabSwipePan.panHandlers}>
              {activeTab === 'insight' && <InsightTab fixture={fixture} />}
              {activeTab === 'lineups' && <LineupsTab fixture={fixture} />}
              {activeTab === 'events'  && <EventsTab  fixture={fixture} />}

              {activeTab === 'table' && (
                <View style={{ height: SCREEN_HEIGHT * 0.96 - 120 }}>
                  <LeagueTableModal
                    visible={true}
                    competition={resolveCompetition(fixture.competition)}
                    highlightTeams={[fixture.homeTeam, fixture.awayTeam]}
                    onClose={() => setActiveTab('bet')}
                    onTeamPress={(t) => setTeamProfile(t)}
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
            </View>{/* end tab content swipe wrapper */}
          </Animated.View>
        </View>
      </GestureHandlerRootView>

      <SearchableDropdown visible={showMarkets} onClose={() => setShowMarkets(false)} title="Mercado" sections={marketSections} onSelect={(val) => { setMarket(val); }} isLoading={marketsQuery.isLoading} initialVisibleCount={8} />
      <SearchableDropdown visible={showSites} onClose={() => setShowSites(false)} title="Site de apostas" items={BETTING_SITES.map((s) => ({ label: s.name, value: s.slug }))} onSelect={(val) => setSiteSlug(val)} />

      {teamProfile && <TeamProfileSheet team={teamProfile} onClose={() => setTeamProfile(null)} />}
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
  const isFinished = fixture.status === 'FINISHED';
  const isLive = fixture.status === 'LIVE';
  const kickoffTime = formatKickoff(fixture.kickoffAt);
  const kickoffDate = formatDate(fixture.kickoffAt);
  const isToday = adjustedDateKey(fixture.kickoffAt) === toLocalDateKey(stripTime(new Date()));

  return (
    <PressableScale
      onPress={() => { hapticLight(); onPress(fixture); }}
      style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: isLast ? 'transparent' : colors.border }]}
    >
      <View style={styles.cardTimeCol}>
        {isLive ? (
          <>
            <View style={styles.liveIndicator}>
              <View style={[styles.liveDot, { backgroundColor: '#ef4444' }]} />
              <Text style={[styles.liveText, { color: '#ef4444' }]}>AO VIVO</Text>
            </View>
            {fixture.elapsedMinutes != null && (
              <Text style={[styles.elapsedText, { color: '#ef4444' }]}>{fixture.elapsedMinutes}&apos;</Text>
            )}
          </>
        ) : isFinished ? (
          <>
            <Text style={[styles.kickoffTimeSmall, { color: colors.textMuted }]}>{kickoffTime}</Text>
            <Text style={[styles.ftLabel, { color: colors.textMuted }]}>FT</Text>
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
            style={[styles.teamNameSmall, { color: colors.textPrimary }, (isFinished || isLive) && (fixture.homeScore ?? 0) > (fixture.awayScore ?? 0) && { fontWeight: '800' }]}
            numberOfLines={1}
          >
            {fixture.homeTeam}
          </Text>
          {(isFinished || isLive) && fixture.homeScore != null && (
            <Text style={[styles.scoreSmall, { color: isLive ? '#ef4444' : ((fixture.homeScore > (fixture.awayScore ?? 0)) ? colors.textPrimary : colors.textMuted), fontWeight: (fixture.homeScore > (fixture.awayScore ?? 0)) ? '800' : '500' }]}>
              {fixture.homeScore}
            </Text>
          )}
        </View>
        <View style={[styles.teamRow, { marginTop: 6 }]}>
          <TeamBadge name={fixture.awayTeam} imageUrl={getFixtureTeamLogoUrl(fixture.awayTeam)} size={18} />
          <Text
            style={[styles.teamNameSmall, { color: colors.textPrimary }, (isFinished || isLive) && (fixture.awayScore ?? 0) > (fixture.homeScore ?? 0) && { fontWeight: '800' }]}
            numberOfLines={1}
          >
            {fixture.awayTeam}
          </Text>
          {(isFinished || isLive) && fixture.awayScore != null && (
            <Text style={[styles.scoreSmall, { color: isLive ? '#ef4444' : ((fixture.awayScore > (fixture.homeScore ?? 0)) ? colors.textPrimary : colors.textMuted), fontWeight: (fixture.awayScore > (fixture.homeScore ?? 0)) ? '800' : '500' }]}>
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
    height: '75%',
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
  const insets = useSafeAreaInsets();

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

  const activeDates = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const f of rawFixtures) {
      s.add(adjustedDateKey(f.kickoffAt));
    }
    return s;
  }, [rawFixtures]);

  // ── Live polling ─────────────────────────────────────────────────────────────
  // Poll when any fixture IS live, OR when one should be live based on kickoff
  // time but hasn't been synced yet (bootstrap case: status still 'SCHEDULED').
  const shouldPollLive = useMemo(() => {
    const now = Date.now();
    return rawFixtures.some((f) => {
      if (f.status === 'LIVE') return true;
      if (f.status === 'FINISHED') return false;
      const ko = new Date(f.kickoffAt).getTime();
      // Match kicked off ≤130 min ago and isn't marked finished
      return ko <= now && now - ko <= 130 * 60 * 1000;
    });
  }, [rawFixtures]);

  useEffect(() => {
    if (!shouldPollLive) return;
    const tick = async () => {
      try {
        await apiClient.post('/sync/fixtures/recent', null, { timeout: 20_000 });
      } catch { /* non-fatal */ }
      upcomingQuery.refetch();
      recentQuery.refetch();
    };
    tick(); // immediate first sync when we detect a match should be live
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [shouldPollLive]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSearching = search.trim().length > 0;

  const filtered = useMemo(() => {
    let list = rawFixtures;
    if (!isSearching) {
      const key = toLocalDateKey(selectedDate);
      list = list.filter((f) => adjustedDateKey(f.kickoffAt) === key);
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

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await apiClient.post('/sync/fixtures/recent', null, { timeout: 25000 });
    } catch { /* non-fatal — still refetch local data */ }
    await Promise.all([upcomingQuery.refetch(), recentQuery.refetch()]);
    setIsRefreshing(false);
  }, [upcomingQuery, recentQuery]);

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
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
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
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
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
        activeDates={activeDates}
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
  elapsedText: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 1 },
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

  dragArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  closeBtn: { padding: 4 },

  // Fixture hero header
  heroControls: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 2, width: '100%' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 12, gap: 8, width: '100%' },
  heroTeamCol: { flex: 1, alignItems: 'center', gap: 6 },
  heroLogo: { width: 64, height: 64 },
  heroTeamName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  heroCenterCol: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingTop: 8 },
  heroDate: { fontSize: 16, fontWeight: '800', textAlign: 'center', letterSpacing: 0.3 },
  heroTime: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 3 },
  competitionStrip: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' },
  competitionStripText: { fontSize: 12, fontWeight: '600' },
  competitionLogo: { width: 16, height: 16 },
  heroStatusLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  heroScore: { fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  tab: {
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 0,
    alignItems: 'center',
  },
  tabText: { fontSize: 14, letterSpacing: 0.1 },
  underline: {
    marginTop: 10,
    height: 2.5,
    width: '100%',
    minWidth: 24,
    borderRadius: 1.5,
  },
  tabActive: {},
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

  formRow: { flexDirection: 'row', gap: 3 },
  formPill: {
    width: 22, height: 22, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  formPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },

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

const insightSubStyles = StyleSheet.create({
  bar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: {},
  tabText: { fontSize: 13, fontWeight: '700' },
});

const overviewStyles = StyleSheet.create({
  faceoffTeam:  { fontSize: 12, fontWeight: '700' },
  faceoffVenue: { fontSize: 10, marginTop: 1, marginBottom: 4 },
  faceoffSub:   { fontSize: 11, marginTop: 4 },
  metricRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  metricVal:    { width: 50, fontSize: 13, fontWeight: '700' },
  metricLabel:  { flex: 1, fontSize: 11, textAlign: 'center' },
  h2hCount:     { fontSize: 20, fontWeight: '900', minWidth: 22, textAlign: 'center' },
  scorerRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth },
  scorerName:   { flex: 1, fontSize: 12, fontWeight: '600' },
  scorerBadge:  { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  scorerStat:   { fontSize: 11, fontWeight: '700' },
  injuryRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3 },
  injuryName:   { flex: 1, fontSize: 12, fontWeight: '500' },
});