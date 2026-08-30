import { describe, expect, it } from 'vitest';
import { createRouter, resolveRoute, routeHash, type RouteBrowser } from './router.svelte';

function fakeBrowser(initialPath: string) {
  let url = new URL(initialPath, 'https://money.example');
  const pushes: string[] = [];
  const replacements: string[] = [];
  const browser = {
    location: {
      get hash() { return url.hash; },
      get pathname() { return url.pathname; },
      get search() { return url.search; },
    },
    history: {
      pushState(_state: unknown, _title: string, next: string | URL | null) {
        pushes.push(String(next));
        url = new URL(String(next), url.origin);
      },
      replaceState(_state: unknown, _title: string, next: string | URL | null) {
        replacements.push(String(next));
        url = new URL(String(next), url.origin);
      },
    },
    setUrl(next: string) { url = new URL(next, url.origin); },
  } as unknown as RouteBrowser & { setUrl(next: string): void };
  return { browser, pushes, replacements };
}

describe('resolveRoute', () => {
  const currentWeek = '2026-05-24';

  it.each([
    ['#/home', { kind: 'home' }, '#/home'],
    ['#/entries/2026-05-24', { kind: 'entries', week: '2026-05-24' }, '#/entries/2026-05-24'],
    ['#/summary', { kind: 'summary' }, '#/summary'],
    ['#/summary/statistics', { kind: 'statistics' }, '#/summary/statistics'],
  ] as const)('parses canonical route %s', (hash, route, canonicalHash) => {
    expect(resolveRoute(hash, currentWeek)).toEqual({ route, hash: canonicalHash });
  });

  it.each([
    '#/entries',
    '#/entries/',
    '#/entries/2026-05-25',
    '#/entries/2026-02-30',
    '#/entries/not-a-date',
  ])('resolves malformed Entries route %s to the current week', (hash) => {
    expect(resolveRoute(hash, currentWeek)).toEqual({
      route: { kind: 'entries', week: currentWeek },
      hash: `#/entries/${currentWeek}`,
    });
  });

  it('removes query strings and trailing slashes while retaining a valid route', () => {
    expect(resolveRoute('#/entries/2026-05-24?source=share', currentWeek)).toEqual({
      route: { kind: 'entries', week: '2026-05-24' },
      hash: '#/entries/2026-05-24',
    });
    expect(resolveRoute('#/summary/statistics/', currentWeek)).toEqual({
      route: { kind: 'statistics' },
      hash: '#/summary/statistics',
    });
  });

  it('resolves bare and unknown routes to Home', () => {
    expect(resolveRoute('', currentWeek)).toEqual({ route: { kind: 'home' }, hash: '#/home' });
    expect(resolveRoute('#/unknown', currentWeek)).toEqual({ route: { kind: 'home' }, hash: '#/home' });
  });
});

describe('createRouter', () => {
  it('replaces a noncanonical initial URL without creating history', () => {
    const { browser, pushes, replacements } = fakeBrowser('/money-sheet/?gasUrl=x#/summary/');
    const router = createRouter(browser, () => '2026-05-24');

    expect(router.current).toEqual({ kind: 'summary' });
    expect(pushes).toEqual([]);
    expect(replacements).toEqual(['/money-sheet/#/summary']);
  });

  it('pushes deliberate changes once and ignores no-op navigation', () => {
    const { browser, pushes } = fakeBrowser('/money-sheet/#/home');
    const router = createRouter(browser, () => '2026-05-24');

    expect(router.navigate({ kind: 'summary' })).toBe(true);
    expect(router.navigate({ kind: 'summary' })).toBe(false);
    expect(pushes).toEqual(['/money-sheet/#/summary']);
    expect(routeHash(router.current)).toBe('#/summary');
  });

  it('synchronizes browser traversal without pushing a second entry', () => {
    const { browser, pushes } = fakeBrowser('/money-sheet/#/home');
    const router = createRouter(browser, () => '2026-05-24');
    router.navigate({ kind: 'summary' });

    browser.setUrl('/money-sheet/#/entries/2026-05-17');
    expect(router.sync()).toBe(true);
    expect(router.current).toEqual({ kind: 'entries', week: '2026-05-17' });
    expect(pushes).toEqual(['/money-sheet/#/summary']);
  });
});
