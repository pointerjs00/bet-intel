/**
 * Round 3: Use TheSportsDB to find remaining teams.
 * TheSportsDB has idAPIfootball which maps directly to TEAM_CDN() IDs.
 * 
 * Strategy:
 * 1. Bulk lookup by league (more reliable than individual search)
 * 2. Individual search for remaining teams
 *
 * Usage: node scripts/fetch-teams-round3.mjs
 */
import fs from 'fs';
import https from 'https';

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

// ── Read current state ──────────────────────────────────────────────────────
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

// Read round 2 not-found
const r2 = JSON.parse(fs.readFileSync('scripts/team-ids-round2.json', 'utf-8'));
const notFound = r2.notFound;
console.log(`Round 2 not found: ${notFound.length}`);

// Also include the round 2 found football teams (to add to existingIds so we don't collide)
for (const e of r2.football) {
  const idMatch = e.line.match(/TEAM_CDN\((\d+)\)/);
  if (idMatch) existingIds.add(parseInt(idMatch[1]));
}

// ── TheSportsDB league IDs for football leagues with many missing ──────────
// Mapping: TheSportsDB league ID → our competition name
const TSDB_LEAGUES = {
  // Leagues API-Football couldn't cover (no data for any season)
  4567: 'Primera Federación',      // Spain 3rd
  5082: 'MLS Next Pro',            // USA developmental
  4353: 'J2 League',               // Japan 2nd
  4771: 'USL Championship',        // USA 2nd tier
  4351: '3. Liga',                 // Germany 3rd
  4415: 'Nigeria Premier Football League',
  4404: 'Primera Nacional',        // Argentina 2nd
  4481: 'Campeonato de Portugal',  // Portugal 3rd
  4345: 'Eerste Divisie',          // Netherlands 2nd
  4343: 'Trendyol 1.Lig',         // Turkey 2nd
  4355: 'Russian Premier League',
  4457: 'Norwegian 1st Division',
  4412: 'Botola Pro',              // Morocco
  4414: 'South African Premier Division',
  4474: 'Betclic 1. Liga',        // Poland 2nd
  4360: 'Superettan',             // Sweden 2nd
  4476: 'Brasileirão Série C',
  4487: 'Super League 2',         // Greece 2nd
  4362: 'Betinia Liga',           // Denmark 2nd
  4475: 'J3 League',              // Japan 3rd
  4485: '2. Liga (Áustria)',      // Austria 2nd
  4483: 'National 1',             // France 3rd
  4385: 'Fizz Liga',              // Hungary
  4567: 'Challenge League',       // Switzerland 2nd (same ID as Primera Fed...)
  4382: 'K League 2',             // S. Korea 2nd
  4571: 'Challenger Pro League',  // Belgium 2nd
  4480: 'Gaúcho',                 // Brazil state
  4482: 'Mineiro, Módulo I',      // Brazil state
  4370: 'Ekstraklasa',            // Poland
  5087: 'Canadian Premier League',
  4338: 'League Two',             // England
  4479: 'Paulista Série A1',      // Brazil state
  4604: 'Carioca',                // Brazil state (guess ID)
  4408: 'Liga de Primera',        // Chile
  4397: 'Mozzart Bet Superliga',  // Serbia
  4486: 'Niké Liga',              // Slovakia
  4416: 'UAE Pro League',
  4339: 'National League',        // England 5th
  4359: 'Allsvenskan',            // Sweden
  4361: 'Danish Superliga',       // Denmark
  4390: 'Brasileirão Série B',    // Brazil
  4411: 'League of Ireland',
  4399: 'Liga AUF Uruguaya',      // Uruguay
  4403: 'Liga Profesional (Argentina)',
  4373: 'Czech First League',
  4358: 'Eliteserien',            // Norway
  4406: 'Liga 1',                 // Peru
  4352: 'J1 League',              // Japan
  4344: 'Ligue 2',                // France
  4395: 'Bundesliga (Áustria)',
  4422: 'Scottish Championship',
  4354: 'Ukrainian Premier League',
  4369: 'Romanian SuperLiga',
  4345: 'Eerste Divisie',
  4393: 'Primera A',              // Colombia
  4346: 'Liga MX',                // Mexico
};

