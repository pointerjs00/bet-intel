/**
 * Static mappings for sports visual assets.
 *
 * Team badge URLs: api-football.com CDN (public, no key required for images)
 * League logo URLs: same CDN
 * Country flags: flagcdn.com (free, no auth)
 */
import type { ImageSourcePropType } from 'react-native';
import { getTennisTournamentPoints, isTennisTournament } from '@betintel/shared';
import { getSofascoreTournamentLogoUrl } from './sofascoreTournaments';

// ─── CDN helpers ─────────────────────────────────────────────────────────────

const TEAM_CDN = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`;
const LEAGUE_CDN = (id: number) => `https://media.api-sports.io/football/leagues/${id}.png`;
const BBALL_LEAGUE_CDN = (id: number) => `https://media.api-sports.io/basketball/leagues/${id}.png`;
const HOCKEY_LEAGUE_CDN = (id: number) => `https://media.api-sports.io/hockey/leagues/${id}.png`;
const AMFOOT_LEAGUE_CDN = (id: number) => `https://media.api-sports.io/american-football/leagues/${id}.png`;
const BASEBALL_LEAGUE_CDN = (id: number) => `https://media.api-sports.io/baseball/leagues/${id}.png`;
const RUGBY_LEAGUE_CDN = (id: number) => `https://media.api-sports.io/rugby/leagues/${id}.png`;
const HANDBALL_LEAGUE_CDN = (id: number) => `https://media.api-sports.io/handball/leagues/${id}.png`;
const VOLLEYBALL_LEAGUE_CDN = (id: number) => `https://media.api-sports.io/volleyball/leagues/${id}.png`;
// ESPN CDN — reliable for major American leagues
const ESPN_LEAGUE = (abbrev: string) => `https://a.espncdn.com/i/teamlogos/leagues/500/${abbrev}.png`;
const FLAG_CDN = (code: string) => `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
// Sofascore CDN — tournament logos (public CDN, no auth required)
const SOFA = (id: number) => `https://img.sofascore.com/api/v1/unique-tournament/${id}/image`;
// Sofascore CDN — sport category logos (ATP, WTA, Challenger tier branding)
const SOFA_CAT = (id: number) => `https://img.sofascore.com/api/v1/category/${id}/image`;

// ─── Country flags ────────────────────────────────────────────────────────────
// Keys: Portuguese country name used in seed.ts → flagcdn country code

export const COUNTRY_FLAGS: Record<string, string> = {
  Portugal:       FLAG_CDN('pt'),
  Inglaterra:     FLAG_CDN('gb-eng'),
  Escócia:        FLAG_CDN('gb-sct'),
  Espanha:        FLAG_CDN('es'),
  Itália:         FLAG_CDN('it'),
  Alemanha:       FLAG_CDN('de'),
  França:         FLAG_CDN('fr'),
  Holanda:        FLAG_CDN('nl'),
  Bélgica:        FLAG_CDN('be'),
  Turquia:        FLAG_CDN('tr'),
  Áustria:        FLAG_CDN('at'),
  Suíça:          FLAG_CDN('ch'),
  Grécia:         FLAG_CDN('gr'),
  Canadá:         FLAG_CDN('ca'),
  Mónaco:         FLAG_CDN('mc'),
  México:         FLAG_CDN('mx'),
  Chile:          FLAG_CDN('cl'),
  China:          FLAG_CDN('cn'),
  Japão:          FLAG_CDN('jp'),
  'Nova Zelândia': FLAG_CDN('nz'),
  'Emirados Árabes Unidos': FLAG_CDN('ae'),
  Qatar:          FLAG_CDN('qa'),
  Croácia:        FLAG_CDN('hr'),
  Cazaquistão:    FLAG_CDN('kz'),
  Suécia:         FLAG_CDN('se'),
  Brasil:         FLAG_CDN('br'),
  Argentina:      FLAG_CDN('ar'),
  EUA:            FLAG_CDN('us'),
  Austrália:      FLAG_CDN('au'),
  Internacional:  FLAG_CDN('eu'),
};

// Fallback – flag emoji when image is not required
export const COUNTRY_FLAG_EMOJI: Record<string, string> = {
  Portugal:      '🇵🇹',
  Inglaterra:    '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Escócia:       '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  Espanha:       '🇪🇸',
  Itália:        '🇮🇹',
  Alemanha:      '🇩🇪',
  França:        '🇫🇷',
  Holanda:       '🇳🇱',
  Bélgica:       '🇧🇪',
  Turquia:       '🇹🇷',
  Áustria:       '🇦🇹',
  Suíça:         '🇨🇭',
  Grécia:        '🇬🇷',
  Canadá:        '🇨🇦',
  Mónaco:        '🇲🇨',
  México:        '🇲🇽',
  Chile:         '🇨🇱',
  China:         '🇨🇳',
  Japão:         '🇯🇵',
  'Nova Zelândia': '🇳🇿',
  'Emirados Árabes Unidos': '🇦🇪',
  Qatar:         '🇶🇦',
  Croácia:       '🇭🇷',
  Cazaquistão:   '🇰🇿',
  Suécia:        '🇸🇪',
  Brasil:        '🇧🇷',
  Argentina:     '🇦🇷',
  EUA:           '🇺🇸',
  Austrália:     '🇦🇺',
  Internacional: '🌍',
};

// ─── League / competition logos ───────────────────────────────────────────────

