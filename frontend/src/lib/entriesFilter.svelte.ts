import { store } from './store.svelte';
import { countByCategory } from './aggregations';
import { groupByWeek, weekStartOf, weekLabel, compareEntriesForDisplay } from './groupEntries';

export function currentWeekKey(): string {
  const n = new Date();
  return weekStartOf(
    `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  );
}

export function createEntriesFilter() {
  let filterDir = $state<'all' | 'I' | 'O'>('all');
  let filterCat = $state('');
  let selectedWeek = $state(currentWeekKey());

  const filtered = $derived(
    store.entries
      .filter((e) => {
        if (filterDir !== 'all' && e.direction !== filterDir) return false;
        if (filterCat && e.mainCategory !== filterCat) return false;
        if (weekStartOf(e.date) !== selectedWeek) return false;
        return true;
      })
      .sort(compareEntriesForDisplay)
  );

  const weekGroups = $derived(groupByWeek(filtered));

  const selectableWeeks = $derived(() => {
    const cur = currentWeekKey();
    const fromEntries = groupByWeek(
      store.entries.filter(e => filterDir === 'all' || e.direction === filterDir)
    ).map(g => ({ key: g.key, label: g.label }));
    const hasCur = fromEntries.some(w => w.key === cur);
    const all = hasCur ? fromEntries : [...fromEntries, { key: cur, label: weekLabel(cur) }];
    return all.sort((a, b) => a.key.localeCompare(b.key));
  });

  $effect(() => {
    const weeks = selectableWeeks();
    if (!weeks.some(w => w.key === selectedWeek)) selectedWeek = currentWeekKey();
  });

  const catCounts = $derived(
    countByCategory(store.entries, filterDir === 'all' ? undefined : filterDir)
  );

  return {
    get filterDir() { return filterDir; },
    get filterCat() { return filterCat; },
    get selectedWeek() { return selectedWeek; },
    get filtered() { return filtered; },
    get weekGroups() { return weekGroups; },
    get selectableWeeks() { return selectableWeeks; },
    get catCounts() { return catCounts; },
    setDirection(v: 'all' | 'I' | 'O') { filterDir = v; filterCat = ''; },
    setCategory(v: string) { filterCat = v; },
    selectWeek(v: string) { selectedWeek = v; },
  };
}
