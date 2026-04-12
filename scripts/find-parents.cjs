const f = require('fs').readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const terms = ['AZ Alkmaar','PSV Eindhoven','Atletico Madrid','Seattle Sounders','San Jose','Vancouver Whitecaps','DC United','Real Salt Lake','Sporting KC','Celta','Roda','CF Montreal','Jong'];
terms.forEach(t => {
  const lines = f.split('\n').filter(l => l.includes(t) && l.includes(':'));
  if (lines.length) lines.forEach(l => console.log(l.trim()));
  else console.log('NOT FOUND:', t);
});
