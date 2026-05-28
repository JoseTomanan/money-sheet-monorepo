import { describe, it, expect, afterEach, vi } from "vitest";

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
