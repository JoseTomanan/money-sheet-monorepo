import { test, expect, type Page } from "@playwright/test";
import type { AddEntryPayload, GatewayAdapter, UpdateEntryPatch } from "../src/lib/types";

async function waitForAppReady(page: Page) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  await page.locator(".loading-spinner").waitFor({ state: "detached" });
}

async function switchTab(page: Page, label: "Home" | "Entries" | "Summary") {
  await page.locator(".tab-bar-pill").getByRole("button", { name: label }).click();
}

async function holdMockAdds(page: Page, outcome: 'confirmed' | 'failed' | 'queued' = 'confirmed') {
  await page.evaluate(async outcome => {
    const modulePath = "/money-sheet-monorepo/src/lib/api.ts";
    const api = await import(modulePath);
    const base = api.gateway() as GatewayAdapter;
    const waitForRelease = () => new Promise<void>((resolve) => {
      window.addEventListener("release-e2e-add", () => resolve(), { once: true });
    });
    const finish = async <T>(run: () => Promise<T>): Promise<T> => {
      await waitForRelease();
      if (outcome === 'failed') throw new Error('The save was rejected');
      if (outcome === 'queued') throw new api.ConnectionError('Delivery timed out');
      return run();
    };

    api.setAdapter({
      getEntries: () => base.getEntries(),
      getMaster: () => base.getMaster(),
      getCategories: () => base.getCategories(),
      getConfig: () => base.getConfig(),
      getStats: () => base.getStats(),
      addEntry: async (payload: AddEntryPayload, mutationId?: string) => {
        return finish(() => base.addEntry(payload, mutationId));
      },
      addEntries: async (payloads: AddEntryPayload[], mutationId?: string) => {
        return finish(() => base.addEntries(payloads, mutationId));
      },
      updateEntry: (id: number, patch: UpdateEntryPatch) => base.updateEntry(id, patch),
      deleteEntry: (id: number) => base.deleteEntry(id),
      validateConnection: (gasUrl: string, apiSecret: string) => base.validateConnection(gasUrl, apiSecret),
    });
  }, outcome);
}

async function holdMockChanges(page: Page, outcome: 'confirmed' | 'failed' | 'queued' = 'confirmed') {
  await page.evaluate(async outcome => {
    const apiPath = '/money-sheet-monorepo/src/lib/api.ts';
    const api = await import(apiPath);
    const base = api.gateway() as GatewayAdapter;
    const wait = () => new Promise<void>(resolve => {
      window.addEventListener('release-e2e-change', () => resolve(), { once: true });
    });
    const finish = async (run: () => Promise<void>) => {
      await wait();
      if (outcome === 'failed') throw new Error('The change was rejected');
      if (outcome === 'queued') throw new api.ConnectionError('Offline');
      await run();
    };
    api.setAdapter({
      getEntries: () => base.getEntries(), getMaster: () => base.getMaster(),
      getCategories: () => base.getCategories(), getConfig: () => base.getConfig(),
      getStats: () => base.getStats(),
      addEntry: (payload: AddEntryPayload, mutationId?: string) => base.addEntry(payload, mutationId),
      addEntries: (payloads: AddEntryPayload[], mutationId?: string) => base.addEntries(payloads, mutationId),
      updateEntry: (id: number, patch: UpdateEntryPatch) => finish(() => base.updateEntry(id, patch)),
      deleteEntry: (id: number) => finish(() => base.deleteEntry(id)),
      validateConnection: (url: string, secret: string) => base.validateConnection(url, secret),
    });
  }, outcome);
}

async function refreshEntries(page: Page) {
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    await (await import(path)).store.refreshAll(true);
  });
}

async function addEntryViaUi(
  page: Page,
  opts: { description: string; amount: string; tag: string; direction?: "Outgoing" | "Incoming" }
) {
  const direction = opts.direction ?? "Outgoing";
  await switchTab(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
  if (direction === "Incoming") {
    await page.locator("button.dir-btn", { hasText: "Incoming" }).click();
  }
  await page.locator(".amount-input").fill(opts.amount);
  await page.locator(".field-input").first().fill(opts.description);
  // Outgoing entries drill: click parent category first, then subcategory
  if (direction === "Outgoing") {
    const parentCat: Record<string, string> = {
      Groceries: "FOOD", Dining: "FOOD", Rent: "HOUSING", Utilities: "HOUSING",
      Leisure: "LIFESTYLE", Entertainment: "LIFESTYLE",
      "Commute Fare": "TRANSIT", Fuel: "TRANSIT",
    };
    const parent = parentCat[opts.tag];
    if (parent) await page.locator(`.tag-pill`, { hasText: parent }).first().click();
  }
  await page.locator(".tag-pill", { hasText: opts.tag }).first().click();
  await page.locator("button.header-btn.save").click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });
  // This helper seeds a confirmed Entry for the next Edit/Delete interaction.
  // Wait for both the closing overlay and the temporary row to finish first.
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.entry-card', { hasText: opts.description }).locator('[data-local-indicator]')).toHaveCount(0);
  await waitForAppReady(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
});

