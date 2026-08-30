import { currentWeekKey } from './entriesFilter.svelte';
import { weekStartOf } from './groupEntries';

export type Route =
  | { kind: 'home' }
  | { kind: 'entries'; week: string }
  | { kind: 'summary' }
  | { kind: 'statistics' };

export interface RouteBrowser {
  location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  history: Pick<History, 'pushState' | 'replaceState'>;
}

export interface RouteResolution {
  route: Route;
  hash: string;
}

function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isWeekStart(date: string): boolean {
  return isRealDate(date) && weekStartOf(date) === date;
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case 'home': return '#/home';
    case 'entries': return `#/entries/${route.week}`;
    case 'summary': return '#/summary';
    case 'statistics': return '#/summary/statistics';
  }
}

export function routeTab(route: Route): 'home' | 'entries' | 'summary' {
  return route.kind === 'statistics' ? 'summary' : route.kind;
}

export function resolveRoute(hash: string, currentWeek = currentWeekKey()): RouteResolution {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.split('?', 1)[0];

  if (path === '/entries' || path === '/entries/' || path.startsWith('/entries/')) {
    const week = path.slice('/entries/'.length);
    const route: Route = isWeekStart(week)
      ? { kind: 'entries', week }
      : { kind: 'entries', week: currentWeek };
    return { route, hash: routeHash(route) };
  }

  if (path === '/summary/statistics' || path === '/summary/statistics/') {
    return { route: { kind: 'statistics' }, hash: '#/summary/statistics' };
  }
  if (path === '/summary' || path === '/summary/') {
    return { route: { kind: 'summary' }, hash: '#/summary' };
  }

  return { route: { kind: 'home' }, hash: '#/home' };
}

function locationUrl(browser: RouteBrowser, hash: string): string {
  return `${browser.location.pathname}${hash}`;
}

function isCanonical(browser: RouteBrowser, hash: string): boolean {
  return browser.location.hash === hash && browser.location.search === '';
}

export function createRouter(
  browser: RouteBrowser = window,
  getCurrentWeek: () => string = currentWeekKey,
) {
  const initial = resolveRoute(browser.location.hash, getCurrentWeek());
  let current = $state<Route>(initial.route);

  function replace(resolution: RouteResolution): void {
    browser.history.replaceState(null, '', locationUrl(browser, resolution.hash));
  }

  if (!isCanonical(browser, initial.hash)) replace(initial);

  return {
    get current() { return current; },
    get key() { return routeHash(current); },
    navigate(next: Route): boolean {
      if (routeHash(next) === routeHash(current) && isCanonical(browser, routeHash(next))) return false;
      browser.history.pushState(null, '', locationUrl(browser, routeHash(next)));
      current = next;
      return true;
    },
    sync(): boolean {
      const resolution = resolveRoute(browser.location.hash, getCurrentWeek());
      const changed = routeHash(resolution.route) !== routeHash(current);
      current = resolution.route;
      if (!isCanonical(browser, resolution.hash)) replace(resolution);
      return changed;
    },
  };
}