async function main() {
  const found = new Map(); // name → { id, source }
  const tsdbTeams = new Map(); // norm → { id, name }
  
  const uniqueLeagueIds = [...new Set(Object.keys(TSDB_LEAGUES).map(Number))];
  console.log(`\nFetching ${uniqueLeagueIds.length} TheSportsDB leagues...`);
  
  let leaguesFetched = 0;
  for (const leagueId of uniqueLeagueIds) {
    try {
      const data = await fetchJSON(
        `https://www.thesportsdb.com/api/v1/json/3/lookup_all_teams.php?id=${leagueId}`
      );
      if (data?.teams) {
        for (const team of data.teams) {
          const apiId = team.idAPIfootball;
          if (!apiId || apiId === '0' || apiId === 0) continue;
          const id = parseInt(apiId);
          
          // Gather all name variants
          const names = [
            team.strTeam,
            team.strTeamShort,
            ...(team.strTeamAlternate || '').split(/[,\/]/).map(s => s.trim()),
          ].filter(Boolean);
          
          for (const n of names) {
            const norm = normalize(n);
            if (norm.length > 1 && !tsdbTeams.has(norm)) {
              tsdbTeams.set(norm, { id, name: team.strTeam });
            }
          }
        }
        leaguesFetched++;
      }
    } catch (e) {
      console.error(`  Failed ${leagueId}: ${e.message}`);
    }
    
    if (leaguesFetched % 10 === 0 && leaguesFetched > 0) {
      console.log(`  [${leaguesFetched} leagues, ${tsdbTeams.size} teams]`);
    }
    await delay(400);
  }
  
  console.log(`TheSportsDB: ${tsdbTeams.size} teams from ${leaguesFetched} leagues`);
  
  // ── Match not-found teams ──────────────────────────────────────────────
  const notFoundSet = new Set(notFound);
  
  for (const seedName of notFound) {
    const norm = normalize(seedName);
    
    // Exact normalized match
    const exact = tsdbTeams.get(norm);
    if (exact && !existingIds.has(exact.id)) {
      found.set(seedName, { id: exact.id, source: 'league', dbName: exact.name });
      continue;
    }
    
    // Loose match (strip common suffixes)
    const stripped = norm
      .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl|united|city|town|athletic|rovers|wanderers)\b/g, '')
      .replace(/\s+/g, ' ').trim();
    
    if (stripped.length >= 4) {
      for (const [apiNorm, info] of tsdbTeams) {
        if (existingIds.has(info.id)) continue;
        const apiStripped = apiNorm
          .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl|united|city|town|athletic|rovers|wanderers)\b/g, '')
          .replace(/\s+/g, ' ').trim();
        if (stripped === apiStripped) {
          found.set(seedName, { id: info.id, source: 'league-loose', dbName: info.name });
          break;
        }
      }
    }
  }
  
  console.log(`League matches: ${found.size}`);
  
  // ── Individual search for remaining teams ─────────────────────────────
  const stillMissing = notFound.filter(t => !found.has(t) && t.length > 3);
  const searchLimit = Math.min(stillMissing.length, 500);
  console.log(`\nSearching ${searchLimit} individual teams on TheSportsDB...`);
  
  let searchHits = 0;
  for (let i = 0; i < searchLimit; i++) {
    const name = stillMissing[i];
    
    try {
      const data = await fetchJSON(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`
      );
      if (data?.teams) {
        const seedNorm = normalize(name);
        const seedStripped = seedNorm
          .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl|united|city|town|athletic|rovers|wanderers)\b/g, '')
          .replace(/\s+/g, ' ').trim();
        
        for (const team of data.teams) {
          if (!team.idAPIfootball || team.idAPIfootball === '0') continue;
          const id = parseInt(team.idAPIfootball);
          if (existingIds.has(id)) continue;
          
          const allNames = [
            team.strTeam,
            team.strTeamShort,
            ...(team.strTeamAlternate || '').split(/[,\/]/).map(s => s.trim()),
          ].filter(Boolean);
          
          for (const n of allNames) {
            const tNorm = normalize(n);
            const tStripped = tNorm
              .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl|united|city|town|athletic|rovers|wanderers)\b/g, '')
              .replace(/\s+/g, ' ').trim();
            
            if (tNorm === seedNorm || (seedStripped.length >= 4 && tStripped === seedStripped)) {
              found.set(name, { id, source: 'search', dbName: team.strTeam });
              searchHits++;
              break;
            }
          }
          if (found.has(name)) break;
        }
      }
    } catch { /* skip */ }
    
    if (i > 0 && i % 50 === 0) console.log(`  [${i}/${searchLimit}] (${searchHits} found)`);
    await delay(250);
  }
  
  console.log(`Individual search: ${searchHits} found from ${searchLimit} searches`);
  
  // ── Generate output ──────────────────────────────────────────────────
  const finalNotFound = notFound.filter(t => !found.has(t));
  
  const entries = [];
  for (const [name, info] of found) {
    const comment = info.source !== 'league' ? ` // TSDB: ${info.dbName}` : '';
    entries.push({
      name,
      line: `  '${name}': TEAM_CDN(${info.id}),${comment}`,
      id: info.id,
    });
  }
  
  // Check for duplicate IDs within our found set
  const idMap = new Map();
  for (const e of entries) {
    if (!idMap.has(e.id)) idMap.set(e.id, []);
    idMap.get(e.id).push(e.name);
  }
  const dupes = [...idMap.entries()].filter(([, names]) => names.length > 1);
  if (dupes.length) {
    console.log(`\n⚠️ Duplicate IDs found:`);
    dupes.forEach(([id, names]) => console.log(`  ${id}: ${names.join(', ')}`));
  }
  
  const output = {
    entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
    notFound: finalNotFound.sort(),
    dupes: dupes.map(([id, names]) => ({ id, names })),
    stats: {
      found: found.size,
      notFound: finalNotFound.length,
    },
  };
  
  fs.writeFileSync('scripts/team-ids-round3.json', JSON.stringify(output, null, 2));
  
  console.log(`\n=== ROUND 3 RESULTS ===`);
  console.log(`Found: ${found.size}`);
  console.log(`Not found: ${finalNotFound.length}`);
  console.log(`Written to scripts/team-ids-round3.json`);
}

main().catch(console.error);
