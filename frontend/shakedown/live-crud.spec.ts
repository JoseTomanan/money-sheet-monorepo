/**
 * Live CRUD shakedown — hits the real GAS backend and the real spreadsheet.
 *
 * Run with:   npm run shakedown          (from frontend/)
 * Requires:   GAS_URL + API_SECRET in tests/.env (monorepo root)
 *             Dev server running in real mode (VITE_MOCK=false, port 1111)
 *
 * Every test row is prefixed with MARK and swept clean in afterAll, leaving
 * the sheet pristine. Safe to run against the live spreadsheet.
 */

import { test, expect, type Page } from "@playwright/test";

const GAS_URL = process.env.GAS_URL!;
const API_SECRET = process.env.API_SECRET!;
const MARK = `__GOLIVECHK__${Date.now()}`;

// ── API helpers (run in Node — no CORS) ─────────────────────────────────────

interface Entry {
  id: number;
  date: string;
  tag: string;
  mainCategory: string;
  description: string;
  direction: "I" | "O";
  amount: number;
}

// GAS cold starts return 500 for the first ~10–15s after a period of inactivity.
// Exponential backoff: 2s → 4s → 8s → 16s (max ~30s total wait across 5 attempts).
const GAS_RETRIES = 5;

async function gasWithRetry(fetcher: () => Promise<Response>, label: string): Promise<Record<string, unknown>> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < GAS_RETRIES; attempt++) {
    const r = await fetcher();
    if (r.ok) return r.json() as Promise<Record<string, unknown>>;
    lastStatus = r.status;
    if (attempt < GAS_RETRIES - 1) {
      const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
      console.log(`GAS ${label} → ${r.status} (cold start?), waiting ${wait / 1000}s…`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw new Error(`GAS ${label} → HTTP ${lastStatus} after ${GAS_RETRIES} attempts`);
}

async function gasGet(action: string): Promise<Record<string, unknown>> {
  return gasWithRetry(
    () => fetch(`${GAS_URL}?action=${action}&t=${Date.now()}`, { redirect: "follow" }),
    `GET ${action}`
  );
}

async function gasPost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return gasWithRetry(
    () =>
      fetch(GAS_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ ...body, secret: API_SECRET }),
      }),
    `POST ${body.action}`
  );
}

async function getEntries(): Promise<Entry[]> {
  const d = await gasGet("getEntries");
  return (d.entries as Entry[]) ?? [];
}

async function deleteEntryApi(id: number): Promise<void> {
  await gasPost({ action: "deleteEntry", id });
}

// ── UI helpers ───────────────────────────────────────────────────────────────

async function waitForAppReady(page: Page) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  await page.locator(".loading-spinner").waitFor({ state: "detached" });
  // The FAB is gated on !store.loading && !store.error; if GAS is down the
  // error card appears instead. Fail immediately with a useful message.
  const errorCard = page.locator(".error-card");
  if (await errorCard.isVisible()) {
    const msg = await errorCard.locator(".error-body").textContent().catch(() => "unknown");
    throw new Error(`Store error (GAS down?): ${msg}`);
  }
}

async function switchTab(page: Page, label: "Home" | "Entries" | "Summary") {
  await page.locator(".tab-bar-pill").getByRole("button", { name: label }).click();
}

async function openAddSheet(page: Page) {
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });
}

async function fillSheet(
  page: Page,
  opts: {
    direction: "Incoming" | "Outgoing";
    tag: string;
    amount: string;
    description: string;
  }
) {
  if (opts.direction === "Incoming") {
    await page.locator("button.dir-btn", { hasText: "Incoming" }).click();
  }
  await page.locator(".amount-input").fill(opts.amount);
  await page.locator(".field-input").first().fill(opts.description);
  const pill = page.locator(".tag-pill", { hasText: opts.tag }).first();
  await pill.scrollIntoViewIfNeeded();
  await pill.click();
}

async function saveSheet(page: Page) {
  // Set up response waiter BEFORE clicking — the optimistic close happens before
  // the GAS POST completes, so waiting for the spinner would miss it.
  const gasPost = page.waitForResponse(
    (r) => r.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.locator("button.header-btn.save").click();
  await gasPost;
  await page.locator(".sheet.open").waitFor({ state: "detached" });
  await waitForAppReady(page);
}

async function openEditSheet(page: Page, description: string) {
  const card = page.locator(".entry-card", { hasText: description });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.locator(".entry-desc").click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });
}

