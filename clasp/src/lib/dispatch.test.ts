import { describe, it, expect, vi } from "vitest";
import { dispatch, type DispatchDeps } from "./dispatch";

// ──────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────

const CATEGORY_MAP = {
  FOOD: ["Groceries", "Dining"],
  HOUSING: ["Rent", "Utilities"],
  FINANCE: ["Savings", "Investment"],
};

/** Entry returned by the fake data store */
const STORED_ENTRY = {
  id: 1,
  date: "2026-01-15",
  tag: "Dining",
  mainCategory: "FOOD",
  description: "Lunch",
  direction: "O" as const,
  amount: 100,
};

function makeDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    secret: "correct-secret",
    getCategories: () => CATEGORY_MAP,
    addEntry: (payload) => ({
      id: 99,
      mainCategory: "FOOD",
      ...payload,
    }),
    addEntries: (payloads) => payloads.map((payload, i) => ({
      id: 100 + i,
      mainCategory: "FOOD",
      ...payload,
    })),
    updateEntry: (_id, _patch) => {},
    deleteEntry: (id) => {
      if (id !== 1) throw new Error(`Entry ${id} not found`);
    },
    getEntryById: (id) => (id === 1 ? STORED_ENTRY : null),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// Cycle 1 — Auth error
// ──────────────────────────────────────────────────────────────