export const LEAGUE_LOGOS: Record<string, string> = {
  // Portugal
  'Liga Portugal Betclic':      'https://r2.thesportsdb.com/images/media/league/badge/lkfko71751917970.png',
  'Liga Portugal 2':            LEAGUE_CDN(95),
  'Taça de Portugal':           LEAGUE_CDN(96),
  'Taça da Liga':               LEAGUE_CDN(97),
  'Supertaça de Portugal':      LEAGUE_CDN(98),
  // England
  'Premier League':             LEAGUE_CDN(39),
  'Championship':               LEAGUE_CDN(40),
  'League One':                 LEAGUE_CDN(41),
  'FA Cup':                     LEAGUE_CDN(45),
  'EFL Cup (Carabao Cup)':      LEAGUE_CDN(48),
  // Spain
  'La Liga':                    LEAGUE_CDN(140),
  'La Liga 2':                  LEAGUE_CDN(141),
  'Copa del Rey':                LEAGUE_CDN(143),
  'Supercopa de España':        LEAGUE_CDN(556),
  // Italy
  'Serie A':                    LEAGUE_CDN(135),
  'Serie B':                    LEAGUE_CDN(136),
  'Coppa Italia':               LEAGUE_CDN(137),
  // Germany
  'Bundesliga':                 LEAGUE_CDN(78),
  '2. Bundesliga':              LEAGUE_CDN(79),
  'DFB-Pokal':                  LEAGUE_CDN(81),
  'Bundesliga (Áustria)':       LEAGUE_CDN(218),
  // France
  'Ligue 1':                    LEAGUE_CDN(61),
  'Ligue 2':                    LEAGUE_CDN(62),
  'Coupe de France':            LEAGUE_CDN(66),
  // Netherlands
  'Eredivisie':                 LEAGUE_CDN(88),
  // Belgium
  'Jupiler Pro League':         LEAGUE_CDN(144),
  // Turkey
  'Süper Lig':                  LEAGUE_CDN(203),
  // Scotland
  'Scottish Premiership':       LEAGUE_CDN(179),
  // Switzerland
  'Super League (Suíça)':       LEAGUE_CDN(207),
  // Greece
  'Super League (Grécia)':      LEAGUE_CDN(197),
  // Brazil
  'Brasileirão Série A':        LEAGUE_CDN(71),
  // Argentina
  'Liga Profesional (Argentina)': LEAGUE_CDN(128),
  // USA
  'MLS':                        LEAGUE_CDN(253),
  // Europe / International (football)
  'UEFA Champions League':      LEAGUE_CDN(2),
  'UEFA Europa League':         LEAGUE_CDN(3),
  'UEFA Conference League':     LEAGUE_CDN(848),
  'UEFA Nations League':        LEAGUE_CDN(5),
  'UEFA Euro':                  LEAGUE_CDN(4),
  'UEFA Super Cup':             LEAGUE_CDN(531),
  'FIFA World Cup':             LEAGUE_CDN(1),
  'FIFA Club World Cup':        LEAGUE_CDN(15),
  'Copa América':               LEAGUE_CDN(9),
  'Copa Libertadores':          LEAGUE_CDN(13),
  'Copa Sudamericana':          LEAGUE_CDN(11),
  // Football — international / qualification
  'Seleções - Amigáveis':       LEAGUE_CDN(10),
  'Qualificação Mundial':       LEAGUE_CDN(33),
  'Qualificação Euro':          LEAGUE_CDN(960),
  // ── Basketball ───────────────────────────────────────────────────────────────
  'NBA':                              ESPN_LEAGUE('nba'),
  'EuroLeague':                       BBALL_LEAGUE_CDN(120),
  'EuroCup Basketball':               BBALL_LEAGUE_CDN(161),
  'ACB (Espanha)':                    BBALL_LEAGUE_CDN(145),
  'Liga Portuguesa de Basquetebol':   BBALL_LEAGUE_CDN(386),
  // ── Tennis — Grand Slams — ATP (men's) draw logos ────────────────────────────
  'Australian Open': SOFA(2363),
  'Roland Garros':   SOFA(2480),
  'Wimbledon':       SOFA(2361),
  'US Open':         SOFA(2449),
  // Grand Slams — WTA (women's) draw logos
  'Australian Open WTA': SOFA(2571),
  'Roland Garros WTA':   SOFA(2577),
  'Wimbledon WTA':       SOFA(2600),
  'US Open WTA':         SOFA(2601),
  // ── Tennis — ATP Men's tour events & team competitions ───────────────────────
  'ATP Finals': SOFA(2517),
  'Davis Cup':  SOFA(2287),
  'ATP Tour':   SOFA_CAT(3),
  // WTA Women's tour events & team competitions
  'WTA Finals':           SOFA(11864),
  'Billie Jean King Cup': SOFA(2310),
  'WTA Tour':             SOFA_CAT(6),
  // ── Handball ─────────────────────────────────────────────────────────────────
  'EHF Champions League':     HANDBALL_LEAGUE_CDN(27),
  'Andebol 1 (Portugal)':     HANDBALL_LEAGUE_CDN(113),
  // ── Volleyball ───────────────────────────────────────────────────────────────
  'CEV Champions League':     VOLLEYBALL_LEAGUE_CDN(1),
  // ── Ice Hockey ───────────────────────────────────────────────────────────────
  'NHL':    ESPN_LEAGUE('nhl'),
  // ── American Football ────────────────────────────────────────────────────────
  'NFL':    ESPN_LEAGUE('nfl'),
  // ── Baseball ─────────────────────────────────────────────────────────────────
  'MLB':    ESPN_LEAGUE('mlb'),
  // ── Rugby ─────────────────────────────────────────────────────────────────────
  'Six Nations':      RUGBY_LEAGUE_CDN(1),
  'Rugby World Cup':  RUGBY_LEAGUE_CDN(2),
  // ── Tennis — ATP Masters 1000 (Sofascore CDN) ─────────────────────────────────
  'Indian Wells Masters': SOFA(2487),
  'Miami Open':           SOFA(2430),
  'Monte-Carlo Masters':  SOFA(2391),
  'Madrid Open':          SOFA(2374),
  'Italian Open (Roma)':  SOFA(2488),
  'Canadian Open':        SOFA(2510),
  'Cincinnati Masters':   SOFA(2373),
  'Shanghai Masters':     SOFA(2519),
  'Paris Masters':        SOFA(2404),
  // ── Tennis — ATP 500 (Sofascore CDN) ─────────────────────────────────────
  'Dubai Duty Free Championships': SOFA(2389),
  'Qatar Open (Doha)':             SOFA(2420),
  'Acapulco Open':                 SOFA(2366),
  'Barcelona Open':                SOFA(2407),
  'Halle Open':                    SOFA(2493),
  "Queen's Club Championships":    SOFA(2494),
  'Hamburg Open':                  SOFA(2405),
  'Vienna Open':                   SOFA(2428),
  'Basel Indoor':                  SOFA(2406),
  'Tokyo Open':                    SOFA(2435),
  'Beijing Open':                  SOFA(2436),
  // ── Tennis — ATP 250 (Sofascore CDN) ─────────────────────────────────────
  'Brisbane International':   SOFA(2437),
  'Auckland Open':            SOFA(2481),
  // 'Sydney Tennis Classic': Sofascore ID 2482 exists but has no image uploaded — fallback to styled badge
  'Marseille Open':           SOFA(2486),
  'Buenos Aires Open':        SOFA(2383),
  'Rio Open':                 SOFA(2433),
  'Santiago Open':            SOFA(2523),
  'Estoril Open':             SOFA(2541),
  'Geneva Open':              SOFA(2531),
  'Lyon Open':                SOFA(2498),
  'Stuttgart Open':           SOFA(2483),
  'Eastbourne International': SOFA(2362),
  'Newport Open':             SOFA(2447),
  'Umag Open':                SOFA(2426),
  'Gstaad Open':              SOFA(2416),
  'Kitzbühel Open':           SOFA(2501),
  'Los Cabos Open':           SOFA(2369),
  'Atlanta Open':             SOFA(2448),
  'Winston-Salem Open':       SOFA(2439),
  'Chengdu Open':             SOFA(9402),
  'Hangzhou Open':            SOFA(23614),
  'Astana Open':              SOFA(15952),
  'Antwerp Open':             SOFA(2742),
  'Stockholm Open':           SOFA(2382),
  'Metz Open':                SOFA(2496),
  'Santiago Indoor':          SOFA(2523),
  // ── ATP Challenger Tour (men's) ──────────────────────────────────────────────
  'ATP Challenger':           SOFA_CAT(72),   // generic Challenger series logo (cat 72)
  'Challenger Tour':          SOFA_CAT(72),
  // ── ATP Challenger — individual tournament logos (Sofascore-confirmed) ─────────
  'Canberra, Australia':                  SOFA(6634),
  'Noumea, New Caledonia':                SOFA(3402),
  'Bengaluru, India':                     SOFA(6605),
  'Nottingham, Great Britain':            SOFA(4083),
  'Nonthaburi, Thailand':                 SOFA(18862),
  'Glasgow, Great Britain':               SOFA(6402),
  'Nonthaburi 2, Thailand':               SOFA(18866),
  'Buenos Aires, Argentina':              SOFA(3645),
  'Oeiras, Portugal':                     SOFA(16697),
  'Quimper, France':                      SOFA(3661),
  'Oeiras 2, Portugal':                   SOFA(16699),
  'Manama, Bahrain':                      SOFA(17384),
  'Concepcion, Chile':                    SOFA(16595),
  'San Diego, USA':                       SOFA(25127),
  'Rosario, Argentina':                   SOFA(24816),
  'Tenerife, Spain':                      SOFA(17330),
  'Cleveland, USA':                       SOFA(11646),
  'Koblenz, Germany':                     SOFA(10065),
  'Brisbane, Australia':                  SOFA(24722),
  'Tenerife 2, Spain':                    SOFA(19926),
  'Pau, France':                          SOFA(11680),
  'Chennai, India':                       SOFA(5981),
  'Brisbane 2, Australia':                SOFA(24818),
  'Lille, France':                        SOFA(10719),
  'Tigre, Argentina':                     SOFA(18856),
  'Tigre 2, Argentina':                   SOFA(18854),
  'Lugano, Switzerland':                  SOFA(3539),
  'St. Brieuc, France':                   SOFA(3478),
  'Pune, India':                          SOFA(6326),
  'Brasilia, Brazil':                     SOFA(17382),
  'Kigali 1, Rwanda':                     SOFA(22024),
  'Hersonissos, Greece':                  SOFA(25270),
  'Thionville, France':                   SOFA(25268),
  'Kigali 2, Rwanda':                     SOFA(22049),
  'Cherbourg, France':                    SOFA(3576),
  'Hersonissos 2, Greece':                SOFA(25361),
  'Santiago, Chile':                      SOFA(3617),
  'Phoenix, USA':                         SOFA(13366),
  'Cap Cana, Dominican Republic':         SOFA(25364),
  'Morelos, Mexico':                      SOFA(6110),
  'Asuncion, Paraguay':                   SOFA(22121),
  'Zadar, Croatia':                       SOFA(16695),
  'Murcia, Spain':                        SOFA(13432),
  'Girona, Spain':                        SOFA(20106),
  'Napoli, Italy':                        SOFA(22156),
  'Yokkaichi, Japan':                     SOFA(13776),
  'Morelia, Mexico':                      SOFA(25611),
  'Split, Croatia':                       SOFA(14646),
  'Barletta, Italy':                      SOFA(3420),
  'Sao Leopoldo, Brazil':                 SOFA(4190),
  'Sao Leopoldo, Brazil Men Singles':     SOFA(4190),
  'San Luis, Mexico':                     SOFA(3820),
  'Menorca, Spain':                       SOFA(25747),
  'Sarasota, USA':                        SOFA(3559),
  'Monza, Italy':                         SOFA(3465),
  'Mexico City, Mexico':                  SOFA(5631),
  'Campinas, Brazil':                     SOFA(4283),
  'Madrid, Spain':                        SOFA(3981),
  'Busan, South Korea':                   SOFA(3481),
  'Oeiras 3, Portugal':                   SOFA(16862),
  'Merida, Mexico':                       SOFA(22127),
  'Santa Cruz, Bolivia':                  SOFA(16713),
  'Tallahassee, USA':                     SOFA(3183),
  "Abidjan, Cote d'Ivoire":              SOFA(25988),
  'Rome, Italy':                          SOFA(3841),
  'Savannah, USA':                        SOFA(3522),
  'Gwangju, South Korea':                 SOFA(6763),
  'Ostrava, Czech Republic':              SOFA(3179),
  'Aix en Provence, France':              SOFA(6107),
  'Cagliari, Italy':                      SOFA(20302),
  'Mauthausen, Austria':                  SOFA(22392),
  "Abidjan 2, Cote d'Ivoire":            SOFA(26121),
  'Francavilla, Italy':                   SOFA(10247),
  'Santos, Brazil':                       SOFA(3794),
  'Brazzaville, Republic of Congo':       SOFA(24001),
  'Prague, Czech Republic':               SOFA(3878),
  'Wuxi, China':                          SOFA(22388),
  'Bengaluru 2, India':                   SOFA(18463),
  'Valencia, Spain':                      SOFA(19671),
  'Oeiras 4, Portugal':                   SOFA(16929),
  'Bordeaux, France':                     SOFA(3418),
  'Zagreb, Croatia':                      SOFA(3515),
  'Cordoba, Argentina':                   SOFA(6414),
  'Tunis, Tunisia':                       SOFA(3573),
  'Istanbul, Türkiye':                    SOFA(4047),
  'Little Rock, USA':                     SOFA(13567),
  'Vicenza, Italy':                       SOFA(6111),
  'Prostejov, Czech Republic':            SOFA(3512),
  'Perugia, Italy':                       SOFA(6514),
  'Tyler, USA':                           SOFA(20508),
  'Heilbronn, Germany':                   SOFA(3404),
  'San Miguel de Tucuman, Argentina':     SOFA(22258),
  'Bratislava, Slovakia':                 SOFA(3567),
  'Lyon, France':                         SOFA(6787),
  'Ilkley, Great Britain':                SOFA(6475),
  'Parma, Italy':                         SOFA(13569),
  'Nottingham 2, Great Britain':          SOFA(16945),
  'Poznan, Poland':                       SOFA(3445),
  'Piracicaba, Brazil':                   SOFA(19871),
  'Troyes, France':                       SOFA(18661),
  'Milano, Italy':                        SOFA(3453),
  'Brasov, Romania':                      SOFA(3436),
  'Cary, USA':                            SOFA(6636),
  'Trieste, Italy':                       SOFA(15263),
  'Bogota, Colombia':                     SOFA(3577),
  'Braunschweig, Germany':               SOFA(3490),
  'Iasi, Romania':                        SOFA(15277),
  'Granby, Canada':                       SOFA(3438),
  'Pozoblanco, Spain':                    SOFA(3666),
  'Cordenons, Italy':                     SOFA(3494),
  'Zug, Switzerland':                     SOFA(18753),
  'Bloomfield Hills, USA':               SOFA(20666),
  'Segovia, Spain':                       SOFA(3503),
  'Tampere, Finland':                     SOFA(3417),
  'Winnipeg, Canada':                     SOFA(6785),
  'Bonn, Germany':                        SOFA(23146),
  'Liberec, Czech Republic':              SOFA(5812),
  'San Marino, San Marino':              SOFA(3536),
  'Grodzisk Mazowiecki, Poland':         SOFA(18860),
  'Lexington, USA':                       SOFA(3421),
  // ── WTA 125 / WTA Challenger (women's) ───────────────────────────────────────
  // Sofascore category 871 = "WTA 125" (the women's Challenger-level circuit)
  'WTA 125':                  SOFA_CAT(871),
  'WTA Challenger':           SOFA_CAT(871),
  // ── WTA 125 — individual tournament logos ─────────────────────────────────────
  // (Oeiras and Parma skipped — same key used by ATP Challenger above)
  'Mumbai, India':                        SOFA(10662),
  'Midland, USA':                         SOFA(17146),
  'Antalya, Turkiye':                     SOFA(22158),
  'Antalya 2, Turkiye':                   SOFA(25615),
  'Antalya 3, Turkiye':                   SOFA(25749),
  'Saint-Malo, France':                   SOFA(16790),
  "La Bisbal D'Emporada, Spain":          SOFA(20505),
  'Paris, France':                        SOFA(18568),
  'Makarska, Croatia':                    SOFA(18694),
  'Bastad, Sweden':                       SOFA(13377),
  'Contrexeville, France':                SOFA(18581),
  // ── Tennis — WTA 1000 (Sofascore CDN) ─────────────────────────────────────────
  'Indian Wells WTA':         SOFA(2619),
  'Miami WTA':                SOFA(2587),
  'Madrid WTA':               SOFA(2607),
  'Rome WTA':                 SOFA(2569),
  'Toronto WTA':              SOFA(2615),
  'Cincinnati WTA':           SOFA(2548),
  'Beijing WTA':              SOFA(2557),
  'Wuhan Open':               SOFA(2666),
  'Guadalajara WTA':          SOFA(16559),
  // ── Tennis — WTA 500 (Sofascore CDN) ──────────────────────────────────────────
  'Dubai WTA':                SOFA(2612),
  'Doha WTA':                 SOFA(2693),
  'Stuttgart WTA':            SOFA(2549),
  'Osaka WTA':                SOFA(2570),
  'Birmingham Classic':       SOFA(2573),
  'Eastbourne WTA':           SOFA(2596),
  "Libéma Open":              SOFA(2594),  // 's-Hertogenbosch
  'Strasbourg WTA':           SOFA(2591),
  'Linz WTA':                 SOFA(2583),
  'Charleston Open':          SOFA(2622),
  // ── Tennis — WTA 250 (Sofascore CDN) ──────────────────────────────────────────
  'Auckland WTA':             SOFA(2554),
  'Sydney WTA':               SOFA(2566),
  'Hobart International':     SOFA(2567),
  'Tokyo WTA':                SOFA(2582),
  'Paris WTA':                SOFA(2656),
  'Prague WTA':               SOFA(2592),
  'Seoul WTA':                SOFA(2604),
  'Montreal WTA':             SOFA(2624),
  'Guangzhou Open WTA':       SOFA(2579),
  'Rio WTA':                  SOFA(2637),
  'Palermo International':    SOFA(2639),
  'Budapest WTA':             SOFA(2597),
  'Brisbane WTA':             SOFA(2644),
  'Nottingham WTA':           SOFA(2689),
  'Rabat WTA':                SOFA(2682),
  'St. Petersburg WTA':       SOFA(2694),
  'Luxembourg WTA':           SOFA(2647),
  'Portoroz WTA':             SOFA(2599),
  'Hong Kong WTA':            SOFA(2575),
  'Bastad WTA':               SOFA(2552),
  'Shenzhen WTA':             SOFA(2700),
};

