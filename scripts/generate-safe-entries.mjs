/**
 * Process API-Football results and generate safe TypeScript entries.
 * Usage: node scripts/generate-safe-entries.mjs
 */
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scripts/team-ids-apifootball.json', 'utf-8'));

// Bad contains matches to exclude (false positives)
const badContains = new Set([
  'Binacional', 'Chacarita Juniors', 'Club Atlético Progreso', 'Concord Rangers',
  'Córdoba CF', 'FC Juniors OÖ', 'Fortaleza CEIF', 'HFX Wanderers FC',
  'Independiente Rivadavia', 'New York Rangers', 'Portuguesa-RJ', 'Quilmes',
  'Rangers International', 'San Martín', 'Texas Rangers',
  'Portuguesa SP', // different from API's Portuguesa
]);

const safe = data.teamCdn.filter(t => {
  if (t.collision) return false;
  if (t.matchType === 'contains' && badContains.has(t.name)) return false;
  // Filter encoding artifacts and short names
  if (t.name.includes('\n') || t.name.includes('"') || t.name.length < 3) return false;
  return true;
});

console.log('Safe entries: ' + safe.length);

// Check for duplicate IDs within safe set
const idCounts = new Map();
for (const t of safe) {
  if (!idCounts.has(t.id)) idCounts.set(t.id, []);
  idCounts.get(t.id).push(t.name);
}
for (const [id, names] of idCounts) {
  if (names.length > 1) {
    console.log(`  ⚠️ Duplicate ID ${id}: ${names.join(', ')}`);
  }
}

// Generate TypeScript
const lines = safe
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(t => {
    const comment = t.matchType !== 'exact' ? ` // API: ${t.apiName}` : '';
    return `  '${t.name}': TEAM_CDN(${t.id}),${comment}`;
  });

fs.writeFileSync('scripts/safe-team-entries.txt', lines.join('\n'));
console.log(`\nWritten ${lines.length} entries to scripts/safe-team-entries.txt`);

// List contains matches kept for verification
const contains = safe.filter(t => t.matchType === 'contains');
console.log(`\nContains matches kept (${contains.length}):`);
contains.forEach(t => console.log(`  ${t.name} => ${t.id} (API: ${t.apiName})`));

// List not-found count
console.log(`\nNot found: ${data.notFound.length}`);
