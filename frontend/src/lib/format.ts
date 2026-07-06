const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export function peso(n: number, symbol = '₱'): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? `-${symbol}` : symbol) + s;
}

/** ISO "YYYY-MM-DD" → "M/D/YY" */
export function fmtDate(iso: string): string {
  if (!ISO_RE.test(iso)) return '—';
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
  if (!ISO_RE.test(iso)) return '';
  return DAYS[new Date(iso + 'T00:00:00').getDay()];
}

/** ISO "YYYY-MM-DD" → "YYYY-MM" */
export function yearMonth(iso: string): string {
  return iso.slice(0, 7);
}

/** The user's wall-clock calendar day as "YYYY-MM-DD" — local-date semantics, never UTC. */
export function today(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function currentYearMonth(): string {
  return today().slice(0, 7);
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'] as const;

/** "YYYY-MM" → "June 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "YYYY-MM" → "Jun" */
export function monthShort(ym: string): string {
  return MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];
}

/** "YYYY-MM" shifted by delta months (delta may be negative) → "YYYY-MM" */
export function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + delta;
  const ny = Math.floor(t / 12);
  const nm = (t - ny * 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Number of days in a "YYYY-MM" month */
export function daysInYearMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