for (const outcome of ['confirmed', 'failed', 'queued'] as const) {
  test(`Edit closes before confirmation and reconciles a ${outcome} outcome`, async ({ page }, testInfo) => {
    const desc = `pending-edit-${outcome}`;
    await addEntryViaUi(page, { description: desc, amount: '50', tag: 'Dining' });
    const card = page.locator('.entry-card', { hasText: desc });
    await expect(card).not.toHaveClass(/animate-\[shimmer/);
    await holdMockChanges(page, outcome);
    await card.locator('.entry-desc').click();
    await page.locator('.amount-input').fill('999');
    await page.locator('button.header-btn.save').click();
    await expect(page.locator('.sheet')).toBeHidden();
    await expect(card).toContainText('₱999.00');
    await refreshEntries(page);
    await expect(card).toContainText('₱999.00');
    await page.evaluate(() => window.dispatchEvent(new Event('release-e2e-change')));
    await expect(card).not.toHaveClass(/animate-\[shimmer/);
    await expect(card).toContainText(outcome === 'failed' ? '₱50.00' : '₱999.00');
    if (outcome === 'failed') {
      await expect(page.getByRole('alert')).toContainText('The change was rejected');
      await page.screenshot({ path: testInfo.outputPath('optimistic-edit-failure.png') });
    }
    if (outcome === 'queued') {
      await page.locator('.sync-status').click();
      await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeVisible();
    }
    await expect(page.locator('.sheet[data-state="open"]')).toBeHidden();
  });

  test(`Delete hides the entry before confirmation and reconciles a ${outcome} outcome`, async ({ page }) => {
    const desc = `pending-delete-${outcome}`;
    await addEntryViaUi(page, { description: desc, amount: '50', tag: 'Dining' });
    const card = page.locator('.entry-card', { hasText: desc });
    await expect(card).not.toHaveClass(/animate-\[shimmer/);
    await holdMockChanges(page, outcome);
    await card.locator('.entry-desc').click();
    await page.locator('.delete-btn').dispatchEvent('click');
    await expect(page.locator('.sheet')).toBeHidden();
    await expect(card).toBeHidden();
    await refreshEntries(page);
    await expect(card).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('release-e2e-change')));
    if (outcome === 'failed') {
      await expect(card).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('The change was rejected');
    } else {
      await expect(card).toBeHidden();
      if (outcome === 'queued') {
        await page.locator('.sync-status').click();
        await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeVisible();
      }
    }
  });
}

test('bulk confirmation hides selected entries and finishes selection before requests settle', async ({ page }) => {
  await switchTab(page, 'Entries');
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    const { store } = await import(path);
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await store.addEntry(['Pending bulk 1', 'Pending bulk 2'].map(description => ({
      date, tag: 'Dining', direction: 'O', amount: 50, description,
    })));
  });
  await holdMockChanges(page, 'failed');
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await page.locator('.entry-card', { hasText: 'Pending bulk 1' }).click();
  await page.locator('.entry-card', { hasText: 'Pending bulk 2' }).click();
  await page.locator('.delete-sel-btn').click();
  await page.getByRole('button', { name: 'Delete 2 entries', exact: true }).click();
  await expect(page.locator('.sheet')).toBeHidden();
  await expect(page.locator('.select-bar')).toBeHidden();
  await expect(page.locator('.entry-card', { hasText: 'Pending bulk' })).toHaveCount(0);
  await refreshEntries(page);
  await expect(page.locator('.entry-card', { hasText: 'Pending bulk' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('release-e2e-change')));
  await expect(page.locator('.entry-card', { hasText: 'Pending bulk' })).toHaveCount(2);
  await expect(page.getByRole('alert')).toContainText('Failed to delete 2 entries');
});

