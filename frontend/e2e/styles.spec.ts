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

test("EntrySheet opens with position:fixed", async ({ page }) => {
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
  const pos = await page.locator(".sheet").evaluate(
    (el) => getComputedStyle(el).position
  );
  expect(pos).toBe("fixed");
  await page.locator("button.header-btn.cancel").click();
});

test("entry-card uses flex layout", async ({ page }) => {
  await switchTab(page, "Entries");
  const display = await page.locator(".entry-card").first().evaluate(
    (el) => getComputedStyle(el).display
  );
  expect(display).toBe("flex");
});

test("outgoing category stripes stay aligned across short-date lengths", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-11T12:00:00"));
  await page.reload();
  await waitForAppReady(page);
  await switchTab(page, "Entries");

  const stripePosition = async (description: string, dateLabel: string) => {
    const row = page.locator(".entry-card", { hasText: description });
    await expect(row.locator(".entry-date-lead")).toHaveText(dateLabel);
    const [rowBox, stripeBox] = await Promise.all([
      row.boundingBox(),
      row.locator(".entry-stripe").boundingBox(),
    ]);
    expect(rowBox).not.toBeNull();
    expect(stripeBox).not.toBeNull();
    return { x: stripeBox!.x, offset: stripeBox!.x - rowBox!.x };
  };

  const oneDigitDay = await stripePosition("dinner: cereal again", "Sep 9");
  const twoDigitDay = await stripePosition("full cart, forgot", "Sep 10");
  expect(oneDigitDay.x).toBeCloseTo(twoDigitDay.x, 1);

  await page.locator("[data-week-trigger]").click();
  await page.locator('[data-week-row][data-week-key="2026-08-16"]').click();
  const otherMonth = await stripePosition("57 cans of anchovies", "Aug 22");
  expect(otherMonth.x).toBeCloseTo(twoDigitDay.x, 1);

  await switchTab(page, "Home");
  const homeRow = page.locator(".today-row").first();
  const [homeRowBox, homeStripeBox] = await Promise.all([
    homeRow.boundingBox(),
    homeRow.locator(".entry-stripe").boundingBox(),
  ]);
  expect(homeRowBox).not.toBeNull();
  expect(homeStripeBox).not.toBeNull();
  expect(homeStripeBox!.x - homeRowBox!.x).toBeCloseTo(twoDigitDay.offset, 1);
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
