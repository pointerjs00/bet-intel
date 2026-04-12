/**
 * Batch-fetch API-Football IDs by looking up ENTIRE LEAGUES from TheSportsDB.
 * This is much more reliable than individual team searches.
 * Outputs JSON results to scripts/team-ids-result.json
 * 
 * Usage: node scripts/fetch-leagues-bulk.mjs
 */
import fs from 'fs';
import https from 'https';

// TheSportsDB league IDs mapped to our competition names
const LEAGUE_LOOKUPS = {
  // Major European
  4351: '3. Liga',                    // Germany 3rd div
  4355: 'Russian Premier League',
  4350: '2. Bundesliga',              // might find missing ones
  4344: 'Ligue 2',
  4483: 'National 1',                 // France 3rd
  4338: 'League Two',                 // England 4th
  4339: 'National League',            // England 5th
  4457: 'Norwegian 1st Division',
  4360: 'Superettan',                 // Sweden 2nd
  4358: 'Eliteserien',               // Norway top (for aliases)
  4359: 'Allsvenskan',               // Sweden top
  4361: 'Danish Superliga',
  4362: 'Betinia Liga',              // Denmark 2nd
  4337: 'Championship',               // for missing
  4343: 'Trendyol 1.Lig',            // Turkey 2nd
  4345: 'Eerste Divisie',            // Netherlands 2nd
  4354: 'Ukrainian Premier League',
  4395: 'Bundesliga (Áustria)',       // Austria top
  4485: '2. Liga (Áustria)',          // Austria 2nd
  4525: 'Super League (Suíça)',       // Switzerland
  4567: 'Challenge League',           // Switzerland 2nd
  4336: 'Super League (Grécia)',      // Greece top
  4487: 'Super League 2',            // Greece 2nd
  4370: 'Ekstraklasa',               // Poland
  4474: 'Betclic 1. Liga',           // Poland 2nd
  4369: 'Romanian SuperLiga',
  4374: 'Croatian HNL',              // HNL
  4397: 'Mozzart Bet Superliga',     // Serbia
  4385: 'Fizz Liga',                 // Hungary
  4373: 'Czech First League',
  4486: 'Niké Liga',                 // Slovakia
  4422: 'Scottish Championship',
  4423: 'Scottish League One',
  4424: 'Scottish League Two',
  4347: 'Jupiler Pro League',        // Belgium top
  4571: 'Challenger Pro League',     // Belgium 2nd
  // South America
  4403: 'Liga Profesional (Argentina)',
  4404: 'Primera Nacional',          // Argentina 2nd
  4390: 'Brasileirão Série B',
  4476: 'Brasileirão Série C',
  4478: 'Copa del Rey',              // might not work
  // Mexico
  4346: 'Liga MX',                   // for Club Puebla
  // Perú
  4406: 'Liga 1',
  // Uruguay
  4399: 'Liga AUF Uruguaya',
  // Colombia
  4393: 'Primera A',
  // Chile  
  4408: 'Liga de Primera',
  // Morocco
  4412: 'Botola Pro',
  // South Africa
  4414: 'South African Premier Division',
  // Nigeria
  4415: 'Nigeria Premier Football League',
  // Japan
  4353: 'J2 League',
  4475: 'J3 League',
  4352: 'J1 League',
  // Korea
  4382: 'K League 2',
  // UAE
  4416: 'UAE Pro League',
  // Canada
  5087: 'Canadian Premier League',
  // USA
  4771: 'USL Championship',
  5082: 'MLS Next Pro',
  // Ireland
  4411: 'League of Ireland',
  // Spain  
  4567: 'Primera Federación',       // might not be on TheSportsDB
  // Campeonato de Portugal
  4481: 'Campeonato de Portugal',
  // Estado Brasileiros
  4479: 'Paulista Série A1',
  4480: 'Gaúcho',
  4481: 'Carioca',
  4482: 'Mineiro, Módulo I',
};

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

// ── Read current mapped teams ──────────────────────────────────────────────────
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const teamSection = assets.match(/export const TEAM_LOGOS[\s\S]*?^};/m)[0];
const mappedTeams = new Set();
for (const m of teamSection.matchAll(/^\s+'([^']+)':\s+/gm)) mappedTeams.add(m[1]);
const aliasMatch = assets.match(/const TEAM_LOGO_ALIASES[\s\S]*?^};/m);
if (aliasMatch) for (const m of aliasMatch[0].matchAll(/^\s+'([^']+)':/gm)) mappedTeams.add(m[1]);

