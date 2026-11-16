const FLAG_CDN = (code: string) => `https://flagcdn.com/w40/${code}.png`;

/** UK nations and other non-ISO codes houses use, mapped to flagcdn's codes. */
const ALIASES: Record<string, string> = { eng: 'gb-eng', sco: 'gb-sct', sct: 'gb-sct', wal: 'gb-wls', wls: 'gb-wls', nir: 'gb-nir' };
/** Codes that name no single country ("world", "international"). */
const NO_FLAG = new Set(['ww', 'int', 'wo', 'xx']);

/** flagcdn URL of a competition's country code ("PT", "GB-ENG", "EU"), or null when it names no country. */
export function flagUrlForCode(code: string | undefined | null): string | null {
  const c = (code ?? '').trim().toLowerCase();
  if (!c || NO_FLAG.has(c)) return null;
  if (ALIASES[c]) return FLAG_CDN(ALIASES[c]);
  if (/^[a-z]{2}$/.test(c) || /^gb-(eng|sct|wls|nir)$/.test(c)) return FLAG_CDN(c);
  return null;
}
