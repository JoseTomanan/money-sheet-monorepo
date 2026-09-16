import { describe, expect, it } from "vitest";
import { shouldRunLiveStoreSyncTests } from "./store-sync-env";

const LIVE_ENV = {
  mode: "store-sync-live",
  gasUrl: "https://example.invalid/exec",
  apiSecret: "test-secret",
  mock: "false",
};

describe("shouldRunLiveStoreSyncTests", () => {
  it("does not opt in when ordinary test credentials are present", () => {
    expect(
      shouldRunLiveStoreSyncTests({
        ...LIVE_ENV,
        mode: "test",
      }),
    ).toBe(false);
  });

  it("opts in only when every live prerequisite is present", () => {
    expect(shouldRunLiveStoreSyncTests(LIVE_ENV)).toBe(true);

    for (const environment of [
      { ...LIVE_ENV, gasUrl: undefined },
      { ...LIVE_ENV, apiSecret: undefined },
      { ...LIVE_ENV, mock: "true" },
    ]) {
      expect(shouldRunLiveStoreSyncTests(environment)).toBe(false);
    }
  });
});
