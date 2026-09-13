import { describe, expect, it } from "vitest";
import manifest from "./appsscript.json";

describe("Apps Script manifest", () => {
  it("authorizes the container UI used by connection dialogs", () => {
    expect(manifest.oauthScopes).toContain(
      "https://www.googleapis.com/auth/script.container.ui"
    );
  });
});