function normalize(v) {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-zA-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
const normMap = new Map();
for (const k of mappedTeams) normMap.set(normalize(k), k);

// ── Read seed teams ──────────────────────────────────────────────────────────
const seed = fs.readFileSync('apps/api/src/prisma/seed.ts', 'utf-8');
const seedTeams = new Set();
for (const block of seed.matchAll(/teams:\s*\[([\s\S]*?)\]/g)) {
  for (const n of block[1].matchAll(/'([^']+)'/g)) {
    if (n[1].length > 1) seedTeams.add(n[1]);
  }
}

// ── Known ESPN mappings ──────────────────────────────────────────────────────
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

async function main() {
  const found = new Map(); // name → { id, source }

  // 1. ESPN teams
  for (const [name, abbrev] of Object.entries({ ...NFL_TEAMS, ...NHL_TEAMS, ...MLB_TEAMS })) {
    const sport = NFL_TEAMS[name] ? 'nfl' : NHL_TEAMS[name] ? 'nhl' : 'mlb';
    found.set(name, { url: `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbrev}.png`, source: 'espn' });
  }

  // 2. Fetch all leagues
  const leagueIds = [...new Set(Object.keys(LEAGUE_LOOKUPS).map(Number))];
  console.log(`Fetching ${leagueIds.length} leagues from TheSportsDB...`);
  
  for (const leagueId of leagueIds) {
    const url = `https://www.thesportsdb.com/api/v1/json/3/lookup_all_teams.php?id=${leagueId}`;
    try {
      const data = await fetchJSON(url);
      if (data?.teams) {
        for (const team of data.teams) {
          const apiId = team.idAPIfootball;
          if (!apiId || apiId === '0') continue;
          
          // Check if this team matches any seed team
          const names = [team.strTeam, ...(team.strTeamAlternate || '').split(',').map(s => s.trim())].filter(Boolean);
          
          for (const seedName of seedTeams) {
            if (found.has(seedName)) continue;
            if (mappedTeams.has(seedName) || normMap.has(normalize(seedName))) continue;
            
            const seedNorm = normalize(seedName);
            for (const n of names) {
              if (normalize(n) === seedNorm || n === seedName) {
                found.set(seedName, { id: parseInt(apiId), source: 'league', dbName: team.strTeam });
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`Failed league ${leagueId}: ${e.message}`);
    }
    await delay(300);
  }

  // 3. Individual search for remaining important teams not found via leagues
  const stillMissing = [...seedTeams].filter(t => 
    !found.has(t) && !mappedTeams.has(t) && !normMap.has(normalize(t)) && t.length > 1
  );
  
  console.log(`\nSearching individually for ${Math.min(stillMissing.length, 300)} remaining teams...`);
  
  // Search at most 300 teams individually
  for (let i = 0; i < Math.min(stillMissing.length, 300); i++) {
    const name = stillMissing[i];
    if (i > 0 && i % 50 === 0) console.log(`  [${i}/${Math.min(stillMissing.length, 300)}]`);
    
    try {
      const encoded = encodeURIComponent(name);
      const data = await fetchJSON(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encoded}`);
      if (data?.teams) {
        for (const team of data.teams) {
          if (!team.idAPIfootball || team.idAPIfootball === '0') continue;
          const names = [team.strTeam, ...(team.strTeamAlternate || '').split(',').map(s => s.trim())].filter(Boolean);
          const seedNorm = normalize(name);
          for (const n of names) {
            if (normalize(n) === seedNorm) {
              found.set(name, { id: parseInt(team.idAPIfootball), source: 'search', dbName: team.strTeam });
              break;
            }
          }
          if (found.has(name)) break;
        }
      }
    } catch { /* skip */ }
    await delay(200);
  }

  // 4. Write results to file
  const results = {
    espn: [],
    teamCdn: [],
    notFound: [],
  };

  for (const [name, info] of found) {
    if (info.source === 'espn') {
      results.espn.push({ name, url: info.url });
    } else {
      results.teamCdn.push({ name, id: info.id, source: info.source });
    }
  }
  
  const finalMissing = [...seedTeams].filter(t => 
    !found.has(t) && !mappedTeams.has(t) && !normMap.has(normalize(t)) && t.length > 1
  );
  results.notFound = finalMissing.sort();

  fs.writeFileSync('scripts/team-ids-result.json', JSON.stringify(results, null, 2));
  
  console.log(`\n=== RESULTS ===`);
  console.log(`ESPN teams: ${results.espn.length}`);
  console.log(`TEAM_CDN teams: ${results.teamCdn.length}`);
  console.log(`Not found: ${results.notFound.length}`);
  console.log(`\nResults written to scripts/team-ids-result.json`);
}

main().catch(console.error);
