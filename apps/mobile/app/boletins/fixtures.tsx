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
import { useUpcomingFixtures, useRecentFixtures } from '../../services/referenceService';
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

function resolveCountry(country: string): string {
  return COUNTRY_EN_TO_PT[country] ?? country;
}

// ─── Team name mapping ────────────────────────────────────────────────────────

const FIXTURE_TEAM_ALIASES: Record<string, string> = {
  'Sporting Clube de Braga': 'SC Braga',
  'Sport Lisboa e Benfica': 'SL Benfica',
  'Futebol Clube do Porto': 'FC Porto',
  'Sporting Clube de Portugal': 'Sporting CP',
  'GD Estoril Praia': 'Estoril Praia',
  'Grupo Desportivo Estoril Praia': 'Estoril Praia',
  'Rio Ave FC': 'Rio Ave FC',
  'Gil Vicente FC': 'Gil Vicente FC',
  'Casa Pia AC': 'Casa Pia AC',
  'CD Tondela': 'CD Tondela',
  'FC Famalicão': 'FC Famalicão',
  'SC Farense': 'SC Farense',
  'Portimonense SC': 'Portimonense SC',
  'FC Paços de Ferreira': 'FC Paços de Ferreira',
  'Vitória SC': 'Vitória SC',
  'Vitória Sport Clube': 'Vitória SC',
  'Vitória Guimarães': 'Vitória SC',
  'Moreirense FC': 'Moreirense FC',
  'CF Estrela da Amadora': 'CF Estrela Amadora',
  'CD Nacional': 'CD Nacional',
  'FC Arouca': 'FC Arouca',
  'Manchester United FC': 'Manchester United',
  'Manchester City FC': 'Manchester City',
  'Liverpool FC': 'Liverpool',
  'Arsenal FC': 'Arsenal',
  'Chelsea FC': 'Chelsea',
  'Tottenham Hotspur FC': 'Tottenham Hotspur',
  'Aston Villa FC': 'Aston Villa',
  'Newcastle United FC': 'Newcastle United',
  'West Ham United FC': 'West Ham United',
  'Brighton & Hove Albion FC': 'Brighton & Hove Albion',
  'Wolverhampton Wanderers FC': 'Wolverhampton Wanderers',
  'Crystal Palace FC': 'Crystal Palace',
  'Everton FC': 'Everton',
  'Fulham FC': 'Fulham',
  'Brentford FC': 'Brentford',
  'Nottingham Forest FC': 'Nottingham Forest',
  'AFC Bournemouth': 'AFC Bournemouth',
  'Leicester City FC': 'Leicester City',
  'Leeds United FC': 'Leeds United',
  'Burnley FC': 'Burnley',
  'Southampton FC': 'Southampton',
  'Sunderland AFC': 'Sunderland',
  'Ipswich Town FC': 'Ipswich Town',
  'Sheffield United FC': 'Sheffield United',
  'Real Madrid CF': 'Real Madrid',
  'FC Barcelona': 'FC Barcelona',
  'Club Atlético de Madrid': 'Atlético Madrid',
  'Atlético de Madrid': 'Atlético Madrid',
  'Sevilla FC': 'Sevilla FC',
  'Real Betis Balompié': 'Real Betis',
  'Real Betis': 'Real Betis',
  'Villarreal CF': 'Villarreal CF',
  'Athletic Club': 'Athletic Bilbao',
  'Real Sociedad': 'Real Sociedad',
  'Real Sociedad B': 'Real Sociedad B',
  'RC Celta de Vigo': 'Celta de Vigo',
  'Celta Vigo': 'Celta de Vigo',
  'Getafe CF': 'Getafe CF',
  'Girona FC': 'Girona FC',
  'RCD Mallorca': 'RCD Mallorca',
  'Rayo Vallecano de Madrid': 'Rayo Vallecano',
  'Deportivo Alavés': 'Deportivo Alavés',
  'Valencia CF': 'Valencia CF',
  'CA Osasuna': 'CA Osasuna',
  'UD Las Palmas': 'UD Las Palmas',
  'CD Leganés': 'Leganés',
  'Leganés': 'Leganés',
  'Real Valladolid CF': 'Real Valladolid',
  'Real Valladolid': 'Real Valladolid',
  'Real Zaragoza': 'Real Zaragoza',
  'CD Castellón': 'CD Castellón',
  'SD Eibar': 'Eibar',
  'SD Huesca': 'Huesca',
  'Málaga CF': 'Malaga',
  'Elche CF': 'Elche CF',
  'CD Mirandés': 'Mirandés',
  'Cultural Leonesa': 'Cultural Leonesa',
  'Cádiz CF': 'Cadiz',
  'UD Almería': 'Almeria',
  'RCD Espanyol de Barcelona': 'RCD Espanyol',
  'Deportivo La Coruña': 'Deportivo de La Coruña',
  'Córdoba CF': 'Cordoba',
  'Racing de Santander': 'Racing de Santander',
  'AD Ceuta FC': 'AD Ceuta FC',
  'FC Internazionale Milano': 'Inter Milan',
  'FC Internazionale': 'Inter Milan',
  'Inter Milano': 'Inter Milan',
  'AC Milan': 'AC Milan',
  'Juventus FC': 'Juventus',
  'SSC Napoli': 'SSC Napoli',
  'AS Roma': 'AS Roma',
  'SS Lazio': 'SS Lazio',
  'Atalanta BC': 'Atalanta BC',
  'ACF Fiorentina': 'ACF Fiorentina',
  'Bologna FC 1909': 'Bologna FC',
  'Torino FC': 'Torino FC',
  'Udinese Calcio': 'Udinese Calcio',
  'Genoa CFC': 'Genoa CFC',
  'Cagliari Calcio': 'Cagliari',
  'Hellas Verona FC': 'Hellas Verona',
  'US Sassuolo Calcio': 'Sassuolo',
  'Parma Calcio 1913': 'Parma Calcio',
  'AC Monza': 'AC Monza',
  'Como 1907': 'Como 1907',
  'Venezia FC': 'Venezia FC',
  'Spezia Calcio': 'Spezia',
  'Frosinone Calcio': 'Frosinone Calcio',
  'US Salernitana 1919': 'US Salernitana',
  'Stade Brestois 29': 'Stade Brestois',
  'FC Bayern München': 'Bayern München',
  'Bayern Munich': 'Bayern München',
  'Borussia Dortmund': 'Borussia Dortmund',
  'RB Leipzig': 'RB Leipzig',
  'Bayer 04 Leverkusen': 'Bayer Leverkusen',
  'VfB Stuttgart': 'VfB Stuttgart',
  'Eintracht Frankfurt': 'Eintracht Frankfurt',
  'VfL Wolfsburg': 'VfL Wolfsburg',
  'SC Freiburg': 'SC Freiburg',
  'TSG 1899 Hoffenheim': 'TSG Hoffenheim',
  '1. FC Union Berlin': '1. FC Union Berlin',
  'Borussia Mönchengladbach': 'Borussia Mönchengladbach',
  'SV Werder Bremen': 'Werder Bremen',
  'FC Augsburg': 'FC Augsburg',
  '1. FSV Mainz 05': '1. FSV Mainz 05',
  '1. FC Heidenheim 1846': '1. FC Heidenheim',
  'FC Köln': 'FC Köln',
  'Hamburger SV': 'Hamburger SV',
  'FC St. Pauli 1910': 'FC St. Pauli',
  'FC St. Pauli': 'FC St. Pauli',
  'VfL Bochum 1848': 'VfL Bochum',
  'VfL Bochum': 'VfL Bochum',
  'Fortuna Düsseldorf': 'Fortuna Düsseldorf',
  'Hannover 96': 'Hannover 96',
  'FC Schalke 04': 'FC Schalke 04',
  'Hertha BSC': 'Hertha BSC',
  'SV Darmstadt 98': 'SV Darmstadt 98',
  'Holstein Kiel': 'Holstein Kiel',
  'Karlsruher SC': 'Karlsruher SC',
  'SC Paderborn 07': 'SC Paderborn',
  'SpVgg Greuther Fürth': 'SpVgg Greuther Furth',
  '1. FC Nürnberg': '1. FC Nurnberg',
  'SV 07 Elversberg': 'SV Elversberg',
  'Eintracht Braunschweig': 'Eintracht Braunschweig',
  'Preußen Münster': 'Preußen Münster',
  '1. FC Magdeburg': 'Magdeburg',
  'Arminia Bielefeld': 'Bielefeld',
  'Dynamo Dresden': 'Dynamo Dresden',
  '1. FC Kaiserslautern': '1. FC Kaiserslautern',
  'Paris Saint-Germain FC': 'Paris Saint-Germain',
  'Olympique de Marseille': 'Olympique de Marseille',
  'AS Monaco FC': 'AS Monaco',
  'LOSC Lille': 'LOSC Lille',
  'Olympique Lyonnais': 'Olympique Lyonnais',
  'OGC Nice': 'OGC Nice',
  'RC Lens': 'RC Lens',
  'Stade Rennais FC': 'Stade Rennais',
  'Stade Rennais FC 1901': 'Stade Rennais',
  'Stade Brestois': 'Stade Brestois',
  'Toulouse FC': 'Toulouse FC',
  'FC Nantes': 'Nantes',
  'RC Strasbourg Alsace': 'RC Strasbourg',
  'FC Lorient': 'FC Lorient',
  'Paris FC': 'Paris FC',
  'FC Metz': 'FC Metz',
  'Le Havre AC': 'Le Havre AC',
  'AJ Auxerre': 'AJ Auxerre',
  'Angers SCO': 'Angers SCO',
  'Racing Club de Lens': 'RC Lens',
  'SBV Excelsior': 'Excelsior',
  'Lille OSC': 'LOSC Lille',
  'AFC Ajax': 'Ajax',
  'PSV': 'PSV Eindhoven',
  'Feyenoord Rotterdam': 'Feyenoord',
  'AZ Alkmaar': 'AZ Alkmaar',
  'AZ': 'AZ Alkmaar',
  'Real Sociedad de Fútbol': 'Real Sociedad',
  'US Cremonese': 'Cremonese',
  'FC Twente': 'FC Twente',
  "FC Twente '65": 'FC Twente',
  'FC Utrecht': 'FC Utrecht',
  'SC Heerenveen': 'SC Heerenveen',
  'Sparta Rotterdam': 'Sparta Rotterdam',
  'NEC Nijmegen': 'NEC Nijmegen',
  'Go Ahead Eagles': 'Go Ahead Eagles',
  'Fortuna Sittard': 'Fortuna Sittard',
  'PEC Zwolle': 'PEC Zwolle',
  'FC Volendam': 'FC Volendam',
  'Heracles Almelo': 'Heracles Almelo',
  'Almere City FC': 'Almere City',
  'RKC Waalwijk': 'RKC Waalwijk',
  'Club Brugge KV': 'Club Brugge',
  'RSC Anderlecht': 'RSC Anderlecht',
  'KRC Genk': 'KRC Genk',
  'KAA Gent': 'KAA Gent',
  'Royal Antwerp FC': 'Royal Antwerp FC',
  'Standard de Liège': 'Standard Liège',
  'Cercle Brugge KSV': 'Cercle Brugge',
  'Royale Union SG': 'Royale Union SG',
  'Galatasaray SK': 'Galatasaray',
  'Fenerbahçe SK': 'Fenerbahçe',
  'Beşiktaş JK': 'Beşiktaş',
  'Trabzonspor AŞ': 'Trabzonspor',
  'İstanbul Başakşehir FK': 'İstanbul Başakşehir',
  'İstanbul Başakşehir': 'İstanbul Başakşehir',
  'Kasımpaşa SK': 'Kasimpasa',
  'Kayserispor AŞ': 'Kayserispor',
  'Sivasspor': 'Sivasspor',
  'Samsunspor': 'Samsunspor',
  'Alanyaspor': 'Alanyaspor',
  'Antalyaspor': 'Antalyaspor',
  'Konyaspor': 'Konyaspor',
  'Çaykur Rizespor': 'Caykur Rizespor',
  'Gaziantep FK': 'Gaziantep FK',
  'Fatih Karagümrük': 'Fatih Karagümrük',
  'Gençlerbirliği': 'Gençlerbirliği',
  'Kocaelispor': 'Kocaelispor',
  'Eyüpspor': 'Eyüpspor',
  'Göztepe': 'Göztepe',
  'Celtic FC': 'Celtic',
  'Rangers FC': 'Rangers',
  'Aberdeen FC': 'Aberdeen',
  'Hibernian FC': 'Hibernian',
  'Heart of Midlothian FC': 'Heart of Midlothian',
  'Falkirk FC': 'Falkirk',
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

// ─── Add-to-boletim sheet (mirrors boletim create screen) ─────────────────────

// Replace the AddSheet function (everything from `function AddSheet` to the closing brace before `// ─── Fixture card`)

function AddSheet({ fixture, onClose, onAdded }: AddSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Store
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

  // Selection form state
  const [useCustom, setUseCustom]               = useState(false);
  const [market, setMarket]                     = useState('');
  const [useCustomMarket, setUseCustomMarket]   = useState(false);
  const [selection, setSelection]               = useState('');
  const [odds, setOdds]                         = useState('');
  const [isSaving, setIsSaving]                 = useState(false);
  const [showSites, setShowSites]               = useState(false);
  const [showMarkets, setShowMarkets]           = useState(false);

  // Markets query — same as create screen
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
      (a, b) =>
        (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) -
        (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)),
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

  // Auto-fill selection when market is self-describing
  useEffect(() => {
    if (!useCustomMarket && isSelfDescribing(market) && fixture) {
      setSelection(humanizeMarket(market, fixture.homeTeam, fixture.awayTeam));
    } else if (!useCustomMarket) {
      setSelection('');
    }
  }, [market, useCustomMarket, fixture]);

  // Gesture-based drag to dismiss (react-native-reanimated + gesture-handler)
  const translateY = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  function dismiss() {
    onClose();
  }

  const dragGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withTiming(800, { duration: 200 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  useEffect(() => {
    if (fixture) {
      translateY.value = 0;
    }
  }, [fixture]);

  function resetSelectionForm() {
    setMarket('');
    setUseCustomMarket(false);
    setSelection('');
    setOdds('');
  }

  const parsedOdds = parseFloat(odds.replace(',', '.'));
  const effectiveSelection = selection.trim();
  const effectiveMarket = useCustomMarket ? market.trim() : market.trim();
  const canAddSelection =
    !!fixture && !!effectiveMarket && !!effectiveSelection && parsedOdds >= 1.01;

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
      id: `${fixture.id}-${effectiveMarket}-${effectiveSelection}-${Date.now()}`,
      homeTeam: fixture.homeTeam,
      homeTeamImageUrl: getFixtureTeamLogoUrl(fixture.homeTeam),
      awayTeam: fixture.awayTeam,
      awayTeamImageUrl: getFixtureTeamLogoUrl(fixture.awayTeam),
      competition: fixture.competition,
      sport: Sport.FOOTBALL,
      market: humanizeMarket(effectiveMarket, fixture.homeTeam, fixture.awayTeam),
      selection: effectiveSelection,
      oddValue: parsedOdds,
      eventDate: fixture.kickoffAt,
    } as BoletinBuilderItem);
    hapticSuccess();
    resetSelectionForm();
    showToast('Seleção adicionada.', 'success');
  };

  const handleSave = async () => {
    if (storeItems.length === 0) {
      showToast('Adiciona pelo menos uma seleção.', 'error');
      return;
    }
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
    } catch {
      showToast('Não foi possível guardar o boletim.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!fixture) return null;

  const kickoffTime = formatKickoff(fixture.kickoffAt, fixture.country);

  return (
    <Modal visible={!!fixture} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={bsStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <Animated.View
            style={[
              bsStyles.sheet,
              { backgroundColor: colors.background },
              animatedStyle,
            ]}
          >
            {/* ── Drag handle ── */}
            <GestureDetector gesture={dragGesture}>
              <View style={bsStyles.dragArea}>
                <View style={[bsStyles.handle, { backgroundColor: colors.border }]} />
                <View style={bsStyles.headerRow}>
                  <Pressable hitSlop={12} onPress={onClose} style={bsStyles.closeBtn}>
                    <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
                  </Pressable>
                  <Text style={[bsStyles.headerTitle, { color: colors.textPrimary }]}>
                    Novo boletim
                  </Text>
                  <View style={{ width: 34 }} />
                </View>
              </View>
            </GestureDetector>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                bsStyles.scrollContent,
                { paddingBottom: insets.bottom + 90 },
              ]}
            >
              {/* ══ 1. SELEÇÃO ══════════════════════════════════════════════ */}
              <Text style={[bsStyles.sectionDivider, { color: colors.textSecondary }]}>
                1. SELEÇÃO
              </Text>

              <View style={[bsStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Text style={[bsStyles.cardTitle, { color: colors.textPrimary }]}>
                  Adicionar seleção
                </Text>

                {/* Fixture row */}
                <View style={[bsStyles.fixturePreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={bsStyles.fixturePreviewInner}>
                    <TeamBadge name={fixture.homeTeam} imageUrl={getFixtureTeamLogoUrl(fixture.homeTeam)} size={22} />
                    <Text style={[bsStyles.fixturePreviewText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {fixture.homeTeam}
                    </Text>
                    <Text style={[bsStyles.fixturePreviewVs, { color: colors.textMuted }]}>vs</Text>
                    <Text style={[bsStyles.fixturePreviewText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {fixture.awayTeam}
                    </Text>
                    <TeamBadge name={fixture.awayTeam} imageUrl={getFixtureTeamLogoUrl(fixture.awayTeam)} size={22} />
                  </View>
                  <View style={bsStyles.fixturePreviewMeta}>
                    <CountryFlag country={fixture.country} size={10} />
                    <Text style={[bsStyles.fixturePreviewComp, { color: colors.textMuted }]}>
                      {fixture.competition}
                    </Text>
                    <Text style={[bsStyles.fixturePreviewTime, { color: colors.primary }]}>
                      {kickoffTime}
                    </Text>
                  </View>
                </View>

                {/* ── Market picker — same as create screen ── */}
                {useCustomMarket ? (
                  <Input
                    label="Mercado personalizado"
                    placeholder="Ex: Resultado ao Intervalo..."
                    value={market}
                    onChangeText={setMarket}
                  />
                ) : (
                  <PressableScale
                    onPress={() => setShowMarkets(true)}
                    style={[
                      bsStyles.fieldBtn,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[bsStyles.fieldLabel, { color: colors.textSecondary }]}>
                        MERCADO
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 15,
                          fontWeight: '600',
                          color: market ? colors.textPrimary : colors.textMuted,
                        }}
                      >
                        {market
                          ? humanizeMarket(market, fixture.homeTeam, fixture.awayTeam)
                          : 'Selecionar mercado'}
                      </Text>
                    </View>
                    {market ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => { setMarket(''); setSelection(''); }}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </Pressable>
                    ) : (
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    )}
                  </PressableScale>
                )}

                <Pressable
                  onPress={() => { setUseCustomMarket((v) => !v); setMarket(''); setSelection(''); }}
                  style={bsStyles.customToggle}
                >
                  <Ionicons
                    name={useCustomMarket ? 'list-outline' : 'create-outline'}
                    size={13}
                    color={colors.primary}
                  />
                  <Text style={[bsStyles.customToggleText, { color: colors.primary }]}>
                    {useCustomMarket
                      ? 'Escolher da lista de mercados'
                      : 'Escrever mercado personalizado'}
                  </Text>
                </Pressable>

                {/* ── Selection — only shown when market is not self-describing ── */}
                {(useCustomMarket || !isSelfDescribing(market)) && (
                  <>
                    <Text style={[bsStyles.fieldLabel, { color: colors.textSecondary, marginTop: 4 }]}>
                      SELEÇÃO
                    </Text>
                    {/* Quick-select chips */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[bsStyles.chips, { marginBottom: 6 }]}
                    >
                    {['Sim', 'Não', 'Acima de 0,5', 'Acima de 1,5', 'Acima de 2,5', 'Acima de 3,5',
                      'Abaixo de 1,5', 'Abaixo de 2,5', 'Abaixo de 3,5', '1', 'X', '2',
                      '1X', 'X2', '12'].map((q) => (
                        <PressableScale
                          key={q}
                          onPress={() => setSelection(q)}
                          style={[
                            bsStyles.chip,
                            {
                              backgroundColor: selection === q ? colors.primary : colors.background,
                              borderColor: selection === q ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text style={[bsStyles.chipText, { color: selection === q ? '#fff' : colors.textSecondary }]}>
                            {q}
                          </Text>
                        </PressableScale>
                      ))}
                    </ScrollView>
                    <View style={[bsStyles.textBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <TextInput
                        style={[bsStyles.textBoxInput, { color: colors.textPrimary }]}
                        placeholder="Ex: Over 2.5, Casa, Empate…"
                        placeholderTextColor={colors.textMuted}
                        value={selection}
                        onChangeText={setSelection}
                      />
                    </View>
                  </>
                )}

                {/* ── Odds — NumericInput with custom keyboard ── */}
                <Text style={[bsStyles.fieldLabel, { color: colors.textSecondary, marginTop: 8 }]}>
                  ODD
                </Text>
                <NumericInput
                  allowDecimal
                  maxLength={6}
                  placeholder="1.85"
                  value={odds}
                  onChangeText={setOdds}
                />

                {/* ── Add button ── */}
                <Pressable
                  onPress={handleAddSelection}
                  disabled={!canAddSelection}
                  style={[
                    bsStyles.addSelBtn,
                    {
                      borderColor: canAddSelection ? colors.primary : colors.border,
                      opacity: canAddSelection ? 1 : 0.45,
                    },
                  ]}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color={canAddSelection ? colors.primary : colors.textMuted}
                  />
                  <Text style={[bsStyles.addSelBtnText, { color: canAddSelection ? colors.primary : colors.textMuted }]}>
                    Adicionar ao boletim
                  </Text>
                </Pressable>
              </View>

              {/* ══ 2. APOSTA ═══════════════════════════════════════════════ */}
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
                <NumericInput
                  allowDecimal
                  maxLength={8}
                  placeholder="0,00"
                  suffix="€"
                  value={storeStake > 0 ? String(storeStake) : ''}
                  onChangeText={(v) => setStake(parseFloat(v.replace(',', '.')) || 0)}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {[5, 10, 20, 50].map((amt) => (
                    <Pressable
                      key={amt}
                      onPress={() => { hapticLight(); setStake(amt); }}
                      style={[bsStyles.quickStake, { backgroundColor: colors.background, borderColor: colors.border }]}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{amt},00 €</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* ══ 3. DETALHES ═════════════════════════════════════════════ */}
              <Text style={[bsStyles.sectionDivider, { color: colors.textSecondary }]}>3. DETALHES</Text>

              <View style={[bsStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, gap: 12 }]}>
                <View style={[bsStyles.textBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[bsStyles.textBoxInput, { color: colors.textPrimary }]}
                    placeholder={defaultName || 'Nome'}
                    placeholderTextColor={colors.textMuted}
                    value={storeName}
                    onChangeText={setName}
                  />
                </View>
                <View style={[bsStyles.textBox, { backgroundColor: colors.background, borderColor: colors.border, minHeight: 80 }]}>
                  <TextInput
                    style={[bsStyles.textBoxInput, { color: colors.textPrimary }]}
                    placeholder="Notas"
                    placeholderTextColor={colors.textMuted}
                    value={storeNotes}
                    onChangeText={setNotes}
                    multiline
                  />
                </View>
                <DatePickerField
                  label="Data da aposta"
                  maxDate={new Date()}
                  placeholder="DD/MM/AAAA (opcional)"
                  value={(() => {
                    if (!storeBetDate || storeBetDate.length < 10) return null;
                    const [dd, mm, yyyy] = storeBetDate.split('/');
                    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
                    return isNaN(d.getTime()) ? null : d;
                  })()}
                  onChange={(date) => {
                    const dd = String(date.getDate()).padStart(2, '0');
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    setBetDate(`${dd}/${mm}/${date.getFullYear()}`);
                  }}
                  onClear={() => setBetDate('')}
                />
                <PressableScale
                  onPress={() => setShowSites(true)}
                  style={[bsStyles.fieldBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
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

              {/* ══ SELECTIONS LIST ══════════════════════════════════════════ */}
              {storeItems.length > 0 && (
                <>
                  <Text style={[bsStyles.sectionTitle, { color: colors.textPrimary }]}>
                    Seleções ({storeItems.length})
                  </Text>
                  {storeItems.map((item) => (
                    <View key={item.id}>
                      <BoletinSelectionRow
                        item={{
                          homeTeam: item.homeTeam,
                          homeTeamImageUrl: item.homeTeamImageUrl,
                          awayTeam: item.awayTeam,
                          awayTeamImageUrl: item.awayTeamImageUrl,
                          competition: item.competition,
                          market: item.market,
                          oddValue: String(item.oddValue),
                          result: ItemResult.PENDING,
                          selection: item.selection,
                          sport: item.sport,
                        }}
                        onRemove={() => removeItem(item.id)}
                      />
                      <Pressable
                        onPress={() => {
                          const d = item.eventDate ? new Date(item.eventDate) : new Date();
                          setItemEventDate(item.id, d.toISOString());
                        }}
                        style={[bsStyles.kickoffBtn, {
                          borderColor: item.eventDate ? colors.primary : colors.border,
                          backgroundColor: item.eventDate ? `${colors.primary}12` : colors.surfaceRaised,
                        }]}
                      >
                        <Ionicons name="time-outline" size={13} color={item.eventDate ? colors.primary : colors.textMuted} />
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: item.eventDate ? colors.primary : colors.textMuted }}>
                          {item.eventDate
                            ? (() => {
                                const d = new Date(item.eventDate);
                                return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                              })()
                            : 'Definir hora do jogo'}
                        </Text>
                        {item.eventDate && (
                          <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setItemEventDate(item.id, null); }}>
                            <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                          </Pressable>
                        )}
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            {/* ── Save button ── */}
            <View style={[bsStyles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16, backgroundColor: colors.background }]}>
              <Pressable
                onPress={handleSave}
                disabled={isSaving || storeItems.length === 0}
                style={[
                  bsStyles.saveBtn,
                  {
                    backgroundColor: storeItems.length > 0 ? colors.primary : colors.surfaceRaised,
                    opacity: storeItems.length === 0 ? 0.5 : 1,
                  },
                ]}
              >
                {isSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="checkmark-circle-outline" size={20} color={storeItems.length > 0 ? '#fff' : colors.textMuted} />
                }
                <Text style={[bsStyles.saveBtnText, { color: storeItems.length > 0 ? '#fff' : colors.textMuted }]}>
                  Guardar boletim
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>

      {/* Market picker modal */}
      <SearchableDropdown
        visible={showMarkets}
        onClose={() => setShowMarkets(false)}
        title="Mercado"
        sections={marketSections}
        onSelect={(val) => { setMarket(val); }}
        isLoading={marketsQuery.isLoading}
        initialVisibleCount={8}
      />

      {/* Site picker modal */}
      <SearchableDropdown
        visible={showSites}
        onClose={() => setShowSites(false)}
        title="Site de apostas"
        items={BETTING_SITES.map((s) => ({ label: s.name, value: s.slug }))}
        onSelect={(val) => setSiteSlug(val)}
      />
    </Modal>
  );
}

// ─── Fixture card ─────────────────────────────────────────────────────────────

const FixtureCard = React.memo(function FixtureCard({
  fixture,
  onPress,
  isLast,
  showDate,
}: {
  fixture: Fixture;
  onPress: (fixture: Fixture) => void;
  isLast: boolean;
  showDate: boolean;
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

      {!isFinished && (
        <View style={styles.cardRight}>
          <View style={[styles.addHint, { backgroundColor: `${colors.primary}14` }]}>
            <Ionicons name="add" size={14} color={colors.primary} />
          </View>
        </View>
      )}
    </PressableScale>
  );
});

// ─── Competition section header ───────────────────────────────────────────────

function CompetitionHeader({ section, isExpanded, onToggle }: { section: Section; isExpanded: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.competitionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <CompetitionBadge name={section.competition} country={section.country} size={28} />
      <View style={styles.competitionTextWrap}>
        <Text style={[styles.competitionName, { color: colors.textPrimary }]} numberOfLines={1}>{section.competition}</Text>
        <View style={styles.competitionCountryRow}>
          <CountryFlag country={section.country} size={11} />
          <Text style={[styles.competitionCountry, { color: colors.textSecondary }]}>{section.country}</Text>
        </View>
      </View>
      <View style={[styles.competitionCountBadge, { backgroundColor: colors.surfaceRaised }]}>
        <Text style={[styles.competitionCountText, { color: colors.textSecondary }]}>{section.data.length}/{section.totalCount}</Text>
      </View>
      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FixturesScreen() {
  const { colors } = useTheme();

  const [search, setSearch] = useState('');
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => stripTime(new Date()));
  const slideAnim = useRef(new RNAnimated.Value(0)).current;
  const SCREEN_WIDTH = Dimensions.get('window').width;

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

  const upcomingQuery = useUpcomingFixtures(5475);
  const recentQuery = useRecentFixtures(2);
  const isLoading = upcomingQuery.isLoading || recentQuery.isLoading;

  const rawFixtures = useMemo<Fixture[]>(() => {
    const all = [...(upcomingQuery.data ?? []), ...(recentQuery.data ?? [])];
    const seen = new Set<string>();
    return all.filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });
  }, [upcomingQuery.data, recentQuery.data]);

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
    return list;
  }, [rawFixtures, search, selectedDate, isSearching]);

  const allSections = useMemo(() => groupByCompetition(filtered), [filtered]);
  const sections = useMemo(
    () => allSections.map((s) => collapsedSections.has(s.competition) ? { ...s, data: [] as Fixture[] } : s),
    [allSections, collapsedSections],
  );

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
      <FixtureCard fixture={item} onPress={setSelectedFixture} isLast={index === section.data.length - 1} showDate={isSearching} />
    ),
    [isSearching],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <CompetitionHeader section={section} isExpanded={!collapsedSections.has(section.competition)} onToggle={() => handleToggleSection(section.competition)} />
    ),
    [collapsedSections, handleToggleSection],
  );

  const keyExtractor = useCallback((item: Fixture) => item.id, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Jogos', headerLargeTitle: false }} />
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
  cardRight: { alignItems: 'center', justifyContent: 'center' },
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