/**
 * Apply batch 3 entries and aliases to sportAssets.ts
 */
const fs = require('fs');

const asset = fs.readFileSync('apps/mobile/utils/sportAssets.ts', 'utf-8');
const batch = fs.readFileSync('scripts/batch3-entries.txt', 'utf-8');
const aliases = fs.readFileSync('scripts/batch3-aliases.txt', 'utf-8');

// Detect line ending
const eol = asset.includes('\r\n') ? '\r\n' : '\n';
const batchFixed = batch.replace(/\r?\n/g, eol);
const aliasFixed = aliases.replace(/\r?\n/g, eol);

// Insert batch 3 entries before closing }; of TEAM_LOGOS
const marker = `  'São Bernardo FC':        TEAM_CDN(7865),${eol}};`;
if (!asset.includes(marker)) {
  console.error('MARKER NOT FOUND');
  process.exit(1);
}

let result = asset.replace(
  marker,
  `  'São Bernardo FC':        TEAM_CDN(7865),${eol}${eol}` + batchFixed + `};`
);

// Insert aliases before closing }; of TEAM_LOGO_ALIASES
const aliasMarker = `  'Deportivo Riestra': 'Riestra',${eol}};`;
if (!result.includes(aliasMarker)) {
  console.error('ALIAS MARKER NOT FOUND');
  process.exit(1);
}

result = result.replace(
  aliasMarker,
  `  'Deportivo Riestra': 'Riestra',${eol}` + aliasFixed + `};`
);

fs.writeFileSync('apps/mobile/utils/sportAssets.ts', result, 'utf-8');
console.log('sportAssets.ts updated');
console.log('New line count:', result.split('\n').length);
