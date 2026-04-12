/**
 * Round 2: Fetch remaining 553 missing teams from multiple sources.
 * - API-Football: retry leagues that failed + individual team search
 * - ESPN CDN: NFL, NHL, MLB  
 * - Sofascore: EuroLeague basketball
 * - Manual: Portuguese basketball, handball, ACB
 *
 * Usage: node scripts/fetch-teams-round2.mjs
 */
import fs from 'fs';
import https from 'https';

const API_KEY = process.env.APIFOOTBALL_API_KEY || process.env.RAPIDAPI_KEY;

if (!API_KEY) {
  throw new Error('Missing APIFOOTBALL_API_KEY or RAPIDAPI_KEY environment variable.');
}

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'BetIntel/1.0', ...headers },
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

function apiFetch(path) {
  return fetchJSON(`https://v3.football.api-sports.io${path}`, {
    'x-rapidapi-key': API_KEY,
    'x-rapidapi-host': 'v3.football.api-sports.io',
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalize(v) {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`ʼ]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Read existing state ─────────────────────────────────────────────────────
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const mappedTeams = new Set();
for (const m of assets.matchAll(/^\s+['"][^'"]+?['"]\s*:\s+(?:TEAM_CDN|'http)/gm)) {
  const name = m[0].match(/['"]([^'"]+)['"]/)?.[1];
  if (name) mappedTeams.add(name);
}
const aliasBlock = assets.match(/TEAM_LOGO_ALIASES[\s\S]*?^};/m);
if (aliasBlock) {
  for (const a of aliasBlock[0].matchAll(/['"]([^'"]+)['"]\s*:/gm)) {
    mappedTeams.add(a[1]);
  }
}
const existingIds = new Set();
for (const m of assets.matchAll(/TEAM_CDN\((\d+)\)/g)) existingIds.add(parseInt(m[1]));
const mappedNormMap = new Map();
for (const k of mappedTeams) mappedNormMap.set(normalize(k), k);
console.log(`Already mapped: ${mappedTeams.size} teams`);

// Read notFound from previous run
const prev = JSON.parse(fs.readFileSync('scripts/team-ids-apifootball.json', 'utf-8'));
const notFoundSet = new Set(prev.notFound);

// Read seed for context
const seed = fs.readFileSync('apps/api/src/prisma/seed.ts', 'utf-8');
const compTeams = new Map();
for (const b of seed.matchAll(/name:\s*'([^']+)'[\s\S]*?sport:\s*Sport\.(\w+)[\s\S]*?teams:\s*\[([\s\S]*?)\]/g)) {
  const comp = b[1], sport = b[2], teams = [...b[3].matchAll(/'([^']+)'/g)].map(m => m[1]);
  if (teams.length > 0) compTeams.set(comp, { sport, teams });
}

// ── Results ─────────────────────────────────────────────────────────────────
const found = new Map(); // name → { entry, comment }

// ═══════════════════════════════════════════════════════════════════════════
// 1. ESPN CDN for NFL, NHL, MLB (no API needed)
// ═══════════════════════════════════════════════════════════════════════════
const ESPN = {
  // NFL (all 32 teams - we have 16 missing)
  'Kansas City Chiefs': ['nfl', 'kc'],
  'San Francisco 49ers': ['nfl', 'sf'],
  'Baltimore Ravens': ['nfl', 'bal'],
  'Buffalo Bills': ['nfl', 'buf'],
  'Detroit Lions': ['nfl', 'det'],
  'Dallas Cowboys': ['nfl', 'dal'],
  'Philadelphia Eagles': ['nfl', 'phi'],
  'Miami Dolphins': ['nfl', 'mia'],
  'Green Bay Packers': ['nfl', 'gb'],
  'Houston Texans': ['nfl', 'hou'],
  'Cleveland Browns': ['nfl', 'cle'],
  'Cincinnati Bengals': ['nfl', 'cin'],
  'Los Angeles Rams': ['nfl', 'lar'],
  'Pittsburgh Steelers': ['nfl', 'pit'],
  'Tampa Bay Buccaneers': ['nfl', 'tb'],
  'Jacksonville Jaguars': ['nfl', 'jax'],
  // NHL
  'Edmonton Oilers': ['nhl', 'edm'],
  'Florida Panthers': ['nhl', 'fla'],
  'Dallas Stars': ['nhl', 'dal'],
  'Colorado Avalanche': ['nhl', 'col'],
  'Carolina Hurricanes': ['nhl', 'car'],
  'Boston Bruins': ['nhl', 'bos'],
  'Vancouver Canucks': ['nhl', 'van'],
  'Toronto Maple Leafs': ['nhl', 'tor'],
  'Winnipeg Jets': ['nhl', 'wpg'],
  'Tampa Bay Lightning': ['nhl', 'tb'],
  'Vegas Golden Knights': ['nhl', 'vgk'],
  // MLB
  'Los Angeles Dodgers': ['mlb', 'lad'],
  'Atlanta Braves': ['mlb', 'atl'],
  'Houston Astros': ['mlb', 'hou'],
  'New York Yankees': ['mlb', 'nyy'],
  'Tampa Bay Rays': ['mlb', 'tb'],
  'Baltimore Orioles': ['mlb', 'bal'],
  'Philadelphia Phillies': ['mlb', 'phi'],
  'Minnesota Twins': ['mlb', 'min'],
  'Arizona Diamondbacks': ['mlb', 'ari'],
  'Milwaukee Brewers': ['mlb', 'mil'],
  'Toronto Blue Jays': ['mlb', 'tor'],
};

for (const [name, [sport, abbr]] of Object.entries(ESPN)) {
  if (notFoundSet.has(name) && !mappedTeams.has(name) && !mappedNormMap.has(normalize(name))) {
    found.set(name, {
      entry: `'${name}': 'https://a.espncdn.com/i/teamlogos/${sport}/500/${abbr}.png',`,
      comment: `// ESPN ${sport.toUpperCase()}`,
      sport,
    });
  }
}
console.log(`ESPN teams: ${[...found.values()].filter(v => v.sport).length}`);

