import { PrismaClient, Sport } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Competitions & Teams ─────────────────────────────────────────────────────
// Top 3-4 divisions of major leagues available on Portuguese betting sites

interface CompetitionSeed {
  name: string;
  country: string;
  sport: Sport;
  tier: number;
  teams: string[];
}

const FOOTBALL_COMPETITIONS: CompetitionSeed[] = [
  // ── Portugal ──
  {
    name: 'Liga Portugal Betclic',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'SL Benfica', 'Sporting CP', 'FC Porto', 'SC Braga', 'Vitória SC',
      'Gil Vicente FC', 'Moreirense FC', 'Rio Ave FC', 'CD Santa Clara',
      'Estoril Praia', 'CF Estrela Amadora', 'Casa Pia AC', 'FC Arouca',
      'CD Nacional', 'AVS Futebol SAD', 'FC Famalicão', 'CD Tondela',
      'Alverca',
    ],
  },
  {
    name: 'Liga Portugal 2',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'SC Farense', 'Leixões SC', 'CD Mafra', 'Académico de Viseu FC',
      'UD Oliveirense', 'FC Penafiel', 'Portimonense SC', 'Boavista FC',
      'FC Paços de Ferreira', 'Académica de Coimbra', 'SL Benfica B',
      'FC Porto B', 'Sporting CP B', 'Marítimo', 'Vizela',
      'Feirense', 'Torreense', 'GD Chaves',
    ],
  },
  {
    name: 'Liga 3',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'SC Covilhã', 'Varzim SC', 'Académica de Coimbra', 'SC Braga B',
      'Sporting CP B', 'Fafe', '1º Dezembro', 'Amarante FC', 'CD Anadia',
      'Caldas SC', 'Lusitânia FC', 'Oliveira do Hospital', 'AD Sanjoanense',
      'CD Trofense', 'Länk Vilaverdense', 'Atlético CP', 'Lusitânia Lourosa',
      'São João de Ver', 'União de Santarém', 'CF Os Belenenses',
    ],
  },
  {
    name: 'Taça de Portugal',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Taça da Liga',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Supertaça de Portugal',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── England ──
  {
    name: 'Premier League',
    country: 'Inglaterra',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Arsenal', 'Aston Villa', 'AFC Bournemouth', 'Brentford', 'Brighton & Hove Albion',
      'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Leeds United',
      'Burnley', 'Liverpool', 'Manchester City', 'Manchester United',
      'Newcastle United', 'Nottingham Forest', 'Sunderland', 'Tottenham Hotspur',
      'West Ham United', 'Wolverhampton Wanderers',
    ],
  },
  {
    name: 'Championship',
    country: 'Inglaterra',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Ipswich Town', 'Leicester City', 'Sheffield United', 'Southampton', 'Norwich City',
      'West Bromwich Albion', 'Middlesbrough', 'Coventry City', 'Bristol City',
      'Watford', 'Millwall', 'Stoke City', 'Swansea City', 'Queens Park Rangers',
      'Hull City', 'Blackburn Rovers', 'Cardiff City', 'Preston North End',
      'Plymouth Argyle', 'Sheffield Wednesday', 'Luton Town', 'Birmingham City',
      'Huddersfield Town', 'Rotherham United',
    ],
  },
  {
    name: 'League One',
    country: 'Inglaterra',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Derby County', 'Bolton Wanderers', 'Peterborough United', 'Oxford United',
      'Barnsley', 'Wigan Athletic', 'Charlton Athletic', 'Reading',
      'Leyton Orient', 'Stevenage', 'Portsmouth', 'Lincoln City',
    ],
  },
  {
    name: 'FA Cup',
    country: 'Inglaterra',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'EFL Cup (Carabao Cup)',
    country: 'Inglaterra',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── Spain ──
  {
    name: 'La Liga',
    country: 'Espanha',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Real Madrid', 'FC Barcelona', 'Atlético Madrid', 'Real Sociedad',
      'Real Betis', 'Villarreal CF', 'Athletic Bilbao', 'Girona FC',
      'Valencia CF', 'Sevilla FC', 'Celta de Vigo', 'CA Osasuna',
      'Getafe CF', 'RCD Mallorca', 'Rayo Vallecano', 'Deportivo Alavés',
      'RCD Espanyol', 'Levante UD', 'Elche CF', 'Real Oviedo',
    ],
  },
  {
    name: 'La Liga 2',
    country: 'Espanha',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Eibar', 'Real Valladolid', 'UD Las Palmas', 'Sporting de Gijón',
      'Racing de Santander', 'Huesca', 'Tenerife', 'Leganés',
      'Cartagena', 'Real Zaragoza', 'Burgos CF', 'Albacete', 'Mirandés',
      'Eldense', 'Amorebieta', 'Andorra CF',
    ],
  },
  {
    name: 'Copa del Rey',
    country: 'Espanha',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Supercopa de España',
    country: 'Espanha',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── Italy ──
  {
    name: 'Serie A',
    country: 'Itália',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Inter Milan', 'AC Milan', 'Juventus', 'SSC Napoli', 'AS Roma',
      'SS Lazio', 'Atalanta BC', 'ACF Fiorentina', 'Bologna FC', 'Torino FC',
      'Udinese Calcio', 'Genoa CFC', 'Lecce', 'Hellas Verona', 'Cagliari',
      'Parma Calcio', 'Como 1907', 'Sassuolo', 'Pisa SC', 'Cremonese',
    ],
  },
  {
    name: 'Serie B',
    country: 'Itália',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Venezia FC', 'Catanzaro', 'Palermo', 'Sampdoria', 'Bari',
      'Brescia', 'Spezia', 'Modena', 'Südtirol', 'Reggiana',
      'Cittadella', 'Cosenza', 'Ternana', 'Feralpisalò',
      'Frosinone Calcio', 'US Salernitana', 'AC Monza', 'Empoli FC',
    ],
  },
  {
    name: 'Coppa Italia',
    country: 'Itália',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── Germany ──
  {
    name: 'Bundesliga',
    country: 'Alemanha',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Bayern München', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen',
      'VfB Stuttgart', 'Eintracht Frankfurt', 'VfL Wolfsburg', 'SC Freiburg',
      'TSG Hoffenheim', '1. FC Union Berlin', 'Borussia Mönchengladbach',
      'Werder Bremen', 'FC Augsburg', '1. FSV Mainz 05', '1. FC Heidenheim',
      'FC Köln', 'Hamburger SV', 'FC St. Pauli',
    ],
  },
  {
    name: '2. Bundesliga',
    country: 'Alemanha',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'VfL Bochum', 'SV Darmstadt 98', 'Fortuna Düsseldorf', 'Hannover 96',
      'SC Paderborn', 'Holstein Kiel', 'Karlsruher SC', 'Hertha BSC',
      'SpVgg Greuther Fürth', '1. FC Nürnberg', '1. FC Kaiserslautern',
      'FC Schalke 04', 'Eintracht Braunschweig', 'SV Elversberg',
      'Wehen Wiesbaden', 'Hansa Rostock', 'VfL Osnabrück',
    ],
  },
  {
    name: 'DFB-Pokal',
    country: 'Alemanha',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── France ──
  {
    name: 'Ligue 1',
    country: 'França',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Paris Saint-Germain', 'Olympique de Marseille', 'AS Monaco', 'LOSC Lille',
      'Olympique Lyonnais', 'OGC Nice', 'RC Lens', 'Stade Rennais',
      'Stade Brestois', 'Toulouse FC', 'RC Strasbourg', 'Nantes',
      'Le Havre AC', 'FC Metz', 'FC Lorient', 'AJ Auxerre',
      'Angers SCO', 'Paris FC',
    ],
  },
  {
    name: 'Ligue 2',
    country: 'França',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'AS Saint-Étienne', 'Montpellier HSC', 'Stade de Reims',
      'SM Caen', 'Rodez', 'Amiens SC', 'SC Bastia', 'Bordeaux',
      'FC Guingamp', 'Grenoble Foot', 'Laval', 'Pau FC',
      'Quevilly-Rouen', 'Troyes', 'Valenciennes', 'Concarneau', 'Dunkerque',
    ],
  },
  {
    name: 'Coupe de France',
    country: 'França',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── Netherlands ──
  {
    name: 'Eredivisie',
    country: 'Holanda',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Ajax', 'PSV Eindhoven', 'Feyenoord', 'AZ Alkmaar', 'FC Twente',
      'FC Utrecht', 'Vitesse', 'SC Heerenveen', 'NEC Nijmegen',
      'Go Ahead Eagles', 'Fortuna Sittard', 'Sparta Rotterdam',
      'PEC Zwolle', 'Excelsior', 'RKC Waalwijk', 'Almere City',
      'FC Volendam', 'Heracles Almelo',
    ],
  },
  // ── Belgium ──
  {
    name: 'Jupiler Pro League',
    country: 'Bélgica',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Club Brugge', 'Royale Union SG', 'RSC Anderlecht', 'KRC Genk',
      'KAA Gent', 'Royal Antwerp FC', 'Standard Liège', 'Cercle Brugge',
      'OH Leuven', 'Sint-Truiden', 'Charleroi', 'Westerlo',
      'KV Mechelen', 'Eupen', 'RWDM', 'KV Kortrijk',
    ],
  },
  // ── Turkey ──
  {
    name: 'Süper Lig',
    country: 'Turquia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor',
      'İstanbul Başakşehir', 'Adana Demirspor', 'Antalyaspor', 'Konyaspor',
      'Kayserispor', 'Alanyaspor', 'Hatayspor', 'Çaykur Rizespor',
      'Gaziantep FK', 'Sivasspor', 'Kasımpaşa', 'MKE Ankaragücü',
      'Pendikspor', 'İstanbulspor', 'Samsunspor',
    ],
  },
  // ── Scotland ──
  {
    name: 'Scottish Premiership',
    country: 'Escócia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Celtic', 'Rangers', 'Aberdeen', 'Hibernian', 'Heart of Midlothian',
      'Dundee United', 'Dundee FC', 'Kilmarnock', 'Livingston',
      'Motherwell', 'St Mirren', 'Falkirk',
    ],
  },
  // ── Austria ──
  {
    name: 'Bundesliga (Áustria)',
    country: 'Áustria',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Red Bull Salzburg', 'SK Sturm Graz', 'SK Rapid Wien', 'LASK',
      'Austria Wien', 'Wolfsberger AC', 'TSV Hartberg', 'SCR Altach',
      'WSG Tirol', 'Austria Klagenfurt', 'Blau-Weiß Linz', 'Admira Wacker',
    ],
  },
  // ── Switzerland ──
  {
    name: 'Super League (Suíça)',
    country: 'Suíça',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'BSC Young Boys', 'FC Basel', 'FC Zürich', 'FC Lugano',
      'Servette FC', 'FC St. Gallen', 'FC Luzern', 'Grasshopper Club',
      'FC Winterthur', 'Yverdon-Sport',
    ],
  },
  // ── Greece ──
  {
    name: 'Super League (Grécia)',
    country: 'Grécia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Olympiacos', 'PAOK', 'AEK Athens', 'Panathinaikos',
      'Aris Thessaloniki', 'OFI Crete', 'Asteras Tripolis', 'Volos NFC',
      'Atromitos', 'PAS Giannina', 'Lamia', 'Panserraikos',
    ],
  },
  // ── Brazil ──
  {
    name: 'Brasileirão Série A',
    country: 'Brasil',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Flamengo', 'Palmeiras', 'Cruzeiro', 'Mirassol', 'Fluminense',
      'Botafogo', 'Bahia', 'São Paulo FC', 'Grêmio', 'Red Bull Bragantino',
      'Atlético Mineiro', 'Santos', 'Corinthians', 'Vasco da Gama', 'Vitória',
      'Internacional', 'Ceará', 'Fortaleza', 'Juventude', 'Sport Recife',
    ],
  },
  // ── Argentina ──
  {
    name: 'Liga Profesional (Argentina)',
    country: 'Argentina',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'River Plate', 'Boca Juniors', 'Racing Club', 'Independiente',
      'San Lorenzo', 'Vélez Sarsfield', 'Estudiantes', 'Lanús',
      'Talleres', 'Godoy Cruz', 'Defensa y Justicia', 'Argentinos Juniors',
      'Huracán', 'Instituto', 'Belgrano', 'Central Córdoba',
      'Newell\'s Old Boys', 'Rosario Central', 'Colón', 'Platense',
    ],
  },
  // ── USA ──
  {
    name: 'MLS',
    country: 'EUA',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Inter Miami CF', 'LAFC', 'LA Galaxy', 'Philadelphia Union',
      'FC Cincinnati', 'Columbus Crew', 'Nashville SC', 'New York Red Bulls',
      'Atlanta United', 'Seattle Sounders', 'Portland Timbers',
      'Austin FC', 'St. Louis City SC', 'Charlotte FC',
    ],
  },
  // ── International / European ──
  {
    name: 'UEFA Champions League',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'UEFA Europa League',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'UEFA Conference League',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'UEFA Nations League',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'UEFA Euro',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'FIFA World Cup',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Copa América',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Copa Libertadores',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Copa Sudamericana',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'UEFA Super Cup',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'FIFA Club World Cup',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── National Teams ──
  {
    name: 'Seleções - Amigáveis',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Qualificação Mundial',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Qualificação Euro',
    country: 'Internacional',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [],
  },
  // ── International (additional) ──
  { name: 'CONMEBOL Recopa', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'International Friendly Games', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Club Friendly Games', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'World Cup Qual. UEFA', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'World Cup Qual. CONMEBOL', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'World Cup Qual. CAF', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'World Cup Qual. CONCACAF', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'EURO, Qualification', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'U21 European Championship', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'UEFA Youth League', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: "UEFA Women's Champions League", country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'FIFA Intercontinental Cup', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Olympic Games', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'CONCACAF Gold Cup', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'CONCACAF Champions Cup', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Africa Cup of Nations', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'CAF Champions League', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'CAF Confederations Cup', country: 'Internacional', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Portugal (additional) ──
  {
    name: 'Campeonato de Portugal',
    country: 'Portugal',
    sport: Sport.FOOTBALL,
    tier: 4,
    teams: [
      'Académico de Viseu', 'FC Alverca', 'UD Oliveirense', 'SC Covilhã', 'CD Feirense',
      'Cova da Piedade', 'CD Nacional', 'CD Tondela', 'FC Penafiel', 'UD Leiria',
      'Varzim SC', 'SC Braga B', 'SL Benfica B', 'FC Porto B', 'Sporting CP B',
      'GD Bragança', 'CF Riba d\'Ave', 'Canelas 2010', 'Vilafranquense', 'Caldas SC',
      'Lusitânia de Lourosa', 'Lusitano de Évora', 'Marítimo B', 'CD Aves',
    ],
  },
  // ── England (additional) ──
  {
    name: 'League Two',
    country: 'Inglaterra',
    sport: Sport.FOOTBALL,
    tier: 4,
    teams: [
      'Stockport County', 'Wrexham', 'Notts County', 'Crawley Town',
      'Chesterfield FC', 'AFC Wimbledon', 'Bradford City', 'Crewe Alexandra',
      'Doncaster Rovers', 'Fleetwood Town', 'Grimsby Town', 'Harrogate Town',
      'MK Dons', 'Mansfield Town', 'Morecambe', 'Newport County',
      'Salford City', 'Swindon Town', 'Tranmere Rovers', 'Walsall',
      'Cheltenham Town', 'Port Vale', 'Barrow AFC', 'Gillingham FC',
    ],
  },
  {
    name: 'National League',
    country: 'Inglaterra',
    sport: Sport.FOOTBALL,
    tier: 5,
    teams: [
      'Altrincham', 'Barnet', 'Boreham Wood', 'Bromley', 'Dagenham & Redbridge',
      'Eastleigh', 'Ebbsfleet United', 'FC Halifax Town', 'Gateshead', 'Hartlepool United',
      'Maidenhead United', 'Oldham Athletic', 'Solihull Moors', 'Southend United',
      'Wealdstone', 'Woking', 'York City', 'Gloucester City', 'AFC Fylde',
      'Concord Rangers', 'Braintree Town', 'Welling United',
    ],
  },
  { name: 'Community Shield', country: 'Inglaterra', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Football League Trophy', country: 'Inglaterra', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: "Women's Super League", country: 'Inglaterra', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Scotland (additional) ──
  {
    name: 'Scottish Championship',
    country: 'Escócia',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Raith Rovers', 'Partick Thistle', 'Greenock Morton', 'Airdrieonians',
      'Dunfermline Athletic', 'Hamilton Academical', 'Inverness CT',
      'Queen of the South', 'Arbroath', "Queen's Park",
    ],
  },
  {
    name: 'Scottish League One',
    country: 'Escócia',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Montrose', 'Peterhead', 'Stirling Albion', 'Alloa Athletic', 'East Fife',
      'Dumbarton', 'Clyde', 'Kelty Hearts', 'Stenhousemuir', 'Cove Rangers',
    ],
  },
  {
    name: 'Scottish League Two',
    country: 'Escócia',
    sport: Sport.FOOTBALL,
    tier: 4,
    teams: [
      'Elgin City', 'Annan Athletic', 'Bonnyrigg Rose', 'Albion Rovers',
      'Forfar Athletic', 'Stranraer', 'Edinburgh City', 'Spartans FC',
      'Cowdenbeath', 'East Stirlingshire',
    ],
  },
  { name: 'Scottish Cup', country: 'Escócia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Scottish League Cup', country: 'Escócia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Spain (additional) ──
  {
    name: 'Primera Federación',
    country: 'Espanha',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Atlético de Madrid B', 'Villarreal B', 'Real Sociedad B', 'Real Betis Deportivo',
      'Athletic Club B', 'FC Barcelona B', 'Valencia B', 'Sevilla FC B',
      'Real Madrid Castilla', 'Deportivo de La Coruña', 'Córdoba CF', 'CD Castellón',
      'Intercity', 'Racing de Ferrol', 'SD Logroñés', 'Cultural Leonesa',
      'CD Numancia', 'Rayo Majadahonda', 'Getafe CF B', 'Celta B',
      'Pontevedra CF', 'CD Lugo', 'Barakaldo CF', 'SD Amorebieta',
      'CD Toledo', 'Talavera de la Reina', 'CD Badajoz', 'Linares Deportivo',
    ],
  },
  // ── Italy (additional) ──
  { name: 'Supercoppa Italiana', country: 'Itália', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Germany (additional) ──
  {
    name: '3. Liga',
    country: 'Alemanha',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Dynamo Dresden', 'FC Ingolstadt 04', 'TSV 1860 München', 'Preußen Münster',
      'FC Energie Cottbus', 'Rot-Weiss Essen', 'SV Wehen Wiesbaden', 'Waldhof Mannheim',
      'SC Verl', 'SV Sandhausen', 'Viktoria Köln', 'SpVgg Unterhaching',
      'SSV Ulm 1846', 'FC Erzgebirge Aue', 'Hallescher FC', 'Bayern Munich II',
      'SC Freiburg II', 'VfL Osnabrück', 'FC Arminia Bielefeld', 'FK Pirmasens',
    ],
  },
  // ── France (additional) ──
  {
    name: 'National 1',
    country: 'França',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Grenoble Foot 38', 'Chamois Niortais', 'FC Martigues', 'US Avranches',
      'Villefranche-Beaujolais', 'Châteauroux', 'SC Bastia', 'US Dunkerque',
      'Pau FC', 'Le Mans FC', 'US Orléans', 'Chambly Oise',
      'Bergerac Périgord FC', 'Stade Briochin', 'GFA Rumilly', 'FC Rouen', 'Rodez AF',
    ],
  },
  { name: 'Trophée des Champions', country: 'França', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Netherlands (additional) ──
  {
    name: 'Eerste Divisie',
    country: 'Holanda',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'FC Dordrecht', 'MVV Maastricht', 'TOP Oss', 'FC Eindhoven', 'FC Den Bosch',
      'Helmond Sport', 'Telstar', 'ADO Den Haag', 'Roda JC', 'Jong Ajax',
      'Jong PSV', 'Jong AZ', 'Jong FC Twente', 'Jong Utrecht', 'Jong Sparta Rotterdam',
      'De Graafschap', 'Almere City FC', 'FC Volendam',
    ],
  },
  { name: 'KNVB Cup', country: 'Holanda', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Johan Cruijff Schaal', country: 'Holanda', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Belgium (additional) ──
  {
    name: 'Challenger Pro League',
    country: 'Bélgica',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'RWDM Brussels FC', 'OH Leuven', 'Dender EH', 'Zulte Waregem',
      'Lommel SK', 'SK Beveren', 'Lierse Kempenzonen', 'RE Virton',
      'AFC Tubize Braine', 'Sporting Lokeren-Temse',
    ],
  },
  { name: 'Belgian Cup', country: 'Bélgica', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Belgian Super Cup', country: 'Bélgica', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Turkey (additional) ──
  {
    name: 'Trendyol 1.Lig',
    country: 'Turquia',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Samsunspor', 'Eyüpspor', 'Erzurumspor FK', 'Bodrumspor', 'Keçiörengücü',
      'Ankara Demirspor', 'Altay', 'Altınordu', 'Ümraniyespor', 'Adanaspor',
      'Manisa FK', 'Şanlıurfaspor', 'Sakaryaspor', 'Tuzlaspor', 'Gençlerbirliği',
      'Boluspor', 'Çorum FK', 'Bandırmaspor', 'Kocaelispor',
    ],
  },
  { name: 'Türkiye Kupası', country: 'Turquia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'TFF Süper Kupa', country: 'Turquia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Austria (additional) ──
  { name: 'ÖFB Cup', country: 'Áustria', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  {
    name: '2. Liga (Áustria)',
    country: 'Áustria',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'SV Lafnitz', 'FC Dornbirn', 'FC Juniors OÖ', 'First Vienna FC',
      'Wacker Innsbruck', 'SKU Amstetten', 'Floridsdorfer AC', 'Austria Lustenau',
      'SV Ried', 'SKN St. Pölten', 'FC Admira Wacker Mödling', 'SV Horn',
      'FC Liefering', 'FAC Wien',
    ],
  },
  // ── Switzerland (additional) ──
  {
    name: 'Challenge League',
    country: 'Suíça',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'FC Lausanne-Sport', 'US Schaffhausen', 'FC Thun', 'FC Wil 1900',
      'FC Vaduz', 'SC Kriens', 'FC Aarau', 'Grasshopper Club',
      'FC Sion', 'Neuchâtel Xamax', 'FC Stade Lausanne-Ouchy', 'AC-Bellinzona',
    ],
  },
  { name: 'Schweizer Cup', country: 'Suíça', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Greece (additional) ──
  {
    name: 'Super League 2',
    country: 'Grécia',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'PAS Giannina', 'Kalamata', 'Levadiakos', 'Rodos FC', 'Panachaiki',
      'Kallithea', 'Ionikos Nikaia', 'Xanthi FC', 'PAE Veria', 'Chania FC',
      'OFI Crete', 'AOK Kerkyra', 'Anagennisi Karditsa', 'Fokikos',
      'Thrasivoulos FC', 'Panetolikos',
    ],
  },
  { name: 'Greek Football Cup', country: 'Grécia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Russia ──
  {
    name: 'Russian Premier League',
    country: 'Rússia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Zenit', 'Spartak Moscow', 'CSKA Moscow', 'Lokomotiv Moscow', 'Dynamo Moscow',
      'FK Krasnodar', 'Rubin Kazan', 'Akhmat Grozny', 'FK Rostov',
      'Krylya Sovetov Samara', 'Torpedo Moscow', 'PFC Sochi',
      'Fakel Voronezh', 'Orenburg', 'Baltika Kaliningrad', 'Ural Yekaterinburg',
    ],
  },
  { name: 'Russian Cup', country: 'Rússia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Russian Supercup', country: 'Rússia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Ukraine ──
  {
    name: 'Ukrainian Premier League',
    country: 'Ucrânia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Shakhtar Donetsk', 'Dynamo Kyiv', 'Zorya Luhansk', 'Dnipro-1',
      'Oleksandriya', 'Vorskla Poltava', 'Metalist 1925', 'Chornomorets Odesa',
      'Kolos Kovalivka', 'Polissya Zhytomyr', 'LNZ Cherkasy',
      'Kryvbas Kryvyi Rih', 'Rukh Lviv', 'FC Minaj', 'Inhulets Petrove', 'Cherkaskyi Dnipro',
    ],
  },
  { name: 'Ukraine Cup', country: 'Ucrânia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Poland ──
  {
    name: 'Ekstraklasa',
    country: 'Polónia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Legia Warsaw', 'Lech Poznań', 'Jagiellonia Białystok', 'śląsk Wrocław',
      'Górnik Zabrze', 'Cracovia', 'Raków Częstochowa', 'Piast Gliwice',
      'Zagłębie Lubin', 'Pogoń Szczecin', 'Wisła Kraków', 'Widzew Łódź',
      'Ruch Chorzów', 'GKS Katowice', 'Zagłębie Sosnowiec', 'Korona Kielce',
      'Motor Lublin', 'Puszcza Niepołomice',
    ],
  },
  {
    name: 'Betclic 1. Liga',
    country: 'Polónia',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Wisła Kraków', 'GKS Tychy', 'GKS Katowice', 'Ruch Chorzów', 'ŁKS Łódź',
      'Stal Mielec', 'Zagłębie Sosnowiec', 'GKS Bełchatów', 'Arka Gdynia',
      'Miedź Legnica', 'Warta Poznań', 'GKS Jastrzębie', 'Puszcza Niepołomice',
      'Resovia Rzeszów', 'Stomil Olsztyn', 'Górnik Łęczna', 'Sandecja Nowy Sącz', 'Odra Opole',
    ],
  },
  { name: 'Puchar Polski', country: 'Polónia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Superpuchar Polski', country: 'Polónia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Romania ──
  {
    name: 'Romanian SuperLiga',
    country: 'Roménia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'FCSB', 'CFR Cluj', 'Rapid București', 'Universitatea Craiova',
      'Dinamo București', 'Poli Iași', 'Farul Constanța', 'Sepsi SC',
      'FC Voluntari', 'FC Botoșani', 'Petrolul Ploiești', 'UTA Arad',
      'Hermannstadt', 'Corvinul Hunedoara', 'FC Oțelul Galați', 'Gloria Buzău',
    ],
  },
  { name: 'Cupa României Betano', country: 'Roménia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Supercupa României', country: 'Roménia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Croatia ──
  {
    name: 'HNL',
    country: 'Croácia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Dinamo Zagreb', 'Hajduk Split', 'HNK Rijeka', 'NK Osijek',
      'NK Gorica', 'NK Lokomotiva Zagreb', 'NK Slaven Belupo',
      'NK Istra 1961', 'NK Varaždin', 'HNK Šibenik',
    ],
  },
  { name: 'Hrvatski nogometni kup', country: 'Croácia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Croatian Super Cup', country: 'Croácia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Serbia ──
  {
    name: 'Mozzart Bet Superliga',
    country: 'Sérvia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Red Star Belgrade', 'FK Partizan', 'FK Vojvodina', 'FK Čukaricki',
      'TSC Bačka Topola', 'FK Radnički Niš', 'FK Spartak Subotica',
      'FK Napredak Kruševac', 'FK IMT', 'FK Javor Ivanjica',
      'FK Radnički 1923', 'FK Kolubara', 'FK Radnik Bijeljina',
      'FK Borac Čačak', 'FK Vojvodina Novi Sad', 'FK Mladi Radnik',
    ],
  },
  { name: 'Mozzart Kup Srbije', country: 'Sérvia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Hungary ──
  {
    name: 'Fizz Liga',
    country: 'Hungria',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Ferencváros TC', 'Puskás Akadémia FC', 'MOL Fehérvár FC', 'Debreceni VSC',
      'Paks FC', 'Kecskemét TE', 'Zalaegerszeg TC', 'Diósgyőri VTK',
      'Honvéd', 'Újpest FC', 'Kisvárda Master Good', 'Vasas FC',
    ],
  },
  { name: 'MOL Magyar Kupa', country: 'Hungria', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Czech Republic ──
  {
    name: 'Czech First League',
    country: 'República Checa',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Slavia Prague', 'Sparta Prague', 'Viktoria Plzeň', 'Baník Ostrava',
      'Slovan Liberec', 'Sigma Olomouc', 'FK Jablonec nad Nisou', 'FK Teplice',
      'Mladá Boleslav', 'FK Pardubice', 'Bohemians 1905', 'FC Slovácko',
      'FC Fastav Zlín', 'FC Zbrojovka Brno', 'Hradec Králové', 'MFK Karviná',
    ],
  },
  { name: 'MOL Cup', country: 'República Checa', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Czech Super Cup', country: 'República Checa', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Slovakia ──
  {
    name: 'Niké Liga',
    country: 'Eslováquia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Slovan Bratislava', 'Spartak Trnava', 'MŠK Žilina', 'AS Trenčín',
      'FC DAC Dunajská Streda', 'FK Senica', 'MFK Skalica',
      'MFK Tatran Liptovský Mikuláš', 'FC Nitra', 'Ružomberok',
      'MFK Dukla Banská Bystrica', 'FK Pohroní',
    ],
  },
  { name: 'Slovnaft Cup', country: 'Eslováquia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Norway ──
  {
    name: 'Eliteserien',
    country: 'Noruega',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Bodø/Glimt', 'Brann', 'Molde FK', 'Viking FK', 'Rosenborg BK',
      'Lillestrøm SK', 'Strømsgodset IF', 'Stabæk', 'Vålerenga', 'FK Haugesund',
      'Sarpsborg 08', 'Fredrikstad FK', 'Tromsø IL', 'KFUM Oslo', 'FK Jerv', 'Odd',
    ],
  },
  {
    name: 'Norwegian 1st Division',
    country: 'Noruega',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Kongsvinger IL', 'Ranheim IL', 'Raufoss IL', 'Åsane FK', 'Sogndal',
      'Bryne FK', 'HamKam', 'Ull/Kisa', 'Notodden FK', 'Hødd IL',
      'Florø SK', 'Follo FK', 'Tromsdalen UIL', 'FK Mjøndalen', 'Sandnes Ulf', 'Stjørdals-Blink',
    ],
  },
  { name: 'NM Cup', country: 'Noruega', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Sweden ──
  {
    name: 'Allsvenskan',
    country: 'Suécia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Malmö FF', 'Djurgårdens IF', 'IFK Göteborg', 'IFK Norrköping',
      'Hammarby IF', 'AIK', 'BK Häcken', 'IF Elfsborg',
      'Kalmar FF', 'Halmstads BK', 'GAIS', 'IFK Värnamo',
      'Brommapojkarna', 'Sirius FK', 'Örebro SK', 'Västerås SK',
    ],
  },
  {
    name: 'Superettan',
    country: 'Suécia',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'AFC Eskilstuna', 'IK Sirius', 'IK Brage', 'GIF Sundsvall',
      'Trelleborgs FF', 'Degerfors IF', 'Öster IF', 'Utsiktens BK',
      'Norrby IF', 'Helsingborgs IF', 'IF Sylvia', 'Landskrona BoIS',
      'Vasalunds IF', 'Örgryte IS', 'Örebro SK', 'IFK Värnamo',
    ],
  },
  { name: 'Svenska Cupen', country: 'Suécia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Denmark ──
  {
    name: 'Danish Superliga',
    country: 'Dinamarca',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'FC Copenhagen', 'Brøndby IF', 'FC Midtjylland', 'AGF Aarhus',
      'Silkeborg IF', 'AaB Aalborg', 'OB Odense', 'FC Nordsjælland',
      'Randers FC', 'Viborg FF', 'Vejle Boldklub', 'FC Helsingør',
      'HB Køge', 'Lyngby BK',
    ],
  },
  {
    name: 'Betinia Liga',
    country: 'Dinamarca',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Hvidovre IF', 'SønderjyskE', 'AC Horsens', 'Fredericia BK',
      'BK Fremad Amager', 'FC Roskilde', 'Esbjerg fB', 'Thisted FC',
      'Næstved BK', 'B93', 'Kolding IF', 'Nykøbing FC', 'Jammerbugt FC', 'FC Helsingør',
    ],
  },
  { name: 'Oddset Pokalen', country: 'Dinamarca', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Ireland ──
  {
    name: 'League of Ireland',
    country: 'Irlanda',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Shamrock Rovers', 'Shelbourne FC', 'Bohemian FC', 'Dundalk FC',
      'Sligo Rovers', 'Drogheda United', 'Cork City', "St Patrick's Athletic",
      'Derry City', 'Galway United', 'Waterford FC', 'Longford Town',
    ],
  },
  { name: 'FAI Cup', country: 'Irlanda', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Brazil (additional) ──
  {
    name: 'Brasileirão Série B',
    country: 'Brasil',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Sport Recife', 'Atlético Goianiense', 'América Mineiro', 'Guarani',
      'CRB', 'Goiás', 'Operário', 'Novorizontino', 'Ituano', 'Ponte Preta',
      'Paysandu', 'Chapecoense', 'Botafogo SP', 'Brusque', 'Vila Nova',
      'Sampaio Corrêa', 'Coritiba', 'Figueirense', 'Tombense', 'AVAí',
    ],
  },
  {
    name: 'Brasileirão Série C',
    country: 'Brasil',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Caxias do Sul', 'Remo', 'Confiança', 'Figueirense', 'ABC FC',
      'Botafogo-PB', 'Santa Cruz', 'Ferroviária', 'Aparecidense', 'São José-RS',
      'Brusque', 'Londrina', 'Athletic Club MG', 'Náutico', 'Ituano',
      'Tombense', 'Vila Nova', 'Sampaio Corrêa', 'Joinville EC', 'Atlético-CE',
    ],
  },
  { name: 'Copa Betano do Brasil', country: 'Brasil', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Supercopa do Brasil', country: 'Brasil', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  {
    name: 'Carioca',
    country: 'Brasil',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Flamengo', 'Fluminense', 'Vasco da Gama', 'Botafogo',
      'Nova Iguaçu', 'Volta Redonda', 'Madureira EC', 'Bangu AC',
      'Resende FC', 'Portuguesa-RJ', 'Boavista FC', 'Sampaio Corrêa-RJ',
    ],
  },
  {
    name: 'Gaúcho',
    country: 'Brasil',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Grêmio', 'Internacional', 'Caxias do Sul', 'Juventude',
      'Ypiranga FC', 'São Luiz', 'Brasil de Pelotas', 'EC Pelotas',
      'EC Novo Hamburgo', 'Esportivo de Bento Gonçalves', 'São José-RS', 'Aimoré',
    ],
  },
  {
    name: 'Paulista Série A1',
    country: 'Brasil',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'São Paulo FC', 'Santos', 'Corinthians', 'Palmeiras', 'Red Bull Bragantino',
      'Guarani FB', 'Portuguesa SP', 'Mirassol FC', 'Novorizontino',
      'EC Santo André', 'Ituano FC', 'Botafogo-SP', 'Ponte Preta', 'Inter de Limeira',
      'Agua Santa', 'São Bernardo FC',
    ],
  },
  {
    name: 'Mineiro, Módulo I',
    country: 'Brasil',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Atlético Mineiro', 'Cruzeiro', 'América Mineiro', 'Athletic Club',
      'Pouso Alegre FC', 'Villa Nova AC', 'Boa Esporte Clube', 'Ipatinga FC',
      'Tombense', 'Caldense', 'Democrata-GV', 'Patrocinense',
    ],
  },
  { name: 'Copa do Nordeste', country: 'Brasil', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Argentina (additional) ──
  { name: 'Copa Argentina', country: 'Argentina', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Copa de la Liga Profesional', country: 'Argentina', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  {
    name: 'Primera Nacional',
    country: 'Argentina',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'All Boys', 'Almagro', 'Atlanta', 'Chacarita Juniors', 'Ferro Carril Oeste',
      'Independiente Rivadavia', 'Quilmes', 'San Telmo', 'Temperley', 'Tigre',
      'San Martín de San Juan', 'Chaco For Ever', 'Defensores de Belgrano',
      'Mitre', 'Güemes', 'Agropecuario CF', 'Brown de Adrogué', 'Barracas Central',
      'Deportivo Morón', 'Almirante Brown', 'Atlético Rafaela',
      'Estudiantes de Buenos Aires', 'San Martín de Tucumán', 'Riestra',
    ],
  },
  { name: 'Supercopa Argentina', country: 'Argentina', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Mexico ──
  {
    name: 'Liga MX, Clausura',
    country: 'México',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Club América', 'Chivas Guadalajara', 'Cruz Azul', 'Tigres UANL',
      'CF Monterrey', 'Santos Laguna', 'Club Toluca', 'Pachuca',
      'Atlas FC', 'Pumas UNAM', 'Club Puebla', 'Querétaro FC',
      'Club Tijuana', 'FC Juárez', 'Club León', 'Necaxa',
      'Mazatlán FC', 'Atlético de San Luis',
    ],
  },
  {
    name: 'Liga MX, Apertura',
    country: 'México',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Club América', 'Chivas Guadalajara', 'Cruz Azul', 'Tigres UANL',
      'CF Monterrey', 'Santos Laguna', 'Club Toluca', 'Pachuca',
      'Atlas FC', 'Pumas UNAM', 'Club Puebla', 'Querétaro FC',
      'Club Tijuana', 'FC Juárez', 'Club León', 'Necaxa',
      'Mazatlán FC', 'Atlético de San Luis',
    ],
  },
  { name: 'Copa MX', country: 'México', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Colombia ──
  {
    name: 'Primera A, Finalización',
    country: 'Colômbia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Millonarios FC', 'Atlético Nacional', 'América de Cali', 'Junior FC',
      'Independiente Medellín', 'Deportivo Cali', 'Deportivo Pereira',
      'Atlético Bucaramanga', 'Santa Fe', 'Once Caldas', 'Deportes Tolima',
      'La Equidad', 'Fortaleza CEIF', 'Águilas Doradas', 'Envigado FC', 'Deportivo Pasto',
    ],
  },
  {
    name: 'Primera A, Apertura',
    country: 'Colômbia',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Millonarios FC', 'Atlético Nacional', 'América de Cali', 'Junior FC',
      'Independiente Medellín', 'Deportivo Cali', 'Deportivo Pereira',
      'Atlético Bucaramanga', 'Santa Fe', 'Once Caldas', 'Deportes Tolima',
      'La Equidad', 'Fortaleza CEIF', 'Águilas Doradas', 'Envigado FC', 'Deportivo Pasto',
    ],
  },
  { name: 'Copa Colombia', country: 'Colômbia', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Chile ──
  {
    name: 'Liga de Primera',
    country: 'Chile',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Colo-Colo', 'Universidad de Chile', 'Universidad Católica',
      'Audax Italiano', 'Everton de Viña', 'Huachipato',
      'Deportes Iquique', 'Unión La Calera', "O'Higgins FC",
      'Palestino', 'Cobreloa', 'Cobresal',
      'Deportes Antofagasta', 'Ñublense', 'Deportes Concepción', 'Deportes Temuco',
    ],
  },
  { name: 'Copa Chile', country: 'Chile', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Supercopa de Chile', country: 'Chile', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Peru ──
  {
    name: 'Liga 1',
    country: 'Peru',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Universitario', 'Alianza Lima', 'Sporting Cristal', 'Cienciano',
      'César Vallejo', 'FBC Melgar', 'UTC Cajamarca', 'Binacional',
      'Sport Boys', 'Atlético Grau', 'San Martín', 'ADT',
      'Ayacucho FC', 'Unión Comercio', 'Deportivo Municipal', 'Los Chankas',
      'Alianza Atlético', 'Cusco FC',
    ],
  },
  // ── Uruguay ──
  {
    name: 'Liga AUF Uruguaya',
    country: 'Uruguai',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Peñarol', 'Nacional', 'Defensor Sporting', 'Danubio',
      'River Plate Uruguay', 'Montevideo Wanderers', 'Liverpool FC Uruguay',
      'Club Atlético Progreso', 'Cerrito', 'Boston River',
      'Cerro Largo', 'Torque', 'El Tanque Sisley', 'Fénix',
    ],
  },
  { name: 'Copa Uruguay', country: 'Uruguai', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Supercopa Uruguaya', country: 'Uruguai', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── USA (additional) ──
  {
    name: 'USL Championship',
    country: 'EUA',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'San Antonio FC', 'Tampa Bay Rowdies', 'Indy Eleven', 'New Mexico United',
      'El Paso Locomotive FC', 'Sacramento Republic FC', 'Louisville City FC',
      'Phoenix Rising FC', 'Memphis 901 FC', 'Pittsburgh Riverhounds SC',
      'Rio Grande Valley FC', 'Orange County SC', 'FC Tulsa', 'Charleston Battery',
      'Detroit City FC', 'Oakland Roots SC', 'Hartford Athletic',
      'Colorado Springs Switchbacks FC', 'Miami FC', 'Birmingham Legion FC',
    ],
  },
  { name: 'US Open Cup', country: 'EUA', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'NWSL', country: 'EUA', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  {
    name: 'MLS Next Pro',
    country: 'EUA',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Columbus Crew 2', 'FC Cincinnati 2', 'Inter Miami II', 'Atlanta United 2',
      'Chicago Fire II', 'CF Montréal II', 'LAFC 2', 'LA Galaxy II',
      'Real Salt Lake Monarchs', 'Minnesota United 2', 'Nashville SC 2',
      'New England Revolution II', 'New York City FC II', 'New York Red Bulls II',
      'Orlando City B', 'Philadelphia Union II', 'Portland Timbers 2',
      'San Jose Earthquakes 2', 'Seattle Sounders FC 2', 'Sporting KC 2',
      'Toronto FC II', 'Vancouver Whitecaps 2', 'D.C. United 2',
    ],
  },
  // ── Canada ──
  {
    name: 'Canadian Premier League',
    country: 'Canadá',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Forge FC', 'Pacific FC', 'HFX Wanderers FC', 'Cavalry FC',
      'Valour FC', 'York United FC', 'Atlético Ottawa', 'FC Edmonton',
    ],
  },
  { name: 'Canadian Championship', country: 'Canadá', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Japan ──
  {
    name: 'J1 League',
    country: 'Japão',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Kashima Antlers', 'Urawa Red Diamonds', 'Yokohama F. Marinos', 'Gamba Osaka',
      'Nagoya Grampus', 'Cerezo Osaka', 'Kashiwa Reysol', 'FC Tokyo',
      'Vissel Kobe', 'Kawasaki Frontale', 'Sagan Tosu', 'Consadole Sapporo',
      'Sanfrecce Hiroshima', 'Avispa Fukuoka', 'Tokyo Verdy', 'Kyoto Sanga',
      'Albirex Niigata', 'Shonan Bellmare', 'Júbilo Iwata', 'Machida Zelvia',
    ],
  },
  {
    name: 'J2 League',
    country: 'Japão',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Roasso Kumamoto', 'Vegalta Sendai', 'Mito HollyHock', 'Shonan Bellmare',
      'Fagiano Okayama', 'JEF United Chiba', 'FC Ryukyu', 'Renofa Yamaguichi',
      'Blaublitz Akita', 'Gainare Tottori', 'Kataller Toyama', 'Ehime FC',
      'Tokushima Vortis', 'FC Machida Zelvia', 'Azul Claro Numazu', 'Tochigi SC',
      'Zweigen Kanazawa', 'SC Sagamihara', 'Montedio Yamagata', 'FC Gifu',
      'Vanraure Hachinohe', 'Grulla Morioka',
    ],
  },
  {
    name: 'J3 League',
    country: 'Japão',
    sport: Sport.FOOTBALL,
    tier: 3,
    teams: [
      'Kagoshima United FC', 'Matsumoto Yamaga FC', 'Thespakusatsu Gunma',
      'Fujieda MYFC', 'FC Imabari', 'Nara Club', 'FC Osaka', 'Giravanz Kitakyushu',
      'Tegevajaro Miyazaki', 'Cobaltore Onagawa', 'FC Tiamo Hirakata',
      'Blaublitz Akita', 'Gainare Tottori', 'Iwate Grulla Morioka',
    ],
  },
  { name: 'J. League Cup', country: 'Japão', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Emperor Cup', country: 'Japão', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── South Korea ──
  {
    name: 'K League 1',
    country: 'Coreia do Sul',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Ulsan HD FC', 'Jeonbuk Hyundai Motors', 'Pohang Steelers', 'FC Seoul',
      'Incheon United', 'Jeju United', 'Gangwon FC', 'Suwon Samsung Bluewings',
      'Daejeon Citizen', 'Daegu FC', 'Gimcheon Sangmu', 'Gwangju FC',
    ],
  },
  {
    name: 'K League 2',
    country: 'Coreia do Sul',
    sport: Sport.FOOTBALL,
    tier: 2,
    teams: [
      'Chungnam Asan FC', 'Gyeongnam FC', 'Seoul E-Land FC', 'Bucheon FC 1995',
      'Busan IPark', 'Ansan Greeners', 'Hwaseong FC', 'Chungbuk Cheongju FC',
      'Gimpo FC', 'FC Anyang',
    ],
  },
  { name: 'Korean Cup', country: 'Coreia do Sul', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Saudi Arabia ──
  {
    name: 'Saudi Pro League',
    country: 'Arábia Saudita',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Al-Hilal', 'Al-Nassr', 'Al-Ittihad', 'Al-Ahli',
      'Al-Qadsiah', 'Al-Taawoun', 'Al-Shabab', 'Al-Fateh',
      'Al-Wehda', 'Al-Faisaly', 'Al-Ettifaq', 'Al-Hazm',
      'Al-Okhdood', 'Al-Raed', 'Al-Riyadh', 'Al-Orubah',
      'Abha FC', 'Al-Khaleej',
    ],
  },
  { name: "King's Cup", country: 'Arábia Saudita', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'Saudi Super Cup', country: 'Arábia Saudita', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── UAE ──
  {
    name: 'UAE Pro League',
    country: 'Emirados Árabes Unidos',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Al Ain', 'Al-Wahda', 'Al Jazira', 'Sharjah FC',
      'Shabab Al-Ahli', 'Al Nasr', 'Baniyas FC', 'Emirates Club',
      'Ajman Club', 'Dibba Al-Fujairah', 'Al-Dhafra', 'Ittihad Kalba',
      'Khorfakkan Club', 'Al Orouba',
    ],
  },
  { name: 'UAE Presidents Cup', country: 'Emirados Árabes Unidos', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Morocco ──
  {
    name: 'Botola Pro',
    country: 'Marrocos',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Wydad AC', 'Raja Casablanca', 'FUS Rabat', 'RS Berkane',
      'FAR Rabat', 'DHJ Jadida', 'Hassania Agadir', 'IRT Tanger',
      'Chabab Mohammedia', 'Mouloudia Oujda', 'Moghreb Tétouan', 'OC Khouribga',
      'Olympic Safi', 'Youssoufia Berrechid', 'Kawkab Marrakech', 'Chabab Rif Al-Hoceima',
    ],
  },
  { name: 'Coupe du Trône', country: 'Marrocos', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── South Africa ──
  {
    name: 'South African Premier Division',
    country: 'África do Sul',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Mamelodi Sundowns', 'Kaizer Chiefs', 'Orlando Pirates', 'SuperSport United',
      'Cape Town City', 'Sekhukhune United', 'Stellenbosch FC', 'AmaZulu FC',
      'TS Galaxy', 'Golden Arrows', 'Polokwane City', 'Chippa United',
      'Richards Bay FC', 'Swallows FC', 'Cape Town Spurs', 'Magesi FC',
    ],
  },
  { name: 'Nedbank Cup', country: 'África do Sul', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  { name: 'MTN 8', country: 'África do Sul', sport: Sport.FOOTBALL, tier: 1, teams: [] },
  // ── Nigeria ──
  {
    name: 'Nigeria Premier Football League',
    country: 'Nigéria',
    sport: Sport.FOOTBALL,
    tier: 1,
    teams: [
      'Rivers United', 'Enyimba FC', 'Kano Pillars', 'Shooting Stars',
      'Remo Stars', 'Akwa United', 'Heartland FC', 'Nasarawa United',
      'Kwara United', 'Rangers International', 'Plateau United', 'Lobi Stars',
      'Bendel Insurance', 'Sunshine Stars', 'Doma United', 'Sporting Lagos',
      'FC Ifeanyi Ubah', 'Niger Tornadoes', 'Wikki Tourists', 'Abia Warriors',
    ],
  },
];

