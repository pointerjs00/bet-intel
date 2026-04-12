/**
 * Fetch missing team IDs from API-Football (the authoritative source for TEAM_CDN IDs).
 * Uses `GET /leagues` (1 req) + `GET /teams?league=X&season=2024` (~60 reqs) ≈ 61 total.
 * Free tier = 100 req/day.
 *
 * Usage: node scripts/fetch-teams-apifootball.mjs
 */
import fs from 'fs';
import https from 'https';

const API_KEY = process.env.APIFOOTBALL_API_KEY || process.env.RAPIDAPI_KEY;

if (!API_KEY) {
  throw new Error('Missing APIFOOTBALL_API_KEY or RAPIDAPI_KEY environment variable.');
}

function apiFetch(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'v3.football.api-sports.io',
      path,
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      },
    };
    https.get(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalize(v) {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`ʼ]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Read mapped teams from sportAssets.ts ───────────────────────────────────
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const mappedTeams = new Set();
for (const m of assets.matchAll(/^\s+'([^']+)':\s+(?:TEAM_CDN|'http)/gm)) {
  mappedTeams.add(m[1]);
}
const aliasBlock = assets.match(/TEAM_LOGO_ALIASES[\s\S]*?^}/m);
if (aliasBlock) {
  for (const a of aliasBlock[0].matchAll(/^\s+'([^']+)':/gm)) {
    mappedTeams.add(a[1]);
  }
}
// Extract existing TEAM_CDN IDs to detect collisions
const existingIds = new Set();
for (const m of assets.matchAll(/TEAM_CDN\((\d+)\)/g)) {
  existingIds.add(parseInt(m[1]));
}
const mappedNormMap = new Map();
for (const k of mappedTeams) mappedNormMap.set(normalize(k), k);
console.log(`Already mapped: ${mappedTeams.size} teams (${existingIds.size} unique TEAM_CDN IDs)`);

// ── Read seed.ts teams grouped by competition ──────────────────────────────
const seed = fs.readFileSync('apps/api/src/prisma/seed.ts', 'utf-8');
const competitionTeams = new Map();
for (const block of seed.matchAll(/name:\s*'([^']+)'[\s\S]*?teams:\s*\[([\s\S]*?)\]/g)) {
  const compName = block[1];
  const teams = [...block[2].matchAll(/'([^']+)'/g)].map(m => m[1]);
  if (teams.length > 0) {
    const existing = competitionTeams.get(compName) || [];
    competitionTeams.set(compName, [...new Set([...existing, ...teams])]);
  }
}

const allSeedTeams = new Set();
for (const teams of competitionTeams.values()) {
  for (const t of teams) allSeedTeams.add(t);
}

const missingTeams = [...allSeedTeams].filter(t =>
  t.length > 1 && !mappedTeams.has(t) && !mappedNormMap.has(normalize(t))
);
console.log(`Missing teams: ${missingTeams.length}`);

// Find which competitions have missing teams
const compsWithMissing = new Map();
for (const [comp, teams] of competitionTeams) {
  const missing = teams.filter(t =>
    t.length > 1 && !mappedTeams.has(t) && !mappedNormMap.has(normalize(t))
  );
  if (missing.length > 0) {
    compsWithMissing.set(comp, missing);
  }
}
console.log(`Competitions with missing teams: ${compsWithMissing.size}`);

// ── Map competition names → API-Football league IDs ─────────────────────────
// Correct API-Football league IDs - verified
const COMP_TO_LEAGUE_ID = {
  // Portugal
  'Liga Portugal Betclic': 94,
  'Liga Portugal 2': 95,
  'Campeonato de Portugal': 97,
  // England
  'Premier League': 39,
  'Championship': 40,
  'League One': 41,
  'League Two': 42,
  'National League': 43,
  // Spain
  'La Liga': 140,
  'La Liga 2': 141,
  'Primera Federación': 435,
  // Italy
  'Serie A': 135,
  'Serie B': 136,
  // Germany
  'Bundesliga': 78,
  '2. Bundesliga': 79,
  '3. Liga': 80,
  // France
  'Ligue 1': 61,
  'Ligue 2': 62,
  'National 1': 63,
  // Netherlands
  'Eredivisie': 88,
  'Eerste Divisie': 89,
  // Belgium
  'Jupiler Pro League': 144,
  'Challenger Pro League': 145,
  // Turkey
  'Süper Lig': 203,
  'Trendyol 1.Lig': 204,
  // Scotland
  'Scottish Premiership': 179,
  'Scottish Championship': 180,
  'Scottish League One': 181,
  'Scottish League Two': 182,
  // Austria
  'Bundesliga (Áustria)': 218,
  '2. Liga (Áustria)': 219,
  // Switzerland
  'Super League (Suíça)': 207,
  'Challenge League': 208,
  // Greece
  'Super League (Grécia)': 197,
  'Super League 2': 486,
  // Poland
  'Ekstraklasa': 106,
  'Betclic 1. Liga': 107,
  // Romania
  'Romanian SuperLiga': 283,
  // Croatia
  'HNL': 210,
  // Serbia
  'Mozzart Bet Superliga': 286,
  // Hungary
  'Fizz Liga': 271,
  // Czech Republic
  'Czech First League': 345,
  // Slovakia
  'Niké Liga': 332,
  // Norway
  'Eliteserien': 103,
  'Norwegian 1st Division': 104,
  // Sweden
  'Allsvenskan': 113,
  'Superettan': 114,
  // Denmark
  'Danish Superliga': 119,
  'Betinia Liga': 120,
  // Ireland
  'League of Ireland': 357,
  // Russia
  'Russian Premier League': 235,
  // Ukraine
  'Ukrainian Premier League': 333,
  // Brazil
  'Brasileirão Série A': 71,
  'Brasileirão Série B': 72,
  'Brasileirão Série C': 75,
  'Carioca': 604,
  'Gaúcho': 609,
  'Paulista Série A1': 475,
  'Mineiro, Módulo I': 605,
  // Argentina
  'Liga Profesional (Argentina)': 128,
  'Primera Nacional': 131,
  // Mexico
  'Liga MX, Clausura': 262,
  'Liga MX, Apertura': 262,
  // Colombia
  'Primera A, Finalización': 239,
  'Primera A, Apertura': 239,
  // Chile
  'Liga de Primera': 265,
  // Peru
  'Liga 1': 281,
  // Uruguay
  'Liga AUF Uruguaya': 268,
  // USA
  'MLS': 253,
  'USL Championship': 255,
  'MLS Next Pro': 909,
  // Canada
  'Canadian Premier League': 501,
  // Japan
  'J1 League': 98,
  'J2 League': 99,
  'J3 League': 521,
  // South Korea
  'K League 1': 292,
  'K League 2': 293,
  // Saudi Arabia
  'Saudi Pro League': 307,
  // UAE
  'UAE Pro League': 305,
  // Morocco
  'Botola Pro': 200,
  // Nigeria
  'Nigeria Premier Football League': 331,
  // South Africa
  'South African Premier Division': 288,
};

async function main() {
  let requestCount = 0;
  const found = new Map(); // seedName → { id, apiName }
  
  // Get unique league IDs for competitions with missing teams
  const leaguesToFetch = new Set();
  for (const comp of compsWithMissing.keys()) {
    const leagueId = COMP_TO_LEAGUE_ID[comp];
    if (leagueId) leaguesToFetch.add(leagueId);
  }
  console.log(`\nLeagues to fetch: ${leaguesToFetch.size}`);
  
  // Build a master lookup of API-Football teams
  const apiTeams = new Map(); // normalized name → { id, name }
  
  for (const leagueId of leaguesToFetch) {
    if (requestCount >= 90) {
      console.log(`  ⚠️ Approaching request limit (${requestCount}/100), stopping league fetches`);
      break;
    }
    
    // Try season 2024 first (covers 2024-2025 European seasons)
    const resp = await apiFetch(`/teams?league=${leagueId}&season=2024`);
    requestCount++;
    
    if (resp?.response?.length > 0) {
      for (const entry of resp.response) {
        const team = entry.team;
        if (!team?.id || !team?.name) continue;
        
        const names = [team.name, team.code].filter(Boolean);
        for (const n of names) {
          const norm = normalize(n);
          if (norm.length > 1) {
            apiTeams.set(norm, { id: team.id, name: team.name });
          }
        }
      }
    } else if (requestCount < 85) {
      // Try 2025 for leagues that might use calendar-year seasons (South America, Asia)
      await delay(300);
      const resp2 = await apiFetch(`/teams?league=${leagueId}&season=2025`);
      requestCount++;
      if (resp2?.response?.length > 0) {
        for (const entry of resp2.response) {
          const team = entry.team;
          if (!team?.id || !team?.name) continue;
          const names = [team.name, team.code].filter(Boolean);
          for (const n of names) {
            const norm = normalize(n);
            if (norm.length > 1) {
              apiTeams.set(norm, { id: team.id, name: team.name });
            }
          }
        }
      }
    }
    
    if (requestCount % 10 === 0) {
      console.log(`  [${requestCount} requests used, ${apiTeams.size} teams found]`);
    }
    await delay(300);
  }
  
  console.log(`API-Football teams fetched: ${apiTeams.size} (${requestCount} requests used)`);
  
  // ── Match missing teams ──────────────────────────────────────────────────
  const missingNormSet = new Map(); // normalized → original name
  for (const t of missingTeams) {
    missingNormSet.set(normalize(t), t);
  }
  
  for (const [norm, info] of apiTeams) {
    // Direct match
    if (missingNormSet.has(norm)) {
      const seedName = missingNormSet.get(norm);
      if (!found.has(seedName)) {
        found.set(seedName, { id: info.id, apiName: info.name, matchType: 'exact' });
      }
    }
  }
  
  // Try matching with additional heuristics for unmatched teams
  const stillMissing = missingTeams.filter(t => !found.has(t));
  for (const seedName of stillMissing) {
    const seedNorm = normalize(seedName);
    
    // Try without common suffixes
    const stripped = seedNorm
      .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '')
      .replace(/\s+/g, ' ').trim();
    
    for (const [apiNorm, info] of apiTeams) {
      const apiStripped = apiNorm
        .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '')
        .replace(/\s+/g, ' ').trim();
      
      if (stripped.length >= 4 && stripped === apiStripped) {
        found.set(seedName, { id: info.id, apiName: info.name, matchType: 'loose' });
        break;
      }
      
      // Also try containment (e.g., "Sporting CP" vs "sporting clube de portugal")
      if (stripped.length >= 6 && apiStripped.length >= 6) {
        if (apiStripped.includes(stripped) || stripped.includes(apiStripped)) {
          found.set(seedName, { id: info.id, apiName: info.name, matchType: 'contains' });
          break;
        }
      }
    }
  }
  
  // ── Generate output ──────────────────────────────────────────────────────
  const results = {
    teamCdn: [],
    notFound: [],
    requestsUsed: requestCount,
  };
  
  for (const [name, info] of found) {
    const collision = existingIds.has(info.id);
    results.teamCdn.push({
      name,
      id: info.id,
      apiName: info.apiName,
      matchType: info.matchType,
      collision,
    });
  }
  
  results.notFound = missingTeams.filter(t => !found.has(t)).sort();
  
  // Generate TypeScript entries ready to paste
  let tsEntries = '';
  for (const entry of results.teamCdn.sort((a, b) => a.name.localeCompare(b.name))) {
    const warn = entry.collision ? ' // ⚠️ COLLISION with existing ID' : '';
    const note = entry.matchType !== 'exact' ? ` // matched: ${entry.apiName}` : '';
    tsEntries += `  '${entry.name}': TEAM_CDN(${entry.id}),${warn}${note}\n`;
  }
  results.tsEntries = tsEntries;
  
  fs.writeFileSync('scripts/team-ids-apifootball.json', JSON.stringify(results, null, 2));
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Teams found: ${results.teamCdn.length}`);
  console.log(`  Exact: ${results.teamCdn.filter(t => t.matchType === 'exact').length}`);
  console.log(`  Loose: ${results.teamCdn.filter(t => t.matchType === 'loose').length}`);
  console.log(`  Contains: ${results.teamCdn.filter(t => t.matchType === 'contains').length}`);
  console.log(`  Collisions: ${results.teamCdn.filter(t => t.collision).length}`);
  console.log(`Not found: ${results.notFound.length}`);
  console.log(`API requests used: ${requestCount}`);
  console.log(`\nReady-to-paste entries written to scripts/team-ids-apifootball.json`);
}

main().catch(console.error);
