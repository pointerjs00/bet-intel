const f = require('fs').readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');

// Full list of parents for the B/reserve teams in still-missing
const parents = [
  'LA Galaxy','LAFC','Nashville SC','Portland Timbers','Seattle Sounders',
  'AZ Alkmaar','PSV Eindhoven','Bayern München',
  'Atlético Madrid','Real Betis','Celta de Vigo',
  'D.C. United','CF Montréal','San Jose Earthquakes','Vancouver Whitecaps FC',
  'Sporting Kansas City','Real Salt Lake',
  'Roda JC Kerkrade',
  'Pittsburgh Riverhounds',
];
parents.forEach(p => {
  const found = f.includes("'" + p + "'") || f.includes('"' + p + '"');
  console.log(found ? '✓' : '✗', p);
});

// Also look for any Swallows FC
['Swallows','Moroka Swallows','Bidvest Wits','Roda JC','Jong AZ','Jong PSV'].forEach(t=>{
  const lines = f.split('\n').filter(l => l.includes(t) && l.includes(':'));
  if (lines.length) lines.forEach(l => console.log('  found:', l.trim()));
  else console.log('  NOT:', t);
});
