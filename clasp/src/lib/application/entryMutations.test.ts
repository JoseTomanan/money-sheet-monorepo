import { expect, it } from "vitest";
import { dispatch, type DispatchDeps } from "./dispatch";
import { createEntryApplication, type EntryRepository } from "./entries";
import type { Entry } from "../domain/entry";

it("rejects a Direction edit when an intervening Tag edit makes the locked Entry incompatible", () => {
  let current: Entry = { id: 1, date: "2026-09-15", tag: "FOOD", mainCategory: "FOOD", description: "Lunch", direction: "O", amount: 100 };
  let beforeTransaction: (() => void) | undefined;
  const repository: EntryRepository = {
    list: () => [{ ...current }],
    findByMutationId: () => [],
    insert: () => { throw new Error("unused"); },
    insertMany: () => { throw new Error("unused"); },
    update: (_, patch) => { current = { ...current, ...patch }; return true; },
    remove: () => false,
  };
  const categories = { FOOD: ["Dining"] };
  const app = createEntryApplication({ repository, getCategories: () => categories, transact: (work) => {
    const intervene = beforeTransaction;
    beforeTransaction = undefined;
    intervene?.();
    return work(repository);
  } });
  const deps: DispatchDeps = { secret: "secret", getCategories: () => categories,
    addEntry: app.add, addEntries: app.addMany,
    updateEntry: app.update, deleteEntry: app.remove };
  const call = (body: Record<string, unknown>) => dispatch({ action: "updateEntry", secret: "secret", body }, deps);
  beforeTransaction = () => expect(call({ id: 1, tag: "Dining" })).toEqual({ ok: true });
  expect(call({ id: 1, direction: "I" })).toMatchObject({ ok: false, code: "validation" });
  expect(current).toMatchObject({ tag: "Dining", direction: "O", amount: 100 });
});

it("maps structured missing deletes while preserving unrelated persistence failures", () => {
  const deps = { secret: "secret", deleteEntry: () => ({ status: "not_found", id: 404 }) } as DispatchDeps;
  const request = { action: "deleteEntry", secret: "secret", body: { id: 404 } };
  expect(dispatch(request, deps)).toEqual({ ok: false, code: "not_found", error: "Entry with id 404 not found", message: "Entry with id 404 not found" });
  deps.deleteEntry = () => { throw new Error("Storage service not found"); };
  expect(dispatch(request, deps)).toMatchObject({ ok: false, code: "internal", message: "Storage service not found" });
});
