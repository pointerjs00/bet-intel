/** Formats a decimal number as Euro currency using pt-PT conventions. */
export function formatCurrency(value: number | string): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

/** Formats a decimal odd to two places, pt-PT ("2,20"). */
export function formatOdds(value: number | string): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2).replace('.', ',') : '0,00';
}

/** Formats a percentage pt-PT: "8,6%", "−100%" (no trailing ",0"). `signed` adds "+" to positives. */
export function formatPercentage(value: number, digits = 1, signed = false): string {
  if (!Number.isFinite(value)) return '0%';
  const abs = Math.abs(value);
  const txt = abs.toFixed(digits).replace(/\.0+$/, '').replace('.', ',');
  const sign = value < 0 && Number(txt.replace(',', '.')) !== 0 ? '−' : signed && value > 0 ? '+' : '';
  return `${sign}${txt}%`;
}

/** Signed euro amount: "+12,00 €", "−10,00 €". */
export function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

/** Portuguese plural: plural(1, 'seleção', 'seleções') → "1 seleção". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Formats an ISO date as a compact relative time in pt-PT style. */
export function formatRelativeTime(value: string | undefined | null): string {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (isNaN(timestamp)) return '';
  const deltaMs = Date.now() - timestamp;
  const seconds = Math.round(deltaMs / 1000);
  const absSeconds = Math.abs(seconds);

  const past = seconds >= 0;

  if (absSeconds < 60) return past ? 'agora mesmo' : 'em breve';
  if (absSeconds < 3600) {
    const m = Math.round(absSeconds / 60);
    return past ? `há ${m} min` : `em ${m} min`;
  }
  if (absSeconds < 86400) {
    const h = Math.round(absSeconds / 3600);
    return past ? `há ${h}h` : `em ${h}h`;
  }
  if (absSeconds < 86400 * 7) {
    const d = Math.round(absSeconds / 86400);
    return past ? `há ${d} dia${d !== 1 ? 's' : ''}` : `em ${d} dia${d !== 1 ? 's' : ''}`;
  }
  if (absSeconds < 86400 * 30) {
    const w = Math.round(absSeconds / (86400 * 7));
    return past ? `há ${w} sem.` : `em ${w} sem.`;
  }
  if (absSeconds < 86400 * 365) {
    const mo = Math.round(absSeconds / (86400 * 30));
    const unit = mo === 1 ? 'mês' : 'meses';
    return past ? `há ${mo} ${unit}` : `em ${mo} ${unit}`;
  }
  const y = Math.round(absSeconds / (86400 * 365));
  return past ? `há ${y} ano${y !== 1 ? 's' : ''}` : `em ${y} ano${y !== 1 ? 's' : ''}`;
}

/** Formats a date string with pt-PT date and time. */
export function formatShortDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
}

/** Formats an ISO date string as DD/MM/YYYY (always slashes, UTC date part). Returns '' if invalid. */
export function formatDateToDDMMYYYY(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  // Use UTC components to match how dates are stored (noon UTC) — avoids timezone date shifts.
  // Always uses '/' separator for compatibility with parseDDMMYYYYToISO across all platforms.
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Parses a DD/MM/YYYY string into an ISO 8601 string (noon UTC), or null if invalid.
 * Used to convert user-entered bet dates to ISO before sending to the API.
 */
export function parseDDMMYYYYToISO(input: string): string | null {
  const parts = input.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y || y < 2000 || y > 2100) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** Parses a DD/MM/YYYY string into a Date object, or null if invalid. */
export function parseDDMMYYYYToDate(input: string): Date | null {
  const iso = parseDDMMYYYYToISO(input);
  return iso ? new Date(iso) : null;
}

/** Formats a date string using a full pt-PT date. */
export function formatLongDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  });
}

/** Resolves the best available live minute, falling back to elapsed time from kick-off. */
export function formatLiveClock(value: string | null | undefined, eventDate: string | Date): string | null {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  const kickOff = eventDate instanceof Date ? eventDate : new Date(eventDate);
  const kickOffMs = kickOff.getTime();
  if (!Number.isFinite(kickOffMs)) {
    return null;
  }

  const elapsedMinutes = Math.floor((Date.now() - kickOffMs) / 60000);
  if (elapsedMinutes < 0 || elapsedMinutes > 150) {
    return null;
  }

  return `${Math.max(1, elapsedMinutes)}'`;
}