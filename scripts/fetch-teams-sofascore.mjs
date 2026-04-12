/**
 * Round 4: Use Sofascore search API to find team IDs for remaining missing teams.
 * The app already has SOFA_TEAM() helper that generates team image URLs.
 * URL: https://api.sofascore.com/api/v1/search/teams?q=TEAMNAME
 *
 * Usage: node scripts/fetch-teams-sofascore.mjs
 */
import fs from 'fs';
import https from 'https';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
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

// ── Known sports in our app ──────────────────────────────────────────────────
// Map from competition context → Sofascore sport slug
const SPORT_MAP = {
  'FOOTBALL': 'football',
  'BASKETBALL': 'basketball',
  'HOCKEY': 'ice-hockey',
  'AMERICAN_FOOTBALL': 'american-football',
  'BASEBALL': 'baseball',
  'HANDBALL': 'handball',
};

// ── Read what's NOT found from round 3 ───────────────────────────────────────
const r3 = JSON.parse(fs.readFileSync('scripts/team-ids-round3.json', 'utf-8'));
const r2 = JSON.parse(fs.readFileSync('scripts/team-ids-round2.json', 'utf-8'));
const notFoundR3 = r3.notFound; // 458 teams

// Also read round 2 notFound to combine with round 3 found
// We want ALL unfound teams
console.log(`Teams to search: ${notFoundR3.length}`);

// ── Read current sportAssets to know what's already mapped ──────────────
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const existingSofaTeamIds = new Set();
for (const m of assets.matchAll(/SOFA_TEAM\((\d+)\)/g)) existingSofaTeamIds.add(parseInt(m[1]));

// ── Read competition context for each team from notFound data ──────────
// The round 2 notFound has format: "TeamName" (just name strings)
// We need to infer sport from the competition context. 
// Let's parse the full notFound from round 2 which has more context.

// Actually, the notFound lists are just team name strings. We need to figure out their sport
// from the broader context. Let's read the sportAssets.ts to get competition info.
// For now, assume all are football unless we can detect otherwise.

// Known non-football teams (from round 2 JSON)
const espnTeams = new Set((r2.espn || []).map(e => e.name));
const basketballTeams = new Set((r2.basketball || []).map(e => e.name));

// Teams we already mapped in round 2/3
const alreadyFound = new Set([
  ...(r2.football || []).map(e => e.name),
  ...(r2.espn || []).map(e => e.name),
  ...(r2.basketball || []).map(e => e.name),
  ...(r3.entries || []).map(e => e.name),
]);

