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
