import { describe, it, expect } from "vitest";
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
  it("rejects Category tag on Outgoing entry", () => {
    const deps = makeDeps();
    const res = dispatch(
      {
        action: "addEntry",
        secret: "correct-secret",
        body: {
          date: "2026-01-15",
          tag: "FOOD", // Category, but direction is O
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
  it("rejects patch that would make tag invalid for existing direction", () => {
    const deps = makeDeps({
      // STORED_ENTRY has direction: O
      getEntryById: (id) => (id === 1 ? STORED_ENTRY : null),
    });
    // Patching tag to a Category while direction remains O
    const res = dispatch(
      {
        action: "updateEntry",
        secret: "correct-secret",
        body: {
          id: 1,
          tag: "FOOD", // Category — invalid for Outgoing
        },
      },
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("validation");
  });

  it("rejects patch where new direction conflicts with existing tag", () => {
    const incomingEntry = { ...STORED_ENTRY, direction: "I" as const, tag: "FOOD" };
    const deps = makeDeps({
      getEntryById: (id) => (id === 1 ? incomingEntry : null),
    });
    // Changing direction to O while existing tag is still a Category
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