const BASKETBALL_COMPETITIONS: CompetitionSeed[] = [
  {
    name: 'NBA',
    country: 'EUA',
    sport: Sport.BASKETBALL,
    tier: 1,
    teams: [
      'Boston Celtics', 'Milwaukee Bucks', 'Philadelphia 76ers', 'New York Knicks',
      'Cleveland Cavaliers', 'Brooklyn Nets', 'Miami Heat', 'Atlanta Hawks',
      'Chicago Bulls', 'Indiana Pacers', 'Orlando Magic', 'Toronto Raptors',
      'Charlotte Hornets', 'Washington Wizards', 'Detroit Pistons',
      'Denver Nuggets', 'Minnesota Timberwolves', 'Oklahoma City Thunder',
      'Dallas Mavericks', 'Phoenix Suns', 'LA Clippers', 'Los Angeles Lakers',
      'Sacramento Kings', 'Golden State Warriors', 'New Orleans Pelicans',
      'Houston Rockets', 'Memphis Grizzlies', 'Utah Jazz',
      'San Antonio Spurs', 'Portland Trail Blazers',
    ],
  },
  {
    name: 'EuroLeague',
    country: 'Internacional',
    sport: Sport.BASKETBALL,
    tier: 1,
    teams: [
      'Real Madrid Baloncesto', 'FC Barcelona Basquet', 'Olympiacos BC', 'Panathinaikos BC',
      'Fenerbahçe Beko', 'Anadolu Efes', 'Maccabi Tel Aviv', 'CSKA Moscow',
      'Bayern München Basketball', 'Partizan Belgrade', 'Crvena Zvezda',
      'Virtus Bologna', 'Monaco Basket', 'Baskonia',
      'ALBA Berlin', 'Žalgiris Kaunas',
    ],
  },
  {
    name: 'EuroCup Basketball',
    country: 'Internacional',
    sport: Sport.BASKETBALL,
    tier: 2,
    teams: [],
  },
  {
    name: 'Liga Portuguesa de Basquetebol',
    country: 'Portugal',
    sport: Sport.BASKETBALL,
    tier: 1,
    teams: [
      'SL Benfica', 'Sporting CP', 'FC Porto', 'Oliveirense',
      'Imortal', 'Ovarense', 'Lusitânia', 'CAB Madeira',
    ],
  },
  {
    name: 'ACB (Espanha)',
    country: 'Espanha',
    sport: Sport.BASKETBALL,
    tier: 1,
    teams: [
      'Real Madrid', 'FC Barcelona', 'Baskonia', 'Valencia Basket',
      'Unicaja', 'Joventut Badalona', 'Gran Canaria', 'Tenerife',
      'Murcia', 'MoraBanc Andorra',
    ],
  },
];