async function main() {
  const found = [];
  const notFound = [];
  let successCount = 0;
  
  for (let i = 0; i < notFoundR3.length; i++) {
    const teamName = notFoundR3[i];
    
    try {
      const data = await fetchJSON(
        `https://api.sofascore.com/api/v1/search/teams?q=${encodeURIComponent(teamName)}`
      );
      
      if (data?.results?.length > 0) {
        const seedNorm = normalize(teamName);
        const seedStripped = seedNorm
          .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '')
          .replace(/\s+/g, ' ').trim();
        
        let bestMatch = null;
        let bestScore = 0;
        
        for (const result of data.results) {
          const team = result.entity;
          if (!team?.id || !team?.name) continue;
          
          // Skip if we already have this Sofascore ID mapped
          if (existingSofaTeamIds.has(team.id)) continue;
          
          const teamNorm = normalize(team.name);
          const teamStripped = teamNorm
            .replace(/\b(fc|sc|cf|afc|ac|fk|sk|bk|if|ff|ssc|us|as|rc|rsc|cd|ud|sd|ad|ca|se|ec|cr|sl)\b/g, '')
            .replace(/\s+/g, ' ').trim();
          
          // Scoring
          let score = 0;
          if (teamNorm === seedNorm) {
            score = 100; // Exact match
          } else if (seedStripped.length >= 4 && teamStripped === seedStripped) {
            score = 90; // Stripped match
          } else if (teamNorm.includes(seedNorm) || seedNorm.includes(teamNorm)) {
            // One contains the other
            const ratio = Math.min(teamNorm.length, seedNorm.length) / Math.max(teamNorm.length, seedNorm.length);
            score = ratio > 0.5 ? 70 + ratio * 20 : 0;
          } else if (seedStripped.length >= 5 && (teamStripped.includes(seedStripped) || seedStripped.includes(teamStripped))) {
            const ratio = Math.min(teamStripped.length, seedStripped.length) / Math.max(teamStripped.length, seedStripped.length);
            score = ratio > 0.5 ? 50 + ratio * 20 : 0;
          }
          
          // Prefer football matches (most of our teams are football)
          if (score > 0 && team.sport?.slug === 'football') score += 5;
          
          // Use Sofascore's own relevance score as tiebreaker
          if (score > 0 && result.score) score += Math.min(result.score / 1000000, 3);
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              id: team.id,
              name: team.name,
              sport: team.sport?.name || 'Football',
              country: team.country?.name || '?',
              score,
            };
          }
        }
        
        // Only accept matches with score >= 70 (exact or stripped match)
        if (bestMatch && bestScore >= 70) {
          found.push({
            seedName: teamName,
            sofascoreId: bestMatch.id,
            sofascoreName: bestMatch.name,
            sport: bestMatch.sport,
            country: bestMatch.country,
            matchScore: bestScore,
          });
          successCount++;
        } else {
          notFound.push(teamName);
        }
      } else {
        notFound.push(teamName);
      }
    } catch (e) {
      notFound.push(teamName);
    }
    
    if ((i + 1) % 25 === 0) {
      console.log(`[${i + 1}/${notFoundR3.length}] found: ${successCount}`);
    }
    
    // Sofascore rate limiting: 300ms between requests
    await delay(300);
  }
  
  // ── Generate entries ──────────────────────────────────────────────
  const entries = found.map(f => ({
    name: f.seedName,
    line: `  '${f.seedName.replace(/'/g, "\\'")}': SOFA_TEAM(${f.sofascoreId}),`,
    id: f.sofascoreId,
    sofascoreName: f.sofascoreName,
    sport: f.sport,
    country: f.country,
    matchScore: f.matchScore,
  }));
  
  // Check for duplicate Sofascore IDs
  const idMap = new Map();
  for (const e of entries) {
    if (!idMap.has(e.id)) idMap.set(e.id, []);
    idMap.get(e.id).push(e.name);
  }
  const dupes = [...idMap.entries()].filter(([, names]) => names.length > 1);
  if (dupes.length) {
    console.log(`\n⚠️ Duplicate Sofascore IDs:`);
    dupes.forEach(([id, names]) => console.log(`  ${id}: ${names.join(', ')}`));
  }
  
  // Separate high-confidence (>=90) from medium (70-89)
  const highConf = entries.filter(e => e.matchScore >= 90);
  const medConf = entries.filter(e => e.matchScore >= 70 && e.matchScore < 90);
  
  const output = {
    highConfidence: highConf.sort((a, b) => a.name.localeCompare(b.name)),
    mediumConfidence: medConf.sort((a, b) => a.name.localeCompare(b.name)),
    notFound: notFound.sort(),
    dupes: dupes.map(([id, names]) => ({ id, names })),
    stats: {
      total: notFoundR3.length,
      foundHigh: highConf.length,
      foundMedium: medConf.length,
      notFound: notFound.length,
    },
  };
  
  fs.writeFileSync('scripts/team-ids-sofascore.json', JSON.stringify(output, null, 2));
  
  console.log(`\n=== SOFASCORE SEARCH RESULTS ===`);
  console.log(`High confidence (>=90): ${highConf.length}`);
  console.log(`Medium confidence (70-89): ${medConf.length}`);
  console.log(`Not found: ${notFound.length}`);
  console.log(`Written to scripts/team-ids-sofascore.json`);
}

main().catch(console.error);
