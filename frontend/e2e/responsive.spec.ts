import { test, expect, type Page } from "@playwright/test";

async function waitForAppReady(page: Page) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  await page.locator(".loading-spinner").waitFor({ state: "detached" });
}

async function switchTab(page: Page, label: "Home" | "Entries" | "Summary") {
  await page.locator(".tab-bar-pill").getByRole("button", { name: label }).click();
}

// ─── Desktop 1024×800 ────────────────────────────────────────────────────────

test.describe("desktop 1024px — responsive reflow", () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
  });

  // AC: HomeScreen two-column — hero and category section are side by side
  test("HomeScreen: hero card and category section are side by side", async ({ page }) => {
    const hero = await page.locator(".hero-card").boundingBox();
    const cats = await page.locator(".category-scroll-wrap").boundingBox();
    expect(hero).not.toBeNull();
    expect(cats).not.toBeNull();

    // Category section starts to the right of the hero card
    expect(cats!.x).toBeGreaterThan(hero!.x + hero!.width * 0.5);

    // Their vertical ranges overlap (both visible roughly at the same height)
    const heroBottom = hero!.y + hero!.height;
    const catsBottom = cats!.y + cats!.height;
    expect(cats!.y).toBeLessThan(heroBottom);
    expect(hero!.y).toBeLessThan(catsBottom);
  });

  // AC: HomeScreen — category chips reflow into a multi-row grid (not horizontal scroll)
  test("HomeScreen: category chips wrap into a grid (4th chip is below 1st)", async ({ page }) => {
    const chips = page.locator(".cat-chip");
    await expect(chips.first()).toBeVisible();

    const first = await chips.nth(0).boundingBox();
    const fourth = await chips.nth(3).boundingBox();
    expect(first).not.toBeNull();
    expect(fourth).not.toBeNull();

    // 4th chip is on a lower row than the 1st
    expect(fourth!.y).toBeGreaterThan(first!.y + first!.height * 0.5);
  });

  // AC: EntriesView — filter sidebar to the left of the entry list
  test("EntriesView: filter sidebar is to the left of the entry list", async ({ page }) => {
    await switchTab(page, "Entries");

    const sidebar = await page.locator(".filter-bar").boundingBox();
    const list = await page.locator(".entry-list").boundingBox();
    expect(sidebar).not.toBeNull();
    expect(list).not.toBeNull();

    // Sidebar's right edge is to the left of (or at) the list's left edge
    expect(list!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width - 2);

    // They overlap vertically
    const sidebarBottom = sidebar!.y + sidebar!.height;
    const listBottom = list!.y + list!.height;
    expect(sidebar!.y).toBeLessThan(listBottom);
    expect(list!.y).toBeLessThan(sidebarBottom);
  });

  // AC: EntriesView — filter bar is NOT sticky (position is not fixed/sticky)
  test("EntriesView: filter bar is not sticky at desktop", async ({ page }) => {
    await switchTab(page, "Entries");

    const position = await page.locator(".filter-bar").evaluate(
      (el) => getComputedStyle(el).position
    );
    expect(position).not.toBe("sticky");
    expect(position).not.toBe("fixed");
  });

  // AC: SummaryView — Category balances and spending pace form two columns
  test("SummaryView: Category balances and Spending pace are side by side", async ({ page }) => {
    await switchTab(page, "Summary");

    const housing = await page.getByText("Housing", { exact: true }).boundingBox();
    const spendingPace = await page.getByText("Spending pace", { exact: true }).boundingBox();
    expect(housing).not.toBeNull();
    expect(spendingPace).not.toBeNull();

    expect(spendingPace!.x).toBeGreaterThan(housing!.x + housing!.width);
    expect(Math.abs(spendingPace!.y - housing!.y)).toBeLessThan(40);
  });

  // AC: SummaryView — Category balances use the wider side of the 3:2 desktop grid
  test("SummaryView: Category balances use the wider desktop column", async ({ page }) => {
    await switchTab(page, "Summary");

    const categoryColumn = await page.locator(".summary-left").boundingBox();
    const paceColumn = await page.locator(".summary-aside").boundingBox();
    expect(categoryColumn).not.toBeNull();
    expect(paceColumn).not.toBeNull();

    expect(categoryColumn!.width).toBeGreaterThan(paceColumn!.width);
    expect(paceColumn!.x).toBeGreaterThanOrEqual(categoryColumn!.x + categoryColumn!.width - 2);
  });
});

// ─── Mobile 390×800 ──────────────────────────────────────────────────────────

