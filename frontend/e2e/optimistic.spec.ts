import { test, expect, type Page } from "@playwright/test";

async function waitForAppReady(page: Page) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  await page.locator(".loading-spinner").waitFor({ state: "detached" });
}

async function switchTab(page: Page, label: "Home" | "Entries" | "Summary") {
  await page.locator(".tab-bar-pill").getByRole("button", { name: label }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
});

// AC: adding an entry — appears immediately, no full-page spinner
test("adding an entry shows it immediately without a loading spinner", async ({ page }) => {
  const desc = `opt-add-${Date.now()}`;

  await switchTab(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });

  await page.locator(".amount-input").fill("50");
  await page.locator(".field-input").first().fill(desc);
  await page.locator(".tag-pill", { hasText: "Dining" }).first().click();
  await page.locator("button.header-btn.save").click();
  await page.locator(".sheet.open").waitFor({ state: "detached" });

  await expect(page.locator(".entry-card", { hasText: desc })).toBeVisible();
  await expect(page.locator(".loading-spinner")).not.toBeVisible();
});

// AC: editing an entry — reflects new value immediately, no spinner
test("editing an entry updates it immediately without a loading spinner", async ({ page }) => {
  await switchTab(page, "Entries");
  await page.locator(".entry-desc").first().click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });

  await page.locator(".amount-input").fill("999");
  await page.locator("button.header-btn.save").click();
  await page.locator(".sheet.open").waitFor({ state: "detached" });

  await expect(page.locator(".loading-spinner")).not.toBeVisible();
  await expect(page.locator(".entry-card").first()).toContainText("₱999.00");
});

// AC: deleting an entry — gone immediately, no spinner
test("deleting an entry removes it immediately without a loading spinner", async ({ page }) => {
  const desc = `opt-del-${Date.now()}`;

  await switchTab(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });
  await page.locator(".amount-input").fill("1");
  await page.locator(".field-input").first().fill(desc);
  await page.locator(".tag-pill", { hasText: "Dining" }).first().click();
  await page.locator("button.header-btn.save").click();
  await page.locator(".sheet.open").waitFor({ state: "detached" });

  const card = page.locator(".entry-card", { hasText: desc });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Delete entry" }).dispatchEvent("click");
  await card.locator(".confirm-btn").dispatchEvent("click");

  await expect(page.locator(".entry-card", { hasText: desc })).not.toBeVisible();
  await expect(page.locator(".loading-spinner")).not.toBeVisible();
});

// AC: cache hit on reload — data visible without spinner
test("reloading the page with cached data skips the loading spinner", async ({ page }) => {
  // beforeEach already loaded data and primed localStorage cache
  await page.reload();

  // Should NOT block on spinner — cached data renders immediately
  await expect(page.locator(".loading-spinner")).not.toBeVisible();
  await expect(page.locator(".app-shell")).toBeVisible();
});