const TENNIS_COMPETITIONS: CompetitionSeed[] = [
  // ── Grand Slams ──
  { name: 'Australian Open', country: 'Austrália',     sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'Roland Garros',   country: 'França',        sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'Wimbledon',       country: 'Inglaterra',    sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'US Open',         country: 'EUA',           sport: Sport.TENNIS, tier: 1, teams: [] },
  // ── ATP Finals / Team events ──
  { name: 'ATP Finals',      country: 'Itália',        sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'Davis Cup',       country: 'Internacional', sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'ATP Tour',        country: 'Internacional', sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'WTA Tour',        country: 'Internacional', sport: Sport.TENNIS, tier: 1, teams: [] },
  // ── ATP Masters 1000 ──
  { name: 'Indian Wells Masters',     country: 'EUA',           sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Miami Open',               country: 'EUA',           sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Monte-Carlo Masters',      country: 'Mónaco',        sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Madrid Open',              country: 'Espanha',       sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Italian Open (Roma)',       country: 'Itália',        sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Canadian Open',            country: 'Canadá',        sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Cincinnati Masters',       country: 'EUA',           sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Shanghai Masters',         country: 'China',         sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Paris Masters',            country: 'França',        sport: Sport.TENNIS, tier: 2, teams: [] },
  // ── ATP 500 ──
  { name: 'Dubai Duty Free Championships', country: 'Emirados Árabes Unidos', sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Qatar Open (Doha)',              country: 'Qatar',        sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Acapulco Open',                  country: 'México',       sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Barcelona Open',                 country: 'Espanha',       sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Halle Open',                     country: 'Alemanha',      sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: "Queen's Club Championships",     country: 'Inglaterra',    sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Hamburg Open',                   country: 'Alemanha',      sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Vienna Open',                    country: 'Áustria',       sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Basel Indoor',                   country: 'Suíça',         sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Tokyo Open',                     country: 'Japão',         sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Beijing Open',                   country: 'China',         sport: Sport.TENNIS, tier: 3, teams: [] },
  // ── ATP 250 — key events ──
  { name: 'Brisbane International',    country: 'Austrália',     sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Auckland Open',             country: 'Nova Zelândia', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Sydney Tennis Classic',     country: 'Austrália',     sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Marseille Open',            country: 'França',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Buenos Aires Open',         country: 'Argentina',     sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Rio Open',                  country: 'Brasil',        sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Santiago Open',             country: 'Chile',         sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Estoril Open',              country: 'Portugal',      sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Geneva Open',               country: 'Suíça',         sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Lyon Open',                 country: 'França',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Stuttgart Open',            country: 'Alemanha',      sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Eastbourne International',  country: 'Inglaterra',    sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Newport Open',              country: 'EUA',           sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Umag Open',                 country: 'Croácia',       sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Gstaad Open',              country: 'Suíça',         sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Kitzbühel Open',            country: 'Áustria',       sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Los Cabos Open',            country: 'México',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Atlanta Open',              country: 'EUA',           sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Winston-Salem Open',        country: 'EUA',           sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Chengdu Open',              country: 'China',         sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Hangzhou Open',             country: 'China',         sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Astana Open',               country: 'Cazaquistão',   sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Antwerp Open',              country: 'Bélgica',       sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Stockholm Open',            country: 'Suécia',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Metz Open',                 country: 'França',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Santiago Indoor',           country: 'Chile',         sport: Sport.TENNIS, tier: 4, teams: [] },
  // ── ATP Challenger Tour ───────────────────────────────────────────────────────
  { name: 'ATP Challenger',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Challenger Tour',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  // ── ATP Challenger — individual tournaments (Sofascore-confirmed logos) ────────
  { name: 'Canberra, Australia',                country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Noumea, New Caledonia',              country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bengaluru, India',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Nottingham, Great Britain',          country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Nonthaburi, Thailand',               country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Glasgow, Great Britain',             country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Nonthaburi 2, Thailand',             country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Buenos Aires, Argentina',            country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Oeiras, Portugal',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Quimper, France',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Oeiras 2, Portugal',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Manama, Bahrain',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Concepcion, Chile',                  country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'San Diego, USA',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Rosario, Argentina',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tenerife, Spain',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Cleveland, USA',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Koblenz, Germany',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Brisbane, Australia',                country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tenerife 2, Spain',                  country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Pau, France',                        country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Chennai, India',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Brisbane 2, Australia',              country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Lille, France',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tigre, Argentina',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tigre 2, Argentina',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Lugano, Switzerland',                country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'St. Brieuc, France',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Pune, India',                        country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Brasilia, Brazil',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Kigali 1, Rwanda',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Hersonissos, Greece',                country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Thionville, France',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Kigali 2, Rwanda',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Cherbourg, France',                  country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Hersonissos 2, Greece',              country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Santiago, Chile',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Phoenix, USA',                       country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Cap Cana, Dominican Republic',       country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Morelos, Mexico',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Asuncion, Paraguay',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Zadar, Croatia',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Murcia, Spain',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Girona, Spain',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Napoli, Italy',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Yokkaichi, Japan',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Morelia, Mexico',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Split, Croatia',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Barletta, Italy',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Sao Leopoldo, Brazil',               country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Sao Leopoldo, Brazil Men Singles',   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'San Luis, Mexico',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Menorca, Spain',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Sarasota, USA',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Monza, Italy',                       country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Mexico City, Mexico',                country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Campinas, Brazil',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Madrid, Spain',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Busan, South Korea',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Oeiras 3, Portugal',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Merida, Mexico',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Santa Cruz, Bolivia',                country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tallahassee, USA',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: "Abidjan, Cote d'Ivoire",             country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Rome, Italy',                        country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Savannah, USA',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Gwangju, South Korea',               country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Ostrava, Czech Republic',            country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Aix en Provence, France',            country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Cagliari, Italy',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Mauthausen, Austria',                country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: "Abidjan 2, Cote d'Ivoire",           country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Francavilla, Italy',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Santos, Brazil',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Brazzaville, Republic of Congo',     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Prague, Czech Republic',             country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Wuxi, China',                        country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bengaluru 2, India',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Valencia, Spain',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Oeiras 4, Portugal',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bordeaux, France',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Zagreb, Croatia',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Cordoba, Argentina',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tunis, Tunisia',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Istanbul, Türkiye',                  country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Little Rock, USA',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Vicenza, Italy',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Prostejov, Czech Republic',          country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Perugia, Italy',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tyler, USA',                         country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Heilbronn, Germany',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'San Miguel de Tucuman, Argentina',   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bratislava, Slovakia',               country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Lyon, France',                       country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Ilkley, Great Britain',              country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Parma, Italy',                       country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Nottingham 2, Great Britain',        country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Poznan, Poland',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Piracicaba, Brazil',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Troyes, France',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Milano, Italy',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Brasov, Romania',                    country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Cary, USA',                          country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Trieste, Italy',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bogota, Colombia',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Braunschweig, Germany',              country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Iasi, Romania',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Granby, Canada',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Pozoblanco, Spain',                  country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Cordenons, Italy',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Zug, Switzerland',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bloomfield Hills, USA',              country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Segovia, Spain',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Tampere, Finland',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Winnipeg, Canada',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bonn, Germany',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Liberec, Czech Republic',            country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'San Marino, San Marino',             country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Grodzisk Mazowiecki, Poland',        country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Lexington, USA',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  // ── WTA 125 / WTA Challenger (women's Challenger equivalent) ─────────────────
  { name: 'WTA 125',          country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'WTA Challenger',   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  // ── WTA 125 — individual tournaments ─────────────────────────────────────────
  { name: 'Mumbai, India',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Midland, USA',                       country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Antalya, Turkiye',                   country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Antalya 2, Turkiye',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Antalya 3, Turkiye',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Saint-Malo, France',                 country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: "La Bisbal D'Emporada, Spain",        country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Paris, France',                      country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Makarska, Croatia',                  country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Bastad, Sweden',                     country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  { name: 'Contrexeville, France',              country: 'Internacional', sport: Sport.TENNIS, tier: 5, teams: [] },
  // ── WTA Women's Tour ─────────────────────────────────────────────────────────
  { name: 'WTA Finals',           country: 'Internacional', sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'Billie Jean King Cup', country: 'Internacional', sport: Sport.TENNIS, tier: 1, teams: [] },
  // WTA Grand Slams (women's draw)
  { name: 'Australian Open WTA', country: 'Austrália',     sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'Roland Garros WTA',   country: 'França',        sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'Wimbledon WTA',       country: 'Inglaterra',    sport: Sport.TENNIS, tier: 1, teams: [] },
  { name: 'US Open WTA',         country: 'EUA',           sport: Sport.TENNIS, tier: 1, teams: [] },
  // WTA 1000
  { name: 'Indian Wells WTA',  country: 'EUA',       sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Miami WTA',         country: 'EUA',       sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Madrid WTA',        country: 'Espanha',   sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Rome WTA',          country: 'Itália',    sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Toronto WTA',       country: 'Canadá',    sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Cincinnati WTA',    country: 'EUA',       sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Beijing WTA',       country: 'China',     sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Wuhan Open',        country: 'China',     sport: Sport.TENNIS, tier: 2, teams: [] },
  { name: 'Guadalajara WTA',   country: 'México',    sport: Sport.TENNIS, tier: 2, teams: [] },
  // WTA 500
  { name: 'Dubai WTA',           country: 'Emirados Árabes Unidos', sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Doha WTA',            country: 'Qatar',      sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Stuttgart WTA',       country: 'Alemanha',   sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Osaka WTA',           country: 'Japão',      sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Birmingham Classic',  country: 'Inglaterra', sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Eastbourne WTA',      country: 'Inglaterra', sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Libéma Open',         country: 'Holanda',    sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Strasbourg WTA',      country: 'França',     sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Linz WTA',            country: 'Áustria',    sport: Sport.TENNIS, tier: 3, teams: [] },
  { name: 'Charleston Open',     country: 'EUA',        sport: Sport.TENNIS, tier: 3, teams: [] },
  // WTA 250
  { name: 'Auckland WTA',           country: 'Nova Zelândia', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Sydney WTA',             country: 'Austrália',     sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Hobart International',   country: 'Austrália',     sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Tokyo WTA',              country: 'Japão',         sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Paris WTA',              country: 'França',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Prague WTA',             country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Seoul WTA',              country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Montreal WTA',           country: 'Canadá',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Guangzhou Open WTA',     country: 'China',         sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Rio WTA',                country: 'Brasil',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Palermo International',  country: 'Itália',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Budapest WTA',           country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Brisbane WTA',           country: 'Austrália',     sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Nottingham WTA',         country: 'Inglaterra',    sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Rabat WTA',              country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'St. Petersburg WTA',     country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Luxembourg WTA',         country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Portoroz WTA',           country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Hong Kong WTA',          country: 'Internacional', sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Bastad WTA',             country: 'Suécia',        sport: Sport.TENNIS, tier: 4, teams: [] },
  { name: 'Shenzhen WTA',           country: 'China',         sport: Sport.TENNIS, tier: 4, teams: [] },
];

const OTHER_COMPETITIONS: CompetitionSeed[] = [
  // Handball
  {
    name: 'EHF Champions League',
    country: 'Internacional',
    sport: Sport.HANDBALL,
    tier: 1,
    teams: [],
  },
  {
    name: 'Andebol 1 (Portugal)',
    country: 'Portugal',
    sport: Sport.HANDBALL,
    tier: 1,
    teams: ['SL Benfica', 'Sporting CP', 'FC Porto', 'ABC Braga', 'Águas Santas'],
  },
  // Volleyball
  {
    name: 'CEV Champions League',
    country: 'Internacional',
    sport: Sport.VOLLEYBALL,
    tier: 1,
    teams: [],
  },
  // Hockey
  {
    name: 'NHL',
    country: 'EUA',
    sport: Sport.HOCKEY,
    tier: 1,
    teams: [
      'Edmonton Oilers', 'Florida Panthers', 'Dallas Stars', 'Colorado Avalanche',
      'New York Rangers', 'Carolina Hurricanes', 'Boston Bruins', 'Vancouver Canucks',
      'Toronto Maple Leafs', 'Winnipeg Jets', 'Tampa Bay Lightning', 'Vegas Golden Knights',
    ],
  },
  // American Football
  {
    name: 'NFL',
    country: 'EUA',
    sport: Sport.AMERICAN_FOOTBALL,
    tier: 1,
    teams: [
      'Kansas City Chiefs', 'San Francisco 49ers', 'Baltimore Ravens', 'Buffalo Bills',
      'Detroit Lions', 'Dallas Cowboys', 'Philadelphia Eagles', 'Miami Dolphins',
      'Green Bay Packers', 'Houston Texans', 'Cleveland Browns', 'Cincinnati Bengals',
      'Los Angeles Rams', 'Pittsburgh Steelers', 'Tampa Bay Buccaneers', 'Jacksonville Jaguars',
    ],
  },
  // Baseball
  {
    name: 'MLB',
    country: 'EUA',
    sport: Sport.BASEBALL,
    tier: 1,
    teams: [
      'Los Angeles Dodgers', 'Atlanta Braves', 'Houston Astros', 'New York Yankees',
      'Tampa Bay Rays', 'Baltimore Orioles', 'Texas Rangers', 'Philadelphia Phillies',
      'Minnesota Twins', 'Arizona Diamondbacks', 'Milwaukee Brewers', 'Toronto Blue Jays',
    ],
  },
  // Rugby
  {
    name: 'Six Nations',
    country: 'Internacional',
    sport: Sport.RUGBY,
    tier: 1,
    teams: [],
  },
  {
    name: 'Rugby World Cup',
    country: 'Internacional',
    sport: Sport.RUGBY,
    tier: 1,
    teams: [],
  },
];

const ALL_COMPETITIONS = [
  ...FOOTBALL_COMPETITIONS,
  ...BASKETBALL_COMPETITIONS,
  ...TENNIS_COMPETITIONS,
  ...OTHER_COMPETITIONS,
];

// ─── Markets (Portuguese labels as used on PT betting sites) ──────────────────

interface MarketSeed {
  name: string;
  category: string;
  sport: Sport | null;
}

const MARKETS: MarketSeed[] = [
  // ── Football - Principal ──
  { name: 'Casa vence', category: 'Principal', sport: null },  // sport-neutral: shows via OR sport IS NULL for all sports
  { name: 'Empate', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Fora vence', category: 'Principal', sport: null },  // sport-neutral
  { name: 'Dupla: Casa ou Empate', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Fora', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Dupla: Empate ou Fora', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'EAA: Casa vence', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'EAA: Fora vence', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Equipa a Marcar Primeiro', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Equipa a Marcar Último', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Golo no Encontro', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Casa Não Sofre Golo', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Fora Não Sofre Golo', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Penálti no Jogo', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Expulsão no Jogo', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Prolongamento', category: 'Principal', sport: Sport.FOOTBALL },
  { name: 'Decisão por Penáltis', category: 'Principal', sport: Sport.FOOTBALL },

  // ── Football - Golos ──
  { name: 'Ambas Marcam (BTTS)', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Mais de 0.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Mais de 1.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Mais de 2.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Mais de 3.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Mais de 4.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Mais de 5.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Menos de 0.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Menos de 1.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Menos de 2.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Menos de 3.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Menos de 4.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Total de Golos - Menos de 5.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Casa - Mais de 0.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Casa - Mais de 1.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Casa - Mais de 2.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Casa - Menos de 0.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Casa - Menos de 1.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Fora - Mais de 0.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Fora - Mais de 1.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Fora - Mais de 2.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Fora - Menos de 0.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Golos Fora - Menos de 1.5', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Número Exato de Golos', category: 'Golos', sport: Sport.FOOTBALL },
  { name: 'Par/Ímpar (Golos)', category: 'Golos', sport: Sport.FOOTBALL },

  // ── Football - Handicap ──
  { name: 'Handicap Europeu', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -0.25', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -0.5', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -0.75', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -1', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -1.25', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -1.5', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -1.75', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático -2', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +0.25', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +0.5', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +0.75', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +1', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +1.25', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +1.5', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +1.75', category: 'Handicap', sport: Sport.FOOTBALL },
  { name: 'Handicap Asiático +2', category: 'Handicap', sport: Sport.FOOTBALL },

  // ── Football - Resultado ──
  { name: 'Resultado Exato', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'Intervalo: Casa vence', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'Intervalo: Empate', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'Intervalo: Fora vence', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'Intervalo/Final (HT/FT)', category: 'Resultado', sport: Sport.FOOTBALL },
  // HT/FT specific outcome combinations
  { name: 'HT/FT: Casa/Casa', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Casa/Empate', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Casa/Fora', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Empate/Casa', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Empate/Empate', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Empate/Fora', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Fora/Casa', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Fora/Fora', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'HT/FT: Fora/Empate', category: 'Resultado', sport: Sport.FOOTBALL },
  { name: 'Margem de Vitória', category: 'Resultado', sport: Sport.FOOTBALL },

  // ── Football - 1ª Parte ──
  { name: '1ª Parte: Casa vence', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte: Empate', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte: Fora vence', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte: Casa ou Empate', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte: Casa ou Fora', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte: Empate ou Fora', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte: EAA Casa vence', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte: EAA Fora vence', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Ambas Marcam', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Total de Golos Mais de 0.5', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Total de Golos Mais de 1.5', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Total de Golos Mais de 2.5', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Total de Golos Menos de 0.5', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Total de Golos Menos de 1.5', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Total de Golos Menos de 2.5', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Resultado Exato', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Par/Ímpar Golos', category: '1ª Parte', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Handicap Asiático', category: '1ª Parte', sport: Sport.FOOTBALL },

  // ── Football - 2ª Parte ──
  { name: '2ª Parte: Casa vence', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte: Empate', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte: Fora vence', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte: Casa ou Empate', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte: Empate ou Fora', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Ambas Marcam', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Total de Golos Mais de 0.5', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Total de Golos Mais de 1.5', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Total de Golos Mais de 2.5', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Total de Golos Menos de 0.5', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Total de Golos Menos de 1.5', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Total de Golos Menos de 2.5', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Resultado Exato', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Par/Ímpar Golos', category: '2ª Parte', sport: Sport.FOOTBALL },
  { name: '2ª Parte - Handicap Asiático', category: '2ª Parte', sport: Sport.FOOTBALL },

  // ── Football - Combinado (Resultado/Golos) ──
  { name: 'Resultado/Golos - acima/abaixo', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Resultado Final + Ambas Marcam', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Resultado Final + Total de Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Ambas Marcam + Total de Golos Mais de 1.5', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Ambas Marcam + Total de Golos Mais de 2.5', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Ambas Marcam + Total de Golos Mais de 3.5', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Ambas Marcam + Total de Golos Menos de 2.5', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Ambas Marcam + Total de Golos Menos de 3.5', category: 'Combinado', sport: Sport.FOOTBALL },
  // Casa vence & total golos (over/under)
  { name: 'Casa vence & +1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & +2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & +3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & +4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & +5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & -1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & -2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & -3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & -4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence & -5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  // Fora vence & total golos (over/under)
  { name: 'Fora vence & +1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & +2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & +3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & +4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & +5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & -1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & -2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & -3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & -4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence & -5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  // Casa vence ou empata (Draw No Bet) & total golos
  { name: 'Casa vence ou empata & +1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & +2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & +3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & +4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & +5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & -1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & -2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & -3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & -4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Casa vence ou empata & -5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  // Fora vence ou empata (Draw No Bet) & total golos
  { name: 'Fora vence ou empata & +1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & +2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & +3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & +4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & +5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & -1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & -2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & -3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & -4.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Fora vence ou empata & -5.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: '1ª Parte - Resultado + Ambas Marcam', category: 'Combinado', sport: Sport.FOOTBALL },
  // Double Chance + Goals combinations
  { name: 'Dupla: Casa ou Empate & +1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Empate & +2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Empate & +3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Empate & -1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Empate & -2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Fora & +1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Fora & +2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Fora & +3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Fora & -1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Casa ou Fora & -2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Empate ou Fora & +1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Empate ou Fora & +2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Empate ou Fora & +3.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Empate ou Fora & -1.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },
  { name: 'Dupla: Empate ou Fora & -2.5 Golos', category: 'Combinado', sport: Sport.FOOTBALL },

  // ── Football - Especiais ──
  { name: 'Cartões - Mais/Menos', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cartões - Mais de 1.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cartões - Mais de 2.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cartões - Mais de 3.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cartões - Mais de 4.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cartões - Mais de 5.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cartões - Número Exato', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cantos - Mais/Menos', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cantos - Mais de 7.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cantos - Mais de 8.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cantos - Mais de 9.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cantos - Mais de 10.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cantos - Mais de 11.5', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Cantos - Par/Ímpar', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Primeiro Golo', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Último Golo', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Minuto do Primeiro Golo', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Golo nos Últimos 5 Minutos', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Golo nos Últimos 10 Minutos', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Marcador a Qualquer Momento', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Primeiro Marcador', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Último Marcador', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Hat-Trick', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Faltas - Mais/Menos', category: 'Especiais', sport: Sport.FOOTBALL },
  { name: 'Remates à Baliza - Mais/Menos', category: 'Especiais', sport: Sport.FOOTBALL },

  // ── Basketball ──
  // Principal — 'Casa vence' / 'Fora vence' are sport: null (defined in Football section above)
  // They appear for Basketball via the API's `WHERE sport = 'BASKETBALL' OR sport IS NULL` clause.
  // Handicap (team-specific — humanize via \bCasa\b / \bFora\b)
  { name: 'Casa Handicap -1.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -2.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -3.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -4.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -5.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -6.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -7.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -8.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -9.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -10.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -11.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Casa Handicap -12.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +1.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +2.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +3.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +4.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +5.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +6.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +7.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +8.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +9.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +10.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +11.5', category: 'Handicap', sport: Sport.BASKETBALL },
  { name: 'Fora Handicap +12.5', category: 'Handicap', sport: Sport.BASKETBALL },
  // Total de Pontos (more = self-describing via /Mais de/ and /Menos de/)
  { name: 'Total de Pontos - Mais/Menos', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 175.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 175.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 180.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 180.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 185.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 185.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 190.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 190.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 195.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 195.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 200.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 200.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 205.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 205.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 210.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 210.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 215.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 215.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 220.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 220.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Mais de 225.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Total de Pontos - Menos de 225.5', category: 'Pontos', sport: Sport.BASKETBALL },
  // Pontos por equipa (humanize: Pontos Casa → home, Pontos Fora → away)
  { name: 'Pontos Casa - Mais de 95.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Menos de 95.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Mais de 100.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Menos de 100.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Mais de 105.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Menos de 105.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Mais de 110.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Menos de 110.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Mais de 115.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Casa - Menos de 115.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Mais de 95.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Menos de 95.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Mais de 100.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Menos de 100.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Mais de 105.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Menos de 105.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Mais de 110.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Menos de 110.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Mais de 115.5', category: 'Pontos', sport: Sport.BASKETBALL },
  { name: 'Pontos Fora - Menos de 115.5', category: 'Pontos', sport: Sport.BASKETBALL },
  // 1ª Parte
  { name: '1ª Parte - Casa vence', category: '1ª Parte', sport: Sport.BASKETBALL },
  { name: '1ª Parte - Fora vence', category: '1ª Parte', sport: Sport.BASKETBALL },
  { name: '1ª Parte - Handicap (Basketball)', category: '1ª Parte', sport: Sport.BASKETBALL },
  { name: '1ª Parte - Total de Pontos', category: '1ª Parte', sport: Sport.BASKETBALL },
  // Quartos (team-specific via \bCasa\b / \bFora\b)
  { name: '1º Quarto - Casa vence', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '1º Quarto - Fora vence', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '1º Quarto - Total de Pontos', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '1º Quarto - Handicap', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '2º Quarto - Casa vence', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '2º Quarto - Fora vence', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '3º Quarto - Casa vence', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '3º Quarto - Fora vence', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '4º Quarto - Casa vence', category: 'Quartos', sport: Sport.BASKETBALL },
  { name: '4º Quarto - Fora vence', category: 'Quartos', sport: Sport.BASKETBALL },
  // Especiais
  { name: 'Par/Ímpar (Pontos)', category: 'Especiais', sport: Sport.BASKETBALL },
  { name: 'Margem de Vitória (Basketball)', category: 'Resultado', sport: Sport.BASKETBALL },

  // ── Tennis ──
  { name: 'Vencedor do Encontro', category: 'Principal', sport: Sport.TENNIS },
  { name: 'Handicap de Sets', category: 'Handicap', sport: Sport.TENNIS },
  { name: 'Handicap de Games', category: 'Handicap', sport: Sport.TENNIS },
  { name: 'Total de Sets', category: 'Sets', sport: Sport.TENNIS },
  { name: 'Total de Games - Mais/Menos', category: 'Games', sport: Sport.TENNIS },
  { name: 'Total de Games - Mais de 19.5', category: 'Games', sport: Sport.TENNIS },
  { name: 'Total de Games - Mais de 20.5', category: 'Games', sport: Sport.TENNIS },
  { name: 'Total de Games - Mais de 21.5', category: 'Games', sport: Sport.TENNIS },
  { name: 'Total de Games - Mais de 22.5', category: 'Games', sport: Sport.TENNIS },
  { name: 'Total de Games - Mais de 23.5', category: 'Games', sport: Sport.TENNIS },
  { name: 'Total de Games - Mais de 24.5', category: 'Games', sport: Sport.TENNIS },
  { name: 'Resultado Exato em Sets', category: 'Sets', sport: Sport.TENNIS },
  { name: '1º Set - Vencedor', category: 'Sets', sport: Sport.TENNIS },
  { name: '2º Set - Vencedor', category: 'Sets', sport: Sport.TENNIS },
  { name: '1º Set - Total de Games', category: 'Sets', sport: Sport.TENNIS },
  { name: 'Tiebreak no Encontro', category: 'Especiais', sport: Sport.TENNIS },
  { name: '1º Set Tiebreak', category: 'Sets', sport: Sport.TENNIS },
  { name: 'Par/Ímpar (Games)', category: 'Especiais', sport: Sport.TENNIS },
  // Combo set + match markets
  { name: 'Casa vence 1º Set e o Encontro', category: 'Sets', sport: Sport.TENNIS },
  { name: 'Fora vence 1º Set e o Encontro', category: 'Sets', sport: Sport.TENNIS },
  { name: 'Casa vence 2º Set e o Encontro', category: 'Sets', sport: Sport.TENNIS },
  { name: 'Fora vence 2º Set e o Encontro', category: 'Sets', sport: Sport.TENNIS },
  { name: '3º Set - Vencedor', category: 'Sets', sport: Sport.TENNIS },
  { name: '2º Set - Total de Games', category: 'Sets', sport: Sport.TENNIS },
  { name: '3º Set - Total de Games', category: 'Sets', sport: Sport.TENNIS },
  { name: 'Resultado Correto do Encontro', category: 'Resultado', sport: Sport.TENNIS },
  { name: 'Casa vence sem perder um set', category: 'Especiais', sport: Sport.TENNIS },
  { name: 'Fora vence sem perder um set', category: 'Especiais', sport: Sport.TENNIS },
  { name: 'Handicap de Games no 1º Set', category: 'Handicap', sport: Sport.TENNIS },
  { name: 'Total de Games no 1º Set - Mais/Menos', category: 'Games', sport: Sport.TENNIS },

  // ── Handball ──
  { name: 'Casa vence (Andebol)', category: 'Principal', sport: Sport.HANDBALL },
  { name: 'Empate (Andebol)', category: 'Principal', sport: Sport.HANDBALL },
  { name: 'Fora vence (Andebol)', category: 'Principal', sport: Sport.HANDBALL },
  { name: 'Dupla Andebol: Casa ou Empate', category: 'Principal', sport: Sport.HANDBALL },
  { name: 'Dupla Andebol: Casa ou Fora', category: 'Principal', sport: Sport.HANDBALL },
  { name: 'Dupla Andebol: Empate ou Fora', category: 'Principal', sport: Sport.HANDBALL },
  { name: 'Handicap (Andebol)', category: 'Handicap', sport: Sport.HANDBALL },
  { name: 'Total de Golos - Mais/Menos (Andebol)', category: 'Golos', sport: Sport.HANDBALL },
  { name: 'Total de Golos - Mais de 45.5', category: 'Golos', sport: Sport.HANDBALL },
  { name: 'Total de Golos - Mais de 50.5', category: 'Golos', sport: Sport.HANDBALL },
  { name: 'Total de Golos - Mais de 55.5', category: 'Golos', sport: Sport.HANDBALL },
  { name: 'Total de Golos - Mais de 60.5', category: 'Golos', sport: Sport.HANDBALL },
  { name: '1ª Parte: Casa vence (Andebol)', category: '1ª Parte', sport: Sport.HANDBALL },
  { name: '1ª Parte: Empate (Andebol)', category: '1ª Parte', sport: Sport.HANDBALL },
  { name: '1ª Parte: Fora vence (Andebol)', category: '1ª Parte', sport: Sport.HANDBALL },
  { name: '1ª Parte - Total de Golos (Andebol)', category: '1ª Parte', sport: Sport.HANDBALL },
  { name: 'Par/Ímpar (Andebol)', category: 'Especiais', sport: Sport.HANDBALL },

  // ── Volleyball ──
  { name: 'Vencedor (Voleibol)', category: 'Principal', sport: Sport.VOLLEYBALL },
  { name: 'Handicap de Sets (Voleibol)', category: 'Handicap', sport: Sport.VOLLEYBALL },
  { name: 'Total de Sets (Voleibol)', category: 'Sets', sport: Sport.VOLLEYBALL },
  { name: 'Resultado Exato em Sets (Voleibol)', category: 'Sets', sport: Sport.VOLLEYBALL },
  { name: '1º Set - Vencedor (Voleibol)', category: 'Sets', sport: Sport.VOLLEYBALL },
  { name: '1º Set - Total de Pontos', category: 'Sets', sport: Sport.VOLLEYBALL },
  { name: 'Total de Pontos (Voleibol)', category: 'Pontos', sport: Sport.VOLLEYBALL },
  { name: 'Par/Ímpar (Voleibol)', category: 'Especiais', sport: Sport.VOLLEYBALL },

  // ── Hockey (Hóquei no Gelo) ──
  { name: 'Casa vence (Hóquei)', category: 'Principal', sport: Sport.HOCKEY },
  { name: 'Empate (Hóquei)', category: 'Principal', sport: Sport.HOCKEY },
  { name: 'Fora vence (Hóquei)', category: 'Principal', sport: Sport.HOCKEY },
  { name: 'Resultado Incluindo Prolongamento', category: 'Principal', sport: Sport.HOCKEY },
  { name: 'Dupla Hóquei: Casa ou Empate', category: 'Principal', sport: Sport.HOCKEY },
  { name: 'Dupla Hóquei: Casa ou Fora', category: 'Principal', sport: Sport.HOCKEY },
  { name: 'Dupla Hóquei: Empate ou Fora', category: 'Principal', sport: Sport.HOCKEY },
  { name: 'Handicap de Períodos', category: 'Handicap', sport: Sport.HOCKEY },
  { name: 'Total de Golos (Hóquei) - Mais/Menos', category: 'Golos', sport: Sport.HOCKEY },
  { name: 'Total de Golos (Hóquei) - Mais de 4.5', category: 'Golos', sport: Sport.HOCKEY },
  { name: 'Total de Golos (Hóquei) - Mais de 5.5', category: 'Golos', sport: Sport.HOCKEY },
  { name: 'Total de Golos (Hóquei) - Mais de 6.5', category: 'Golos', sport: Sport.HOCKEY },
  { name: '1º Período: Casa vence', category: '1º Período', sport: Sport.HOCKEY },
  { name: '1º Período: Empate', category: '1º Período', sport: Sport.HOCKEY },
  { name: '1º Período: Fora vence', category: '1º Período', sport: Sport.HOCKEY },
  { name: '1º Período - Total de Golos', category: '1º Período', sport: Sport.HOCKEY },
  { name: 'Ambas Marcam (Hóquei)', category: 'Golos', sport: Sport.HOCKEY },
  { name: 'Par/Ímpar (Hóquei)', category: 'Especiais', sport: Sport.HOCKEY },

  // ── Rugby ──
  { name: 'Vencedor (Rugby)', category: 'Principal', sport: Sport.RUGBY },
  { name: 'Handicap (Rugby)', category: 'Handicap', sport: Sport.RUGBY },
  { name: 'Total de Pontos (Rugby) - Mais/Menos', category: 'Pontos', sport: Sport.RUGBY },
  { name: 'Total de Ensaios - Mais/Menos', category: 'Especiais', sport: Sport.RUGBY },
  { name: '1ª Parte - Vencedor (Rugby)', category: '1ª Parte', sport: Sport.RUGBY },
  { name: 'Par/Ímpar (Rugby)', category: 'Especiais', sport: Sport.RUGBY },
  { name: 'Margem de Vitória (Rugby)', category: 'Resultado', sport: Sport.RUGBY },

  // ── American Football ──
  { name: 'Vencedor (F. Americano)', category: 'Principal', sport: Sport.AMERICAN_FOOTBALL },
  { name: 'Handicap (F. Americano)', category: 'Handicap', sport: Sport.AMERICAN_FOOTBALL },
  { name: 'Total de Pontos (F. Americano) - Mais/Menos', category: 'Pontos', sport: Sport.AMERICAN_FOOTBALL },
  { name: '1ª Parte - Vencedor (F. Americano)', category: '1ª Parte', sport: Sport.AMERICAN_FOOTBALL },
  { name: '1ª Parte - Total de Pontos', category: '1ª Parte', sport: Sport.AMERICAN_FOOTBALL },
  { name: 'Par/Ímpar (F. Americano)', category: 'Especiais', sport: Sport.AMERICAN_FOOTBALL },
  { name: 'Margem de Vitória (F. Americano)', category: 'Resultado', sport: Sport.AMERICAN_FOOTBALL },

  // ── Baseball ──
  { name: 'Vencedor (Basebol)', category: 'Principal', sport: Sport.BASEBALL },
  { name: 'Handicap de Corridas', category: 'Handicap', sport: Sport.BASEBALL },
  { name: 'Total de Corridas - Mais/Menos', category: 'Corridas', sport: Sport.BASEBALL },
  { name: 'Total de Corridas - Mais de 6.5', category: 'Corridas', sport: Sport.BASEBALL },
  { name: 'Total de Corridas - Mais de 7.5', category: 'Corridas', sport: Sport.BASEBALL },
  { name: 'Total de Corridas - Mais de 8.5', category: 'Corridas', sport: Sport.BASEBALL },
  { name: '1ª Volta - Vencedor', category: '1ª Volta', sport: Sport.BASEBALL },
  { name: '1ª Volta - Total de Corridas', category: '1ª Volta', sport: Sport.BASEBALL },
  { name: 'Par/Ímpar (Basebol)', category: 'Especiais', sport: Sport.BASEBALL },

  // ── Generic (multi-sport) ──
  { name: 'Vencedor', category: 'Principal', sport: null },
  { name: 'Handicap', category: 'Handicap', sport: null },
  { name: 'Total - Mais/Menos', category: 'Total', sport: null },
  { name: 'Resultado Final', category: 'Principal', sport: null },
  { name: 'Par/Ímpar', category: 'Especiais', sport: null },
  { name: 'Outro', category: 'Outro', sport: null },
];

// ─── National Team Names (for international competitions) ─────────────────────

const NATIONAL_TEAMS: string[] = [
  'Portugal', 'Espanha', 'França', 'Alemanha', 'Itália', 'Inglaterra',
  'Holanda', 'Bélgica', 'Croácia', 'Suíça', 'Áustria', 'Polónia',
  'Dinamarca', 'Suécia', 'Noruega', 'República Checa', 'Turquia', 'Grécia',
  'Escócia', 'País de Gales', 'Irlanda', 'Sérvia', 'Ucrânia', 'Roménia',
  'Hungria', 'Eslováquia', 'Eslovénia', 'Geórgia', 'Finlândia', 'Islândia',
  'Albânia', 'Bósnia e Herzegovina', 'Montenegro', 'Macedónia do Norte',
  'Brasil', 'Argentina', 'Uruguai', 'Colômbia', 'Chile', 'Equador',
  'Paraguai', 'Peru', 'Venezuela', 'Bolívia', 'México', 'EUA', 'Canadá',
  'Japão', 'Coreia do Sul', 'Austrália', 'Arábia Saudita', 'Irão',
  'Marrocos', 'Senegal', 'Nigéria', 'Camarões', 'Gana', 'Costa do Marfim',
  'Egito', 'Tunísia', 'Argélia', 'África do Sul',
];

// ─── Seed function ────────────────────────────────────────────────────────────

export async function seed(): Promise<void> {
  console.log('🌱 Seeding reference data...');

  // Clear team-competition links so re-seeding removes stale associations (e.g. relegated teams)
  await prisma.teamCompetition.deleteMany({});

  // Remove duplicate tennis players created by scraper runs with slightly different name formatting.
  // teamCompetition rows are already gone above, so FK constraints won't block deletes.
  const allTennisTeams = await prisma.team.findMany({
    where: { sport: Sport.TENNIS },
    orderBy: { createdAt: 'asc' },
  });
  const seenTennisNames = new Map<string, string>();
  const duplicateTennisIds: string[] = [];
  for (const t of allTennisTeams) {
    const key = t.name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seenTennisNames.has(key)) {
      duplicateTennisIds.push(t.id);
    } else {
      seenTennisNames.set(key, t.id);
    }
  }
  if (duplicateTennisIds.length > 0) {
    await prisma.team.deleteMany({ where: { id: { in: duplicateTennisIds } } });
    console.log(`🧹 Removed ${duplicateTennisIds.length} duplicate tennis player entries`);
  }
  // Mark all competitions inactive first so renamed countries/tournaments don't leave stale active rows behind.
  await prisma.competition.updateMany({ data: { isActive: false } });

  // 1. Seed competitions and teams
  let competitionsCreated = 0;
  let teamsCreated = 0;

  for (const comp of ALL_COMPETITIONS) {
    const competition = await prisma.competition.upsert({
      where: {
        name_country_sport: { name: comp.name, country: comp.country, sport: comp.sport },
      },
      update: { tier: comp.tier, isActive: true },
      create: {
        name: comp.name,
        country: comp.country,
        sport: comp.sport,
        tier: comp.tier,
        isActive: true,
      },
    });
    competitionsCreated++;

    for (const teamName of comp.teams) {
      const team = await prisma.team.upsert({
        where: { name_sport: { name: teamName, sport: comp.sport } },
        update: {},
        create: { name: teamName, sport: comp.sport, country: comp.country },
      });

      await prisma.teamCompetition.createMany({
        data: [{ teamId: team.id, competitionId: competition.id }],
        skipDuplicates: true,
      });

      teamsCreated++;
    }
  }

  // 2. Seed national teams as generic football teams
  for (const name of NATIONAL_TEAMS) {
    await prisma.team.upsert({
      where: { name_sport: { name, sport: Sport.FOOTBALL } },
      update: {},
      create: { name, sport: Sport.FOOTBALL, country: name },
    });
    teamsCreated++;
  }

  // 3. Seed markets
  let marketsCreated = 0;
  for (const market of MARKETS) {
    await prisma.market.upsert({
      where: { name: market.name },
      update: { category: market.category, sport: market.sport },
      create: {
        name: market.name,
        category: market.category,
        sport: market.sport,
      },
    });
    marketsCreated++;
  }

  console.log(`✅ Seeded ${competitionsCreated} competitions, ${teamsCreated} team entries, ${marketsCreated} markets`);
}

if (require.main === module) {
  seed()
    .catch((e) => {
      console.error('❌ Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
