/**
 * V3: Fetch API-Football IDs for missing teams.
 * Fixes UTF-8 encoding issues from V2 and uses aggressive fuzzy matching.
 * 
 * Usage: node scripts/fetch-teams-v3.mjs
 */
import fs from 'fs';
import https from 'https';

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function normalize(v) {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`ʼ]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Strip common suffixes for looser matching */
function normalizeLoose(v) {
  let n = normalize(v);
  // Strip common team suffixes
  n = n.replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl|real|united|city|town|athletic|rovers|wanderers|albion|hotspur|argyle|wednesday|orient|stanley|alexandra|vale|county|palace|rangers|villa)\b/gi, '');
  return n.replace(/\s+/g, ' ').trim();
}

// ── TheSportsDB League IDs ──────────────────────────────────────────────────
const LEAGUE_IDS = [
  4328, // English Premier League
  4329, // La Liga
  4330, // Bundesliga
  4331, // Serie A
  4332, // Ligue 1
  4335, // Liga Portugal
  4336, // Super League Greece
  4337, // Championship
  4338, // League One / League Two
  4339, // National League
  4340, // Eredivisie
  4343, // Turkish Super Lig / 1.Lig
  4344, // Ligue 2
  4345, // Eerste Divisie
  4346, // Liga MX
  4347, // Jupiler Pro League
  4350, // 2. Bundesliga
  4351, // 3. Liga
  4352, // J1 League
  4353, // J2 League
  4354, // Ukrainian Premier League
  4355, // Russian Premier League
  4358, // Eliteserien
  4359, // Allsvenskan
  4360, // Superettan
  4361, // Danish Superliga
  4362, // 1st Division Denmark
  4369, // Liga I Romania
  4370, // Ekstraklasa
  4373, // Czech First League
  4374, // Croatian HNL
  4380, // K League 1
  4382, // K League 2
  4385, // OTP Bank Liga / NB I Hungary
  4390, // Serie B Brazil
  4393, // Primera A Colombia
  4395, // Austrian Bundesliga
  4397, // Serbian SuperLiga
  4399, // Primera Division Uruguay
  4403, // Argentine Primera
  4404, // Primera Nacional Argentina
  4406, // Liga 1 Peru
  4408, // Chilean Primera
  4411, // League of Ireland
  4412, // Botola Pro Morocco
  4414, // South African Premier Division
  4415, // NPFL Nigeria
  4416, // UAE Pro League
  4422, // Scottish Championship
  4423, // Scottish League One
  4424, // Scottish League Two
  4457, // Norwegian 1st Division
  4471, // EFL Trophy (has League Two teams)
  4474, // 1st Liga Poland (2nd div)
  4475, // J3 League
  4476, // Serie C Brazil
  4480, // Campeonato Gaucho
  4481, // Campeonato Carioca (or de Portugal)
  4485, // Austrian 2. Liga
  4486, // Fortuna Liga Slovakia
  4487, // Super League 2 Greece
  4525, // Swiss Super League
  4567, // Swiss Challenge League (or Primera Fed)
  4571, // Challenger Pro League Belgium
  4771, // USL Championship
  5082, // MLS Next Pro
  5087, // Canadian Premier League
  4501, // MLS
  4387, // Liga Portugal 2
  4334, // Scottish Premiership
  4341, // Serie B Italy
  4483, // National 1 France
  4479, // Campeonato Paulista
  4482, // Campeonato Mineiro
];

// ── Read sportAssets.ts to find already-mapped teams ────────────────────────
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');

// Extract all mapped team names (both direct entries and aliases)
const mappedTeams = new Set();
// Match TEAM_LOGOS entries
for (const m of assets.matchAll(/^\s+'([^']+)':\s+(?:TEAM_CDN|'http)/gm)) {
  mappedTeams.add(m[1]);
}
// Match TEAM_LOGO_ALIASES entries
const aliasBlock = assets.match(/TEAM_LOGO_ALIASES[\s\S]*?^}/m);
if (aliasBlock) {
  for (const a of aliasBlock[0].matchAll(/^\s+'([^']+)':/gm)) {
    mappedTeams.add(a[1]);
  }
}

// Build normalized lookup map
const mappedNormMap = new Map();
for (const k of mappedTeams) {
  mappedNormMap.set(normalize(k), k);
}

console.log(`Already mapped: ${mappedTeams.size} teams`);

// ── Read seed.ts to find all teams ──────────────────────────────────────────
const seed = fs.readFileSync('apps/api/src/prisma/seed.ts', 'utf-8');

// Parse teams from seed — teams arrays span multiple lines
const competitionTeams = new Map(); // comp name → team[]
// Match each competition block with its teams array (multiline)
for (const block of seed.matchAll(/name:\s*'([^']+)'[\s\S]*?teams:\s*\[([\s\S]*?)\]/g)) {
  const compName = block[1];
  const teamsStr = block[2];
  const teams = [...teamsStr.matchAll(/'([^']+)'/g)].map(m => m[1]);
  if (teams.length > 0) {
    competitionTeams.set(compName, teams);
  }
}

const allSeedTeams = new Set();
for (const teams of competitionTeams.values()) {
  for (const t of teams) allSeedTeams.add(t);
}

// Find missing teams
const missingTeams = [...allSeedTeams].filter(t => {
  if (t.length <= 1) return false;
  if (mappedTeams.has(t)) return false;
  if (mappedNormMap.has(normalize(t))) return false;
  return true;
});

console.log(`Missing teams: ${missingTeams.length}`);

// ── Fetch ALL teams from TheSportsDB leagues ────────────────────────────────
const uniqueLeagueIds = [...new Set(LEAGUE_IDS)];
const tsdbTeams = []; // { name, alternates, apiFootballId, leagueId }
console.log(`\nFetching ${uniqueLeagueIds.length} leagues from TheSportsDB...`);

for (let i = 0; i < uniqueLeagueIds.length; i++) {
  const leagueId = uniqueLeagueIds[i];
  try {
    const data = await fetchJSON(
      `https://www.thesportsdb.com/api/v1/json/3/lookup_all_teams.php?id=${leagueId}`
    );
    if (data?.teams) {
      for (const team of data.teams) {
        const apiId = team.idAPIfootball;
        if (!apiId || apiId === '0' || apiId === 0) continue;
        
        const alternates = (team.strTeamAlternate || '')
          .split(/[,\/]/)
          .map(s => s.trim())
          .filter(Boolean);
        
        tsdbTeams.push({
          name: team.strTeam,
          alternates,
          apiFootballId: parseInt(apiId),
          leagueId,
          strTeamShort: team.strTeamShort || '',
        });
      }
    }
  } catch (e) {
    console.error(`  Failed league ${leagueId}: ${e.message}`);
  }
  if (i > 0 && i % 10 === 0) console.log(`  [${i}/${uniqueLeagueIds.length}]`);
  await delay(350);
}
console.log(`  Got ${tsdbTeams.length} teams with API-Football IDs from leagues`);

