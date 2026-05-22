const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Normalize any reasonable date string to "YYYY-MM-DD". Returns "" for unrecognized input. */
export function normalizeDate(raw: string): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Fallback: parse Date.toString() format (e.g. from GAS String(date) serialization)
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  }
  return '';
}
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;

export function peso(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-₱' : '₱') + s;
}

/** ISO "YYYY-MM-DD" → "M/D/YY" */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

/** ISO "YYYY-MM-DD" → "May 21" */
export function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

/** ISO "YYYY-MM-DD" → "Mon" */
export function dayOfWeek(iso: string): string {
  return DAYS[new Date(iso + 'T00:00:00').getDay()];
}

/** ISO "YYYY-MM-DD" → "YYYY-MM" */
export function yearMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
