/**
 * Generate the combined insertion text from rounds 2, 3, and Sofascore results.
 * Outputs to scripts/batch3-entries.txt — ready to paste into sportAssets.ts
 *
 * Usage: node scripts/generate-batch3.mjs
 */
import fs from 'fs';

const r2 = JSON.parse(fs.readFileSync('scripts/team-ids-round2.json', 'utf-8'));
const r3 = JSON.parse(fs.readFileSync('scripts/team-ids-round3.json', 'utf-8'));
const sofa = JSON.parse(fs.readFileSync('scripts/team-ids-sofascore.json', 'utf-8'));

// Read existing sportAssets.ts to check for collisions
const assets = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');

// ── Exclude bad medium-confidence matches ─────────────────────────────────
const medExclude = new Set([
  'Atlético-CE',            // Wrong club (Atlético Central ≠ Atlético-CE)
  'Democrata-GV',           // Uncertain match
  'Dender EH',              // U21 team
  'GD Bragança',            // U19 team
  'Hassania Agadir',        // Basketball version
  'Imortal',                // B team
  'Ionikos Nikaia',         // U23 basketball
  'Kallithea',              // U19 team
  'Næstved BK',             // U17 team
  'Roda JC',                // U14 team
  'São José-RS',            // U20 team
  'Swallows FC',            // Wrong club (Malta vs SA)
  'US Schaffhausen',        // U18 team
]);

// ── Duplicate handling ─────────────────────────────────────────────────────
// Dupes: FC Machida Zelvia / Machida Zelvia → keep Machida Zelvia
// Dupes: Grulla Morioka / Iwate Grulla Morioka → keep from high conf
const dupExclude = new Set([
  'FC Machida Zelvia',  // keep Machida Zelvia
]);

// ── Collect all entries ────────────────────────────────────────────────────
const allEntries = new Map(); // name → line
const allAliases = new Map(); // alias → canonical

// Round 2: ESPN (NFL/NHL/MLB)
for (const e of r2.espn) {
  allEntries.set(e.name, e.line.trim());
}

// Round 2: Football (TEAM_CDN)
for (const e of r2.football) {
  allEntries.set(e.name, e.line.trim());
}

// Round 2: Basketball (Sofascore URLs)
for (const e of r2.basketball) {
  // Convert direct URLs to SOFA_TEAM() format
  const idMatch = e.line.match(/team\/(\d+)\/image/);
  if (idMatch) {
    allEntries.set(e.name, `'${e.name}': SOFA_TEAM(${idMatch[1]}),`);
  } else {
    allEntries.set(e.name, e.line.trim());
  }
}

// Round 3: TheSportsDB (TEAM_CDN)
for (const e of r3.entries) {
  if (allEntries.has(e.name)) continue; // round 2 takes priority
  allEntries.set(e.name, e.line.trim());
}

// Sofascore: high confidence
for (const e of sofa.highConfidence) {
  if (allEntries.has(e.name)) continue; // earlier rounds take priority
  if (dupExclude.has(e.name)) continue;
  allEntries.set(e.name, e.line.trim());
}

// Sofascore: medium confidence (filtered)
for (const e of sofa.mediumConfidence) {
  if (allEntries.has(e.name)) continue;
  if (medExclude.has(e.name)) continue;
  if (dupExclude.has(e.name)) continue;
  allEntries.set(e.name, e.line.trim());
}

// ── Add aliases for duplicates ─────────────────────────────────────────────
allAliases.set('FC Machida Zelvia', 'Machida Zelvia');
// Grulla Morioka → Iwate Grulla Morioka (should be in high confidence already)
// Check if Iwate Grulla Morioka is in entries
if (allEntries.has('Iwate Grulla Morioka') && !allEntries.has('Grulla Morioka')) {
  allAliases.set('Grulla Morioka', 'Iwate Grulla Morioka');
}

