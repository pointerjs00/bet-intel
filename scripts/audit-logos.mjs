/**
 * Audit script: cross-reference seed.ts teams/competitions with sportAssets.ts
 * to find missing logos, duplicate CDN IDs (wrong logos), and verify Saudi teams etc.
 */
import { readFileSync } from 'fs';

const seedPath = 'apps/api/src/prisma/seed.ts';
const assetsPath = 'apps/mobile/utils/sportAssets.ts';

const seedContent = readFileSync(seedPath, 'utf-8');
const assetsContent = readFileSync(assetsPath, 'utf-8');

// ── Extract all team names from seed.ts ──────────────────────────────────────
const teamSet = new Set();
// Match teams arrays: teams: [ 'Name1', 'Name2', ... ]
const teamsBlockRegex = /teams:\s*\[([\s\S]*?)\]/g;
let match;
while ((match = teamsBlockRegex.exec(seedContent)) !== null) {
  const block = match[1];
  const names = block.match(/'([^']+)'/g) || [];
  for (const n of names) {
    teamSet.add(n.slice(1, -1)); // remove quotes
  }
}
// Also match escaped quotes like "Newell's Old Boys"
const escapedNames = seedContent.match(/\\?'([^'\\]+(?:\\.[^'\\]*)*)'/g) || [];

console.log(`\n=== TEAM AUDIT ===`);
console.log(`Total unique teams in seed.ts: ${teamSet.size}`);

// ── Extract TEAM_LOGOS entries ────────────────────────────────────────────────
const teamLogos = new Map(); // name -> url expression
const teamCDNIds = new Map(); // name -> numeric CDN ID
const idToTeams = new Map(); // CDN ID -> array of team names

const teamLogosSection = assetsContent.match(/export const TEAM_LOGOS[\s\S]*?(?=\n\/\/ ─── Betting sites)/);
if (!teamLogosSection) {
  console.error('Could not find TEAM_LOGOS section');
  process.exit(1);
}

const entryRegex = /'([^']+)':\s*(.+?)(?:,\s*(?:\/\/.*)?)?$/gm;
while ((match = entryRegex.exec(teamLogosSection[0])) !== null) {
  const name = match[1];
  const value = match[2].trim().replace(/,\s*$/, '');
  teamLogos.set(name, value);

  // Extract CDN ID if it's a TEAM_CDN() call
  const cdnMatch = value.match(/TEAM_CDN\((\d+)\)/);
  if (cdnMatch) {
    const id = parseInt(cdnMatch[1]);
    teamCDNIds.set(name, id);
    if (!idToTeams.has(id)) idToTeams.set(id, []);
    idToTeams.get(id).push(name);
  }
}

console.log(`Total entries in TEAM_LOGOS: ${teamLogos.size}`);

// ── Find teams missing from TEAM_LOGOS ───────────────────────────────────────
// Normalize for comparison
function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const logoNormalized = new Map();
for (const name of teamLogos.keys()) {
  logoNormalized.set(normalize(name), name);
}

const missingTeams = [];
for (const team of teamSet) {
  const norm = normalize(team);
  if (!logoNormalized.has(norm) && !teamLogos.has(team)) {
    missingTeams.push(team);
  }
}

console.log(`\n--- TEAMS MISSING FROM TEAM_LOGOS (${missingTeams.length}) ---`);
missingTeams.sort().forEach(t => console.log(`  ${t}`));

// ── Find duplicate CDN IDs (wrong logos) ─────────────────────────────────────
console.log(`\n--- DUPLICATE CDN IDs (potential wrong logos) ---`);
for (const [id, teams] of idToTeams.entries()) {
  if (teams.length > 1) {
    // Check if teams are related (e.g., "SL Benfica" and "SL Benfica Basquetebol")
    const unrelated = teams.filter((t, i) =>
      teams.every((other, j) => i === j || !normalize(t).includes(normalize(other)))
    );
    if (unrelated.length > 1) {
      console.log(`  CDN ID ${id}: ${teams.join(', ')}`);
    }
  }
}

// ── Extract competitions from seed.ts ────────────────────────────────────────
const compSet = new Set();
const compRegex = /name:\s*'([^']+)',\s*\n\s*country:\s*'([^']+)'/g;
while ((match = compRegex.exec(seedContent)) !== null) {
  compSet.add(match[1]);
}

console.log(`\n\n=== COMPETITION AUDIT ===`);
console.log(`Total competitions in seed.ts: ${compSet.size}`);

// ── Extract LEAGUE_LOGOS entries ─────────────────────────────────────────────
const leagueLogos = new Map();
const leagueSection = assetsContent.match(/export const LEAGUE_LOGOS[\s\S]*?(?=\nexport const PLAYER_PHOTOS)/);
if (!leagueSection) {
  console.error('Could not find LEAGUE_LOGOS section');
  process.exit(1);
}

const leagueEntryRegex = /'([^']+)':\s*(.+?)(?:,\s*(?:\/\/.*)?)?$/gm;
while ((match = leagueEntryRegex.exec(leagueSection[0])) !== null) {
  leagueLogos.set(match[1], match[2].trim().replace(/,\s*$/, ''));
}

console.log(`Total entries in LEAGUE_LOGOS: ${leagueLogos.size}`);

const leagueNormalized = new Map();
for (const name of leagueLogos.keys()) {
  leagueNormalized.set(normalize(name), name);
}

const missingComps = [];
for (const comp of compSet) {
  const norm = normalize(comp);
  if (!leagueNormalized.has(norm) && !leagueLogos.has(comp)) {
    missingComps.push(comp);
  }
}

console.log(`\n--- COMPETITIONS MISSING FROM LEAGUE_LOGOS (${missingComps.length}) ---`);
missingComps.sort().forEach(c => console.log(`  ${c}`));

// ── Check for duplicate league CDN IDs ───────────────────────────────────────
const leagueCDNIds = new Map();
const leagueIdToNames = new Map();
const leagueCdnRegex = /LEAGUE_CDN\((\d+)\)|SOFA\((\d+)\)/g;

for (const [name, value] of leagueLogos.entries()) {
  const cdnMatch = value.match(/LEAGUE_CDN\((\d+)\)/);
  const sofaMatch = value.match(/SOFA\((\d+)\)/);
  if (cdnMatch) {
    const id = `LEAGUE_CDN(${cdnMatch[1]})`;
    if (!leagueIdToNames.has(id)) leagueIdToNames.set(id, []);
    leagueIdToNames.get(id).push(name);
  }
  if (sofaMatch) {
    const id = `SOFA(${sofaMatch[1]})`;
    if (!leagueIdToNames.has(id)) leagueIdToNames.set(id, []);
    leagueIdToNames.get(id).push(name);
  }
}

console.log(`\n--- DUPLICATE LEAGUE CDN IDs ---`);
for (const [id, names] of leagueIdToNames.entries()) {
  if (names.length > 1) {
    console.log(`  ${id}: ${names.join(', ')}`);
  }
}
