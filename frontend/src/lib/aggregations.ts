import { yearMonth } from './format';
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

export function outgoingByCategory(entries: Entry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (e.direction !== 'O') continue;
    result[e.mainCategory] = (result[e.mainCategory] ?? 0) + e.amount;
  }
  return result;
}

export function countByCategory(entries: Entry[], direction?: Direction): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (direction !== undefined && e.direction !== direction) continue;
    result[e.mainCategory] = (result[e.mainCategory] ?? 0) + 1;
  }
  return result;
}