// ─── ATP player headshots ────────────────────────────────────────────────────
// Source: ATP Tour official CDN  https://www.atptour.com/-/media/alias/player-gladiator-headshot/{ATP_ID}
// ATP IDs are 4-character codes (e.g. "S0AG" for Sinner, "A0AG" for Alcaraz).
// This map is the seed layer; the weekly rankings job adds/updates entries at runtime.

const ATP_PHOTO = (id: string) =>
  `https://www.atptour.com/-/media/alias/player-gladiator-headshot/${id}`;

export const PLAYER_PHOTOS: Record<string, string> = {
  'Jannik Sinner':                    ATP_PHOTO('S0AG'),
  'Carlos Alcaraz':                   ATP_PHOTO('A0AG'),
  'Alexander Zverev':                 ATP_PHOTO('Z355'),
  'Novak Djokovic':                   ATP_PHOTO('D643'),
  'Taylor Fritz':                     ATP_PHOTO('F456'),
  'Casper Ruud':                      ATP_PHOTO('R0AR'),
  'Daniil Medvedev':                  ATP_PHOTO('M0DP'),
  'Andrey Rublev':                    ATP_PHOTO('R0DO'),
  'Holger Rune':                      ATP_PHOTO('R0HO'),
  'Grigor Dimitrov':                  ATP_PHOTO('D875'),
  'Tommy Paul':                       ATP_PHOTO('P905'),
  'Ugo Humbert':                      ATP_PHOTO('H919'),
  'Alex de Minaur':                   ATP_PHOTO('M0IL'),
  'Stefanos Tsitsipas':               ATP_PHOTO('T1778'),
  'Sebastian Korda':                  ATP_PHOTO('K0EA'),
  'Cameron Norrie':                   ATP_PHOTO('N552'),
  'Nicolas Jarry':                    ATP_PHOTO('J918'),
  'Arthur Fils':                      ATP_PHOTO('F0CR'),
  'Francisco Cerundolo':              ATP_PHOTO('C0CE'),
  'Giovanni Mpetshi Perricard':       ATP_PHOTO('M0GP'),
  'Ben Shelton':                      ATP_PHOTO('S0BW'),
  'Lorenzo Musetti':                  ATP_PHOTO('M0LM'),
  'Hubert Hurkacz':                   ATP_PHOTO('H921'),
  'Karen Khachanov':                  ATP_PHOTO('K749'),
  'Matteo Berrettini':                ATP_PHOTO('B988'),
  'Frances Tiafoe':                   ATP_PHOTO('T935'),
  'Alejandro Davidovich Fokina':      ATP_PHOTO('D875'),
  'Roberto Bautista Agut':            ATP_PHOTO('B669'),
  'Tomas Machac':                     ATP_PHOTO('M0TC'),
  'Alejandro Tabilo':                 ATP_PHOTO('T0AT'),
  'Adrian Mannarino':                 ATP_PHOTO('M585'),
  'Jiri Lehecka':                     ATP_PHOTO('L0JL'),
  'Jordan Thompson':                  ATP_PHOTO('T935'),
  'Nuno Borges':                      ATP_PHOTO('B0NB'),
  'Felix Auger-Aliassime':            ATP_PHOTO('A0FA'),
  'Jan-Lennard Struff':               ATP_PHOTO('S741'),
  'Gael Monfils':                     ATP_PHOTO('M610'),
  'Christopher Eubanks':              ATP_PHOTO('E0CE'),
  'Flavio Cobolli':                   ATP_PHOTO('C0FC'),
  'Denis Shapovalov':                 ATP_PHOTO('S1042'),
  'Sebastian Baez':                   ATP_PHOTO('B0SB'),
  'Tallon Griekspoor':                ATP_PHOTO('G0TG'),
  'Pablo Carreno Busta':              ATP_PHOTO('C977'),
  'Luciano Darderi':                  ATP_PHOTO('D0LD'),
  'Brandon Nakashima':                ATP_PHOTO('N0BN'),
  'Jack Draper':                      ATP_PHOTO('D0JD'),
  'Lorenzo Sonego':                   ATP_PHOTO('S0LS'),
  'Alexander Bublik':                 ATP_PHOTO('B0AB'),
  'Joao Fonseca':                     ATP_PHOTO('F0JF'),
  'Luca Nardi':                       ATP_PHOTO('N0LN'),
  'Gabriel Diallo':                   ATP_PHOTO('D0GD'),
  'Mattia Bellucci':                  ATP_PHOTO('B0MB'),
  'Hamad Medjedovic':                 ATP_PHOTO('M0HM'),
  'Corentin Moutet':                  ATP_PHOTO('M0CM'),
};

