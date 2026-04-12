const f = require('fs').readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const parents = [
  'AZ', 'PSV', 'Bayern München', 'Bayern Munich', 'Atlético de Madrid',
  'Real Betis', 'Celta de Vigo', 'Celta Vigo',
  'LA Galaxy', 'LAFC', 'D.C. United', 'CF Montréal',
  'Nashville SC', 'Portland Timbers', 'Seattle Sounders FC', 'San Jose Earthquakes',
  'Vancouver Whitecaps FC', 'Sporting Kansas City',
  'Real Salt Lake',
  'Roda JC Kerkrade', 'Royal Antwerp',
  'Kaizer Chiefs', 'Orlando Pirates',
];
parents.forEach(p => {
  const found = f.includes("'" + p + "'") || f.includes('"' + p + '"');
  console.log(found ? '✓' : '✗', p);
});
