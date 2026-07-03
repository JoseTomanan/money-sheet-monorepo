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

  // AC: BudgetsView — onhand card stays full-width; category breakdown is 2-column grid
  test("BudgetsView: category rows are in a 2-column grid", async ({ page }) => {
    await switchTab(page, "Summary");

    const rows = page.locator(".cat-list .cat-row");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const row0 = await rows.nth(0).boundingBox();
    const row1 = await rows.nth(1).boundingBox();
    expect(row0).not.toBeNull();
    expect(row1).not.toBeNull();

    // Row 0 and row 1 are side by side (same approximate y, different x)
    expect(Math.abs(row1!.y - row0!.y)).toBeLessThan(20);
    expect(row1!.x).toBeGreaterThan(row0!.x + row0!.width * 0.5);
  });

  // AC: BudgetsView — onhand card and dist bar stay full-width (not compressed into a column)
  test("BudgetsView: onhand card and dist bar remain full-width", async ({ page }) => {
    await switchTab(page, "Summary");

    const shell = await page.locator(".app-shell").boundingBox();
    const onhand = await page.locator(".onhand-card").boundingBox();
    const dist = await page.locator(".dist-bar").boundingBox();
    expect(shell).not.toBeNull();
    expect(onhand).not.toBeNull();
    expect(dist).not.toBeNull();

    // Each spans more than 70% of the container width
    expect(onhand!.width).toBeGreaterThan(shell!.width * 0.7);
    expect(dist!.width).toBeGreaterThan(shell!.width * 0.7);

    // And they are stacked (dist starts below onhand)
    expect(dist!.y).toBeGreaterThan(onhand!.y);
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

  // AC: mobile BudgetsView — category rows are stacked in a single column
  test("BudgetsView: category rows are stacked vertically", async ({ page }) => {
    await switchTab(page, "Summary");

    const rows = page.locator(".cat-list .cat-row");
    await expect(rows.first()).toBeVisible();

    const row0 = await rows.nth(0).boundingBox();
    const row1 = await rows.nth(1).boundingBox();
    expect(row0).not.toBeNull();
    expect(row1).not.toBeNull();

    // Row 1 is below row 0 (different y, similar x)
    expect(row1!.y).toBeGreaterThan(row0!.y + row0!.height * 0.5);
    expect(Math.abs(row1!.x - row0!.x)).toBeLessThan(20);
  });
});