// ═══════════════════════════════════════════════════════════════════════════
// 2. EuroLeague basketball — use API-Basketball (via same RapidAPI key)
//    or hardcode Sofascore team IDs (free, no API needed)
// ═══════════════════════════════════════════════════════════════════════════
// EuroLeague teams have football club equivalents we can reuse, or use
// their API-Football parent club IDs as badge proxies
const BASKETBALL_MANUAL = {
  // EuroLeague (Sofascore team images: https://api.sofascore.com/api/v1/team/{id}/image)
  'Panathinaikos BC':         { sofaTeamId: 3442 },
  'Anadolu Efes':             { sofaTeamId: 3433 },
  'Maccabi Tel Aviv':         { sofaTeamId: 3439 },
  'CSKA Moscow':              { sofaTeamId: 3440 },
  'Bayern München Basketball':{ sofaTeamId: 3459 },
  'Partizan Belgrade':        { sofaTeamId: 3441 },
  'Crvena Zvezda':            { sofaTeamId: 3448 },
  'Virtus Bologna':           { sofaTeamId: 3436 },
  'Monaco Basket':            { sofaTeamId: 117832 },
  'Baskonia':                 { sofaTeamId: 3438 },
  'ALBA Berlin':              { sofaTeamId: 3458 },
  'Žalgiris Kaunas':          { sofaTeamId: 3443 },
  // ACB Spain
  'Valencia Basket':          { sofaTeamId: 3449 },
  'Unicaja':                  { sofaTeamId: 3451 },
  'Joventut Badalona':        { sofaTeamId: 3453 },
  'Gran Canaria':             { sofaTeamId: 3455 },
  'Murcia':                   { sofaTeamId: 3457 },
  'MoraBanc Andorra':         { sofaTeamId: 36388 },
};

for (const [name, { sofaTeamId }] of Object.entries(BASKETBALL_MANUAL)) {
  if (notFoundSet.has(name) || (!mappedTeams.has(name) && !mappedNormMap.has(normalize(name)))) {
    found.set(name, {
      entry: `'${name}': 'https://api.sofascore.com/api/v1/team/${sofaTeamId}/image',`,
      comment: '// Sofascore basketball',
    });
  }
}

// Portuguese basketball — very small clubs, may not have online logos
// Use football club badges where the basketball section shares the same club
const PT_BASKETBALL = {
  'Oliveirense':   { note: 'UD Oliveirense football badge', footballId: 4221 },
  'Imortal':       null, // no reliable source
  'Ovarense':      null,
  'Lusitânia':     null,
  'CAB Madeira':   null,
};
for (const [name, data] of Object.entries(PT_BASKETBALL)) {
  if (data && notFoundSet.has(name)) {
    found.set(name, {
      entry: `'${name}': TEAM_CDN(${data.footballId}),`,
      comment: `// ${data.note}`,
    });
  }
}

// Handball
const HANDBALL = {
  'ABC Braga': null,     // very small, no reliable CDN
  'Águas Santas': null,
};

