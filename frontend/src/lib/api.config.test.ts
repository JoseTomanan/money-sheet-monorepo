/**
 * Tests for api.getConfig() — the silent-fallback read action.
 * Unlike other api functions, getConfig swallows errors and returns
 * { currency: "₱" } as a default so the store's Promise.all never rejects.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const FAKE_GAS_URL = "https://fake.gas.example";
const FAKE_CONN = { gasUrl: FAKE_GAS_URL, apiSecret: "test-secret" };

async function freshModsWithConn() {
  localStorage.clear();
  localStorage.setItem("ms_connection", JSON.stringify(FAKE_CONN));
  vi.resetModules();
  const apiMod = await import("./api");
  return { api: apiMod };
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("api.getConfig — success path", () => {
  it("returns the config object from the GAS response", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ config: { currency: "€" } })),
    }));
    const config = await api.getConfig();
    expect(config).toEqual({ currency: "€" });
  });

  it("hits the GAS URL with action=getConfig", async () => {
    const { api } = await freshModsWithConn();
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ config: { currency: "₱" } })),
    });
    vi.stubGlobal("fetch", fetchMock);
    await api.getConfig();
    expect((fetchMock.mock.calls[0][0] as string)).toContain("action=getConfig");
  });
});

describe("api.getConfig — silent fallback to { currency: '₱' }", () => {
  it("returns default when fetch fails (network error)", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const config = await api.getConfig();
    expect(config).toEqual({ currency: "₱" });
  });

  it("returns default when GAS returns a json.error field", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "unknown action" })),
    }));
    const config = await api.getConfig();
    expect(config).toEqual({ currency: "₱" });
  });

  it("returns default when config object lacks the currency key", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ config: {} })),
    }));
    const config = await api.getConfig();
    expect(config).toEqual({ currency: "₱" });
  });

  it("returns default when connection is missing (no GAS URL configured)", async () => {
    localStorage.clear();
    vi.resetModules();
    const { api } = await (async () => {
      const apiMod = await import("./api");
      return { api: apiMod };
    })();
    const config = await api.getConfig();
    expect(config).toEqual({ currency: "₱" });
  });
});