// The delete button is behind pointer-events:none unless the sheet is dragged
// to "expanded" snap — dispatchEvent bypasses the CSS guard (same as e2e suite).
async function deleteEntryUi(page: Page) {
  const gasPost = page.waitForResponse(
    (r) => r.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.locator(".delete-btn").dispatchEvent("click");
  await gasPost;
  await page.locator(".sheet.open").waitFor({ state: "detached" });
  await waitForAppReady(page);
}

// ── Shakedown suite ───────────────────────────────────────────────────────────
// Wrapped in describe so beforeAll/afterAll run exactly once regardless of
// whether individual tests fail and Playwright recycles the worker.

test.describe("live CRUD shakedown", () => {
  let baselineCount = 0;
  let outgoingTag = "";
  let incomingTag = "";

  test.beforeAll(async () => {
    if (!GAS_URL || !API_SECRET) {
      throw new Error("GAS_URL and API_SECRET must be set in tests/.env");
    }

    // Record baseline so we can assert the sheet is clean afterward
    const entries = await getEntries();
    baselineCount = entries.length;
    console.log(`Baseline: ${baselineCount} entries`);

    // Pick valid tags dynamically from the live categories
    const d = await gasGet("getCategories");
    const cats = d.categories as Record<string, string[]>;
    incomingTag = Object.keys(cats)[0];      // e.g. "HOUSING"
    outgoingTag = Object.values(cats)[0][0]; // e.g. "Rent"
    console.log(`Tags — Incoming: ${incomingTag}, Outgoing: ${outgoingTag}`);
  });

  test.beforeEach(async ({ page }) => {
    // Inject the real connection via URL params so importFromUrl() seeds localStorage
    // and SettingsGate is bypassed. Navigate directly to the Vite base path to avoid
    // redirect stripping the query string.
    const url = new URL("http://localhost:1111/money-sheet-monorepo/");
    url.searchParams.set("gasUrl", GAS_URL);
    url.searchParams.set("apiSecret", API_SECRET);
    await page.goto(url.toString());
    await waitForAppReady(page);
    await switchTab(page, "Entries");
  });

  test.afterAll(async () => {
    // Sweep any straggler MARK rows (guards against mid-test failures)
    const entries = await getEntries();
    const stragglers = entries.filter((e) => e.description?.startsWith(MARK));
    for (const e of stragglers) {
      await deleteEntryApi(e.id);
      console.log(`Swept straggler id=${e.id} desc="${e.description}"`);
    }

    const finalCount = (await getEntries()).length;
    console.log(`Final count: ${finalCount} (expected ${baselineCount})`);
    if (finalCount !== baselineCount) {
      throw new Error(
        `Sheet not clean after shakedown: expected ${baselineCount} entries, got ${finalCount}`
      );
    }
    console.log("Sheet is clean — ready for go-live.");
  });

  // ── OUTGOING: add → verify → edit → verify → delete → verify ──────────────

  test("OUTGOING add → edit → delete", async ({ page }) => {
    const desc = `${MARK} out`;
    let entryId!: number;

    // ADD
    await openAddSheet(page);
    await fillSheet(page, {
      direction: "Outgoing",
      tag: outgoingTag,
      amount: "120.50",
      description: desc,
    });
    await saveSheet(page);

    {
      const entries = await getEntries();
      const found = entries.find((e) => e.description === desc);
      expect(found, "Row should exist in sheet after add").toBeTruthy();
      expect(found!.direction).toBe("O");
      expect(found!.tag).toBe(outgoingTag);
      expect(found!.mainCategory).toBeTruthy(); // VLOOKUP resolved
      expect(Number(found!.amount)).toBeCloseTo(120.5, 1);
      entryId = found!.id;
      console.log(`[OUT] ADD  PASS — id=${entryId}, mainCategory=${found!.mainCategory}`);
    }

    // EDIT
    await openEditSheet(page, desc);
    await page.locator(".amount-input").fill("99");
    await saveSheet(page);

    {
      const entries = await getEntries();
      const found = entries.find((e) => e.id === entryId);
      expect(found, "Row should still exist after edit").toBeTruthy();
      expect(Number(found!.amount)).toBeCloseTo(99, 1);
      console.log(`[OUT] EDIT PASS — id=${entryId}, amount=${found!.amount}`);
    }

    // DELETE
    await openEditSheet(page, desc);
    await deleteEntryUi(page);

    {
      const entries = await getEntries();
      const gone = !entries.find((e) => e.id === entryId);
      expect(gone, "Row should be gone from sheet after delete").toBe(true);
      console.log(`[OUT] DEL  PASS — id=${entryId} gone`);
    }
  });

  // ── INCOMING: add → verify → edit → verify → delete → verify ──────────────

  test("INCOMING add → edit → delete", async ({ page }) => {
    const desc = `${MARK} in`;
    let entryId!: number;

    // ADD
    await openAddSheet(page);
    await fillSheet(page, {
      direction: "Incoming",
      tag: incomingTag,
      amount: "5000",
      description: desc,
    });
    await saveSheet(page);

    {
      const entries = await getEntries();
      const found = entries.find((e) => e.description === desc);
      expect(found, "Row should exist in sheet after add").toBeTruthy();
      expect(found!.direction).toBe("I");
      expect(found!.tag).toBe(incomingTag);
      expect(Number(found!.amount)).toBeCloseTo(5000, 1);
      entryId = found!.id;
      console.log(`[IN]  ADD  PASS — id=${entryId}`);
    }

    // EDIT
    await openEditSheet(page, desc);
    await page.locator(".amount-input").fill("5500");
    await saveSheet(page);

    {
      const entries = await getEntries();
      const found = entries.find((e) => e.id === entryId);
      expect(found, "Row should still exist after edit").toBeTruthy();
      expect(Number(found!.amount)).toBeCloseTo(5500, 1);
      console.log(`[IN]  EDIT PASS — id=${entryId}, amount=${found!.amount}`);
    }

    // DELETE
    await openEditSheet(page, desc);
    await deleteEntryUi(page);

    {
      const entries = await getEntries();
      const gone = !entries.find((e) => e.id === entryId);
      expect(gone, "Row should be gone from sheet after delete").toBe(true);
      console.log(`[IN]  DEL  PASS — id=${entryId} gone`);
    }
  });
});
