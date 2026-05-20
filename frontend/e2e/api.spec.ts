import { test, expect } from "@playwright/test";

const GAS_URL = process.env.VITE_GAS_URL;

// AC #1 — GAS API returns valid JSON for getEntries
test("GAS getEntries returns valid JSON with correct entry shape", async ({ request }) => {
  test.skip(!GAS_URL, "VITE_GAS_URL not set — add it to frontend/.env to run this test");

  const res = await request.get(`${GAS_URL}?action=getEntries`);
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body).toHaveProperty("entries");
  expect(Array.isArray(body.entries)).toBeTruthy();

  if (body.entries.length > 0) {
    const entry = body.entries[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("date");
    expect(entry).toHaveProperty("tag");
    expect(entry).toHaveProperty("mainCategory");
    expect(entry).toHaveProperty("description");
    expect(entry).toHaveProperty("direction");
    expect(entry).toHaveProperty("amount");
  }
});
