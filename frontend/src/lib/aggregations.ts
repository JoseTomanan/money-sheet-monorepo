import { daysInYearMonth, shiftYearMonth, yearMonth } from './format';
import type { Direction, Entry } from './types';

export function totalOutgoing(entries: Entry[]): number {
  return entries.filter(e => e.direction === 'O').reduce((s, e) => s + e.amount, 0);
}

export function totalIncoming(entries: Entry[]): number {
  return entries.filter(e => e.direction === 'I').reduce((s, e) => s + e.amount, 0);
}

export function outgoingByMonth(entries: Entry[], ym: string): number {
  return entries
    .filter(e => e.direction === 'O' && yearMonth(e.date) === ym)
    .reduce((s, e) => s + e.amount, 0);
}

export function incomingByMonth(entries: Entry[], ym: string): number {
  return entries
    .filter(e => e.direction === 'I' && yearMonth(e.date) === ym)
    .reduce((s, e) => s + e.amount, 0);
}

export function outgoingByCategory(entries: Entry[], ym?: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (e.direction !== 'O') continue;
    if (ym !== undefined && yearMonth(e.date) !== ym) continue;
    result[e.mainCategory] = (result[e.mainCategory] ?? 0) + e.amount;
  }
  return result;
}

export interface MonthFlow {
  ym: string;
  incoming: number;
  outgoing: number;
}

/** Incoming/outgoing totals for the `months` consecutive months ending at `endYm`, oldest first. */
export function flowByMonth(entries: Entry[], endYm: string, months: number): MonthFlow[] {
  const result: MonthFlow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = shiftYearMonth(endYm, -i);
    result.push({
      ym,
      incoming: incomingByMonth(entries, ym),
      outgoing: outgoingByMonth(entries, ym),
    });
  }
  return result;
}

/** Cumulative outgoing per day of month: index 0 = total through day 1, last = month total. */
export function cumulativeOutgoingByDay(entries: Entry[], ym: string): number[] {
  const days = daysInYearMonth(ym);
  const daily = new Array<number>(days).fill(0);
  for (const e of entries) {
    if (e.direction !== 'O' || yearMonth(e.date) !== ym) continue;
    const d = Number(e.date.slice(8, 10));
    if (d >= 1 && d <= days) daily[d - 1] += e.amount;
  }
  let run = 0;
  return daily.map(v => (run += v));
}

export function countByCategory(entries: Entry[], direction?: Direction): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (direction !== undefined && e.direction !== direction) continue;
    result[e.mainCategory] = (result[e.mainCategory] ?? 0) + 1;
  }
  return result;
}
