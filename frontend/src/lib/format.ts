const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
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
