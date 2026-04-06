/**
 * Sofascore bulk tournament/team fetcher.
 * Fetches all tournaments (unique-tournaments) for each sport from Sofascore,
 * tests which ones have working logo images, and outputs a JSON file with results.
 *
 * Usage: node scripts/fetch-sofascore-data.mjs
 */

const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36', Accept: 'application/json' };
const SOFA_BASE = 'https://www.sofascore.com/api/v1';
const IMG_BASE = 'https://img.sofascore.com/api/v1';

// Map Sofascore sport names → our Sport enum
const SPORT_MAP = {
  football: 'FOOTBALL',
  basketball: 'BASKETBALL',
  tennis: 'TENNIS',
  handball: 'HANDBALL',
  volleyball: 'VOLLEYBALL',
  'ice-hockey': 'HOCKEY',
  rugby: 'RUGBY',
  'american-football': 'AMERICAN_FOOTBALL',
  baseball: 'BASEBALL',
};

async function fetchJson(url) {
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function testImage(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: H, signal: AbortSignal.timeout(6000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchCategoriesForSport(sofaSport) {
  const data = await fetchJson(`${SOFA_BASE}/sport/${sofaSport}/categories`);
  return data.categories.map(c => ({
    id: c.id,
    name: c.name,
    flag: c.flag,
    alpha2: c.alpha2,
  }));
}

async function fetchTournamentsForCategory(categoryId) {
  try {
    const data = await fetchJson(`${SOFA_BASE}/category/${categoryId}/unique-tournaments`);
    const tournaments = data.groups.flatMap(g => g.uniqueTournaments);
    // Deduplicate by ID
    const seen = new Set();
    return tournaments.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    }).map(t => ({
      id: t.id,
      name: t.name,
    }));
  } catch {
    return [];
  }
}

async function main() {
  const allData = {};

  for (const [sofaSport, ourSport] of Object.entries(SPORT_MAP)) {
    console.log(`\n=== ${ourSport} (${sofaSport}) ===`);
    
    let categories;
    try {
      categories = await fetchCategoriesForSport(sofaSport);
    } catch (err) {
      console.log(`  SKIP: ${err.message}`);
      continue;
    }
    console.log(`  ${categories.length} categories found`);

    const sportData = { categories: [], tournaments: [] };
    const tournamentMap = new Map(); // id → tournament data

    // Process all categories
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const tournaments = await fetchTournamentsForCategory(cat.id);
      if (tournaments.length === 0) continue;

      sportData.categories.push({
        id: cat.id,
        name: cat.name,
        alpha2: cat.alpha2,
        tournamentCount: tournaments.length,
      });

      for (const t of tournaments) {
        if (!tournamentMap.has(t.id)) {
          tournamentMap.set(t.id, {
            id: t.id,
            name: t.name,
            country: cat.name,
            alpha2: cat.alpha2,
          });
        }
      }

      if ((i + 1) % 20 === 0) process.stdout.write(`  ${i + 1}/${categories.length} categories...`);
    }
    
    // Test images in batches for tournaments
    const tournaments = Array.from(tournamentMap.values());
    console.log(`\n  ${tournaments.length} unique tournaments — testing images...`);
    
    let withLogo = 0;
    const BATCH = 30;
    for (let i = 0; i < tournaments.length; i += BATCH) {
      const batch = tournaments.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async t => {
          const hasLogo = await testImage(`${IMG_BASE}/unique-tournament/${t.id}/image`);
          return { ...t, hasLogo };
        })
      );
      for (const r of results) {
        if (r.hasLogo) withLogo++;
        sportData.tournaments.push(r);
      }
      process.stdout.write('.');
    }
    
    console.log(`\n  ${withLogo}/${tournaments.length} have logos`);
    allData[ourSport] = sportData;
  }

  // Write results
  const fs = await import('fs');
  fs.writeFileSync('sofascore-data.json', JSON.stringify(allData, null, 2));
  
  // Print summary
  console.log('\n\n=== SUMMARY ===');
  for (const [sport, data] of Object.entries(allData)) {
    const withLogos = data.tournaments.filter(t => t.hasLogo).length;
    console.log(`${sport}: ${data.categories.length} countries, ${data.tournaments.length} tournaments (${withLogos} with logos)`);
  }
  console.log('\nData written to sofascore-data.json');
}

main().catch(e => console.error(e));
