/**
 * Cross-package parity tests — enforces that the "shared" domain algorithms
 * documented in CONTEXT.md actually produce identical output in both packages.
 *
 * A red test here means clasp and frontend have diverged on the same rule.
 * These tests are the enforcement mechanism replacing the "shared with…" comment
 * in clasp/src/lib/weeks.ts.
 *
 * Import paths are deliberate: we import clasp's pure lib by relative path.
 * Both files are plain TypeScript with no GAS runtime globals.
 */

import { describe, it, expect } from 'vitest';
import { weekStartOf, weekLabel } from './groupEntries';
// @ts-ignore — cross-package import; clasp lib is pure TS with no GAS globals
import { weekStartOfStr, weekLabelFromStr } from '../../../clasp/src/lib/weeks';
import { isValidTag } from './domain';
// @ts-ignore — cross-package import
import { checkTagDirection } from '../../../clasp/src/lib/dispatch';
import type { CategoryMap } from './types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const WEEK_START_FIXTURES: string[] = [
  // All seven weekdays
  '2026-01-04', // Sunday
  '2026-01-05', // Monday
  '2026-01-06', // Tuesday
  '2026-01-07', // Wednesday
  '2026-01-08', // Thursday
  '2026-01-09', // Friday
  '2026-01-10', // Saturday
  // Dec 31 / Jan 1 crossings
  '2025-12-31',
  '2026-01-01',
  '2026-01-02',
  '2026-01-03',
  // Multi-year range
  '2024-02-29', // leap day
  '2023-12-25',
  '2022-07-04',
];

const CATEGORIES: CategoryMap = {
  FOOD: ['Groceries', 'Dining'],
  HOUSING: ['Rent', 'Utilities'],
  MISC: ['Tools'],
};

// ---------------------------------------------------------------------------
// Parity: weekStartOf ≡ weekStartOfStr
// ---------------------------------------------------------------------------
describe('week-start parity: frontend weekStartOf ≡ clasp weekStartOfStr', () => {
  for (const dateStr of WEEK_START_FIXTURES) {
    it(`agrees on week start for ${dateStr}`, () => {
      expect(weekStartOf(dateStr)).toBe(weekStartOfStr(dateStr));
    });
  }
});

// ---------------------------------------------------------------------------
// Parity: weekLabel ≡ weekLabelFromStr
// ---------------------------------------------------------------------------
describe('week-label parity: frontend weekLabel ≡ clasp weekLabelFromStr', () => {
  for (const dateStr of WEEK_START_FIXTURES) {
    it(`produces the same label for week starting ${dateStr}`, () => {
      const start = weekStartOf(dateStr);
      expect(weekLabel(start)).toBe(weekLabelFromStr(start));
    });
  }
});

// ---------------------------------------------------------------------------
// Parity: isValidTag ≡ checkTagDirection === null
// ---------------------------------------------------------------------------
const TAG_FIXTURES: Array<{ tag: string; direction: 'I' | 'O'; expectedValid: boolean }> = [
  // Valid Incoming (Category tags)
  { tag: 'FOOD',    direction: 'I', expectedValid: true  },
  { tag: 'HOUSING', direction: 'I', expectedValid: true  },
  // Valid Outgoing (Subcategory tags)
  { tag: 'Groceries', direction: 'O', expectedValid: true  },
  { tag: 'Rent',      direction: 'O', expectedValid: true  },
  // Invalid: Category tag on Outgoing
  { tag: 'FOOD',    direction: 'O', expectedValid: false },
  { tag: 'HOUSING', direction: 'O', expectedValid: false },
  // Invalid: Subcategory tag on Incoming
  { tag: 'Groceries', direction: 'I', expectedValid: false },
  { tag: 'Rent',      direction: 'I', expectedValid: false },
  // Invalid: unknown tag
  { tag: 'Unknown', direction: 'I', expectedValid: false },
  { tag: 'Unknown', direction: 'O', expectedValid: false },
];

describe('tag-polymorphism parity: frontend isValidTag ≡ clasp checkTagDirection===null', () => {
  for (const { tag, direction, expectedValid } of TAG_FIXTURES) {
    it(`tag="${tag}" direction="${direction}" → valid=${expectedValid}`, () => {
      const frontendResult = isValidTag(tag, direction, CATEGORIES);
      const claspResult = checkTagDirection(tag, direction, CATEGORIES);
      // Both must agree on validity
      expect(frontendResult).toBe(expectedValid);
      expect(claspResult === null).toBe(expectedValid);
    });
  }
});
