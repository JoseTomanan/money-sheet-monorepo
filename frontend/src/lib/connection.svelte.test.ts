import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

const FAKE = { gasUrl: "https://fake.example/gas", apiSecret: "fake-secret" };

async function freshConnection(preSet?: () => void) {
  localStorage.clear();
  if (preSet) preSet();
  vi.resetModules();
  return import("./connection.svelte");
}

describe("connection module", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("connection.current is null when localStorage has no entry", async () => {
    const { connection } = await freshConnection();
    expect(connection.current).toBeNull();
  });

  it("connection.current is null when ms_connection is malformed JSON", async () => {
    const { connection } = await freshConnection(() => {
      localStorage.setItem("ms_connection", "not-valid-json{");
    });
    expect(connection.current).toBeNull();
  });

  it("connection.current reads a saved Connection from localStorage on init", async () => {
    const { connection } = await freshConnection(() => {
      localStorage.setItem("ms_connection", JSON.stringify(FAKE));
    });
    expect(connection.current).toEqual(FAKE);
  });

  it("setConnection updates connection.current", async () => {
    const { connection, setConnection } = await freshConnection();
    expect(connection.current).toBeNull();
    setConnection(FAKE);
    expect(connection.current).toEqual(FAKE);
  });

  it("setConnection writes to localStorage under ms_connection", async () => {
    const { setConnection } = await freshConnection();
    setConnection(FAKE);
    const raw = localStorage.getItem("ms_connection");
    expect(JSON.parse(raw!)).toEqual(FAKE);
  });

  it("setConnection overwrites an existing Connection", async () => {
    const old = { gasUrl: "https://old.url", apiSecret: "old-secret" };
    const { connection, setConnection } = await freshConnection(() => {
      localStorage.setItem("ms_connection", JSON.stringify(old));
    });
    setConnection(FAKE);
    expect(connection.current).toEqual(FAKE);
    expect(JSON.parse(localStorage.getItem("ms_connection")!)).toEqual(FAKE);
  });
});

// ---------------------------------------------------------------------------
// generateSetupUrl
// ---------------------------------------------------------------------------

describe("generateSetupUrl", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("returns empty string when no connection is set", async () => {
    const { generateSetupUrl } = await freshConnection();
    expect(generateSetupUrl()).toBe("");
  });

  it("returns a URL containing gasUrl and apiSecret as search params", async () => {
    const { generateSetupUrl } = await freshConnection(() => {
      localStorage.setItem("ms_connection", JSON.stringify(FAKE));
    });
    const url = new URL(generateSetupUrl());
    expect(url.searchParams.get("gasUrl")).toBe(FAKE.gasUrl);
    expect(url.searchParams.get("apiSecret")).toBe(FAKE.apiSecret);
  });

  it("returned URL shares the current origin and pathname", async () => {
    const { generateSetupUrl } = await freshConnection(() => {
      localStorage.setItem("ms_connection", JSON.stringify(FAKE));
    });
    const url = new URL(generateSetupUrl());
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe(window.location.pathname);
  });
});

// ---------------------------------------------------------------------------
// importFromUrl
// ---------------------------------------------------------------------------

describe("importFromUrl", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    localStorage.clear();
    vi.resetModules();
  });

  it("sets connection from URL params and clears the search string", async () => {
    window.history.pushState({}, "", "?gasUrl=https://import.gas&apiSecret=imported-secret");
    const { connection, importFromUrl } = await freshConnection();
    expect(connection.current).toBeNull();
    importFromUrl();
    expect(connection.current).toEqual({ gasUrl: "https://import.gas", apiSecret: "imported-secret" });
    expect(window.location.search).toBe("");
  });

  it("is a no-op when gasUrl param is absent", async () => {
    window.history.pushState({}, "", "?apiSecret=only-secret");
    const { connection, importFromUrl } = await freshConnection();
    importFromUrl();
    expect(connection.current).toBeNull();
  });

  it("is a no-op when apiSecret param is absent", async () => {
    window.history.pushState({}, "", "?gasUrl=https://import.gas");
    const { connection, importFromUrl } = await freshConnection();
    importFromUrl();
    expect(connection.current).toBeNull();
  });

  it("is a no-op when no params are present", async () => {
    const { connection, importFromUrl } = await freshConnection();
    importFromUrl();
    expect(connection.current).toBeNull();
  });
});