// ─── Team badge URLs ──────────────────────────────────────────────────────────
// api-football.com team IDs (well-known, high-confidence)

export const TEAM_LOGOS: Record<string, string> = {
  // ── Liga Portugal Betclic ──────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=94&season=2024
  'SL Benfica':           TEAM_CDN(211),
  'Sporting CP':          TEAM_CDN(228),
  'FC Porto':             TEAM_CDN(212),
  'SC Braga':             TEAM_CDN(217),
  'Vitória SC':           TEAM_CDN(224),
  'Gil Vicente FC':       TEAM_CDN(762),
  'Moreirense FC':        TEAM_CDN(215),
  'Rio Ave FC':           TEAM_CDN(226),
  'CD Santa Clara':       TEAM_CDN(227),
  'Estoril Praia':        TEAM_CDN(230),
  'CF Estrela Amadora':   TEAM_CDN(15130),
  'Casa Pia AC':          TEAM_CDN(4716),
  'FC Arouca':            TEAM_CDN(240),
  'CD Nacional':          TEAM_CDN(225),
  'FC Famalicão':         TEAM_CDN(242),
  'AVS':                  TEAM_CDN(21595),
  'AVS Futebol SAD':      TEAM_CDN(21595),
  'CD Tondela':           TEAM_CDN(218),
  'Alverca':              TEAM_CDN(4724),
  'Torreense':            TEAM_CDN(4729),
  'Académico de Viseu FC': TEAM_CDN(4720),
  // ── Liga Portugal 2 ───────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=95&season=2024
  'SC Farense':           TEAM_CDN(231),
  'Portimonense SC':      TEAM_CDN(216),
  'FC Paços de Ferreira': TEAM_CDN(234),
  'Académica de Coimbra': TEAM_CDN(238),
  'SL Benfica B':         TEAM_CDN(229),
  'FC Porto B':           TEAM_CDN(243),
  'Sporting CP B':        TEAM_CDN(6319),
  'Marítimo':             TEAM_CDN(214),
  'Vizela':               TEAM_CDN(810),
  'Leixões SC':           TEAM_CDN(244),
  'CD Mafra':             TEAM_CDN(245),
  'FC Penafiel':          TEAM_CDN(235),
  'UD Oliveirense':       TEAM_CDN(233),
  'Feirense':             TEAM_CDN(213),
  'Boavista FC':          TEAM_CDN(222),
  'GD Chaves':            TEAM_CDN(223),
  // ── Premier League ────────────────────────────────────────────────────────
  'Arsenal':                    TEAM_CDN(42),
  'Aston Villa':                TEAM_CDN(66),
  'AFC Bournemouth':            TEAM_CDN(35),
  'Brentford':                  TEAM_CDN(55),
  'Brighton & Hove Albion':     TEAM_CDN(51),
  'Chelsea':                    TEAM_CDN(49),
  'Crystal Palace':             TEAM_CDN(52),
  'Everton':                    TEAM_CDN(45),
  'Fulham':                     TEAM_CDN(36),

  'Liverpool':                  TEAM_CDN(40),
  'Manchester City':            TEAM_CDN(50),
  'Manchester United':          TEAM_CDN(33),
  'Newcastle United':           TEAM_CDN(34),
  'Nottingham Forest':          TEAM_CDN(65),
  'Tottenham Hotspur':          TEAM_CDN(47),
  'West Ham United':            TEAM_CDN(48),
  'Wolverhampton Wanderers':    TEAM_CDN(39),
  'Leeds United':               TEAM_CDN(63),
  'Burnley':                    TEAM_CDN(44),
  'Sunderland':                 TEAM_CDN(746),
  // ── Championship ──────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=40&season=2024
  'Sheffield United':       TEAM_CDN(62),
  'Leicester City':         TEAM_CDN(46),
  'Ipswich Town':           TEAM_CDN(57),
  'Southampton':            TEAM_CDN(41),
  'Norwich City':           TEAM_CDN(71),
  'West Bromwich Albion':   TEAM_CDN(60),
  'Middlesbrough':          TEAM_CDN(70),
  'Coventry City':          TEAM_CDN(1346),
  'Bristol City':           TEAM_CDN(56),
  'Watford':                TEAM_CDN(38),
  'Millwall':               TEAM_CDN(58),
  'Stoke City':             TEAM_CDN(75),
  'Swansea City':           TEAM_CDN(76),
  'Queens Park Rangers':    TEAM_CDN(72),
  'Hull City':              TEAM_CDN(64),
  'Blackburn Rovers':       TEAM_CDN(67),
  'Cardiff City':           TEAM_CDN(43),
  // ── La Liga ───────────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=140&season=2024
  'Real Madrid':            TEAM_CDN(541),
  'FC Barcelona':           TEAM_CDN(529),
  'Atlético Madrid':        TEAM_CDN(530),
  'Real Sociedad':          TEAM_CDN(548),
  'Real Betis':             TEAM_CDN(543),
  'Villarreal CF':          TEAM_CDN(533),
  'Athletic Bilbao':        TEAM_CDN(531),
  'Girona FC':              TEAM_CDN(547),
  'Valencia CF':            TEAM_CDN(532),
  'Sevilla FC':             TEAM_CDN(536),
  'Celta de Vigo':          TEAM_CDN(538),
  'CA Osasuna':             TEAM_CDN(727),
  'Getafe CF':              TEAM_CDN(546),
  'RCD Mallorca':           TEAM_CDN(798),
  'Rayo Vallecano':         TEAM_CDN(728),
  'Deportivo Alavés':       TEAM_CDN(542),
  'Levante UD':             TEAM_CDN(539),
  'Elche CF':               TEAM_CDN(797),
  'Real Oviedo':            TEAM_CDN(718),
  // ── La Liga 2 ─────────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=141&season=2024
  'Real Valladolid':        TEAM_CDN(720),
  'UD Las Palmas':          TEAM_CDN(534),
  'Leganés':                TEAM_CDN(537),
  'Eibar':                  TEAM_CDN(545),
  'Zaragoza':               TEAM_CDN(732),
  'Real Zaragoza':          TEAM_CDN(732),
  'Sporting de Gijón':      TEAM_CDN(723),
  'Racing de Santander':    TEAM_CDN(727),
  'Huesca':                 TEAM_CDN(724),
  'Tenerife':               TEAM_CDN(731),
  'Cartagena':              TEAM_CDN(1362),
  'Mirandés':               TEAM_CDN(1361),
  'Albacete':               TEAM_CDN(726),
  // ── Serie A ───────────────────────────────────────────────────────────────
  'Inter Milan':            TEAM_CDN(505),
  'AC Milan':               TEAM_CDN(489),
  'Juventus':               TEAM_CDN(496),
  'SSC Napoli':             TEAM_CDN(492),
  'AS Roma':                TEAM_CDN(497),
  'SS Lazio':               TEAM_CDN(487),
  'Atalanta BC':            TEAM_CDN(499),
  'ACF Fiorentina':         TEAM_CDN(502),
  'Bologna FC':             TEAM_CDN(500),
  'Torino FC':              TEAM_CDN(503),
  'Udinese Calcio':         TEAM_CDN(494),
  'Genoa CFC':              TEAM_CDN(495),
  'Cagliari':               TEAM_CDN(490),
  'Hellas Verona':          TEAM_CDN(504),
  'Sassuolo':               TEAM_CDN(488),
  'Pisa SC':                TEAM_CDN(801),
  'Cremonese':              TEAM_CDN(520),
  'Lecce':                  TEAM_CDN(867),
  'Parma Calcio':           TEAM_CDN(491),
  'Como 1907':              TEAM_CDN(1570),
  // ── Bundesliga ────────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=78&season=2024
  'Bayern München':         TEAM_CDN(157),
  'Borussia Dortmund':      TEAM_CDN(165),
  'RB Leipzig':             TEAM_CDN(173),
  'Bayer Leverkusen':       TEAM_CDN(168),
  'VfB Stuttgart':          TEAM_CDN(172),
  'Eintracht Frankfurt':    TEAM_CDN(169),
  'VfL Wolfsburg':          TEAM_CDN(161),
  'SC Freiburg':            TEAM_CDN(160),
  'TSG Hoffenheim':         TEAM_CDN(167),
  '1. FC Union Berlin':     TEAM_CDN(182),
  'Borussia Mönchengladbach': TEAM_CDN(163),
  'Werder Bremen':          TEAM_CDN(162),
  'FC Augsburg':            TEAM_CDN(170),
  '1. FSV Mainz 05':        TEAM_CDN(164),
  '1. FC Heidenheim':       TEAM_CDN(180),
  'FC Köln':                TEAM_CDN(192),
  'Hamburger SV':           TEAM_CDN(175),
  'FC St. Pauli':           TEAM_CDN(186),
  // ── 2. Bundesliga ─────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=79&season=2024
  'VfL Bochum':             TEAM_CDN(176),
  'Fortuna Düsseldorf':     TEAM_CDN(158),
  'Hannover 96':            TEAM_CDN(166),
  'FC Schalke 04':          TEAM_CDN(174),
  'Hertha BSC':             TEAM_CDN(159),
  'SV Darmstadt 98':        TEAM_CDN(181),
  'Holstein Kiel':          TEAM_CDN(811),
  'Karlsruher SC':          TEAM_CDN(184),
  'SC Paderborn':           TEAM_CDN(1320),
  // ── Ligue 1 ──────────────────────────────────────────────────────────────
  'Paris Saint-Germain':    TEAM_CDN(85),
  'Olympique de Marseille': TEAM_CDN(81),
  'AS Monaco':              TEAM_CDN(91),
  'LOSC Lille':             TEAM_CDN(79),
  'Olympique Lyonnais':     TEAM_CDN(80),
  'OGC Nice':               TEAM_CDN(84),
  'RC Lens':                TEAM_CDN(116),
  'Stade Rennais':          TEAM_CDN(94),
  'Stade Brestois':         TEAM_CDN(106),
  'Toulouse FC':            TEAM_CDN(96),
  'Nantes':                 TEAM_CDN(83),
  'RC Strasbourg':          TEAM_CDN(95),
  'FC Lorient':             TEAM_CDN(97),
  'Paris FC':               TEAM_CDN(114),
  'FC Metz':                TEAM_CDN(112),
  'Le Havre AC':            TEAM_CDN(1015),
  'AJ Auxerre':             TEAM_CDN(1024),
  'Angers SCO':             TEAM_CDN(1026),
  // ── Ligue 2 ──────────────────────────────────────────────────────────────
  'Stade de Reims':         TEAM_CDN(93),
  'SC Bastia':              TEAM_CDN(1019),
  'SM Caen':                TEAM_CDN(1018),
  // ── Eredivisie ────────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=88&season=2024
  'Ajax':                   TEAM_CDN(194),
  'PSV Eindhoven':          TEAM_CDN(197),
  'Feyenoord':              TEAM_CDN(209),
  'AZ Alkmaar':             TEAM_CDN(201),
  'FC Twente':              TEAM_CDN(415),
  'FC Utrecht':             TEAM_CDN(207),
  'SC Heerenveen':          TEAM_CDN(210),
  'Sparta Rotterdam':       TEAM_CDN(426),
  'Vitesse':                TEAM_CDN(200),
  'NEC Nijmegen':           TEAM_CDN(202),
  'Go Ahead Eagles':        TEAM_CDN(416),
  'Fortuna Sittard':        TEAM_CDN(413),
  // ── Jupiler Pro League ────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=144&season=2024
  'Club Brugge':            TEAM_CDN(569),
  'RSC Anderlecht':         TEAM_CDN(554),
  'KRC Genk':               TEAM_CDN(742),
  'KAA Gent':               TEAM_CDN(631),
  'Royal Antwerp FC':       TEAM_CDN(740),
  'Standard Liège':         TEAM_CDN(733),
  'Cercle Brugge':          TEAM_CDN(741),
  'Royale Union SG':        TEAM_CDN(764),
  'OH Leuven':              TEAM_CDN(4346),
  'Sint-Truiden':           TEAM_CDN(734),
  'Charleroi':              TEAM_CDN(738),
  'Westerlo':               TEAM_CDN(750),
  'KV Mechelen':            TEAM_CDN(755),
  'KV Kortrijk':            TEAM_CDN(745),
  // ── Süper Lig ─────────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=203&season=2024
  'Galatasaray':            TEAM_CDN(645),
  'Fenerbahçe':             TEAM_CDN(611),
  'Beşiktaş':              TEAM_CDN(549),
  'Trabzonspor':            TEAM_CDN(998),
  'İstanbul Başakşehir':   TEAM_CDN(564),
  'Adana Demirspor':        TEAM_CDN(2072),
  'Antalyaspor':            TEAM_CDN(609),
  'Konyaspor':              TEAM_CDN(2073),
  'Kayserispor':            TEAM_CDN(614),
  'Sivasspor':              TEAM_CDN(641),
  'Samsunspor':             TEAM_CDN(636),
  // ── Scottish ──────────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=179&season=2024
  'Celtic':                 TEAM_CDN(247),
  'Rangers':                TEAM_CDN(257),
  'Aberdeen':               TEAM_CDN(252),
  'Hibernian':              TEAM_CDN(249),
  'Heart of Midlothian':    TEAM_CDN(254),
  'Falkirk':                TEAM_CDN(1389),
  'Livingston':             TEAM_CDN(255),
  'Dundee United':          TEAM_CDN(246),
  'Dundee FC':              TEAM_CDN(248),
  'Kilmarnock':             TEAM_CDN(250),
  'Motherwell':             TEAM_CDN(251),
  'St Mirren':              TEAM_CDN(256),
  // ── Austrian Bundesliga ───────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=218&season=2024
  'Red Bull Salzburg':      TEAM_CDN(571),
  'SK Sturm Graz':          TEAM_CDN(637),
  'SK Rapid Wien':          TEAM_CDN(781),
  'Austria Wien':           TEAM_CDN(601),
  'LASK':                   TEAM_CDN(785),
  'Wolfsberger AC':         TEAM_CDN(787),
  'TSV Hartberg':           TEAM_CDN(793),
  'SCR Altach':             TEAM_CDN(790),
  // ── Super League (Suíça) ─────────────────────────────────────────────────
  'BSC Young Boys':         TEAM_CDN(1367),
  'FC Basel':               TEAM_CDN(1368),
  'FC Zürich':              TEAM_CDN(1376),
  'FC Lugano':              TEAM_CDN(1381),
  'Servette FC':            TEAM_CDN(1375),
  'FC St. Gallen':          TEAM_CDN(1374),
  'FC Luzern':              TEAM_CDN(1373),
  'Grasshopper Club':       TEAM_CDN(1369),
  // ── Greek Super League ────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=197&season=2024
  'Olympiacos':             TEAM_CDN(553),
  'PAOK':                   TEAM_CDN(619),
  'AEK Athens':             TEAM_CDN(575),
  'Panathinaikos':          TEAM_CDN(617),
  'Aris Thessaloniki':      TEAM_CDN(616),
  'OFI Crete':              TEAM_CDN(622),
  'Asteras Tripolis':       TEAM_CDN(620),
  // ── Brasileirão ───────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=71&season=2024
  'Flamengo':               TEAM_CDN(127),
  'Palmeiras':              TEAM_CDN(121),
  'Grêmio':                 TEAM_CDN(130),
  'Atlético Mineiro':       TEAM_CDN(1062),
  'Botafogo':               TEAM_CDN(120),
  'São Paulo FC':           TEAM_CDN(126),
  'Internacional':          TEAM_CDN(119),
  'Corinthians':            TEAM_CDN(131),
  'Cruzeiro':               TEAM_CDN(135),
  'Bahia':                  TEAM_CDN(118),
  'Fortaleza':              TEAM_CDN(154),
  'Santos':                 TEAM_CDN(128),
  'Vasco da Gama':          TEAM_CDN(133),
  'Fluminense':             TEAM_CDN(124),
  'Vitória':                TEAM_CDN(129),
  'Red Bull Bragantino':    TEAM_CDN(10307),
  'Ceará':                  TEAM_CDN(143),
  'Juventude':              TEAM_CDN(136),
  'Sport Recife':           TEAM_CDN(150),
  'Mirassol':               TEAM_CDN(20244),
  // ── Liga Profesional Argentina ────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=128&season=2024
  'River Plate':            TEAM_CDN(435),
  'Boca Juniors':           TEAM_CDN(451),
  'Racing Club':            TEAM_CDN(436),
  'Independiente':          TEAM_CDN(453),
  'San Lorenzo':            TEAM_CDN(460),
  'Vélez Sarsfield':        TEAM_CDN(438),
  'Estudiantes':            TEAM_CDN(450),
  'Lanús':                  TEAM_CDN(443),
  'Talleres':               TEAM_CDN(463),
  'Godoy Cruz':             TEAM_CDN(455),
  'Argentinos Juniors':     TEAM_CDN(470),
  'Huracán':                TEAM_CDN(471),
  'Belgrano':               TEAM_CDN(465),
  'Rosario Central':        TEAM_CDN(432),
  "Newell's Old Boys":      TEAM_CDN(446),
  'Colón':                  TEAM_CDN(437),
  // ── MLS ───────────────────────────────────────────────────────────────────
  // IDs verified via API-Football /teams?league=253&season=2024
  'Inter Miami CF':         TEAM_CDN(9568),
  'LAFC':                   TEAM_CDN(1616),
  'LA Galaxy':              TEAM_CDN(1605),
  'Columbus Crew':          TEAM_CDN(1613),
  'Nashville SC':           TEAM_CDN(9569),
  'Atlanta United':         TEAM_CDN(1608),
  'Seattle Sounders':       TEAM_CDN(1595),
  'Portland Timbers':       TEAM_CDN(1617),
  'Philadelphia Union':     TEAM_CDN(1597),
  'FC Cincinnati':          TEAM_CDN(1604),
  'New York Red Bulls':     TEAM_CDN(1606),
  // ── Basketball ────────────────────────────────────────────────────────────
  // NBA teams — ESPN CDN: https://a.espncdn.com/i/teamlogos/nba/500/{abbrev}.png
  'Boston Celtics':              'https://a.espncdn.com/i/teamlogos/nba/500/bos.png',
  'Brooklyn Nets':               'https://a.espncdn.com/i/teamlogos/nba/500/bkn.png',
  'New York Knicks':             'https://a.espncdn.com/i/teamlogos/nba/500/ny.png',
  'Philadelphia 76ers':          'https://a.espncdn.com/i/teamlogos/nba/500/phi.png',
  'Toronto Raptors':             'https://a.espncdn.com/i/teamlogos/nba/500/tor.png',
  'Chicago Bulls':               'https://a.espncdn.com/i/teamlogos/nba/500/chi.png',
  'Cleveland Cavaliers':         'https://a.espncdn.com/i/teamlogos/nba/500/cle.png',
  'Detroit Pistons':             'https://a.espncdn.com/i/teamlogos/nba/500/det.png',
  'Indiana Pacers':              'https://a.espncdn.com/i/teamlogos/nba/500/ind.png',
  'Milwaukee Bucks':             'https://a.espncdn.com/i/teamlogos/nba/500/mil.png',
  'Atlanta Hawks':               'https://a.espncdn.com/i/teamlogos/nba/500/atl.png',
  'Charlotte Hornets':           'https://a.espncdn.com/i/teamlogos/nba/500/cha.png',
  'Miami Heat':                  'https://a.espncdn.com/i/teamlogos/nba/500/mia.png',
  'Orlando Magic':               'https://a.espncdn.com/i/teamlogos/nba/500/orl.png',
  'Washington Wizards':          'https://a.espncdn.com/i/teamlogos/nba/500/wsh.png',
  'Denver Nuggets':              'https://a.espncdn.com/i/teamlogos/nba/500/den.png',
  'Minnesota Timberwolves':      'https://a.espncdn.com/i/teamlogos/nba/500/min.png',
  'Oklahoma City Thunder':       'https://a.espncdn.com/i/teamlogos/nba/500/okc.png',
  'Portland Trail Blazers':      'https://a.espncdn.com/i/teamlogos/nba/500/por.png',
  'Utah Jazz':                   'https://a.espncdn.com/i/teamlogos/nba/500/utah.png',
  'Golden State Warriors':       'https://a.espncdn.com/i/teamlogos/nba/500/gs.png',
  'LA Clippers':                 'https://a.espncdn.com/i/teamlogos/nba/500/lac.png',
  'Los Angeles Lakers':          'https://a.espncdn.com/i/teamlogos/nba/500/lal.png',
  'Phoenix Suns':                'https://a.espncdn.com/i/teamlogos/nba/500/phx.png',
  'Sacramento Kings':            'https://a.espncdn.com/i/teamlogos/nba/500/sac.png',
  'Dallas Mavericks':            'https://a.espncdn.com/i/teamlogos/nba/500/dal.png',
  'Houston Rockets':             'https://a.espncdn.com/i/teamlogos/nba/500/hou.png',
  'Memphis Grizzlies':           'https://a.espncdn.com/i/teamlogos/nba/500/mem.png',
  'New Orleans Pelicans':        'https://a.espncdn.com/i/teamlogos/nba/500/no.png',
  'San Antonio Spurs':           'https://a.espncdn.com/i/teamlogos/nba/500/sa.png',
  // EuroLeague
  'SL Benfica Basquetebol': TEAM_CDN(211), // reuse football badge as fallback
  'Sporting CP Basquetebol': TEAM_CDN(228),
  'Real Madrid Baloncesto': TEAM_CDN(541),
  'FC Barcelona Basquet':   TEAM_CDN(529),
  'Olympiacos BC':          TEAM_CDN(611),
  'Fenerbahçe Beko':        TEAM_CDN(356),
};

