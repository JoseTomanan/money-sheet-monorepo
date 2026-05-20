import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForAppReady(page: Page) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  await page.locator(".loading-spinner").waitFor({ state: "detached" });
}

async function switchTab(page: Page, label: "Home" | "Entries" | "Summary") {
  await page.locator(".tab-bar-pill").getByRole("button", { name: label }).click();
}

async function addEntryViaUi(
  page: Page,
  opts: { description: string; amount: string; tag: string; direction?: "Outgoing" | "Incoming" }
) {
  const direction = opts.direction ?? "Outgoing";
  await switchTab(page, "Entries");
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });

  // Direction
  if (direction === "Incoming") {
    await page.locator("button.dir-btn", { hasText: "Incoming" }).click();
  }

  // Amount
  await page.locator(".amount-input").fill(opts.amount);

  // Description
  await page.locator(".field-input").first().fill(opts.description);

  // Tag
  await page.locator(`.tag-pill`, { hasText: opts.tag }).first().click();

  // Save
  await page.locator("button.header-btn.save").click();
  await page.locator(".sheet.open").waitFor({ state: "detached" });
  await waitForAppReady(page);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
});

// AC #2 — app loads and displays entries
test("app loads and displays entries from mock data", async ({ page }) => {
  await switchTab(page, "Entries");
  await expect(page.locator(".entry-card").first()).toBeVisible();
});

// AC #6 — BudgetsView shows On Hand and per-Category budget rows
test("Summary tab shows On Hand and category budget rows", async ({ page }) => {
  await switchTab(page, "Summary");
  await expect(page.locator(".onhand-card")).toBeVisible();
  const catRows = page.locator(".cat-row");
  expect(await catRows.count()).toBeGreaterThan(0);
});

// AC #3 — adding an entry via UI writes it and it appears in the list
test("adding an outgoing entry via the sheet makes it appear in the entries list", async ({
  page,
}) => {
  const desc = `e2e-add-${Date.now()}`;
  await addEntryViaUi(page, { description: desc, amount: "99", tag: "Dining" });

  await switchTab(page, "Entries");
  await expect(page.locator(".entry-card", { hasText: desc })).toBeVisible();
});

// AC #4 — editing an entry updates the correct row
test("editing an entry updates its amount in the entries list", async ({ page }) => {
  const desc = `e2e-edit-${Date.now()}`;
  await addEntryViaUi(page, { description: desc, amount: "50", tag: "Groceries" });

  await switchTab(page, "Entries");
  const card = page.locator(".entry-card", { hasText: desc });
  await expect(card).toBeVisible();

  // Click the card body to open edit sheet
  await card.locator(".entry-desc").click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });

  // Update amount
  await page.locator(".amount-input").fill("777");
  await page.locator("button.header-btn.save").click();
  await page.locator(".sheet.open").waitFor({ state: "detached" });
  await waitForAppReady(page);

  await expect(page.locator(".entry-card", { hasText: desc })).toContainText("₱777.00");
});

// AC #5 — deleting an entry removes it from the list
test("deleting an entry removes it from the entries list", async ({ page }) => {
  const desc = `e2e-del-${Date.now()}`;
  await addEntryViaUi(page, { description: desc, amount: "123", tag: "Leisure" });

  await switchTab(page, "Entries");
  const card = page.locator(".entry-card", { hasText: desc });
  await expect(card).toBeVisible();

  // Reveal delete button and confirm
  await card.getByRole("button", { name: "Delete entry" }).click();
  await card.locator(".confirm-btn").click();
  await waitForAppReady(page);

  await expect(page.locator(".entry-card", { hasText: desc })).not.toBeVisible();
});
