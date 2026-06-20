import { test, expect, type Page } from "@playwright/test";

async function waitForAppReady(page: Page) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  await page.locator(".loading-spinner").waitFor({ state: "detached" });
}

async function openNewEntrySheet(page: Page) {
  await page.locator(".tab-bar-pill").getByRole("button", { name: "Entries" }).click();
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
});

test("formula =10+5 resolves to 15.00 on blur in main amount field", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("=10+5");
  await input.blur();
  await expect(input).toHaveValue("15.00");
  await expect(page.locator(".amount-error")).not.toBeVisible();
});

test("formula =100-SUM(30,20,15) resolves to 35.00 on blur", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("=100-SUM(30,20,15)");
  await input.blur();
  await expect(input).toHaveValue("35.00");
});

test("malformed formula =10+abc shows inline error and keeps raw value", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("=10+abc");
  await input.blur();
  await expect(input).toHaveValue("=10+abc");
  await expect(page.locator(".amount-error")).toBeVisible();
  await expect(page.locator(".amount-error")).toHaveText("Invalid formula");
});

test("formula error disables Save button", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("=10+abc");
  await input.blur();
  await expect(page.locator("button.header-btn.save")).toBeDisabled();
});

test("non-positive formula =5-10 shows error and disables Save", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("=5-10");
  await input.blur();
  await expect(page.locator(".amount-error")).toHaveText("Amount must be positive");
  await expect(page.locator("button.header-btn.save")).toBeDisabled();
});

test("plain numeric input is unaffected by formula logic", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("50.00");
  await input.blur();
  await expect(input).toHaveValue("50.00");
  await expect(page.locator(".amount-error")).not.toBeVisible();
});

test("formula resolves correctly and entry can be saved", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("=10+5");
  await input.blur();
  await expect(input).toHaveValue("15.00");

  await page.locator(".field-input").first().fill("formula test entry");
  await page.locator(".tag-pill", { hasText: "FOOD" }).first().click();
  await page.locator(".tag-pill", { hasText: "Dining" }).first().click();
  await page.locator("button.header-btn.save").click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });
  await expect(page.locator(".entry-card", { hasText: "formula test entry" })).toBeVisible();
  await expect(page.locator(".entry-card", { hasText: "formula test entry" })).toContainText("₱15.00");
});

test("arithmetic 100-50 without = resolves to 50.00 on blur", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("100-50");
  await input.blur();
  await expect(input).toHaveValue("50.00");
  await expect(page.locator(".amount-error")).not.toBeVisible();
});

test("arithmetic 100-50 disables Save until blur resolves it", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("100-50");
  await expect(page.locator("button.header-btn.save")).toBeDisabled();
  await input.blur();
  await expect(input).toHaveValue("50.00");
});

test("negative amount -5 shows error and disables Save", async ({ page }) => {
  await openNewEntrySheet(page);
  const input = page.locator(".amount-input");
  await input.fill("-5");
  await input.blur();
  await expect(page.locator(".amount-error")).toHaveText("Amount must be positive");
  await expect(page.locator("button.header-btn.save")).toBeDisabled();
});

test("split-leg: formula error then plain number clears the error", async ({ page }) => {
  await openNewEntrySheet(page);

  // Enable split mode
  await page.locator(".split-toggle-btn").click();
  await page.locator(".carousel").waitFor({ state: "visible" });

  const legInputs = page.locator(".amount-input");
  const firstLeg = legInputs.first();

  // Type an invalid formula
  await firstLeg.fill("=10+abc");
  await firstLeg.blur();
  await expect(page.locator(".leg-error").first()).toBeVisible();

  // Correct to a plain number — error should clear
  await firstLeg.fill("50");
  await firstLeg.blur();
  await expect(page.locator(".leg-error").first()).not.toBeVisible();
});