// ── Build matching database from TheSportsDB ───────────────────────────────
// normalized name → { apiFootballId, originalName }
const tsdbLookup = new Map();
for (const t of tsdbTeams) {
  const allNames = [t.name, ...t.alternates, t.strTeamShort].filter(Boolean);
  for (const n of allNames) {
    const norm = normalize(n);
    if (norm.length > 1 && !tsdbLookup.has(norm)) {
      tsdbLookup.set(norm, { apiFootballId: t.apiFootballId, originalName: t.name });
    }
    // Also add loose version
    const loose = normalizeLoose(n);
    if (loose.length > 1 && !tsdbLookup.has('L:' + loose)) {
      tsdbLookup.set('L:' + loose, { apiFootballId: t.apiFootballId, originalName: t.name });
    }
  }
}

// ── Match missing teams against TheSportsDB database ───────────────────────
const found = new Map(); // seedName → { id, dbName, matchType }

for (const seedName of missingTeams) {
  // Strategy 1: Exact normalized match
  const norm = normalize(seedName);
  const exact = tsdbLookup.get(norm);
  if (exact) {
    found.set(seedName, { id: exact.apiFootballId, dbName: exact.originalName, matchType: 'exact' });
    continue;
  }
  
  // Strategy 2: Loose match (strip common suffixes)
  const loose = normalizeLoose(seedName);
  const looseMatch = tsdbLookup.get('L:' + loose);
  if (looseMatch && loose.length >= 4) {
    found.set(seedName, { id: looseMatch.apiFootballId, dbName: looseMatch.originalName, matchType: 'loose' });
    continue;
  }
}

console.log(`\nMatched ${found.size} teams from league data`);

// ── Individual search for remaining teams ──────────────────────────────────
const stillMissing = missingTeams.filter(t => !found.has(t));
const searchLimit = Math.min(stillMissing.length, 400);
console.log(`Searching individually for ${searchLimit} remaining teams...`);