// ─── Betting sites ────────────────────────────────────────────────────────────

// Local logo assets (require() at build time)
const SITE_LOGOS: Record<string, ImageSourcePropType> = {
  betclic:  require('../assets/logos/betclic.png'),
  placard:  require('../assets/logos/placard.png'),
  betano:   require('../assets/logos/betano.png'),
  solverde: require('../assets/logos/solverde.png'),
  // Remote logos via Google favicon service (reliable, 128×128 PNG)
  bet365:    { uri: 'https://www.google.com/s2/favicons?domain=bet365.com&sz=128' },
  esconline: { uri: 'https://www.google.com/s2/favicons?domain=esconline.pt&sz=128' },
  moosh:     { uri: 'https://www.google.com/s2/favicons?domain=moosh.pt&sz=128' },
  betway:    { uri: 'https://www.google.com/s2/favicons?domain=betway.com&sz=128' },
  '888sport':{ uri: 'https://www.google.com/s2/favicons?domain=888sport.com&sz=128' },
  bwin:      { uri: 'https://www.google.com/s2/favicons?domain=bwin.com&sz=128' },
  lebull:    { uri: 'https://www.google.com/s2/favicons?domain=lebull.pt&sz=128' },
};

export interface BettingSite {
  slug: string;
  name: string;
  logo?: ImageSourcePropType;
}

