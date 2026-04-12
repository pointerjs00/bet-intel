/**
 * Cleaner batch 3 generator — outputs ready-to-paste text.
 */
import fs from 'fs';

const r2 = JSON.parse(fs.readFileSync('scripts/team-ids-round2.json', 'utf-8'));
const r3 = JSON.parse(fs.readFileSync('scripts/team-ids-round3.json', 'utf-8'));
const sofa = JSON.parse(fs.readFileSync('scripts/team-ids-sofascore.json', 'utf-8'));
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');

// Exclude bad medium-confidence
const medExclude = new Set([
  'Atlético-CE','Democrata-GV','Dender EH','GD Bragança','Hassania Agadir',
  'Imortal','Ionikos Nikaia','Kallithea','Næstved BK','Roda JC',
  'São José-RS','Swallows FC','US Schaffhausen',
]);
const dupExclude = new Set(['FC Machida Zelvia']); // keep Machida Zelvia instead

// Existing teams
const existing = new Set();
for (const m of assets.matchAll(/^\s+['"]([^'"]+)['"]\s*:/gm)) existing.add(m[1]);

// Collect entries: name → { type, line }
const entries = new Map();

// ESPN
for (const e of r2.espn) {
  const sport = e.line.includes('/nfl/') ? 'NFL' : e.line.includes('/nhl/') ? 'NHL' : 'MLB';
  const urlMatch = e.line.match(/'(https:\/\/[^']+)'/);
  if (urlMatch && !existing.has(e.name)) {
    entries.set(e.name, { type: 'espn', sport, line: `  '${e.name}': '${urlMatch[1]}',` });
  }
}

// Football TEAM_CDN (round 2)
for (const e of r2.football) {
  const idMatch = e.line.match(/TEAM_CDN\((\d+)\)/);
  if (idMatch && !existing.has(e.name)) {
    entries.set(e.name, { type: 'football', line: `  '${e.name}': TEAM_CDN(${idMatch[1]}),` });
  }
}

// Basketball SOFA_TEAM (round 2)
for (const e of r2.basketball) {
  const idMatch = e.line.match(/team\/(\d+)\/image/);
  if (idMatch && !existing.has(e.name)) {
    entries.set(e.name, { type: 'basketball', line: `  '${e.name}': SOFA_TEAM(${idMatch[1]}),` });
  }
}

// TheSportsDB TEAM_CDN (round 3)
for (const e of r3.entries) {
  const idMatch = e.line.match(/TEAM_CDN\((\d+)\)/);
  if (idMatch && !existing.has(e.name) && !entries.has(e.name)) {
    entries.set(e.name, { type: 'football', line: `  '${e.name}': TEAM_CDN(${idMatch[1]}),` });
  }
}

// Sofascore high confidence
for (const e of sofa.highConfidence) {
  if (entries.has(e.name) || existing.has(e.name) || dupExclude.has(e.name)) continue;
  entries.set(e.name, { type: 'sofascore', line: `  '${e.name.replace(/'/g, "\\'")}': SOFA_TEAM(${e.id}),` });
}

// Sofascore medium confidence (filtered)
for (const e of sofa.mediumConfidence) {
  if (entries.has(e.name) || existing.has(e.name) || medExclude.has(e.name) || dupExclude.has(e.name)) continue;
  entries.set(e.name, { type: 'sofascore', line: `  '${e.name.replace(/'/g, "\\'")}': SOFA_TEAM(${e.id}),` });
}

// Group by type
const espn = [...entries].filter(([,v]) => v.type === 'espn').sort((a,b) => a[0].localeCompare(b[0]));
const football = [...entries].filter(([,v]) => v.type === 'football').sort((a,b) => a[0].localeCompare(b[0]));
const basketball = [...entries].filter(([,v]) => v.type === 'basketball').sort((a,b) => a[0].localeCompare(b[0]));
const sofascore = [...entries].filter(([,v]) => v.type === 'sofascore').sort((a,b) => a[0].localeCompare(b[0]));

let text = '';
text += `  // ── Batch 3: Multi-source verified (2025-07-15) ─────────────────────────\n`;

if (espn.length) {
  text += `  // ESPN CDN — NFL, NHL, MLB\n`;
  for (const [,v] of espn) text += v.line + '\n';
  text += '\n';
}

if (football.length) {
  text += `  // API-Football CDN — TheSportsDB + API-Football verified\n`;
  for (const [,v] of football) text += v.line + '\n';
  text += '\n';
}

if (basketball.length) {
  text += `  // Sofascore — Basketball (EuroLeague, ACB)\n`;
  for (const [,v] of basketball) text += v.line + '\n';
  text += '\n';
}

if (sofascore.length) {
  text += `  // Sofascore team images — broad coverage\n`;
  for (const [,v] of sofascore) text += v.line + '\n';
}

fs.writeFileSync('scripts/batch3-entries.txt', text);

// Aliases
const aliases = `  'FC Machida Zelvia': 'Machida Zelvia',\n  'Grulla Morioka': 'Iwate Grulla Morioka',\n`;
fs.writeFileSync('scripts/batch3-aliases.txt', aliases);

console.log(`ESPN: ${espn.length}, Football: ${football.length}, Basketball: ${basketball.length}, Sofascore: ${sofascore.length}`);
console.log(`Total: ${entries.size}`);

// Verify no duplicate keys
const keys = [...entries.keys()];
const dupeKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dupeKeys.length) console.log('⚠️ Duplicate keys:', dupeKeys);

console.log('Done. Files: scripts/batch3-entries.txt, scripts/batch3-aliases.txt');
