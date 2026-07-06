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

// ---------------------------------------------------------------------------
// mockMode
// ---------------------------------------------------------------------------

describe("mockMode", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("mockMode.current is true when no connection and no dismissal flag", async () => {
    const { mockMode } = await freshConnection();
    expect(mockMode.current).toBe(true);
  });

  it("mockMode.current is false when ms_mock_dismissed is set", async () => {
    const { mockMode } = await freshConnection(() => {
      localStorage.setItem("ms_mock_dismissed", "1");
    });
    expect(mockMode.current).toBe(false);
  });

  it("mockMode.current is false when a connection exists", async () => {
    const { mockMode } = await freshConnection(() => {
      localStorage.setItem("ms_connection", JSON.stringify(FAKE));
    });
    expect(mockMode.current).toBe(false);
  });

  it("silently writes ms_mock_dismissed when a connection exists and flag is absent", async () => {
    await freshConnection(() => {
      localStorage.setItem("ms_connection", JSON.stringify(FAKE));
    });
    expect(localStorage.getItem("ms_mock_dismissed")).toBe("1");
  });

  it("does NOT write ms_mock_dismissed for a first-time visitor with no connection", async () => {
    await freshConnection();
    expect(localStorage.getItem("ms_mock_dismissed")).toBeNull();
  });

  it("mockMode.current is true when VITE_MOCK env override is set, even with a connection and dismissal", async () => {
    vi.stubEnv("VITE_MOCK", "true");
    const { mockMode } = await freshConnection(() => {
      localStorage.setItem("ms_connection", JSON.stringify(FAKE));
      localStorage.setItem("ms_mock_dismissed", "1");
    });
    expect(mockMode.current).toBe(true);
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// exitMockMode
// ---------------------------------------------------------------------------

describe("exitMockMode", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("sets ms_mock_dismissed to '1'", async () => {
    const { exitMockMode } = await freshConnection();
    exitMockMode();
    expect(localStorage.getItem("ms_mock_dismissed")).toBe("1");
  });

  it("removes ms_cache from localStorage", async () => {
    localStorage.setItem("ms_cache", JSON.stringify({ entries: [] }));
    const { exitMockMode } = await freshConnection();
    exitMockMode();
    expect(localStorage.getItem("ms_cache")).toBeNull();
  });

  it("calls window.location.reload()", async () => {
    const { exitMockMode } = await freshConnection();
    exitMockMode();
    expect(reloadSpy).toHaveBeenCalledOnce();
  });
});
