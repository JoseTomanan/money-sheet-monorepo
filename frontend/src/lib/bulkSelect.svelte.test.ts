import { describe, it, expect, vi } from "vitest";
import { createBulkSelect } from "./bulkSelect.svelte";

function makeBulk(ids: number[]) {
  const deleteEntries = vi.fn(() => ({ accepted: true, completion: Promise.resolve(true) }));
  const bulk = createBulkSelect(() => ids, deleteEntries);
  return { bulk, deleteEntries };
}

describe("createBulkSelect — toggle", () => {
  it("toggling an id adds it to selectedIds", () => {
    const { bulk } = makeBulk([1, 2, 3]);
    bulk.toggle(1);
    expect(bulk.selectedIds.has(1)).toBe(true);
  });

  it("toggling a selected id removes it", () => {
    const { bulk } = makeBulk([1, 2, 3]);
    bulk.toggle(1);
    bulk.toggle(1);
    expect(bulk.selectedIds.has(1)).toBe(false);
  });
});

describe("createBulkSelect — selectAll / clear", () => {
  it("selectAll selects every id from the injected getter", () => {
    const { bulk } = makeBulk([1, 2, 3]);
    bulk.selectAll();
    expect([...bulk.selectedIds].sort()).toEqual([1, 2, 3]);
  });

  it("clear empties the selection", () => {
    const { bulk } = makeBulk([1, 2, 3]);
    bulk.selectAll();
    bulk.clear();
    expect(bulk.selectedIds.size).toBe(0);
  });
});

describe("createBulkSelect — allSelected", () => {
  it("false when nothing is selectable", () => {
    const { bulk } = makeBulk([]);
    expect(bulk.allSelected).toBe(false);
  });

  it("false when only some selectable ids are selected", () => {
    const { bulk } = makeBulk([1, 2, 3]);
    bulk.toggle(1);
    expect(bulk.allSelected).toBe(false);
  });

  it("true when every selectable id is selected", () => {
    const { bulk } = makeBulk([1, 2, 3]);
    bulk.selectAll();
    expect(bulk.allSelected).toBe(true);
  });
});

describe("createBulkSelect — confirmDelete", () => {
  it('keeps the selected IDs and confirmation open when admission is refused', async () => {
    const bulk = createBulkSelect(() => [1, 2], () => ({ accepted: false, completion: Promise.resolve(false) }));
    bulk.selectAll();
    bulk.confirmOpen = true;
    const onDone = vi.fn();
    await bulk.confirmDelete(onDone);
    expect(bulk.selectedIds).toEqual(new Set([1, 2]));
    expect(bulk.confirmOpen).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });
  it("calls the injected deleteEntries with the selected ids", async () => {
    const { bulk, deleteEntries } = makeBulk([1, 2, 3]);
    bulk.toggle(1);
    bulk.toggle(2);
    await bulk.confirmDelete(() => {});
    expect(deleteEntries).toHaveBeenCalledWith([1, 2]);
  });

  it("closes the confirm dialog before deleting", async () => {
    const { bulk } = makeBulk([1]);
    bulk.toggle(1);
    bulk.confirmOpen = true;
    const promise = bulk.confirmDelete(() => {});
    expect(bulk.confirmOpen).toBe(false);
    await promise;
  });

  it("finishes selection while the accepted delete is unresolved", async () => {
    let resolve!: (saved: boolean) => void;
    const deleteEntries = vi.fn(() => ({ accepted: true, completion: new Promise<boolean>(done => { resolve = () => done(true); }) }));
    const bulk = createBulkSelect(() => [1], deleteEntries);
    bulk.toggle(1);
    const onDone = vi.fn();
    const completion = bulk.confirmDelete(onDone);
    expect(onDone).toHaveBeenCalledOnce();
    expect(bulk.selectedIds.size).toBe(0);
    resolve(true);
    await completion;
  });
});
