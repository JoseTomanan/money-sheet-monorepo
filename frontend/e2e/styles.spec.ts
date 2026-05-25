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

test("Fab is position:fixed", async ({ page }) => {
  const pos = await page.locator(".fab").evaluate(
    (el) => getComputedStyle(el).position
  );
  expect(pos).toBe("fixed");
});

test("TabBar outer wrapper is position:fixed", async ({ page }) => {
  const pos = await page.locator(".tab-bar-outer").evaluate(
    (el) => getComputedStyle(el).position
  );
  expect(pos).toBe("fixed");
});

test("EntrySheet opens with position:absolute", async ({ page }) => {
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator(".sheet.open").waitFor({ state: "visible" });
  const pos = await page.locator(".sheet").evaluate(
    (el) => getComputedStyle(el).position
  );
  expect(pos).toBe("absolute");
  await page.locator("button.header-btn.cancel").click();
});

test("entry-card uses flex layout", async ({ page }) => {
  await switchTab(page, "Entries");
  const display = await page.locator(".entry-card").first().evaluate(
    (el) => getComputedStyle(el).display
  );
  expect(display).toBe("flex");
});

test("hero card is visible on Home tab", async ({ page }) => {
  const visible = await page.locator(".hero-card").isVisible();
  expect(visible).toBe(true);
});

test("filter-bar is visible on Entries tab", async ({ page }) => {
  await switchTab(page, "Entries");
  const visible = await page.locator(".filter-bar").isVisible();
  expect(visible).toBe(true);
});

test("onhand card is visible on Summary tab", async ({ page }) => {
  await switchTab(page, "Summary");
  const visible = await page.locator(".onhand-card").isVisible();
  expect(visible).toBe(true);
});