console.log(`Basketball/handball: ${[...found.entries()].filter(([n]) => !ESPN[n]).length}`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. API-Football: fetch leagues that were missed in round 1
//    (ran out of requests before completing them)
// ═══════════════════════════════════════════════════════════════════════════
// These are football leagues with many missing teams
const LEAGUES_TO_RETRY = {
  // Leagues that likely returned empty for 2024 season
  435: 'Primera Federación',      // 27 missing
  909: 'MLS Next Pro',            // 23 missing 
  99:  'J2 League',               // 21 missing
  255: 'USL Championship',        // 20 missing
  80:  '3. Liga',                 // 19 missing
  331: 'Nigeria Premier Football League', // 19 missing
  131: 'Primera Nacional',        // 18 missing
  97:  'Campeonato de Portugal',  // 17 missing
  89:  'Eerste Divisie',          // 17 missing
  204: 'Trendyol 1.Lig',         // 16 missing
  235: 'Russian Premier League',  // 16 missing
  104: 'Norwegian 1st Division',  // 16 missing
  200: 'Botola Pro',              // 16 missing
  288: 'South African Premier Division', // 16 missing
  107: 'Betclic 1. Liga',        // 15 missing
  114: 'Superettan',             // 15 missing
  75:  'Brasileirão Série C',    // 15 missing
  486: 'Super League 2',         // 14 missing
  120: 'Betinia Liga',           // 14 missing
  521: 'J3 League',              // 14 missing
  219: '2. Liga (Áustria)',      // 13 missing
  63:  'National 1',             // 12 missing
  271: 'Fizz Liga',              // 12 missing
  208: 'Challenge League',       // 11 missing
  293: 'K League 2',             // 10 missing
  145: 'Challenger Pro League',   // 9 missing
  609: 'Gaúcho',                  // 9 missing
  605: 'Mineiro, Módulo I',       // 8 missing
  106: 'Ekstraklasa',             // 7 missing
  501: 'Canadian Premier League', // 7 missing
  42:  'League Two',              // 6 missing
  604: 'Carioca',                 // 6 missing
  265: 'Liga de Primera',         // 6 missing
  286: 'Mozzart Bet Superliga',   // 5 missing
  332: 'Niké Liga',               // 5 missing
  305: 'UAE Pro League',          // 5 missing
  // Smaller leagues
  113: 'Allsvenskan',             // 4
  119: 'Danish Superliga',        // 4
  72:  'Brasileirão Série B',     // 4
  357: 'League of Ireland',       // 3
  268: 'Liga AUF Uruguaya',       // 3
  128: 'Liga Profesional (Argentina)', // 3
  43:  'National League',         // 4
  345: 'Czech First League',      // 2
  103: 'Eliteserien',             // 2
  281: 'Liga 1',                  // 2
  98:  'J1 League',               // 2
};

async function main() {
  let apiRequests = 0;
  const apiTeams = new Map(); // norm → { id, name }

  // Sort leagues by missing count descending to prioritize
  const sortedLeagues = Object.entries(LEAGUES_TO_RETRY)
    .sort((a, b) => b[1].length - a[1].length) // just a rough sort by name length as proxy
    .map(([id]) => parseInt(id));

  console.log(`\nFetching ${sortedLeagues.length} leagues from API-Football...`);

  for (const leagueId of sortedLeagues) {
    if (apiRequests >= 70) {
      console.log(`  ⚠️ Budget limit (${apiRequests} requests), stopping`);
      break;
    }

    // Try seasons: 2025 first (for current-year leagues), then 2024, then 2023
    let gotData = false;
    for (const season of [2025, 2024, 2023]) {
      if (apiRequests >= 70) break;

      const resp = await apiFetch(`/teams?league=${leagueId}&season=${season}`);
      apiRequests++;

      if (resp?.response?.length > 0) {
        for (const entry of resp.response) {
          const team = entry.team;
          if (!team?.id || !team?.name) continue;
          const names = [team.name, team.code].filter(Boolean);
          for (const n of names) {
            const norm = normalize(n);
            if (norm.length > 1) apiTeams.set(norm, { id: team.id, name: team.name });
          }
        }
        gotData = true;
        break;
      }
      await delay(400);
    }

    if (!gotData) {
      console.log(`  ❌ No data for league ${leagueId} (${LEAGUES_TO_RETRY[leagueId]})`);
    }

    if (apiRequests % 10 === 0) {
      console.log(`  [${apiRequests} requests, ${apiTeams.size} teams]`);
    }
    await delay(300);
  }

  console.log(`API-Football: ${apiTeams.size} teams from ${apiRequests} requests`);

  // Match against notFound
  const footballMissing = prev.notFound.filter(t => !found.has(t));
  let matchCount = 0;

  for (const seedName of footballMissing) {
    const norm = normalize(seedName);

    // Exact match
    const exact = apiTeams.get(norm);
    if (exact && !existingIds.has(exact.id)) {
      found.set(seedName, {
        entry: `'${seedName}': TEAM_CDN(${exact.id}),`,
        comment: '',
      });
      matchCount++;
      continue;
    }

    // Loose match: strip common suffixes
    const stripped = norm.replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '').replace(/\s+/g, ' ').trim();
    if (stripped.length >= 4) {
      for (const [apiNorm, info] of apiTeams) {
        const apiStripped = apiNorm.replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '').replace(/\s+/g, ' ').trim();
        if (stripped === apiStripped && !existingIds.has(info.id)) {
          found.set(seedName, {
            entry: `'${seedName}': TEAM_CDN(${info.id}),`,
            comment: ` // API: ${info.name}`,
          });
          matchCount++;
          break;
        }
      }
    }
  }

  console.log(`Football matched: ${matchCount}`);

  // ═════════════════════════════════════════════════════════════════════════
  // 4. Individual team search for high-value remaining teams
  // ═════════════════════════════════════════════════════════════════════════
  const stillMissing = prev.notFound.filter(t => !found.has(t) && t.length > 3);
  const searchBudget = Math.min(70 - apiRequests, stillMissing.length);

  if (searchBudget > 0) {
    console.log(`\nSearching ${searchBudget} individual teams...`);
    let searchFound = 0;

    for (let i = 0; i < searchBudget; i++) {
      const name = stillMissing[i];
      if (apiRequests >= 70) break;

      const resp = await apiFetch(`/teams?search=${encodeURIComponent(name)}`);
      apiRequests++;

      if (resp?.response?.length > 0) {
        const seedNorm = normalize(name);
        const seedStripped = seedNorm.replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '').replace(/\s+/g, ' ').trim();

        for (const entry of resp.response) {
          const team = entry.team;
          if (!team?.id) continue;

          const teamNorm = normalize(team.name);
          const teamStripped = teamNorm.replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '').replace(/\s+/g, ' ').trim();

          if ((teamNorm === seedNorm || (seedStripped.length >= 4 && teamStripped === seedStripped)) && !existingIds.has(team.id)) {
            found.set(name, {
              entry: `'${name}': TEAM_CDN(${team.id}),`,
              comment: teamNorm !== seedNorm ? ` // API: ${team.name}` : '',
            });
            searchFound++;
            break;
          }
        }
      }

      if (i > 0 && i % 10 === 0) console.log(`  [${i}/${searchBudget}]`);
      await delay(300);
    }
    console.log(`Individual search: ${searchFound} found`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Generate output
  // ═════════════════════════════════════════════════════════════════════════
  const finalNotFound = prev.notFound.filter(t => !found.has(t));

  // Group entries for clean output
  const espnEntries = [];
  const footballEntries = [];
  const basketballEntries = [];
  const otherEntries = [];

  for (const [name, { entry, comment, sport }] of found) {
    const line = `  ${entry}${comment}`;
    if (sport) espnEntries.push({ name, line });
    else if (entry.includes('sofascore')) basketballEntries.push({ name, line });
    else if (entry.includes('TEAM_CDN')) footballEntries.push({ name, line });
    else otherEntries.push({ name, line });
  }

  const output = {
    espn: espnEntries.sort((a, b) => a.name.localeCompare(b.name)),
    football: footballEntries.sort((a, b) => a.name.localeCompare(b.name)),
    basketball: basketballEntries.sort((a, b) => a.name.localeCompare(b.name)),
    other: otherEntries.sort((a, b) => a.name.localeCompare(b.name)),
    notFound: finalNotFound.sort(),
    stats: {
      totalFound: found.size,
      espn: espnEntries.length,
      football: footballEntries.length,
      basketball: basketballEntries.length,
      other: otherEntries.length,
      notFound: finalNotFound.length,
      apiRequests,
    },
  };

  fs.writeFileSync('scripts/team-ids-round2.json', JSON.stringify(output, null, 2));

  console.log(`\n=== ROUND 2 RESULTS ===`);
  console.log(`Total found: ${found.size}`);
  console.log(`  ESPN (NFL/NHL/MLB): ${espnEntries.length}`);
  console.log(`  Football (TEAM_CDN): ${footballEntries.length}`);
  console.log(`  Basketball (Sofascore): ${basketballEntries.length}`);
  console.log(`  Other: ${otherEntries.length}`);
  console.log(`Still not found: ${finalNotFound.length}`);
  console.log(`API-Football requests used: ${apiRequests}`);
  console.log(`\nWritten to scripts/team-ids-round2.json`);
}

main().catch(console.error);
