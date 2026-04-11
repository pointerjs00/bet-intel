const TOUR_PLAYER_CSV_URL = {
  atp: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv',
  wta: 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_players.csv',
} as const;

type TennisTour = keyof typeof TOUR_PLAYER_CSV_URL;

export const TENNIS_COUNTRY_CODE_TO_NAME: Record<string, string> = {
  arg: 'Argentina',
  aus: 'Austrália',
  aut: 'Áustria',
  aze: 'Azerbaijão',
  bel: 'Bélgica',
  bih: 'Bósnia e Herzegovina',
  blr: 'Bielorrússia',
  bol: 'Bolívia',
  bra: 'Brasil',
  bul: 'Bulgária',
  can: 'Canadá',
  che: 'Suíça',
  chi: 'Chile',
  chl: 'Chile',
  chn: 'China',
  civ: 'Costa do Marfim',
  col: 'Colômbia',
  cro: 'Croácia',
  cze: 'Chéquia',
  den: 'Dinamarca',
  deu: 'Alemanha',
  dnk: 'Dinamarca',
  ecu: 'Equador',
  egy: 'Egito',
  esp: 'Espanha',
  est: 'Estónia',
  fin: 'Finlândia',
  fra: 'França',
  gbr: 'Inglaterra',
  geo: 'Geórgia',
  ger: 'Alemanha',
  grc: 'Grécia',
  gre: 'Grécia',
  hkg: 'Hong Kong',
  hrv: 'Croácia',
  hun: 'Hungria',
  idn: 'Indonésia',
  ina: 'Indonésia',
  ind: 'Índia',
  iri: 'Irão',
  irl: 'Irlanda',
  irn: 'Irão',
  isr: 'Israel',
  ita: 'Itália',
  jam: 'Jamaica',
  jor: 'Jordânia',
  jpn: 'Japão',
  kaz: 'Cazaquistão',
  kor: 'Coreia do Sul',
  lat: 'Letónia',
  lbn: 'Líbano',
  lib: 'Líbano',
  ltu: 'Lituânia',
  lux: 'Luxemburgo',
  mar: 'Marrocos',
  mda: 'Moldávia',
  mex: 'México',
  mon: 'Mónaco',
  ned: 'Holanda',
  nld: 'Holanda',
  nor: 'Noruega',
  nzl: 'Nova Zelândia',
  par: 'Paraguai',
  per: 'Peru',
  phi: 'Filipinas',
  phl: 'Filipinas',
  pol: 'Polónia',
  por: 'Portugal',
  rou: 'Roménia',
  rsa: 'África do Sul',
  rus: 'Rússia',
  slo: 'Eslovénia',
  srb: 'Sérvia',
  sui: 'Suíça',
  svn: 'Eslovénia',
  svk: 'Eslováquia',
  swe: 'Suécia',
  tha: 'Tailândia',
  tpe: 'Taiwan',
  tun: 'Tunísia',
  tur: 'Turquia',
  twn: 'Taiwan',
  ukr: 'Ucrânia',
  uru: 'Uruguai',
  usa: 'EUA',
  uzb: 'Uzbequistão',
};

export function getTennisCountryFromCode(code?: string | null): string | null {
  if (!code) return null;
  return TENNIS_COUNTRY_CODE_TO_NAME[code.trim().toLowerCase()] ?? null;
}

function normalizePlayerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'’_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const playerCountryCache: Partial<Record<TennisTour, Promise<Map<string, string>>>> = {};

async function fetchCountryBackfillMap(tour: TennisTour): Promise<Map<string, string>> {
  if (!playerCountryCache[tour]) {
    playerCountryCache[tour] = (async () => {
      const res = await fetch(TOUR_PLAYER_CSV_URL[tour], { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        throw new Error(`${tour.toUpperCase()} player CSV HTTP ${res.status}`);
      }

      const csv = await res.text();
      const lines = csv.trim().split(/\r?\n/);
      const byName = new Map<string, string>();

      for (const line of lines.slice(1)) {
        const parts = line.split(',');
        if (parts.length < 6) continue;

        const [, firstName, lastName, , , countryCode] = parts;
        if (!firstName?.trim() || !lastName?.trim()) continue;

        const country = getTennisCountryFromCode(countryCode) ?? (countryCode?.trim() || null);
        if (!country) continue;

        byName.set(normalizePlayerName(`${firstName.trim()} ${lastName.trim()}`), country);
      }

      return byName;
    })();
  }

  return playerCountryCache[tour]!;
}

export async function backfillMissingPlayerCountries<T extends {
  name: string;
  displayName: string | null;
  country: string | null;
}>(players: T[], tour: TennisTour): Promise<T[]> {
  if (players.every((player) => Boolean(player.country))) {
    return players;
  }

  const countryByName = await fetchCountryBackfillMap(tour);

  return players.map((player) => {
    if (player.country) {
      return player;
    }

    const lookupName = normalizePlayerName(player.displayName ?? player.name);
    const country = countryByName.get(lookupName) ?? null;
    return country ? { ...player, country } : player;
  });
}