import { expect, test, type Page, type Route } from "@playwright/test";
import { openUsableEntries, readDisposableConnection } from "./readiness";
import { assertBaselineRestored, sweepMarkedEntries, type ShakedownEntry } from "./cleanup";
import { requestWithDeadline, warmRequiredReads } from "./setup";

const CONNECTION = {
  gasUrl: "https://disposable.invalid/exec",
  apiSecret: "disposable-secret",
};

test("requires explicitly disposable credentials instead of generic defaults", () => {
  expect(() => readDisposableConnection({
    GAS_URL: "https://default.invalid/exec",
    API_SECRET: "default-secret",
  })).toThrow("DISPOSABLE_GAS_URL and DISPOSABLE_API_SECRET must be set");
});

test("sweeps marked rows from current and previously failed runs", async () => {
  const baseline: ShakedownEntry = {
    id: 1,
    date: "2026-09-17",
    tag: "FOOD",
    mainCategory: "FOOD",
    description: "baseline",
    direction: "I",
    amount: 100,
  };
  let entries: ShakedownEntry[] = [
    baseline,
    { ...baseline, id: 2, description: "__GOLIVECHK__old out" },
    { ...baseline, id: 3, description: "__GOLIVECHK__new in" },
  ];

  const remaining = await sweepMarkedEntries(
    async () => entries,
    async (id) => {
      entries = entries.filter((entry) => entry.id !== id);
    },
  );

  expect(remaining).toEqual([baseline]);
});

test("rejects a same-count sheet that does not match the exact baseline", () => {
  const baseline: ShakedownEntry[] = [{
    id: 1,
    date: "2026-09-17",
    tag: "FOOD",
    mainCategory: "FOOD",
    description: "baseline",
    direction: "I",
    amount: 100,
  }];
  const substituted = [{ ...baseline[0], id: 99 }];

  expect(() => assertBaselineRestored(baseline, substituted)).toThrow(
    "Sheet does not match the exact pre-shakedown baseline",
  );
});

test("warms every read required for the app to leave loading state", async () => {
  const actions: string[] = [];

  await warmRequiredReads(async (action) => {
    actions.push(action);
  });

  expect(actions).toEqual([
    "getEntries",
    "getMaster",
    "getCategories",
    "getConfig",
    "getStats",
  ]);
});

test("warms remaining app reads concurrently after the Entries probe", async () => {
  const started: string[] = [];
  const releases = new Map<string, () => void>();
  const warming = warmRequiredReads((action) => {
    started.push(action);
    return new Promise<void>((resolve) => releases.set(action, resolve));
  });

  await expect.poll(() => started).toEqual(["getEntries"]);
  releases.get("getEntries")!();
  await expect.poll(() => started).toEqual([
    "getEntries",
    "getMaster",
    "getCategories",
    "getConfig",
    "getStats",
  ]);
  for (const action of started.slice(1)) releases.get(action)!();

  await warming;
});

test("aborts a hung shakedown API request at its deadline", async () => {
  const hungRequest = (signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

  await expect(requestWithDeadline(hungRequest, 5)).rejects.toThrow("request timed out");
});

function responseFor(action: string): Record<string, unknown> {
  switch (action) {
    case "getEntries":
      return { entries: [] };
    case "getMaster":
      return { master: { onHand: 0, budgets: {} } };
    case "getCategories":
      return { categories: { HOUSING: ["Rent"] } };
    case "getConfig":
      return { config: {} };
    case "getStats":
      return {
        stats: {
          categoryMonthChange: [],
          spendingPace: [],
          windowTotals: [],
          windowCategorySpend: [],
        },
      };
    default:
      throw new Error(`Unexpected action: ${action}`);
  }
}

async function fulfillGas(route: Route): Promise<void> {
  const action = new URL(route.request().url()).searchParams.get("action") ?? "";
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(responseFor(action)),
  });
}

async function installConnection(page: Page): Promise<void> {
  await page.addInitScript((connection) => {
    localStorage.setItem("ms_connection", JSON.stringify(connection));
    localStorage.setItem("ms_mock_dismissed", "1");
  }, CONNECTION);
}

test("waits for a usable Entries UI while initial reads are pending", async ({ page }) => {
  await installConnection(page);

  let releaseReads!: () => void;
  const readsReleased = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  await page.route(`${CONNECTION.gasUrl}**`, async (route) => {
    await readsReleased;
    await fulfillGas(route);
  });

  let settled = false;
  const ready = openUsableEntries(page, CONNECTION).finally(() => {
    settled = true;
  });

  await expect(page).toHaveURL(/#\/entries\/\d{4}-\d{2}-\d{2}$/);
  expect(settled).toBe(false);

  releaseReads();
  await ready;

  await expect(page.getByRole("button", { name: "Add entry", exact: true })).toBeEnabled();
});

test("fails with the visible store error instead of timing out on Add entry", async ({ page }) => {
  await installConnection(page);
  await page.route(`${CONNECTION.gasUrl}**`, async (route) => {
    const action = new URL(route.request().url()).searchParams.get("action");
    if (action === "getEntries") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "entries unavailable" }),
      });
      return;
    }
    await fulfillGas(route);
  });

  await expect(openUsableEntries(page, CONNECTION)).rejects.toThrow(
    "Store error: entries unavailable",
  );
});

test("fails with an actionable diagnostic when connection setup is required", async ({ page }) => {
  await page.route("http://localhost:1111/money-sheet-monorepo/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<div role="dialog"><h1>Connect your spreadsheet</h1></div>',
    });
  });

  await expect(openUsableEntries(page, CONNECTION)).rejects.toThrow(
    "Connection setup required: Connect your spreadsheet",
  );
});

test("refuses to run when the browser is in Mock Mode", async ({ page }) => {
  await installConnection(page);
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const banner = document.createElement("div");
      banner.textContent = "Mock mode";
      document.body.appendChild(banner);
    });
  });
  await page.route(`${CONNECTION.gasUrl}**`, fulfillGas);

  await expect(openUsableEntries(page, CONNECTION)).rejects.toThrow(
    "Mock Mode is active; refusing to run live CRUD",
  );
});

test("refuses to run when the browser connection is not the disposable target", async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (key === "ms_connection") {
        setItem.call(this, key, JSON.stringify({
          gasUrl: "https://default.invalid/exec",
          apiSecret: "default-secret",
        }));
        return;
      }
      setItem.call(this, key, value);
    };
  });
  await page.route(`${CONNECTION.gasUrl}**`, fulfillGas);

  await expect(openUsableEntries(page, CONNECTION)).rejects.toThrow(
    "Browser Connection does not match the disposable shakedown target",
  );
});
