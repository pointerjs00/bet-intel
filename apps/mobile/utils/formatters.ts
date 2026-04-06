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

/** Formats a decimal odd to two places. */
export function formatOdds(value: number | string): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
}

/** Formats a percentage with one decimal place. */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Formats an ISO date as a compact relative time in pt-PT style. */
export function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const deltaMs = timestamp - Date.now();
  const seconds = Math.round(deltaMs / 1000);

  const formatter = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, unitSeconds] of units) {
    if (Math.abs(seconds) >= unitSeconds) {
      return formatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }

  return formatter.format(seconds, 'second');
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