describe("auth", () => {
  it("returns auth error code when secret is missing", () => {
    const deps = makeDeps();
    const res = dispatch({ action: "addEntry", secret: undefined, body: {} }, deps);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("auth");
  });

  it("returns auth error code when secret is wrong", () => {
    const deps = makeDeps();
    const res = dispatch({ action: "addEntry", secret: "wrong", body: {} }, deps);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("auth");
  });

  it("does not require auth for read actions", () => {
    const deps = makeDeps({ getCategories: () => CATEGORY_MAP });
    const res = dispatch({ action: "getCategories", secret: undefined, body: {} }, deps);
    expect(res.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// Cycle 2 — addEntry: Category tag on Outgoing is rejected
// ──────────────────────────────────────────────────────────────

describe("addEntry — tag/direction validation", () => {
  it("accepts a bare Category tag on Outgoing entry (Subcategory is optional)", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "FOOD", // Category, no Subcategory — now permanently valid on Outgoing
          description: "test",
          direction: "O",
          amount: 50,
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // Cycle 3 — Subcategory tag on Incoming is rejected
  // ──────────────────────────────────────────────────────────────
  it("rejects Subcategory tag on Incoming entry", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "Dining", // Subcategory, but direction is I
          description: "test",
          direction: "I",
          amount: 500,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("accepts valid Outgoing entry (Subcategory tag)", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "Dining",
          description: "Lunch",
          direction: "O",
          amount: 150,
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });

  it("accepts valid Incoming entry (Category tag)", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "FOOD",
          description: "Salary",
          direction: "I",
          amount: 5000,
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// Cycle 4 — negative amount validation
// ──────────────────────────────────────────────────────────────

describe("addEntry — amount validation", () => {
  it("rejects negative amount on Outgoing entry", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "Dining",
          description: "test",
          direction: "O",
          amount: -50,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  // ──────────────────────────────────────────────────────────────
  // Cycle 5 — negative amount on Incoming is accepted (ADR-0005)
  // ──────────────────────────────────────────────────────────────
  it("accepts negative amount on Incoming entry (redistribution drain)", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "FOOD",
          description: "redistribution",
          direction: "I",
          amount: -200,
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });

  it("rejects non-finite amount", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "Dining",
          description: "test",
          direction: "O",
          amount: NaN,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });
});

// ──────────────────────────────────────────────────────────────
// Cycle 6 — required field validation
// ──────────────────────────────────────────────────────────────

describe("addEntry — required fields", () => {
  it("rejects missing date", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          tag: "Dining",
          description: "test",
          direction: "O",
          amount: 50,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("rejects invalid date format", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "not-a-date",
          tag: "Dining",
          description: "test",
          direction: "O",
          amount: 50,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("rejects missing tag", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          description: "test",
          direction: "O",
          amount: 50,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("rejects missing direction", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "Dining",
          description: "test",
          amount: 50,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("rejects invalid direction value", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "Dining",
          description: "test",
          direction: "X",
          amount: 50,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });
});

// ──────────────────────────────────────────────────────────────
// Cycle 7 — updateEntry: same tag/direction validation
// ──────────────────────────────────────────────────────────────

describe("updateEntry — tag/direction validation", () => {
  it("accepts patching tag to a bare Category while direction stays Outgoing", () => {
    const deps = makeDeps({
      // STORED_ENTRY has direction: O
      getEntryById: (id) => (id === 1 ? STORED_ENTRY : null),
    });
    // Patching tag to a Category while direction remains O — now valid (#123)
    const res = dispatch(
      {
        action: "updateEntry",
        secret: "correct-secret",
        body: {
          id: 1,
          tag: "FOOD", // Category — valid for Outgoing, Subcategory is optional
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });

  it("accepts patching direction to Outgoing when existing tag is a bare Category", () => {
    const incomingEntry = { ...STORED_ENTRY, direction: "I" as const, tag: "FOOD" };
    const deps = makeDeps({
      getEntryById: (id) => (id === 1 ? incomingEntry : null),
    });
    // Changing direction to O while existing tag is still a Category — now valid (#123)
    const res = dispatch(
      {
        action: "updateEntry",
        secret: "correct-secret",
        body: {
          id: 1,
          direction: "O",
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });

  it("rejects patch where new direction conflicts with an existing Subcategory-only tag", () => {
    // Existing entry has a Subcategory tag ("Dining") and Outgoing direction.
    // Patching direction to Incoming must still be rejected — Incoming requires
    // a Category tag, and the Outgoing relaxation does not extend to Incoming.
    const deps = makeDeps({
      getEntryById: (id) => (id === 1 ? STORED_ENTRY : null),
    });
    const res = dispatch(
      {
        action: "updateEntry",
        secret: "correct-secret",
        body: {
          id: 1,
          direction: "I",
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("rejects negative amount patch on Outgoing entry", () => {
    const deps = makeDeps({
      getEntryById: (id) => (id === 1 ? STORED_ENTRY : null),
    });
    const res = dispatch(
      {
        action: "updateEntry",
        secret: "correct-secret",
        body: {
          id: 1,
          amount: -100,
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("accepts valid patch", () => {
    const deps = makeDeps({
      getEntryById: (id) => (id === 1 ? STORED_ENTRY : null),
    });
    const res = dispatch(
      {
        action: "updateEntry",
        secret: "correct-secret",
        body: {
          id: 1,
          description: "Updated description",
          amount: 200,
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// Cycle 8 — deleteEntry not-found
// ──────────────────────────────────────────────────────────────

describe("deleteEntry", () => {
  it("returns not_found when entry does not exist", () => {
    const deps = makeDeps({
      deleteEntry: (id) => {
        if (id !== 1) throw new Error(`Entry ${id} not found`);
      },
    });
    const res = dispatch(
      {
        action: "deleteEntry",
        secret: "correct-secret",
        body: { id: 999 },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("not_found");
  });

  it("returns ok on successful delete", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "deleteEntry",
        secret: "correct-secret",
        body: { id: 1 },
      },
      deps
    );
    expect(res.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// Cycle 9 — success shapes (backwards-compatible)
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// getStats — STATS sheet read action (issue #129)
// ──────────────────────────────────────────────────────────────

describe("getStats", () => {
  const STATS_FIXTURE = {
    categoryMonthChange: [
      { category: "FOOD", incoming: 1500, outgoing: 900, netChange: 600 },
    ],
    spendingPace: [
      { day: 1, cumulativeThisMonth: 100, cumulativeUsual: 80 },
    ],
    windowTotals: [
      { window: "30d" as const, incoming: 3000, outgoing: 2200, net: 800 },
    ],
    windowCategorySpend: [
      { window: "30d" as const, category: "FOOD", outgoing: 1200 },
    ],
  };

  it("does not require auth (unauthenticated read, like getEntries/getMaster)", () => {
    const deps = makeDeps({ getStats: () => STATS_FIXTURE });
    const res = dispatch({ action: "getStats", secret: undefined, body: {} }, deps);
    expect(res.ok).toBe(true);
  });

  it("returns the stats shape from deps.getStats() verbatim", () => {
    const deps = makeDeps({ getStats: () => STATS_FIXTURE });
    const res = dispatch({ action: "getStats", secret: undefined, body: {} }, deps);
    expect(res.ok).toBe(true);
    expect((res as any).stats).toEqual(STATS_FIXTURE);
  });

  it("falls back to empty tables when deps.getStats is not provided", () => {
    const deps = makeDeps(); // no getStats override
    const res = dispatch({ action: "getStats", secret: undefined, body: {} }, deps);
    expect(res.ok).toBe(true);
    expect((res as any).stats).toEqual({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] });
  });
});

describe("success response shapes", () => {
  it("addEntry success returns entry in response", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "Dining",
          description: "Lunch",
          direction: "O",
          amount: 150,
        },
      },
      deps
    );
    expect(res.ok).toBe(true);
    expect((res as any).entry).toBeDefined();
    expect((res as any).entry.id).toBe(99);
  });

  it("unknown action returns internal error", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "bogusAction",
        secret: undefined,
        body: {},
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("internal");
  });

  it("updateEntry not-found propagated correctly", () => {
    const deps = makeDeps({
      getEntryById: (_id) => null, // entry not in store
    });
    const res = dispatch(
      {
        action: "updateEntry",
        secret: "correct-secret",
        body: { id: 999, description: "x" },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("not_found");
  });
});

// ──────────────────────────────────────────────────────────────
// addEntries — batch action (issue #111)
// ──────────────────────────────────────────────────────────────

describe("addEntries — batch", () => {
  const validLeg = {
    date: "2026-01-15",
    tag: "Dining",
    description: "Split leg",
    direction: "O" as const,
    amount: 50,
  };

  it("requires auth — missing secret rejects and never calls deps.addEntries", () => {
    const addEntries = vi.fn();
    const deps = makeDeps({ addEntries });
    const res = dispatch(
      { action: "addEntries", secret: undefined, body: { entries: [validLeg] } },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("auth");
    expect(addEntries).not.toHaveBeenCalled();
  });

  it("requires auth — wrong secret rejects and never calls deps.addEntries", () => {
    const addEntries = vi.fn();
    const deps = makeDeps({ addEntries });
    const res = dispatch(
      { action: "addEntries", secret: "wrong", body: { entries: [validLeg] } },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("auth");
    expect(addEntries).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when any leg is invalid, writing nothing", () => {
    const addEntries = vi.fn();
    const deps = makeDeps({ addEntries });
    const res = dispatch(
      {
        action: "addEntries",
        secret: "correct-secret",
        body: {
          entries: [
            validLeg,
            { ...validLeg, tag: "Dining", direction: "I" as const }, // Subcategory tag on Incoming — invalid
          ],
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
    expect(addEntries).not.toHaveBeenCalled();
  });

  it("accepts a batch with an Outgoing leg tagged with a bare Category (Subcategory optional, #123)", () => {
    const addEntries = vi.fn((payloads) =>
      payloads.map((p: typeof validLeg, i: number) => ({ id: 10 + i, mainCategory: "FOOD", ...p }))
    );
    const deps = makeDeps({ addEntries });
    const categoryLeg = { ...validLeg, tag: "FOOD", description: "^^", amount: 25 };
    const res = dispatch(
      {
        action: "addEntries",
        secret: "correct-secret",
        body: { entries: [validLeg, categoryLeg] },
      },
      deps
    );
    expect(res.ok).toBe(true);
    expect(addEntries).toHaveBeenCalledTimes(1);
  });

  it("valid batch inserts all legs under one call and returns entries in order", () => {
    const addEntries = vi.fn((payloads) =>
      payloads.map((p: typeof validLeg, i: number) => ({ id: 10 + i, mainCategory: "FOOD", ...p }))
    );
    const deps = makeDeps({ addEntries });
    const secondLeg = { ...validLeg, tag: "Rent", description: "^^", amount: 75 };
    const res = dispatch(
      {
        action: "addEntries",
        secret: "correct-secret",
        body: { entries: [validLeg, secondLeg] },
      },
      deps
    );
    expect(res.ok).toBe(true);
    expect(addEntries).toHaveBeenCalledTimes(1);
    expect((res as any).entries).toEqual([
      { id: 10, mainCategory: "FOOD", ...validLeg },
      { id: 11, mainCategory: "FOOD", ...secondLeg },
    ]);
  });
});

// ──────────────────────────────────────────────────────────────
// Backwards-compatible error envelope — legacy `error` field
// ──────────────────────────────────────────────────────────────

describe("error envelope backwards compatibility", () => {
  it("auth errors carry the legacy 'unauthorized' sentinel in `error`", () => {
    const deps = makeDeps();
    const res = dispatch({ action: "addEntry", secret: "wrong", body: {} }, deps);
    expect(res.ok).toBe(false);
    expect((res as any).error).toBe("unauthorized");
    expect(res.code).toBe("auth");
  });

  it("non-auth errors mirror the message in the legacy `error` field", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: { date: "nope", tag: "Dining", direction: "O", amount: 1 },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
    expect((res as any).error).toBe((res as any).message);
    expect((res as any).error).toBeTruthy();
  });

  it("unknown action exposes a truthy legacy `error` so the frontend still throws", () => {
    const deps = makeDeps();
    const res = dispatch({ action: "bogusAction", secret: undefined, body: {} }, deps);
    expect(res.ok).toBe(false);
    expect((res as any).error).toBeTruthy();
    expect(res.code).toBe("internal");
  });
});

// ──────────────────────────────────────────────────────────────
// `validate` is the secret-check endpoint — it requires auth
// ──────────────────────────────────────────────────────────────

describe("validate action", () => {
  it("rejects a missing secret with an auth error", () => {
    const deps = makeDeps();
    const res = dispatch({ action: "validate", secret: undefined, body: {} }, deps);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("auth");
    expect((res as any).error).toBe("unauthorized");
  });

  it("rejects a wrong secret with an auth error", () => {
    const deps = makeDeps();
    const res = dispatch({ action: "validate", secret: "wrong", body: {} }, deps);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("auth");
  });

  it("accepts the correct secret", () => {
    const deps = makeDeps();
    const res = dispatch({ action: "validate", secret: "correct-secret", body: {} }, deps);
    expect(res.ok).toBe(true);
  });
});
