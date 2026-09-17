import { expect, type Page } from "@playwright/test";

export interface ShakedownConnection {
  gasUrl: string;
  apiSecret: string;
}

export function readDisposableConnection(
  env: Readonly<Record<string, string | undefined>>,
): ShakedownConnection {
  const gasUrl = env.DISPOSABLE_GAS_URL;
  const apiSecret = env.DISPOSABLE_API_SECRET;
  if (!gasUrl || !apiSecret) {
    throw new Error("DISPOSABLE_GAS_URL and DISPOSABLE_API_SECRET must be set in tests/.env");
  }
  return { gasUrl, apiSecret };
}

const APP_URL = "http://localhost:1111/money-sheet-monorepo/";

async function assertDisposableTarget(
  page: Page,
  expected: ShakedownConnection,
): Promise<void> {
  const matches = await page.evaluate(({ gasUrl, apiSecret }) => {
    try {
      const stored = JSON.parse(localStorage.getItem("ms_connection") ?? "null") as {
        gasUrl?: unknown;
        apiSecret?: unknown;
      } | null;
      return stored?.gasUrl === gasUrl && stored?.apiSecret === apiSecret;
    } catch {
      return false;
    }
  }, expected);
  if (!matches) {
    throw new Error("Browser Connection does not match the disposable shakedown target");
  }
}

async function waitForUsableAddEntry(page: Page): Promise<void> {
  const addEntry = page.getByRole("button", { name: "Add entry", exact: true });
  await addEntry.waitFor({ state: "visible" });
  await expect(addEntry).toBeEnabled();
}

async function failOnStoreError(page: Page): Promise<never> {
  const errorCard = page.locator(".error-card");
  await errorCard.waitFor({ state: "visible" });
  const message = (await errorCard.locator(".error-body").textContent())?.trim() || "unknown error";
  throw new Error(`Store error: ${message}`);
}

async function failOnConnectionGate(page: Page): Promise<never> {
  const gate = page.getByRole("dialog");
  await gate.waitFor({ state: "visible" });
  const title = (await gate.getByRole("heading").textContent())?.trim() || "connection is missing";
  throw new Error(`Connection setup required: ${title}`);
}

async function assertNoConnectionGate(page: Page): Promise<void> {
  const gate = page.getByRole("dialog");
  if (await gate.isVisible()) {
    const title = (await gate.getByRole("heading").textContent())?.trim() || "connection is missing";
    throw new Error(`Connection setup required: ${title}`);
  }
}

async function failOnMockMode(page: Page): Promise<never> {
  await page.getByText("Mock mode", { exact: true }).waitFor({ state: "visible" });
  throw new Error("Mock Mode is active; refusing to run live CRUD");
}

async function assertNotMockMode(page: Page): Promise<void> {
  if (await page.getByText("Mock mode", { exact: true }).isVisible()) {
    throw new Error("Mock Mode is active; refusing to run live CRUD");
  }
}

export async function waitForUsableEntries(page: Page): Promise<void> {
  await Promise.race([
    waitForUsableAddEntry(page),
    failOnStoreError(page),
    failOnMockMode(page),
  ]);
  await assertNotMockMode(page);
}

async function navigateToEntries(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Entries", exact: true }).click();
  await page.waitForURL(/#\/entries\/\d{4}-\d{2}-\d{2}$/);
}

export async function openUsableEntries(
  page: Page,
  connection: ShakedownConnection,
): Promise<void> {
  const url = new URL(APP_URL);
  url.searchParams.set("gasUrl", connection.gasUrl);
  url.searchParams.set("apiSecret", connection.apiSecret);

  await page.goto(url.toString());
  await assertNoConnectionGate(page);
  await assertDisposableTarget(page, connection);
  await Promise.race([
    navigateToEntries(page),
    failOnConnectionGate(page),
    failOnMockMode(page),
  ]);
  await waitForUsableEntries(page);
}
