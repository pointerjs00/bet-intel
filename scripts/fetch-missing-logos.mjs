/**
 * Batch-fetch API-Football IDs for missing teams via TheSportsDB API.
 * Outputs ready-to-paste TEAM_LOGOS entries.
 * 
 * Usage: node scripts/fetch-missing-logos.mjs
 */
import fs from 'fs';
import https from 'https';

// ── Known ESPN mappings for US sports ──────────────────────────────────────────
const NFL_TEAMS = {
  'Kansas City Chiefs': 'kc', 'San Francisco 49ers': 'sf', 'Baltimore Ravens': 'bal',
  'Buffalo Bills': 'buf', 'Detroit Lions': 'det', 'Dallas Cowboys': 'dal',
  'Philadelphia Eagles': 'phi', 'Miami Dolphins': 'mia', 'Green Bay Packers': 'gb',
  'Houston Texans': 'hou', 'Cleveland Browns': 'cle', 'Cincinnati Bengals': 'cin',
  'Los Angeles Rams': 'lar', 'Pittsburgh Steelers': 'pit', 'Tampa Bay Buccaneers': 'tb',
  'Jacksonville Jaguars': 'jax',
};

const NHL_TEAMS = {
  'Edmonton Oilers': 'edm', 'Florida Panthers': 'fla', 'Dallas Stars': 'dal',
  'Colorado Avalanche': 'col', 'New York Rangers': 'nyr', 'Carolina Hurricanes': 'car',
  'Boston Bruins': 'bos', 'Vancouver Canucks': 'van', 'Toronto Maple Leafs': 'tor',
  'Winnipeg Jets': 'wpg', 'Tampa Bay Lightning': 'tb', 'Vegas Golden Knights': 'vgk',
};

const MLB_TEAMS = {
  'Los Angeles Dodgers': 'lad', 'Atlanta Braves': 'atl', 'Houston Astros': 'hou',
  'New York Yankees': 'nyy', 'Tampa Bay Rays': 'tb', 'Baltimore Orioles': 'bal',
  'Texas Rangers': 'tex', 'Philadelphia Phillies': 'phi', 'Minnesota Twins': 'min',
  'Arizona Diamondbacks': 'ari', 'Milwaukee Brewers': 'mil', 'Toronto Blue Jays': 'tor',
};

// ── Read missing teams from seed vs sportAssets ────────────────────────────────
const seed = fs.readFileSync('apps/api/src/prisma/seed.ts', 'utf-8');
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');

const teamSection = assets.match(/export const TEAM_LOGOS[\s\S]*?^};/m)[0];
const teamKeys = new Set();
for (const m of teamSection.matchAll(/^\s+'([^']+)':\s+/gm)) teamKeys.add(m[1]);
const aliasMatch = assets.match(/const TEAM_LOGO_ALIASES[\s\S]*?^};/m);
const aliasKeys = new Set();
if (aliasMatch) for (const m of aliasMatch[0].matchAll(/^\s+'([^']+)':\s+'([^']+)'/gm)) aliasKeys.add(m[1]);
const photoSection = assets.match(/export const PLAYER_PHOTOS[\s\S]*?^};/m);
const photoKeys = new Set();
if (photoSection) for (const m of photoSection[0].matchAll(/^\s+'([^']+)':\s+/gm)) photoKeys.add(m[1]);

