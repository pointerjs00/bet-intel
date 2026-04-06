/**
 * Generates apps/mobile/utils/sofascoreTournaments.ts from sofascore-data.json.
 * Usage: node scripts/generate-sofascore-ts.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('sofascore-data.json', 'utf-8'));

const lines = [];

lines.push(`// Auto-generated from Sofascore API — ${new Date().toISOString().slice(0, 10)}`);
lines.push('// Do NOT edit manually. Re-generate with: node scripts/generate-sofascore-ts.mjs');
lines.push('// Image URL: https://img.sofascore.com/api/v1/unique-tournament/${id}/image');
lines.push('');

// Write the flat name→id map
lines.push('/** Sofascore unique-tournament IDs for competitions with confirmed logo images. */');
lines.push('export const SOFASCORE_TOURNAMENT_IDS: Record<string, number> = {');

const allTournaments = [];
for (const [, d] of Object.entries(data)) {
  d.tournaments.filter(t => t.hasLogo).forEach(t => {
    allTournaments.push(t);
  });
}

// Deduplicate by name
const seen = new Set();
const uniqueTournaments = allTournaments.filter(t => {
  if (seen.has(t.name)) return false;
  seen.add(t.name);
  return true;
});
uniqueTournaments.sort((a, b) => a.name.localeCompare(b.name));

for (const t of uniqueTournaments) {
  const key = t.name.includes("'") ? JSON.stringify(t.name) : `'${t.name}'`;
  lines.push(`  ${key}: ${t.id},`);
}
lines.push('};');
lines.push('');

// Category fallback IDs
lines.push('/** Sofascore category IDs for series-level fallback logos. */');
lines.push('export const SOFASCORE_CATEGORY_IDS: Record<string, number> = {');
const categories = {};
for (const [, d] of Object.entries(data)) {
  for (const cat of d.categories) {
    categories[cat.name] = cat.id;
  }
}
for (const [name, id] of Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]))) {
  const key = name.includes("'") ? JSON.stringify(name) : `'${name}'`;
  lines.push(`  ${key}: ${id},`);
}
lines.push('};');
lines.push('');

// Country groupings per sport (for the collapsible UI)
lines.push('/** Tournaments grouped by country per sport. Countries sorted by tournament count desc. */');
lines.push('export const SPORT_COUNTRY_TOURNAMENTS: Record<string, Record<string, string[]>> = {');
for (const [sport, d] of Object.entries(data)) {
  lines.push(`  ${sport}: {`);
  const groups = {};
  d.tournaments.filter(t => t.hasLogo).forEach(t => {
    if (!groups[t.country]) groups[t.country] = [];
    groups[t.country].push(t.name);
  });
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  for (const [country, tournaments] of sorted) {
    const key = country.includes("'") ? JSON.stringify(country) : `'${country}'`;
    lines.push(`    ${key}: ${JSON.stringify(tournaments)},`);
  }
  lines.push('  },');
}
lines.push('};');
lines.push('');

// Country alpha-2 codes (for flag display)
lines.push('/** Country name → alpha-2 ISO code from Sofascore. */');
lines.push('export const SOFASCORE_COUNTRY_CODES: Record<string, string> = {');
const countryCodes = {};
for (const [, d] of Object.entries(data)) {
  for (const cat of d.categories) {
    if (cat.alpha2) countryCodes[cat.name] = cat.alpha2;
  }
}
for (const [name, code] of Object.entries(countryCodes).sort((a, b) => a[0].localeCompare(b[0]))) {
  const key = name.includes("'") ? JSON.stringify(name) : `'${name}'`;
  lines.push(`  ${key}: '${code}',`);
}
lines.push('};');
lines.push('');

// Helper functions
lines.push('const SOFA_URL = (id: number): string =>');
lines.push('  `https://img.sofascore.com/api/v1/unique-tournament/${id}/image`;');
lines.push('');
lines.push('const SOFA_CAT_URL = (id: number): string =>');
lines.push('  `https://img.sofascore.com/api/v1/category/${id}/image`;');
lines.push('');
lines.push('/** Get Sofascore CDN URL for a tournament/competition name, or null if not found. */');
lines.push('export function getSofascoreTournamentLogoUrl(name: string): string | null {');
lines.push('  const id = SOFASCORE_TOURNAMENT_IDS[name];');
lines.push('  if (id) return SOFA_URL(id);');
lines.push('  const catId = SOFASCORE_CATEGORY_IDS[name];');
lines.push('  if (catId) return SOFA_CAT_URL(catId);');
lines.push('  return null;');
lines.push('}');
lines.push('');
lines.push('/** Get Sofascore category image URL for a country name. */');
lines.push('export function getSofascoreCategoryLogoUrl(categoryName: string): string | null {');
lines.push('  const catId = SOFASCORE_CATEGORY_IDS[categoryName];');
lines.push('  return catId ? SOFA_CAT_URL(catId) : null;');
lines.push('}');
lines.push('');

const content = lines.join('\n');
writeFileSync('apps/mobile/utils/sofascoreTournaments.ts', content);

console.log(`Generated: ${(content.length / 1024).toFixed(1)}KB, ${uniqueTournaments.length} tournaments, ${Object.keys(categories).length} categories, ${Object.keys(countryCodes).length} country codes`);