// ── Filter out already-existing teams ──────────────────────────────────────
const existing = new Set();
for (const m of assets.matchAll(/^\s+['"]([^'"]+)['"]\s*:\s+(?:TEAM_CDN|SOFA_TEAM|'http)/gm)) {
  existing.add(m[1]);
}
for (const m of assets.matchAll(/^\s+['"]([^'"]+)['"]\s*:\s+['"]([^'"]+)['"]/gm)) {
  existing.add(m[1]);
}

let skipped = 0;
for (const [name] of allEntries) {
  if (existing.has(name)) {
    allEntries.delete(name);
    skipped++;
  }
}

console.log(`Total entries: ${allEntries.size} (${skipped} skipped as already mapped)`);
console.log(`Total aliases: ${allAliases.size}`);

// ── Group entries by source/type ──────────────────────────────────────────
const espnEntries = [];
const footballCdnEntries = [];
const basketballEntries = [];
const sofascoreEntries = [];

for (const [name, line] of allEntries) {
  if (line.includes('espncdn.com')) {
    espnEntries.push({ name, line });
  } else if (line.includes('TEAM_CDN')) {
    footballCdnEntries.push({ name, line });
  } else if (line.includes('SOFA_TEAM') && r2.basketball?.find(b => b.name === name)) {
    basketballEntries.push({ name, line });
  } else if (line.includes('SOFA_TEAM')) {
    sofascoreEntries.push({ name, line });
  } else {
    sofascoreEntries.push({ name, line }); // catch-all
  }
}

// Sort each group alphabetically
espnEntries.sort((a, b) => a.name.localeCompare(b.name));
footballCdnEntries.sort((a, b) => a.name.localeCompare(b.name));
basketballEntries.sort((a, b) => a.name.localeCompare(b.name));
sofascoreEntries.sort((a, b) => a.name.localeCompare(b.name));

// ── Generate insertion text ───────────────────────────────────────────────
let text = '';
text += '\n  // ── Batch 3: Multi-source verified (2025-07-15) ─────────────────────────\n';

if (espnEntries.length) {
  text += '  // ESPN CDN — NFL, NHL, MLB\n';
  for (const e of espnEntries) {
    // Pad for alignment
    const pad = Math.max(0, 38 - e.name.length - 2);
    text += `  '${e.name}':${' '.repeat(pad)} ${e.line.split(': ').slice(1).join(': ').replace(/,$/, '')},\n`;
  }
  text += '\n';
}

if (footballCdnEntries.length) {
  text += '  // API-Football CDN — TheSportsDB + Round 2 verified\n';
  for (const e of footballCdnEntries) {
    text += `  ${e.line}\n`;
  }
  text += '\n';
}

if (basketballEntries.length) {
  text += '  // Sofascore — Basketball (EuroLeague, ACB)\n';
  for (const e of basketballEntries) {
    text += `  ${e.line}\n`;
  }
  text += '\n';
}

if (sofascoreEntries.length) {
  text += '  // Sofascore team images — broad coverage\n';
  for (const e of sofascoreEntries) {
    text += `  ${e.line}\n`;
  }
}

// ── Aliases text ──────────────────────────────────────────────────────────
let aliasText = '';
if (allAliases.size) {
  for (const [alias, canonical] of allAliases) {
    aliasText += `  '${alias}': '${canonical}',\n`;
  }
}

fs.writeFileSync('scripts/batch3-entries.txt', text);
fs.writeFileSync('scripts/batch3-aliases.txt', aliasText);

console.log(`\nEntries written to scripts/batch3-entries.txt`);
console.log(`Aliases written to scripts/batch3-aliases.txt`);
console.log(`\nBreakdown:`);
console.log(`  ESPN: ${espnEntries.length}`);
console.log(`  Football CDN: ${footballCdnEntries.length}`);
console.log(`  Basketball: ${basketballEntries.length}`);
console.log(`  Sofascore: ${sofascoreEntries.length}`);
console.log(`  Aliases: ${allAliases.size}`);

// Also write the not-found list for reference
const stillMissing = [
  ...sofa.notFound,
  ...Array.from(medExclude),
].sort();
fs.writeFileSync('scripts/still-missing.txt', stillMissing.join('\n'));
console.log(`\nStill missing: ${stillMissing.length} (written to scripts/still-missing.txt)`);
