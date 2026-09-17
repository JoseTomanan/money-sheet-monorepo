/**
 * Live CRUD shakedown — hits the real GAS backend and the real spreadsheet.
 *
 * Run with:   npm run shakedown          (from frontend/)
 * Requires:   DISPOSABLE_GAS_URL + DISPOSABLE_API_SECRET in tests/.env
 *             Dev server running in real mode (VITE_MOCK=false, port 1111)
 *
 * Every test row is prefixed with MARK and swept clean in afterAll, leaving
 * the sheet pristine. Safe to run against the live spreadsheet.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  openUsableEntries,
  readDisposableConnection,
  waitForUsableEntries,
} from "./readiness";
import {
  SHAKEDOWN_MARK,
  assertBaselineRestored,
  sweepMarkedEntries,
  type ShakedownEntry,
} from "./cleanup";
import { requestWithDeadline, warmRequiredReads } from "./setup";

const CONNECTION = readDisposableConnection(process.env);
const GAS_URL = CONNECTION.gasUrl;
const API_SECRET = CONNECTION.apiSecret;
const MARK = `${SHAKEDOWN_MARK}${Date.now()}`;

// ── API helpers (run in Node — no CORS) ─────────────────────────────────────

// GAS cold starts return 500 for the first ~10–15s after a period of inactivity.
// Exponential backoff: 2s → 4s → 8s → 16s (max ~30s total wait across 5 attempts).
const GAS_RETRIES = 5;

async function gasWithRetry(
  fetcher: (signal: AbortSignal) => Promise<Response>,
  label: string,
): Promise<Record<string, unknown>> {
  let lastFailure = "unknown failure";
  for (let attempt = 0; attempt < GAS_RETRIES; attempt++) {
    try {
      const outcome = await requestWithDeadline(async (signal) => {
        const response = await fetcher(signal);
        if (!response.ok) return { ok: false as const, status: response.status };
        return {
          ok: true as const,
          data: await response.json() as Record<string, unknown>,
        };
      });
      if (outcome.ok) return outcome.data;
      lastFailure = `HTTP ${outcome.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < GAS_RETRIES - 1) {
      const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
      console.log(`GAS ${label} failed (${lastFailure}), waiting ${wait / 1000}s…`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw new Error(`GAS ${label} failed after ${GAS_RETRIES} attempts: ${lastFailure}`);
}

async function gasGet(action: string): Promise<Record<string, unknown>> {
  return gasWithRetry(
    (signal) => fetch(`${GAS_URL}?action=${action}&t=${Date.now()}`, { redirect: "follow", signal }),
    `GET ${action}`
  );
}

async function gasPost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return gasWithRetry(
    (signal) =>
      fetch(GAS_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ ...body, secret: API_SECRET }),
        signal,
      }),
    `POST ${body.action}`
  );
}

async function getEntries(): Promise<ShakedownEntry[]> {
  const d = await gasGet("getEntries");
  return (d.entries as ShakedownEntry[]) ?? [];
}

async function deleteEntryApi(id: number): Promise<void> {
  await gasPost({ action: "deleteEntry", id });
}

// ── UI helpers ───────────────────────────────────────────────────────────────

async function openAddSheet(page: Page) {
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
}

async function fillSheet(
  page: Page,
  opts: {
    direction: "Incoming" | "Outgoing";
    tag: string;
    parentTag?: string;
    amount: string;
    description: string;
  }
) {
  if (opts.direction === "Incoming") {
    await page.locator("button.dir-btn", { hasText: "Incoming" }).click();
  }
  await page.locator(".amount-input").fill(opts.amount);
  await page.locator(".field-input").first().fill(opts.description);
  if (opts.direction === "Outgoing" && opts.parentTag) {
    await page.locator(".tag-pill", { hasText: opts.parentTag }).first().click();
  }
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
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });
  await waitForUsableEntries(page);
}

async function openEditSheet(page: Page, description: string) {
  const card = page.locator(".entry-card", { hasText: description });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.locator(".entry-desc").click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
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
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });
  await waitForUsableEntries(page);
}

// ── Shakedown suite ───────────────────────────────────────────────────────────
// Wrapped in describe so beforeAll/afterAll run exactly once regardless of
// whether individual tests fail and Playwright recycles the worker.

test.describe("live CRUD shakedown", () => {
  // Match the live-integration budget from #192. UI readiness still terminates
  // on the app's concrete terminal state instead of consuming this allowance.
  test.describe.configure({ timeout: 480_000 });

  let baseline: ShakedownEntry[] | null = null;
  let outgoingCategory = "";
  let outgoingTag = "";
  let incomingTag = "";

  test.beforeAll(async () => {
    // Clear interrupted-run leftovers, then record the exact disposable-sheet baseline.
    baseline = await sweepMarkedEntries(getEntries, deleteEntryApi);
    console.log(`Baseline: ${baseline.length} entries, zero marked rows`);

    // Pick valid tags dynamically from the live categories
    const d = await gasGet("getCategories");
    const cats = d.categories as Record<string, string[]>;
    incomingTag = Object.keys(cats)[0];      // e.g. "HOUSING"
    outgoingCategory = incomingTag;
    outgoingTag = Object.values(cats)[0][0]; // e.g. "Rent"
    console.log(`Tags — Incoming: ${incomingTag}, Outgoing: ${outgoingTag}`);

    // Establish one successful terminal read state before either browser worker.
    await warmRequiredReads(gasGet);
  });

  test.beforeEach(async ({ page }) => {
    await openUsableEntries(page, CONNECTION);
  });

  test.afterAll(async () => {
    if (baseline == null) return;
    const finalEntries = await sweepMarkedEntries(getEntries, deleteEntryApi);
    assertBaselineRestored(baseline, finalEntries);
    console.log(`Final count: ${finalEntries.length}; exact baseline restored, zero marked rows.`);
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
      parentTag: outgoingCategory,
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