/** Priority order for competition sections (Portuguese country names from seed). */
export const COMPETITION_COUNTRY_ORDER: string[] = [
  'Portugal', 'Inglaterra', 'Espanha', 'Itália', 'Alemanha', 'França',
  'Internacional', 'Holanda', 'Bélgica', 'Escócia', 'Turquia',
  'Brasil', 'Argentina', 'EUA', 'Austrália', 'Áustria', 'Suíça', 'Grécia',
  'Canadá', 'Mónaco', 'México', 'Chile', 'China', 'Japão', 'Nova Zelândia',
  'Emirados Árabes Unidos', 'Qatar', 'Croácia', 'Cazaquistão', 'Suécia',
];

export const BETTING_SITES: BettingSite[] = [
  { slug: 'betclic',    name: 'Betclic',    logo: SITE_LOGOS.betclic },
  { slug: 'placard',   name: 'Placard',    logo: SITE_LOGOS.placard },
  { slug: 'bet365',    name: 'Bet365',     logo: SITE_LOGOS.bet365 },
  { slug: 'esconline', name: 'ESC Online', logo: SITE_LOGOS.esconline },
  { slug: 'moosh',     name: 'Moosh',      logo: SITE_LOGOS.moosh },
  { slug: 'solverde',  name: 'Solverde',   logo: SITE_LOGOS.solverde },
  { slug: 'betway',    name: 'Betway',     logo: SITE_LOGOS.betway },
  { slug: '888sport',  name: '888sport',   logo: SITE_LOGOS['888sport'] },
  { slug: 'betano',    name: 'Betano',     logo: SITE_LOGOS.betano },
  { slug: 'bwin',      name: 'Bwin',       logo: SITE_LOGOS.bwin },
  { slug: 'lebull',    name: 'Lebull',     logo: SITE_LOGOS.lebull },
];

