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
}

// Zone config — adjust thresholds to match competition rules
interface ZoneConfig {
  positions: [number, number];
  color: string;
  label: string;
  icon: string;
}
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

function TableContent({
  competition,
  season = '2025-26',
  highlightTeams = [],
  onClose,
  embedded = false,
}: Omit<Props, 'visible'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sortKey, setSortKey] = React.useState<SortKey>('default');
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

  function renderRow({ item }: { item: TeamStatData & { displayPos: number } }) {
    const highlight = isHighlighted(item.team, highlightTeams);
    const zone = sortKey === 'default' ? getZone(item.displayPos, total, DEFAULT_ZONES) : null;

    const gf  = sortKey === 'home' ? item.homeGoalsFor     : sortKey === 'away' ? item.awayGoalsFor     : item.goalsFor;
    const ga  = sortKey === 'home' ? item.homeGoalsAgainst : sortKey === 'away' ? item.awayGoalsAgainst : item.goalsAgainst;
    const w   = sortKey === 'home' ? item.homeWon          : sortKey === 'away' ? item.awayWon          : item.won;
    const d   = sortKey === 'home' ? item.homeDrawn        : sortKey === 'away' ? item.awayDrawn        : item.drawn;
    const l   = sortKey === 'home' ? item.homeLost         : sortKey === 'away' ? item.awayLost         : item.lost;
    const pts = sortKey === 'home' ? w * 3 + d             : sortKey === 'away' ? w * 3 + d             : item.points;
    const p   = sortKey === 'home' ? w + d + l             : sortKey === 'away' ? w + d + l             : item.played;

    const zoneColor = zone?.color;
    const rowBg     = highlight ? `${colors.primary}22` : undefined;

    return (
      <View style={[s.row, { borderBottomColor: colors.border }, rowBg ? { backgroundColor: rowBg } : undefined]}>
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
      </View>
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
    <View style={[s.container, { backgroundColor: colors.background, paddingBottom: embedded ? 0 : insets.bottom }]}>
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
      </View>

      <View style={[s.colHeader, { borderBottomColor: colors.border, backgroundColor: `${colors.primary}08` }]}>
        <View style={s.zoneStrip} />
        <Text style={[s.pos, { color: colors.textMuted }]}>#</Text>
        <Text style={[s.teamName, { color: colors.textMuted }]}>Equipa</Text>
        <Text style={[s.cell, { color: colors.textMuted }]}>J</Text>
        <Text style={[s.cell, { color: '#22c55e', fontWeight: '700' }]}>V</Text>
        <Text style={[s.cell, { color: colors.textMuted }]}>E</Text>
        <Text style={[s.cell, { color: '#ef4444', fontWeight: '700' }]}>D</Text>
        <Text style={[s.cell, { color: colors.textMuted }]}>GM</Text>
        <Text style={[s.cell, { color: colors.textMuted }]}>GS</Text>
        <Text style={[s.pts, { color: colors.textMuted }]}>Pts</Text>
      </View>

      <View style={[s.abbrevBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.abbrevScroll}>
          {[{ k: 'J', v: 'Jogos' }, { k: 'V', v: 'Vitórias' }, { k: 'E', v: 'Empates' }, { k: 'D', v: 'Derrotas' }, { k: 'GM', v: 'Golos marcados' }, { k: 'GS', v: 'Golos sofridos' }, { k: 'Pts', v: 'Pontos' }].map(({ k, v }) => (
            <View key={k} style={s.abbrevItem}>
              <Text style={[s.abbrevKey, { color: colors.primary }]}>{k}</Text>
              <Text style={[s.abbrevVal, { color: colors.textMuted }]}>{v}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {tableQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={[s.empty, { color: colors.textMuted }]}>Sem dados disponíveis</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={listFooter}
        />
      )}
    </View>
  );
}
// ─── Public component ─────────────────────────────────────────────────────────

export function LeagueTableModal({ visible, embedded = false, ...rest }: Props) {
  // Embedded mode: render inline, no Modal wrapper, always "visible"
  if (embedded) {
    return <TableContent embedded {...rest} />;
  }

  // Normal modal mode: unchanged behaviour
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={rest.onClose}
    >
      <TableContent {...rest} />
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