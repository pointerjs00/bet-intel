const f = require('fs').readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const mls = ['San Jose','Vancouver Whitecaps','D.C. United','Real Salt Lake','Sporting Kansas','Roda JC','Atlético de Madrid'];
mls.forEach(t => {
  const lines = f.split('\n').filter(l => l.includes(t) && l.includes(':'));
  if (lines.length) lines.forEach(l => console.log(l.trim()));
  else console.log('NOT FOUND:', t);
});
