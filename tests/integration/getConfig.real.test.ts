import { describe, it, expect } from "vitest";
import { GasClient } from "../src/client";

// Read-only — no writes, no cleanup needed.
const client = new GasClient();

describe("getConfig — real GAS API", () => {
  it("returns a config object (not null/undefined)", async () => {
    const config = await client.getConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("config.currency is a non-empty string when the Config sheet is provisioned", async () => {
    const config = await client.getConfig();
    // If the Config sheet exists and has been seeded by runSetup, currency is present.
    // This assertion is intentionally lenient: if the sheet doesn't exist yet,
    // getConfig returns {} and this test will fail — that's the signal to run setup.
    expect(typeof config.currency).toBe("string");
    expect(config.currency.length).toBeGreaterThan(0);
  });
});