function normalize(v) {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-zA-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
const norm = new Map();
for (const k of teamKeys) norm.set(normalize(k), k);
for (const k of aliasKeys) norm.set(normalize(k), k);

function isMapped(t) {
  return teamKeys.has(t) || aliasKeys.has(t) || photoKeys.has(t) || norm.has(normalize(t));
}

// Parse competitions
const byComp = {};
for (const block of seed.matchAll(/\{\s*name:\s*'([^']+)',[\s\S]*?teams:\s*\[([\s\S]*?)\]/g)) {
  const compName = block[1];
  const teams = [...block[2].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const missing = teams.filter(t => !isMapped(t) && t.length > 1);
  if (missing.length > 0) byComp[compName] = missing;
}

// Deduplicate
const allMissing = [...new Set(Object.values(byComp).flat())];
console.log(`Total unique missing teams: ${allMissing.length}`);

// ── ESPN-based teams (no API lookup needed) ──────────────────────────────────
const espnResults = [];
for (const [name, abbrev] of Object.entries(NFL_TEAMS)) {
  if (allMissing.includes(name)) espnResults.push(`  '${name}': 'https://a.espncdn.com/i/teamlogos/nfl/500/${abbrev}.png',`);
}
for (const [name, abbrev] of Object.entries(NHL_TEAMS)) {
  if (allMissing.includes(name)) espnResults.push(`  '${name}': 'https://a.espncdn.com/i/teamlogos/nhl/500/${abbrev}.png',`);
}
for (const [name, abbrev] of Object.entries(MLB_TEAMS)) {
  if (allMissing.includes(name)) espnResults.push(`  '${name}': 'https://a.espncdn.com/i/teamlogos/mlb/500/${abbrev}.png',`);
}

// ── TheSportsDB batch lookup for football teams ──────────────────────────────
const footballMissing = allMissing.filter(t => 
  !NFL_TEAMS[t] && !NHL_TEAMS[t] && !MLB_TEAMS[t]
);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'BetIntel/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function lookupTeam(name) {
  const encoded = encodeURIComponent(name);
  const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encoded}`;
  const data = await fetchJSON(url);
  if (!data?.teams) return null;
  
  // Try exact match first, then closest
  const exactMatch = data.teams.find(t => 
    t.strTeam.toLowerCase() === name.toLowerCase() ||
    (t.strTeamAlternate || '').toLowerCase().split(',').map(s => s.trim().toLowerCase()).includes(name.toLowerCase())
  );
  const team = exactMatch || data.teams[0];
  
  if (team.idAPIfootball && team.idAPIfootball !== '0') {
    return { name, id: parseInt(team.idAPIfootball), sport: team.strSport, dbName: team.strTeam };
  }
  return null;
}

async function main() {
  const results = [];
  const notFound = [];
  
  console.log(`Looking up ${footballMissing.length} football teams...\n`);
  
  for (let i = 0; i < footballMissing.length; i++) {
    const name = footballMissing[i];
    if (i > 0 && i % 10 === 0) {
      process.stdout.write(`  [${i}/${footballMissing.length}] ...\n`);
    }
    
    try {
      const result = await lookupTeam(name);
      if (result) {
        results.push(result);
      } else {
        notFound.push(name);
      }
    } catch (e) {
      notFound.push(name);
    }
    
    // Rate limit: ~200ms between requests
    await delay(200);
  }
  
  // Output results
  console.log('\n\n// ══════════════════════════════════════════════════════');
  console.log('// ESPN-based teams (NFL, NHL, MLB)');
  console.log('// ══════════════════════════════════════════════════════');
  for (const line of espnResults) console.log(line);
  
  console.log('\n// ══════════════════════════════════════════════════════');
  console.log('// Football teams found via TheSportsDB → TEAM_CDN(id)');
  console.log('// ══════════════════════════════════════════════════════');
  
  // Group by verified sport
  for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
    const pad = ' '.repeat(Math.max(1, 30 - r.name.length));
    console.log(`  '${r.name}':${pad}TEAM_CDN(${r.id}),`);
  }
  
  console.log(`\n// ══════════════════════════════════════════════════════`);
  console.log(`// NOT FOUND (${notFound.length} teams — TheSportsDB fallback handles these at runtime)`);
  console.log(`// ══════════════════════════════════════════════════════`);
  for (const n of notFound.sort()) console.log(`//   ${n}`);
  
  console.log(`\n// Summary: ${results.length} found, ${espnResults.length} ESPN, ${notFound.length} not found`);
}

main().catch(console.error);
