import { describe, expect, it, vi } from "vitest";
import type { DispatchDeps } from "../application/dispatch";
import { handleGet, handlePost } from "./http";

function deps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    secret: "secret",
    getCategories: vi.fn(() => ({ FOOD: ["Dining"] })),
    getMaster: vi.fn(),
    getEntries: vi.fn(() => []),
    getConfig: vi.fn(),
    getStats: vi.fn(),
    getEntryById: vi.fn(),
    addEntry: vi.fn(),
    addEntries: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    ...overrides,
  };
}

describe("HTTP presentation", () => {
  it("translates GET parameters into the existing read action", () => {
    const getCategories = vi.fn(() => ({ FOOD: ["Dining"] }));

    expect(handleGet({ action: "getCategories" }, deps({ getCategories }))).toEqual({
      ok: true,
      categories: { FOOD: ["Dining"] },
    });
    expect(getCategories).toHaveBeenCalledOnce();
  });

  it("translates a JSON POST without changing authentication inputs", () => {
    const addEntry = vi.fn(() => ({
      status: "created" as const,
      entry: {
        id: 1,
        date: "2026-09-15",
        tag: "FOOD",
        mainCategory: "FOOD",
        description: "allocation",
        direction: "I" as const,
        amount: 100,
      },
    }));

    const response = handlePost(JSON.stringify({
      action: "addEntry",
      secret: "secret",
      mutationId: "mutation-1",
      date: "2026-09-15",
      tag: "FOOD",
      description: "allocation",
      direction: "I",
      amount: 100,
    }), deps({ addEntry }));

    expect(response).toEqual(expect.objectContaining({
      ok: true,
      entry: expect.objectContaining({ id: 1 }),
    }));
    expect(addEntry).toHaveBeenCalledWith(expect.objectContaining({
      mutationId: "mutation-1",
      amount: 100,
    }));
  });

  it("preserves the internal error envelope for malformed JSON", () => {
    const response = handlePost("not-json", deps());

    expect(response).toEqual({
      ok: false,
      error: expect.stringContaining("SyntaxError"),
      code: "internal",
      message: expect.stringContaining("SyntaxError"),
    });
  });
});
