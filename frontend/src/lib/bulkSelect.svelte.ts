import type { EntrySubmission } from './types';
export function createBulkSelect(
  getSelectableIds: () => number[],
  deleteEntries: (ids: number[]) => EntrySubmission
) {
  let selectedIds = $state(new Set<number>());
  let confirmOpen = $state(false);

  const allSelected = $derived(
    getSelectableIds().length > 0 && getSelectableIds().every(id => selectedIds.has(id))
  );

  function toggle(id: number): void {
    if (selectedIds.has(id)) {
      selectedIds = new Set([...selectedIds].filter(x => x !== id));
    } else {
      selectedIds = new Set([...selectedIds, id]);
    }
  }

  function selectAll(): void {
    selectedIds = new Set(getSelectableIds());
  }

  function clear(): void {
    selectedIds = new Set();
  }

  async function confirmDelete(onDone: () => void): Promise<void> {
    const submission = deleteEntries([...selectedIds]);
    if (!submission.accepted) return;
    confirmOpen = false;
    clear();
    onDone();
    await submission.completion;
  }

  return {
    get selectedIds() { return selectedIds; },
    get confirmOpen() { return confirmOpen; },
    set confirmOpen(v: boolean) { confirmOpen = v; },
    get allSelected() { return allSelected; },
    toggle,
    selectAll,
    clear,
    confirmDelete,
  };
}
