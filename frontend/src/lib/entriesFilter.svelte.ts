import type { Entry } from './types';
import { countByCategory } from './aggregations';
import { groupByWeek, weekStartOf, weekLabel, compareEntriesForDisplay } from './groupEntries';
import { today } from './format';

export function currentWeekKey(): string {
  return weekStartOf(today());
}

export function createEntriesFilter(getEntries: () => Entry[], getSelectedWeek: () => string) {
  let filterDir = $state<'all' | 'I' | 'O'>('all');
  let filterCat = $state('');

  const filtered = $derived(
    getEntries()
      .filter((e) => {
        if (filterDir !== 'all' && e.direction !== filterDir) return false;
        if (filterCat && e.mainCategory !== filterCat) return false;
        if (weekStartOf(e.date) !== getSelectedWeek()) return false;
        return true;
      })
      .sort(compareEntriesForDisplay)
  );

  const weekGroups = $derived(groupByWeek(filtered));

  const selectableWeeks = $derived(() => {
    const cur = currentWeekKey();
    const fromEntries = groupByWeek(
      getEntries().filter(e => filterDir === 'all' || e.direction === filterDir)
    ).map(g => ({ key: g.key, label: g.label }));
    const keys = new Set([...fromEntries.map(w => w.key), cur, getSelectedWeek()]);
    return [...keys]
      .map(key => fromEntries.find(w => w.key === key) ?? { key, label: weekLabel(key) })
      .sort((a, b) => a.key.localeCompare(b.key));
  });

  const catCounts = $derived(
    countByCategory(getEntries(), filterDir === 'all' ? undefined : filterDir)
  );

  return {
    get filterDir() { return filterDir; },
    get filterCat() { return filterCat; },
    get filtered() { return filtered; },
    get weekGroups() { return weekGroups; },
    get selectableWeeks() { return selectableWeeks; },
    get catCounts() { return catCounts; },
    setDirection(v: 'all' | 'I' | 'O') { filterDir = v; filterCat = ''; },
    setCategory(v: string) { filterCat = v; },
  };
}
