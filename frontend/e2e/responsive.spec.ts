import { test, expect, type Page } from "@playwright/test";

async function expectTouchTarget(locator: { boundingBox(): Promise<{ width: number; height: number } | null> }) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function waitForAppReady(page: Page) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  await page.locator(".loading-spinner").waitFor({ state: "detached" });
}

async function switchTab(page: Page, label: "Home" | "Entries" | "Summary") {
  await page.locator(".tab-bar-pill").getByRole("button", { name: label }).click();
}

async function expectClearOfTabBar(page: Page, contentSelector: string) {
  const scrollArea = page.locator(".scroll-area");
  await scrollArea.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

  const content = await page.locator(contentSelector).boundingBox();
  const tabBar = await page.locator(".tab-bar-pill").boundingBox();
  expect(content).not.toBeNull();
  expect(tabBar).not.toBeNull();
  expect(content!.y + content!.height).toBeLessThanOrEqual(tabBar!.y);
}

// ─── Desktop 1024×800 ────────────────────────────────────────────────────────

test.describe("desktop 1024px — responsive reflow", () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
  });

  test("page headers keep the labeled Settings action in flow", async ({ page }) => {
    const expectInFlowSettings = async () => {
      const header = page.locator(".page-header");
      const settings = header.getByRole("button", { name: "Open settings" });
      await expect(settings).toContainText("Settings");
      expect(await settings.evaluate((element) => getComputedStyle(element).position)).not.toBe("fixed");

      const [headerBox, settingsBox] = await Promise.all([
        header.boundingBox(),
        settings.boundingBox(),
      ]);
      expect(headerBox).not.toBeNull();
      expect(settingsBox).not.toBeNull();
      expect(settingsBox!.x).toBeGreaterThanOrEqual(headerBox!.x);
      expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width);
    };

    await expectInFlowSettings();
    await switchTab(page, "Entries");
    await expectInFlowSettings();
    await switchTab(page, "Summary");
    await expectInFlowSettings();
    await page.getByRole("button", { name: "Deeper statistics" }).click();
    await expectInFlowSettings();
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

  test("EntriesView: mobile touch targets collapse to desktop density", async ({ page }) => {
    await switchTab(page, "Entries");

    const controls = [
      page.locator("[data-week-trigger]"),
      page.getByRole("button", { name: "Redistribute" }),
      page.getByRole("button", { name: "Enter bulk-select mode" }),
      page.getByRole("radio", { name: "All", exact: true }),
      page.locator(".cat-chip-btn").first(),
    ];

    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThan(44);
    }
  });

  test("App and sheet chrome use desktop pointer density", async ({ page }) => {
    const appControls = [
      page.getByRole("button", { name: "Exit" }),
      page.getByRole("button", { name: "Open settings" }),
    ];
    for (const control of appControls) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThan(44);
    }

    await page.getByRole("button", { name: "Open settings" }).click();
    const settings = page.locator('.sheet[data-state="open"]');
    for (const control of [
      settings.getByRole("button", { name: "Done" }),
      settings.getByRole("button", { name: "Show" }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThan(44);
    }
    await settings.getByRole("button", { name: "Done" }).click();

    await switchTab(page, "Summary");
    const deeperStatsBox = await page.getByRole("button", { name: "Deeper statistics" }).boundingBox();
    expect(deeperStatsBox).not.toBeNull();
    expect(deeperStatsBox!.height).toBeLessThan(44);

    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    const entrySheet = page.locator('.sheet[data-state="open"]');
    for (const control of [
      entrySheet.getByRole("button", { name: "Cancel" }),
      entrySheet.getByRole("button", { name: "Save", exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThan(44);
    }
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

test.describe("tablet 900px — touch composition", () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test("routes stay stacked and controls keep touch density below 1024px", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);

    const hero = await page.locator(".hero-card").boundingBox();
    const categories = await page.locator(".category-scroll-wrap").boundingBox();
    expect(hero).not.toBeNull();
    expect(categories).not.toBeNull();
    expect(categories!.y).toBeGreaterThan(hero!.y + hero!.height);
    await expectTouchTarget(page.getByRole("button", { name: "Open settings" }));

    await switchTab(page, "Entries");
    const filters = await page.locator(".filter-bar").boundingBox();
    const entries = await page.locator(".entry-list").boundingBox();
    expect(filters).not.toBeNull();
    expect(entries).not.toBeNull();
    expect(entries!.y).toBeGreaterThan(filters!.y);
    await expectTouchTarget(page.getByRole("radio", { name: "All", exact: true }));

    await switchTab(page, "Summary");
    const funds = await page.locator(".summary-left").boundingBox();
    const pace = await page.locator(".summary-aside").boundingBox();
    expect(funds).not.toBeNull();
    expect(pace).not.toBeNull();
    expect(pace!.y).toBeGreaterThanOrEqual(funds!.y + funds!.height);
  });
});

test.describe("mobile 390px — layout unchanged", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('App and Entries chrome provide 44px touch targets', async ({ page }) => {
    await expectTouchTarget(page.getByRole('button', { name: 'Exit' }));
    await expectTouchTarget(page.getByRole('button', { name: 'Open settings' }));

    await switchTab(page, 'Entries');

    await expectTouchTarget(page.locator('[data-week-trigger]'));
    await expectTouchTarget(page.getByRole('button', { name: 'Redistribute' }));
    await expectTouchTarget(page.getByRole('button', { name: 'Enter bulk-select mode' }));
  });

  test('Entry filters and Summary actions provide 44px touch targets', async ({ page }) => {
    await switchTab(page, 'Entries');

    const filters = page.locator('[role="radiogroup"] button, .cat-chip-btn');
    for (let index = 0; index < await filters.count(); index += 1) {
      await expectTouchTarget(filters.nth(index));
    }

    await switchTab(page, 'Summary');
    await expectTouchTarget(page.getByRole('button', { name: 'Deeper statistics' }));
  });

  test('Entry sheet actions and tag pills provide 44px touch targets', async ({ page }) => {
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    const sheet = page.locator('.sheet[data-state="open"]');
    await sheet.waitFor({ state: 'visible' });

    await expectTouchTarget(sheet.getByRole('button', { name: 'Cancel' }));
    await expectTouchTarget(sheet.getByRole('button', { name: 'Save', exact: true }));

    const tagPills = sheet.locator('.tag-pill');
    for (let index = 0; index < await tagPills.count(); index += 1) {
      await expectTouchTarget(tagPills.nth(index));
    }
  });

  test('Entry sheet keeps the full Add leg action visible inside the sheet', async ({ page }) => {
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();

    const sheet = page.locator('.sheet[data-state="open"]');
    const addLeg = sheet.getByRole('button', { name: /Add leg/ });
    await expect(addLeg).toBeVisible();

    const sheetBox = await sheet.boundingBox();
    const addLegBox = await addLeg.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(addLegBox).not.toBeNull();
    expect(addLegBox!.x).toBeGreaterThanOrEqual(sheetBox!.x);
    expect(addLegBox!.x + addLegBox!.width).toBeLessThanOrEqual(sheetBox!.x + sheetBox!.width);
    expect(addLegBox!.width).toBeGreaterThanOrEqual(44);
    expect(addLegBox!.height).toBeGreaterThanOrEqual(44);
  });

  test('Split Entry keeps multiple legs snapping and reveals keyboard focus', async ({ page }) => {
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();

    const sheet = page.locator('.sheet[data-state="open"]');
    const addLeg = sheet.getByRole('button', { name: 'Add leg', exact: true });
    await addLeg.click();
    await addLeg.click();

    const carousel = sheet.locator('.carousel');
    const legCards = carousel.locator('.leg-card');
    await expect(legCards).toHaveCount(3);
    expect(await carousel.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await carousel.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');

    const categoryTags = legCards.locator('.tag-pill');
    expect(await categoryTags.evaluateAll((tags) => tags.every((tag) => (tag as HTMLElement).tabIndex >= 0))).toBe(true);

    const lastLegTag = legCards.last().locator('.tag-pill').last();
    await lastLegTag.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await expect(lastLegTag).toBeFocused();

    await expect.poll(async () => {
      const carouselBox = await carousel.boundingBox();
      const tagBox = await lastLegTag.boundingBox();
      if (!carouselBox || !tagBox) return false;
      return tagBox.x >= carouselBox.x && tagBox.x + tagBox.width <= carouselBox.x + carouselBox.width;
    }).toBe(true);
  });

  test('Settings actions provide 44px touch targets', async ({ page }) => {
    await page.getByRole('button', { name: 'Open settings' }).click();
    const sheet = page.locator('.sheet[data-state="open"]');
    await sheet.waitFor({ state: 'visible' });

    await expectTouchTarget(sheet.getByRole('button', { name: 'Done' }));
    await expectTouchTarget(sheet.getByRole('button', { name: 'Show' }));
  });

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

    const rows = page.locator(".envelope-row");
    await expect(rows).toHaveCount(7);
    for (let index = 0; index < await rows.count(); index += 1) {
      const row = rows.nth(index);
      const category = row.locator(".cat-label");
      const valueBlock = row.locator(".text-right");

      await expect(row.locator(".direction-chip")).toContainText("This month");
      expect(await category.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

      const rowBox = await row.boundingBox();
      const valueBox = await valueBlock.boundingBox();
      expect(rowBox).not.toBeNull();
      expect(valueBox).not.toBeNull();
      expect(valueBox!.x + valueBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
    }

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

test.describe("mobile 390×844 — fixed tab bar clearance", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Summary: spending pace legend scrolls fully above the tab bar", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await switchTab(page, "Summary");

    await expectClearOfTabBar(page, ".pace-chart > div:last-child");
  });

  test("Deeper stats: final category row scrolls fully above the tab bar", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await switchTab(page, "Summary");
    await page.getByRole("button", { name: "Deeper statistics" }).click();

    await expectClearOfTabBar(page, ".cat-list .cat-row:last-child");
  });
});

test.describe("desktop 1280×752 — fixed tab bar clearance", () => {
  test.use({ viewport: { width: 1280, height: 752 } });

  test("Entry sheet uses a 3:2 grid and lets one leg fill the primary column", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.getByRole("button", { name: "Add entry", exact: true }).click();

    const sheet = page.locator('.sheet[data-state="open"]');
    const primary = sheet.locator(".entry-sheet-primary");
    const details = sheet.locator(".entry-sheet-details");
    const leg = sheet.locator(".leg-card").first();
    const [primaryBox, detailsBox, legBox] = await Promise.all([
      primary.boundingBox(),
      details.boundingBox(),
      leg.boundingBox(),
    ]);

    expect(primaryBox).not.toBeNull();
    expect(detailsBox).not.toBeNull();
    expect(legBox).not.toBeNull();
    expect(primaryBox!.width).toBeGreaterThan(detailsBox!.width);
    expect(detailsBox!.x).toBeGreaterThan(primaryBox!.x + primaryBox!.width);
    expect(Math.abs(primaryBox!.y - detailsBox!.y)).toBeLessThan(8);
    expect(legBox!.width).toBeGreaterThan(primaryBox!.width * 0.9);
  });

  test("Deeper statistics keeps Flow beside the wider spending breakdown", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await switchTab(page, "Summary");
    await page.getByRole("button", { name: "Deeper statistics" }).click();

    const flow = await page.locator(".deeper-stats-aside").boundingBox();
    const spending = await page.locator(".deeper-stats-main").boundingBox();
    expect(flow).not.toBeNull();
    expect(spending).not.toBeNull();
    expect(spending!.x).toBeGreaterThan(flow!.x + flow!.width);
    expect(spending!.width).toBeGreaterThan(flow!.width);
    expect(Math.abs(flow!.y - spending!.y)).toBeLessThan(8);
  });

  test("Settings keeps Connection beside the narrower preferences column", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.getByRole("button", { name: "Open settings" }).click();

    const sheet = page.locator('.sheet[data-state="open"]');
    const connection = await sheet.locator(".settings-connection").boundingBox();
    const preferences = await sheet.locator(".settings-preferences").boundingBox();
    expect(connection).not.toBeNull();
    expect(preferences).not.toBeNull();
    expect(connection!.width).toBeGreaterThan(preferences!.width);
    expect(preferences!.x).toBeGreaterThan(connection!.x + connection!.width);
    const [connectionTop, preferencesTop] = await Promise.all([
      sheet.locator(".settings-connection").evaluate((element) => (element as HTMLElement).offsetTop),
      sheet.locator(".settings-preferences").evaluate((element) => (element as HTMLElement).offsetTop),
    ]);
    expect(Math.abs(connectionTop - preferencesTop)).toBeLessThan(8);
  });

  test("Redistribution bounds Amount above equal From and To panels", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await switchTab(page, "Entries");
    await page.getByRole("button", { name: "Redistribute" }).click();

    const sheet = page.locator(".sheet-root .sheet");
    const amount = await sheet.locator(".redistribution-amount").boundingBox();
    const source = await sheet.locator(".redistribution-source").boundingBox();
    const target = await sheet.locator(".redistribution-target").boundingBox();
    expect(amount).not.toBeNull();
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    expect(amount!.y + amount!.height).toBeLessThanOrEqual(source!.y);
    expect(target!.x).toBeGreaterThan(source!.x + source!.width);
    expect(Math.abs(source!.width - target!.width)).toBeLessThan(4);
    expect(amount!.width).toBeLessThan(source!.width + target!.width);
  });

  test("dark theme uses the approved graphite surface hierarchy", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();

    const tokens = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        canvas: styles.getPropertyValue("--app-bg").trim().toLowerCase(),
        surface: styles.getPropertyValue("--background").trim().toLowerCase(),
        elevated: styles.getPropertyValue("--card").trim().toLowerCase(),
        border: styles.getPropertyValue("--border").trim().toLowerCase(),
        text: styles.getPropertyValue("--foreground").trim().toLowerCase(),
        mutedText: styles.getPropertyValue("--muted-foreground").trim().toLowerCase(),
      };
    });

    expect(tokens).toEqual({
      canvas: "#0c0e10",
      surface: "#15181b",
      elevated: "#1c2024",
      border: "#2c3237",
      text: "#e4e7e9",
      mutedText: "#9ca4aa",
    });
  });

  test('Entry sheet keeps the Add leg action and sheet inside the viewport', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();

    const sheet = page.locator('.sheet[data-state="open"]');
    const addLeg = sheet.getByRole('button', { name: 'Add leg', exact: true });
    await expect(addLeg).toBeVisible();

    const sheetBox = await sheet.boundingBox();
    const addLegBox = await addLeg.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(addLegBox).not.toBeNull();
    expect(sheetBox!.x).toBeGreaterThanOrEqual(0);
    expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(1280);
    expect(addLegBox!.x).toBeGreaterThanOrEqual(sheetBox!.x);
    expect(addLegBox!.x + addLegBox!.width).toBeLessThanOrEqual(sheetBox!.x + sheetBox!.width);
    expect(addLegBox!.height).toBeLessThan(44);

    const firstLegBox = await sheet.locator('.leg-card').first().boundingBox();
    expect(firstLegBox).not.toBeNull();
    expect(firstLegBox!.width).toBeLessThan(sheetBox!.width * 0.75);

    const firstTagBox = await sheet.locator('.tag-pill').first().boundingBox();
    expect(firstTagBox).not.toBeNull();
    expect(firstTagBox!.height).toBeLessThan(44);
  });

  test("Entries: final add-entry control scrolls fully above the tab bar", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await switchTab(page, "Entries");

    await expectClearOfTabBar(page, ".entry-list .add-entry-card:last-child");
  });
});
