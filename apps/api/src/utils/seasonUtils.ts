// apps/api/src/utils/seasonUtils.ts

/** Returns FDCOUK season codes from 2010-11 to current, e.g. ["1011","1112",...,"2425"] */
export function getFdCoUkSeasonsFrom2010(): string[] {
  const seasons: string[] = [];
  const now = new Date();
  const currentYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  for (let y = 2010; y <= currentYear; y++) {
    const start = String(y).slice(2).padStart(2, '0');
    const end   = String(y + 1).slice(2).padStart(2, '0');
    seasons.push(`${start}${end}`);
  }
  return seasons;
}

/** Converts "2425" → "2024-25" */
export function fdCoUkCodeToCanonical(code: string): string {
  if (code.length !== 4) return code;
  const startY = parseInt(`20${code.slice(0, 2)}`);
  const endY   = String(startY + 1).slice(2);
  return `${startY}-${endY}`;
}

/** Returns canonical season string for the current football season */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

/** Converts canonical "2024-25" → API-Football season integer 2024 */
export function canonicalToApiFootballSeason(canonical: string): number {
  return parseInt(canonical.split('-')[0]);
}