test.describe("mobile 390px — layout unchanged", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
  });

  // AC: mobile HomeScreen — sections are stacked (category below hero)
  test("HomeScreen: hero card and category section are stacked vertically", async ({ page }) => {
    const hero = await page.locator(".hero-card").boundingBox();
    const cats = await page.locator(".category-scroll-wrap").boundingBox();
    expect(hero).not.toBeNull();
    expect(cats).not.toBeNull();

    // Category section starts below the hero card
    expect(cats!.y).toBeGreaterThan(hero!.y + hero!.height * 0.5);
  });

  // AC: mobile HomeScreen — chips stay in a single horizontal row
  test("HomeScreen: category chips are in a single horizontal scroll row", async ({ page }) => {
    const chips = page.locator(".cat-chip");
    await expect(chips.first()).toBeVisible();

    const first = await chips.nth(0).boundingBox();
    const fourth = await chips.nth(3).boundingBox();
    expect(first).not.toBeNull();
    expect(fourth).not.toBeNull();

    // All chips are at the same vertical position (within a few pixels)
    expect(Math.abs(fourth!.y - first!.y)).toBeLessThan(10);
  });

  // AC: mobile EntriesView — filter bar is above the entry list
  test("EntriesView: filter bar is above the entry list", async ({ page }) => {
    await switchTab(page, "Entries");

    const bar = await page.locator(".filter-bar").boundingBox();
    const list = await page.locator(".entry-list").boundingBox();
    expect(bar).not.toBeNull();
    expect(list).not.toBeNull();

    // Filter bar's bottom edge is above the list's top edge
    expect(list!.y).toBeGreaterThan(bar!.y + bar!.height * 0.5);
  });

  // AC: split carousel open — sheet clips horizontal overflow (overflow-x-clip) so that
  // the carousel's leg cards cannot push the sheet beyond the viewport width.
  // Primary assertion uses a computed-style check rather than a bounding-box check because
  // Playwright desktop Chrome at 390 px does not reproduce the scroll symptom as reliably as
  // real mobile browsers do; the CSS property directly verifies the fix.
  // Red before fix (overflow-x resolves to "auto" when only overflow-y-auto is set, per CSS spec);
  // green after adding overflow-x-clip.
  test("EntrySheet split mode: sheet has overflow-x clipped to prevent horizontal page scroll", async ({ page }) => {
    // Open the entry sheet
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });

    await page.locator(".carousel").waitFor({ state: "visible" });

    // Primary: sheet's overflow-x must be non-scrollable (clipped or hidden), not "auto".
    // Without the fix, CSS spec coerces overflow-x from visible→auto because overflow-y is "auto",
    // leaving the sheet able to scroll/grow horizontally.
    // With the fix (overflow-x-clip), Chrome normalises the computed value to "hidden" (an
    // alias for clip when combined with overflow-y:auto). Either "hidden" or "clip" are valid
    // non-scrollable outcomes; "auto" or "visible" are not acceptable.
    const sheetOverflowX = await page.locator(".sheet").evaluate(
      (el) => getComputedStyle(el).overflowX
    );
    expect(["hidden", "clip"]).toContain(sheetOverflowX);

    // Secondary: the sheet's right edge must not extend past the viewport.
    const sheetBox = await page.locator(".sheet").boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(viewportWidth + 1);

    // Sanity: carousel's own internal overflow-x is still auto (snap-scroll preserved).
    const carouselOverflowX = await page.locator(".carousel").evaluate(
      (el) => getComputedStyle(el).overflowX
    );
    expect(carouselOverflowX).toBe("auto");
  });

  // AC: mobile SummaryView — Spending pace follows the stacked Category balances
  test("SummaryView: Funds health content is stacked and usable", async ({ page }) => {
    await switchTab(page, "Summary");

    const lastCategory = await page.getByText("Misc", { exact: true }).boundingBox();
    const spendingPace = await page.getByText("Spending pace", { exact: true }).boundingBox();
    const chart = await page
      .getByRole("img", { name: "Cumulative spending, This month versus Usual" })
      .boundingBox();
    expect(lastCategory).not.toBeNull();
    expect(spendingPace).not.toBeNull();
    expect(chart).not.toBeNull();

    expect(spendingPace!.y).toBeGreaterThan(lastCategory!.y + lastCategory!.height);
    expect(chart!.x).toBeGreaterThanOrEqual(0);
    expect(chart!.x + chart!.width).toBeLessThanOrEqual(390);
  });
});