export interface CompetitionBranding {
  label: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
}

const TENNIS_BADGE_LABELS: Record<string, string> = {
  'Australian Open': 'AO',
  'Roland Garros': 'RG',
  Wimbledon: 'W',
  'US Open': 'US',
  'ATP Finals': 'ATP',
  'Davis Cup': 'DC',
  'ATP Tour': 'ATP',
  'WTA Tour': 'WTA',
  'Indian Wells Masters': 'IW',
  'Miami Open': 'MIA',
  'Monte-Carlo Masters': 'MC',
  'Madrid Open': 'MAD',
  'Italian Open (Roma)': 'ROMA',
  'Canadian Open': 'CAN',
  'Cincinnati Masters': 'CIN',
  'Shanghai Masters': 'SHA',
  'Paris Masters': 'PAR',
  'Dubai Duty Free Championships': 'DXB',
  'Qatar Open (Doha)': 'DOH',
  'Acapulco Open': 'ACA',
  'Barcelona Open': 'BCN',
  'Halle Open': 'HAL',
  "Queen's Club Championships": 'QNS',
  'Hamburg Open': 'HAM',
  'Vienna Open': 'VIE',
  'Basel Indoor': 'BSL',
  'Tokyo Open': 'TYO',
  'Beijing Open': 'BJN',
  'Brisbane International': 'BNE',
  'Auckland Open': 'AKL',
  'Sydney Tennis Classic': 'SYD',
  'Marseille Open': 'MRS',
  'Buenos Aires Open': 'BA',
  'Rio Open': 'RIO',
  'Santiago Open': 'SCL',
  'Estoril Open': 'EST',
  'Geneva Open': 'GEN',
  'Lyon Open': 'LYN',
  'Stuttgart Open': 'STU',
  'Eastbourne International': 'EAS',
  'Newport Open': 'NPT',
  'Umag Open': 'UMA',
  'Gstaad Open': 'GST',
  'Kitzbühel Open': 'KIT',
  'Los Cabos Open': 'CAB',
  'Atlanta Open': 'ATL',
  'Winston-Salem Open': 'WS',
  'Chengdu Open': 'CDU',
  'Hangzhou Open': 'HGH',
  'Astana Open': 'AST',
  'Antwerp Open': 'ANT',
  'Stockholm Open': 'STH',
  'Metz Open': 'MET',
  'Santiago Indoor': 'SI',
};