for (let i = 0; i < searchLimit; i++) {
  const name = stillMissing[i];
  if (i > 0 && i % 50 === 0) console.log(`  [${i}/${searchLimit}]`);
  
  try {
    const encoded = encodeURIComponent(name);
    const data = await fetchJSON(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encoded}`
    );
    if (data?.teams) {
      for (const team of data.teams) {
        if (!team.idAPIfootball || team.idAPIfootball === '0') continue;
        
        const allNames = [
          team.strTeam,
          ...(team.strTeamAlternate || '').split(/[,\/]/).map(s => s.trim()),
          team.strTeamShort || '',
        ].filter(Boolean);
        
        const seedNorm = normalize(name);
        const seedLoose = normalizeLoose(name);
        
        for (const n of allNames) {
          if (normalize(n) === seedNorm || (normalizeLoose(n) === seedLoose && seedLoose.length >= 4)) {
            found.set(name, {
              id: parseInt(team.idAPIfootball),
              dbName: team.strTeam,
              matchType: 'search',
            });
            break;
          }
        }
        if (found.has(name)) break;
      }
    }
  } catch { /* skip */ }
  await delay(200);
}

// ── ESPN teams ─────────────────────────────────────────────────────────────
const ESPN_TEAMS = {
  // NFL
  'Kansas City Chiefs': ['nfl', 'kc'], 'San Francisco 49ers': ['nfl', 'sf'],
  'Baltimore Ravens': ['nfl', 'bal'], 'Buffalo Bills': ['nfl', 'buf'],
  'Detroit Lions': ['nfl', 'det'], 'Dallas Cowboys': ['nfl', 'dal'],
  'Philadelphia Eagles': ['nfl', 'phi'], 'Miami Dolphins': ['nfl', 'mia'],
  'Green Bay Packers': ['nfl', 'gb'], 'Houston Texans': ['nfl', 'hou'],
  'Cleveland Browns': ['nfl', 'cle'], 'Cincinnati Bengals': ['nfl', 'cin'],
  'Los Angeles Rams': ['nfl', 'lar'], 'Pittsburgh Steelers': ['nfl', 'pit'],
  'Tampa Bay Buccaneers': ['nfl', 'tb'], 'Jacksonville Jaguars': ['nfl', 'jax'],
  // NHL
  'Edmonton Oilers': ['nhl', 'edm'], 'Florida Panthers': ['nhl', 'fla'],
  'Dallas Stars': ['nhl', 'dal'], 'Colorado Avalanche': ['nhl', 'col'],
  'New York Rangers': ['nhl', 'nyr'], 'Carolina Hurricanes': ['nhl', 'car'],
  'Boston Bruins': ['nhl', 'bos'], 'Vancouver Canucks': ['nhl', 'van'],
  'Toronto Maple Leafs': ['nhl', 'tor'], 'Winnipeg Jets': ['nhl', 'wpg'],
  'Tampa Bay Lightning': ['nhl', 'tb'], 'Vegas Golden Knights': ['nhl', 'vgk'],
  // MLB
  'Los Angeles Dodgers': ['mlb', 'lad'], 'Atlanta Braves': ['mlb', 'atl'],
  'Houston Astros': ['mlb', 'hou'], 'New York Yankees': ['mlb', 'nyy'],
  'Tampa Bay Rays': ['mlb', 'tb'], 'Baltimore Orioles': ['mlb', 'bal'],
  'Texas Rangers': ['mlb', 'tex'], 'Philadelphia Phillies': ['mlb', 'phi'],
  'Minnesota Twins': ['mlb', 'min'], 'Arizona Diamondbacks': ['mlb', 'ari'],
  'Milwaukee Brewers': ['mlb', 'mil'], 'Toronto Blue Jays': ['mlb', 'tor'],
};

for (const [name, [sport, abbrev]] of Object.entries(ESPN_TEAMS)) {
  if (allSeedTeams.has(name) && !mappedTeams.has(name) && !mappedNormMap.has(normalize(name))) {
    found.set(name, { 
      url: `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbrev}.png`,
      matchType: 'espn' 
    });
  }
}

// ── Generate output ────────────────────────────────────────────────────────
const results = {
  teamCdn: [],
  espn: [],
  notFound: [],
};

// Check for ID collisions against existing entries
const existingIds = new Set();
for (const m of assets.matchAll(/TEAM_CDN\((\d+)\)/g)) {
  existingIds.add(parseInt(m[1]));
}

for (const [name, info] of found) {
  if (info.url) {
    results.espn.push({ name, url: info.url });
  } else {
    // Check collision
    const collision = existingIds.has(info.id);
    results.teamCdn.push({ 
      name, 
      id: info.id, 
      matchType: info.matchType, 
      dbName: info.dbName,
      collision 
    });
  }
}

const finalMissing = missingTeams.filter(t => !found.has(t));
results.notFound = finalMissing.sort();

// Generate TypeScript entries
let tsOutput = '\n  // ── Auto-generated missing teams ──\n';
for (const entry of results.teamCdn.sort((a, b) => a.name.localeCompare(b.name))) {
  const comment = entry.collision ? ' // ⚠️ ID COLLISION' : '';
  tsOutput += `  '${entry.name}': TEAM_CDN(${entry.id}),${comment}\n`;
}
for (const entry of results.espn.sort((a, b) => a.name.localeCompare(b.name))) {
  tsOutput += `  '${entry.name}': '${entry.url}',\n`;
}

results.tsEntries = tsOutput;

fs.writeFileSync('scripts/team-ids-result-v3.json', JSON.stringify(results, null, 2));

console.log(`\n=== RESULTS ===`);
console.log(`TEAM_CDN teams found: ${results.teamCdn.length}`);
console.log(`  - Exact match: ${results.teamCdn.filter(t => t.matchType === 'exact').length}`);
console.log(`  - Loose match: ${results.teamCdn.filter(t => t.matchType === 'loose').length}`);
console.log(`  - Search match: ${results.teamCdn.filter(t => t.matchType === 'search').length}`);
console.log(`  - Collisions: ${results.teamCdn.filter(t => t.collision).length}`);
console.log(`ESPN teams: ${results.espn.length}`);
console.log(`Not found: ${results.notFound.length}`);
console.log(`\nResults written to scripts/team-ids-result-v3.json`);