for (const mode of ['Add', 'Split'] as const) {
  for (const outcome of ['confirmed', 'failed', 'queued'] as const) {
    test(`${mode} admits once, closes during delivery, and handles a later ${outcome} outcome`, async ({ page }) => {
      await holdMockAdds(page, outcome);
      await switchTab(page, 'Entries');
      await page.getByRole('button', { name: 'Add entry', exact: true }).click();
      const description = `${mode} submission ${outcome}`;
      await page.locator('.amount-input').fill('42');
      await page.locator('.field-input').first().fill(description);
      await page.getByRole('button', { name: 'FOOD', exact: true }).click();
      await page.getByRole('button', { name: 'Dining', exact: true }).click();
      if (mode === 'Split') {
        await page.getByText('Add leg', { exact: true }).click();
        await page.getByRole('button', { name: 'FOOD', exact: true }).nth(1).click();
        await page.getByRole('button', { name: 'Groceries', exact: true }).nth(1).click();
        await page.locator('.amount-input').nth(1).fill('8');
      }
      await page.evaluate(() => {
        const save = document.querySelector<HTMLButtonElement>('button.header-btn.save')!;
        save.click();
        save.click();
      });
      await expect(page.locator('.sheet[data-state="open"]')).toHaveCount(0);
      const card = page.locator('.entry-card', { hasText: description });
      await expect(card).toBeVisible();
      await expect(card.locator('[data-local-indicator]').first()).toBeVisible();
      const pending = () => page.evaluate(async () => {
        const path = '/money-sheet-monorepo/src/lib/queue.ts';
        return JSON.parse(JSON.stringify((await import(path)).readQueue()));
      });
      const admitted = await pending();
      expect(admitted).toHaveLength(1);
      expect(admitted[0].op).toBe(mode === 'Split' ? 'addBatch' : 'add');
      expect(admitted[0].mutationId).toEqual(expect.any(String));
      if (mode === 'Split') expect(admitted[0].payloads.map((leg: AddEntryPayload) => leg.amount)).toEqual([42, 8]);
      await page.evaluate(() => window.dispatchEvent(new Event('release-e2e-add')));
      if (outcome === 'failed') {
        await expect(card).toHaveCount(0);
        await expect(page.getByRole('alert')).toContainText('The save was rejected');
        expect(await pending()).toEqual([]);
      } else if (outcome === 'queued') {
        await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'waiting');
        expect(await pending()).toEqual(admitted);
        await expect(card.locator('[data-local-indicator]').first()).toBeVisible();
      } else {
        await expect(card.locator('[data-local-indicator]')).toHaveCount(0);
        expect(await pending()).toEqual([]);
      }
      await expect(page.locator('.sheet[data-state="open"]')).toHaveCount(0);
    });
  }
}

test("Add Entry closes while its optimistic row is still synchronizing", async ({ page }) => {
  const desc = `pending-add-${Date.now()}`;
  await holdMockAdds(page);
  await switchTab(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
  await page.locator(".amount-input").fill("50");
  await page.locator(".field-input").first().fill(desc);
  await page.locator(".tag-pill", { hasText: "FOOD" }).first().click();
  await page.locator(".tag-pill", { hasText: "Dining" }).first().click();

  await page.locator("button.header-btn.save").click();

  await expect(page.locator('.sheet[data-state="open"]')).toBeHidden();
  const pendingRow = page.locator(".entry-card", { hasText: desc });
  await expect(pendingRow).toBeVisible();
  await expect(pendingRow).not.toHaveClass(/animate-\[shimmer_1s_ease-in-out_infinite\]/);
  await expect(pendingRow.locator("[data-local-indicator]")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("release-e2e-add")));
  await expect(pendingRow).not.toHaveClass(/animate-\[shimmer_1s_ease-in-out_infinite\]/);
});

// AC: adding an entry — appears immediately, no full-page spinner
test("adding an entry shows it immediately without a loading spinner", async ({ page }) => {
  const desc = `opt-add-${Date.now()}`;

  await switchTab(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });

  await page.locator(".amount-input").fill("50");
  await page.locator(".field-input").first().fill(desc);
  await page.locator(".tag-pill", { hasText: "FOOD" }).first().click();
  await page.locator(".tag-pill", { hasText: "Dining" }).first().click();
  await page.locator("button.header-btn.save").click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });

  await expect(page.locator(".entry-card", { hasText: desc })).toBeVisible();
  await expect(page.locator(".loading-spinner")).not.toBeVisible();
});

// AC: editing an entry — reflects new value immediately, no spinner
test("editing an entry updates it immediately without a loading spinner", async ({ page }) => {
  const desc = `opt-edit-${Date.now()}`;
  await addEntryViaUi(page, { description: desc, amount: "50", tag: "Dining" });

  await switchTab(page, "Entries");
  await page.locator(".entry-card", { hasText: desc }).locator(".entry-desc").click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });

  await page.locator(".amount-input").fill("999");
  await page.locator("button.header-btn.save").click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });

  await expect(page.locator(".loading-spinner")).not.toBeVisible();
  await expect(page.locator(".entry-card", { hasText: desc })).toContainText("₱999.00");
});

// AC: deleting an entry — gone immediately, no spinner
test("deleting an entry removes it immediately without a loading spinner", async ({ page }) => {
  const desc = `opt-del-${Date.now()}`;

  await switchTab(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
  await page.locator(".amount-input").fill("1");
  await page.locator(".field-input").first().fill(desc);
  await page.locator(".tag-pill", { hasText: "FOOD" }).first().click();
  await page.locator(".tag-pill", { hasText: "Dining" }).first().click();
  await page.locator("button.header-btn.save").click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });

  const card = page.locator(".entry-card", { hasText: desc });
  await expect(card).toBeVisible();
  // Delete is inside the EntrySheet — open it then dispatchEvent to bypass pointer-events
  await card.locator(".entry-desc").dispatchEvent("click");
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "visible" });
  await page.locator(".delete-btn").dispatchEvent("click");
  await page.locator('.sheet[data-state="open"]').waitFor({ state: "detached" });

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
