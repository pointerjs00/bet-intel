// National teams: ESPN (English) ↔ the Portuguese names bookmakers and the app use.
// Used to translate ESPN names for display and to match boletim selections during settlement.

/** English (as ESPN writes it) → Portuguese (PT-PT). */
export const COUNTRY_EN_TO_PT: Record<string, string> = {
  Portugal: 'Portugal', Spain: 'Espanha', France: 'França', Germany: 'Alemanha', Italy: 'Itália', England: 'Inglaterra',
  Netherlands: 'Países Baixos', Belgium: 'Bélgica', Croatia: 'Croácia', Switzerland: 'Suíça', Austria: 'Áustria', Poland: 'Polónia',
  Denmark: 'Dinamarca', Sweden: 'Suécia', Norway: 'Noruega', 'Czechia': 'Chéquia', 'Czech Republic': 'Chéquia', Turkey: 'Turquia', 'Türkiye': 'Turquia',
  Greece: 'Grécia', Scotland: 'Escócia', Wales: 'País de Gales', 'Republic of Ireland': 'Irlanda', Ireland: 'Irlanda', 'Northern Ireland': 'Irlanda do Norte',
  Serbia: 'Sérvia', Ukraine: 'Ucrânia', Romania: 'Roménia', Hungary: 'Hungria', Slovakia: 'Eslováquia', Slovenia: 'Eslovénia',
  Georgia: 'Geórgia', Finland: 'Finlândia', Iceland: 'Islândia', Albania: 'Albânia', 'Bosnia and Herzegovina': 'Bósnia e Herzegovina',
  'Bosnia-Herzegovina': 'Bósnia e Herzegovina', Montenegro: 'Montenegro', 'North Macedonia': 'Macedónia do Norte', Kosovo: 'Kosovo',
  Israel: 'Israel', Bulgaria: 'Bulgária', Cyprus: 'Chipre', Estonia: 'Estónia', Latvia: 'Letónia', Lithuania: 'Lituânia',
  Luxembourg: 'Luxemburgo', Malta: 'Malta', Moldova: 'Moldávia', Belarus: 'Bielorrússia', Armenia: 'Arménia', Azerbaijan: 'Azerbaijão',
  Kazakhstan: 'Cazaquistão', Andorra: 'Andorra', 'San Marino': 'São Marino', Liechtenstein: 'Liechtenstein', Gibraltar: 'Gibraltar',
  'Faroe Islands': 'Ilhas Faroé', Russia: 'Rússia',
  Brazil: 'Brasil', Argentina: 'Argentina', Uruguay: 'Uruguai', Colombia: 'Colômbia', Chile: 'Chile', Ecuador: 'Equador',
  Paraguay: 'Paraguai', Peru: 'Peru', Venezuela: 'Venezuela', Bolivia: 'Bolívia', Mexico: 'México', 'United States': 'EUA', USA: 'EUA',
  Canada: 'Canadá', 'Costa Rica': 'Costa Rica', Panama: 'Panamá', Jamaica: 'Jamaica', Honduras: 'Honduras',
  Japan: 'Japão', 'South Korea': 'Coreia do Sul', 'Korea Republic': 'Coreia do Sul', Australia: 'Austrália', 'Saudi Arabia': 'Arábia Saudita',
  Iran: 'Irão', Qatar: 'Catar', Iraq: 'Iraque', 'United Arab Emirates': 'Emirados Árabes Unidos', China: 'China', 'New Zealand': 'Nova Zelândia',
  Morocco: 'Marrocos', Senegal: 'Senegal', Nigeria: 'Nigéria', Cameroon: 'Camarões', Ghana: 'Gana', 'Ivory Coast': 'Costa do Marfim',
  "Côte d'Ivoire": 'Costa do Marfim', Egypt: 'Egito', Tunisia: 'Tunísia', Algeria: 'Argélia', 'South Africa': 'África do Sul',
  'Cape Verde': 'Cabo Verde', 'Cape Verde Islands': 'Cabo Verde', Angola: 'Angola', Mozambique: 'Moçambique', 'Guinea-Bissau': 'Guiné-Bissau',
  Mali: 'Mali', 'DR Congo': 'RD Congo', 'Congo DR': 'RD Congo',
};

/** Portuguese → English, plus common bookmaker variants (Holanda, República Checa…). */
export const COUNTRY_PT_TO_EN: Record<string, string> = {
  ...Object.fromEntries(Object.entries(COUNTRY_EN_TO_PT).map(([en, pt]) => [pt, en])),
  Holanda: 'Netherlands',
  'República Checa': 'Czechia',
  'Chéquia': 'Czechia',
  'Estados Unidos': 'United States',
  'Coreia': 'South Korea',
  'Irlanda do Norte': 'Northern Ireland',
  Irlanda: 'Republic of Ireland',
  'Macedónia': 'North Macedonia',
};

/** Portuguese name for an ESPN national team; unchanged when it isn't a country we know. */
export function countryToPt(name: string): string {
  return COUNTRY_EN_TO_PT[name] ?? name;
}
