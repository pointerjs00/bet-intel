const fs = require('fs');
const f = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');

const teamLogoLines = [];
let inTeamLogos = false;
for (const line of f.split('\n')) {
  if (line.includes('export const TEAM_LOGOS')) { inTeamLogos = true; continue; }
  if (inTeamLogos && line.trim() === '};') { inTeamLogos = false; continue; }
  if (inTeamLogos) {
    const m = line.match(/^\s+'([^']+)':\s+/);
    if (m) teamLogoLines.push({ name: m[1], line: line.trim() });
  }
}

function norm(n) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(FC|CF|SC|AC|EC|FK|SK|BK|IF|FF|SSC|US|AS|RC|RSC|CD|UD|SD|AD|CA|SE|CR|SL|AFC|BC|PC|GD|UD)\b\.?/gi, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

const groups = new Map();
for (const entry of teamLogoLines) {
  const n = norm(entry.name);
  if (!groups.has(n)) groups.set(n, []);
  groups.get(n).push(entry);
}

const dupes = [...groups.entries()].filter(([, v]) => v.length > 1);
console.log('Potential duplicates found:', dupes.length);
dupes.forEach(([key, entries]) => {
  console.log('\n  key: ' + key);
  entries.forEach(e => console.log('    > ' + e.line));
});
