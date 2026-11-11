// Pure team-name comparison (no app imports, so it runs in node tests).

/** "SL Benfica" → "sl benfica" (accents stripped, punctuation to spaces). */
export function nameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
}

const GENERIC = new Set(['fc', 'sc', 'sl', 'cd', 'cf', 'ac', 'afc', 'sad', 'de', 'da', 'do', 'the', 'club', 'clube', 'futebol', 'cp', 'ud', 'rc', 'sv', 'fk', 'sk', 'bk', 'as', 'us']);
const tokens = (n: string) => nameKey(n).split(' ').filter((t) => t.length >= 3 && !GENERIC.has(t));

/** Two team names are the same when one's significant words are all in the other. */
export function sameTeam(a: string, b: string): boolean {
  if (nameKey(a) === nameKey(b)) return true;
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [small, big] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  if (small.every((t) => big.has(t))) return true;
  // Transliterated first names: "Alexander Shevchenko" = "Aleksandr Shevchenko".
  const x = nameKey(a).split(' '), y = nameKey(b).split(' ');
  const lx = x[x.length - 1], ly = y[y.length - 1];
  return x.length >= 2 && y.length >= 2 && lx.length >= 4 && lx === ly && x[0].length >= 3 && y[0].length >= 3 && x[0].slice(0, 3) === y[0].slice(0, 3);
}
