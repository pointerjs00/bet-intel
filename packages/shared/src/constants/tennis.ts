/**
 * Shared tennis reference metadata used to order tournaments and countries
 * consistently across the API and mobile app.
 */

export interface TennisTournamentMetadata {
  country: string;
  points: number;
}

/**
 * Countries ordered by tennis prestige/history first.
 * Tournament points are applied as a secondary sort key at runtime.
 */
export const TENNIS_COUNTRY_PRESTIGE_ORDER: string[] = [
  'Inglaterra',
  'França',
  'Austrália',
  'EUA',
  'Itália',
  'Espanha',
  'Alemanha',
  'Suíça',
  'Mónaco',
  'Canadá',
  'Áustria',
  'Portugal',
  'Suécia',
  'Argentina',
  'Brasil',
  'Bélgica',
  'Japão',
  'China',
  'México',
  'Chile',
  'Croácia',
  'Emirados Árabes Unidos',
  'Qatar',
  'Nova Zelândia',
  'Cazaquistão',
  'Internacional',
];

export const TENNIS_TOURNAMENTS: Record<string, TennisTournamentMetadata> = {
  'Australian Open': { country: 'Austrália', points: 2000 },
  'Roland Garros': { country: 'França', points: 2000 },
  Wimbledon: { country: 'Inglaterra', points: 2000 },
  'US Open': { country: 'EUA', points: 2000 },
  'ATP Finals': { country: 'Itália', points: 1500 },
  'Davis Cup': { country: 'Internacional', points: 0 },
  'ATP Tour': { country: 'Internacional', points: 0 },
  'WTA Tour': { country: 'Internacional', points: 0 },
  'Indian Wells Masters': { country: 'EUA', points: 1000 },
  'Miami Open': { country: 'EUA', points: 1000 },
  'Monte-Carlo Masters': { country: 'Mónaco', points: 1000 },
  'Madrid Open': { country: 'Espanha', points: 1000 },
  'Italian Open (Roma)': { country: 'Itália', points: 1000 },
  'Canadian Open': { country: 'Canadá', points: 1000 },
  'Cincinnati Masters': { country: 'EUA', points: 1000 },
  'Shanghai Masters': { country: 'China', points: 1000 },
  'Paris Masters': { country: 'França', points: 1000 },
  'Dubai Duty Free Championships': { country: 'Emirados Árabes Unidos', points: 500 },
  'Qatar Open (Doha)': { country: 'Qatar', points: 500 },
  'Acapulco Open': { country: 'México', points: 500 },
  'Barcelona Open': { country: 'Espanha', points: 500 },
  'Halle Open': { country: 'Alemanha', points: 500 },
  "Queen's Club Championships": { country: 'Inglaterra', points: 500 },
  'Hamburg Open': { country: 'Alemanha', points: 500 },
  'Vienna Open': { country: 'Áustria', points: 500 },
  'Basel Indoor': { country: 'Suíça', points: 500 },
  'Tokyo Open': { country: 'Japão', points: 500 },
  'Beijing Open': { country: 'China', points: 500 },
  'Brisbane International': { country: 'Austrália', points: 250 },
  'Auckland Open': { country: 'Nova Zelândia', points: 250 },
  'Sydney Tennis Classic': { country: 'Austrália', points: 250 },
  'Marseille Open': { country: 'França', points: 250 },
  'Buenos Aires Open': { country: 'Argentina', points: 250 },
  'Rio Open': { country: 'Brasil', points: 500 },
  'Santiago Open': { country: 'Chile', points: 250 },
  'Estoril Open': { country: 'Portugal', points: 250 },
  'Geneva Open': { country: 'Suíça', points: 250 },
  'Lyon Open': { country: 'França', points: 250 },
  'Stuttgart Open': { country: 'Alemanha', points: 250 },
  'Eastbourne International': { country: 'Inglaterra', points: 250 },
  'Newport Open': { country: 'EUA', points: 250 },
  'Umag Open': { country: 'Croácia', points: 250 },
  'Gstaad Open': { country: 'Suíça', points: 250 },
  'Kitzbühel Open': { country: 'Áustria', points: 250 },
  'Los Cabos Open': { country: 'México', points: 250 },
  'Atlanta Open': { country: 'EUA', points: 250 },
  'Winston-Salem Open': { country: 'EUA', points: 250 },
  'Chengdu Open': { country: 'China', points: 250 },
  'Hangzhou Open': { country: 'China', points: 250 },
  'Astana Open': { country: 'Cazaquistão', points: 250 },
  'Antwerp Open': { country: 'Bélgica', points: 250 },
  'Stockholm Open': { country: 'Suécia', points: 250 },
  'Metz Open': { country: 'França', points: 250 },
  'Santiago Indoor': { country: 'Chile', points: 250 },
};

/** Returns true when the competition is part of the tennis reference catalogue. */
export function isTennisTournament(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(TENNIS_TOURNAMENTS, name);
}

/** Returns tennis metadata for a competition or null when the name is unknown. */
export function getTennisTournamentMetadata(name: string): TennisTournamentMetadata | null {
  return TENNIS_TOURNAMENTS[name] ?? null;
}

/** Returns the canonical host country for a tennis competition. */
export function getTennisTournamentCountry(name: string, fallbackCountry = 'Internacional'): string {
  return TENNIS_TOURNAMENTS[name]?.country ?? fallbackCountry;
}

/** Returns the ranking points awarded by the tennis competition. */
export function getTennisTournamentPoints(name: string): number {
  return TENNIS_TOURNAMENTS[name]?.points ?? 0;
}

/** Returns a numeric prestige score derived from the country order list. */
export function getTennisCountryPrestige(country: string): number {
  const index = TENNIS_COUNTRY_PRESTIGE_ORDER.indexOf(country);
  return index === -1 ? 0 : TENNIS_COUNTRY_PRESTIGE_ORDER.length - index;
}

/**
 * Sorts tennis countries by prestige/history first and by total tournament
 * points second.
 */
export function compareTennisCountries(
  leftCountry: string,
  rightCountry: string,
  countryPoints: Map<string, number> | Record<string, number>,
): number {
  const leftPrestige = getTennisCountryPrestige(leftCountry);
  const rightPrestige = getTennisCountryPrestige(rightCountry);
  if (leftPrestige !== rightPrestige) {
    return rightPrestige - leftPrestige;
  }

  const leftPoints = countryPoints instanceof Map
    ? (countryPoints.get(leftCountry) ?? 0)
    : (countryPoints[leftCountry] ?? 0);
  const rightPoints = countryPoints instanceof Map
    ? (countryPoints.get(rightCountry) ?? 0)
    : (countryPoints[rightCountry] ?? 0);
  if (leftPoints !== rightPoints) {
    return rightPoints - leftPoints;
  }

  return leftCountry.localeCompare(rightCountry, 'pt-PT');
}

/** Sorts tennis tournaments by points descending, then tier ascending, then name. */
export function compareTennisCompetitions(
  left: { name: string; tier?: number | null; points?: number | null },
  right: { name: string; tier?: number | null; points?: number | null },
): number {
  const leftPoints = left.points ?? getTennisTournamentPoints(left.name);
  const rightPoints = right.points ?? getTennisTournamentPoints(right.name);
  if (leftPoints !== rightPoints) {
    return rightPoints - leftPoints;
  }

  const leftTier = left.tier ?? Number.MAX_SAFE_INTEGER;
  const rightTier = right.tier ?? Number.MAX_SAFE_INTEGER;
  if (leftTier !== rightTier) {
    return leftTier - rightTier;
  }

  return left.name.localeCompare(right.name, 'pt-PT');
}