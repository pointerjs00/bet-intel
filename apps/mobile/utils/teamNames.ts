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
  return small.every((t) => big.has(t));
}