function getTennisBadgePalette(points: number): Omit<CompetitionBranding, 'label'> {
  if (points >= 2000) {
    return { backgroundColor: '#0B3954', textColor: '#FDF0D5', borderColor: '#D4AF37' };
  }
  if (points >= 1500) {
    return { backgroundColor: '#264653', textColor: '#FDF0D5', borderColor: '#F4A261' };
  }
  if (points >= 1000) {
    return { backgroundColor: '#1D3557', textColor: '#FFFFFF', borderColor: '#6CCFF6' };
  }
  if (points >= 500) {
    return { backgroundColor: '#6F1D1B', textColor: '#FFF4E6', borderColor: '#F7B538' };
  }
  return { backgroundColor: '#3A5A40', textColor: '#F1FAEE', borderColor: '#A3B18A' };
}

/** Returns a branded fallback badge for tennis competitions without an explicit image logo. */
export function getCompetitionBranding(competitionName: string): CompetitionBranding | null {
  if (!isTennisTournament(competitionName)) {
    return null;
  }

  return {
    label: TENNIS_BADGE_LABELS[competitionName] ?? competitionName.slice(0, 3).toUpperCase(),
    ...getTennisBadgePalette(getTennisTournamentPoints(competitionName)),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the badge URL for a team, or null if not mapped. */
/** Returns the badge/crest URL for a team or player photo, or null if not mapped. */
export function getTeamLogoUrl(teamName: string): string | null {
  return TEAM_LOGOS[teamName] ?? PLAYER_PHOTOS[teamName] ?? null;
}

/** Returns the ATP/WTA player headshot URL, or null if not mapped. */
export function getPlayerPhotoUrl(playerName: string): string | null {
  return PLAYER_PHOTOS[playerName] ?? null;
}

/** Returns the league logo URL, or null if not mapped. */
export function getLeagueLogoUrl(leagueName: string): string | null {
  return LEAGUE_LOGOS[leagueName] ?? getSofascoreTournamentLogoUrl(leagueName) ?? null;
}

/** Returns the flag emoji for a country name (Portuguese), or '🏴' if unknown. */
export function getCountryFlagEmoji(countryName: string): string {
  return COUNTRY_FLAG_EMOJI[countryName] ?? '🏴';
}

/** Returns the flag image URL from flagcdn.com for a country, or null if unknown. */
export function getCountryFlagUrl(countryName: string): string | null {
  return COUNTRY_FLAGS[countryName] ?? null;
}
