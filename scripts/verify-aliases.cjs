const f = require('fs').readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const check = [
  'Jong AZ','Jong PSV','Bayern Munich II','Atlético de Madrid B','Real Betis Deportivo',
  'Celta B','LA Galaxy II','LAFC 2','Nashville SC 2','Portland Timbers 2',
  'Seattle Sounders FC 2','D.C. United 2','CF Montréal II','San Jose Earthquakes 2',
  'Vancouver Whitecaps 2','Sporting KC 2','Real Salt Lake Monarchs','Roda JC',
  'D.C. United','CF Montréal','San Jose Earthquakes','Vancouver Whitecaps FC',
  'Sporting Kansas City','Real Salt Lake','Roda JC Kerkrade',
];
check.forEach(t => {
  const found = f.includes("'" + t + "'");
  console.log(found ? '✓' : '✗', t);
});
