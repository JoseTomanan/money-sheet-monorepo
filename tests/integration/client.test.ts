import { afterEach, describe, expect, it, vi } from "vitest";
import { GasClient, type AddEntryPayload } from "../src/client";

const payload: AddEntryPayload = {
  date: "2026-09-16",
  tag: "FOOD",
  description: "client contract test",
  direction: "I",
  amount: 100,
};

function successfulFetch(result: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function postedBody(fetchMock: ReturnType<typeof successfulFetch>, call = 0) {
  const init = fetchMock.mock.calls[call][1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GasClient target safety", () => {
  it("uses only explicitly disposable credentials by default", async () => {
    vi.stubEnv("GAS_URL", "https://production.example/exec");
    vi.stubEnv("API_SECRET", "production-secret");
    vi.stubEnv("DISPOSABLE_GAS_URL", "https://disposable.example/exec");
    vi.stubEnv("DISPOSABLE_API_SECRET", "disposable-secret");
    const fetchMock = successfulFetch({ config: {} });

    await new GasClient().getConfig();

    expect(fetchMock.mock.calls[0][0]).toBe("https://disposable.example/exec");
    expect(postedBody(fetchMock).secret).toBe("disposable-secret");
  });
});

describe("GasClient transient reads", () => {
  it("retries an empty-action GAS response and returns the successful read", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          ok: false,
          error: 'Unknown action: ""',
          code: "internal",
          message: 'Unknown action: ""',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, entries: [] }));
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.getEntries()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops retrying empty-action responses at the bound with a concise diagnostic", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        ok: false,
        error: 'Unknown action: ""',
        code: "internal",
        message: 'Unknown action: ""',
      }),
    );
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.getEntries()).rejects.toThrow(
      'getEntries failed after 3 attempts: Unknown action: ""',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a transient transport failure for setup reads", async () => {
    const categories = { FOOD: ["Groceries"] };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, categories }));
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.getCategories()).resolves.toEqual(categories);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient GAS service response for reads", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: "Service unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true, config: { currency: "PHP" } }));
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.getConfig()).resolves.toEqual({ currency: "PHP" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a non-JSON gateway response without exposing its body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("private upstream detail", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, stats: { categoryMonthChange: [] } }));
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.getStats()).resolves.toEqual({ categoryMonthChange: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts hung read attempts at a finite per-request deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const signal = init?.signal;
      if (!signal) return Promise.reject(new Error("missing request deadline"));
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("request timed out")), {
          once: true,
        });
      });
    });
    const client = new GasClient("https://example.test/exec", "test-secret");

    const result = expect(client.getEntries()).rejects.toThrow(
      "getEntries failed after 3 attempts: request timed out",
    );
    await vi.advanceTimersByTimeAsync(180_001);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a contract failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ok: false,
        error: "Invalid request",
        code: "validation",
        message: "Invalid request",
      }),
    );
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.getConfig()).rejects.toThrow("Invalid request");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("GasClient add contract", () => {
  it("reuses one generated Mutation ID when a single add is retried", async () => {
    const entry = { id: 1, ...payload, mainCategory: "FOOD" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, entry }));
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.addEntry(payload)).resolves.toEqual(entry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postedBody(fetchMock, 0).mutationId).toBe(postedBody(fetchMock, 1).mutationId);
  });

  it("sends a Mutation ID with addEntry", async () => {
    const fetchMock = successfulFetch({ entry: { id: 1, ...payload, mainCategory: "FOOD" } });
    const client = new GasClient("https://example.test/exec", "test-secret");

    await client.addEntry(payload);

    expect(postedBody(fetchMock)).toMatchObject({
      action: "addEntry",
      mutationId: expect.any(String),
      ...payload,
      secret: "test-secret",
    });
    expect(String(postedBody(fetchMock).mutationId)).not.toHaveLength(0);
  });

  it("reuses a caller-supplied Mutation ID for an addEntry retry", async () => {
    const fetchMock = successfulFetch({ entry: { id: 1, ...payload, mainCategory: "FOOD" } });
    const client = new GasClient("https://example.test/exec", "test-secret");

    await client.addEntry(payload, "retry-single");
    await client.addEntry(payload, "retry-single");

    expect(postedBody(fetchMock, 0).mutationId).toBe("retry-single");
    expect(postedBody(fetchMock, 1).mutationId).toBe("retry-single");
  });

  it("sends one Mutation ID for the whole addEntries batch", async () => {
    const secondPayload: AddEntryPayload = {
      ...payload,
      tag: "HOUSING",
      description: "second batch leg",
      amount: 200,
    };
    const fetchMock = successfulFetch({ entries: [] });
    const client = new GasClient("https://example.test/exec", "test-secret");

    await client.addEntries([payload, secondPayload]);

    expect(postedBody(fetchMock)).toMatchObject({
      action: "addEntries",
      mutationId: expect.any(String),
      entries: [payload, secondPayload],
      secret: "test-secret",
    });
    expect(String(postedBody(fetchMock).mutationId)).not.toHaveLength(0);
  });

  it("reuses one generated Mutation ID when a batch add is retried", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: "Service unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true, entries: [] }));
    const client = new GasClient("https://example.test/exec", "test-secret");

    await expect(client.addEntries([payload])).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postedBody(fetchMock, 0).mutationId).toBe(postedBody(fetchMock, 1).mutationId);
  });

  it("reuses a caller-supplied Mutation ID for an addEntries retry", async () => {
    const fetchMock = successfulFetch({ entries: [] });
    const client = new GasClient("https://example.test/exec", "test-secret");

    await client.addEntries([payload], "retry-batch");
    await client.addEntries([payload], "retry-batch");

    expect(postedBody(fetchMock, 0).mutationId).toBe("retry-batch");
    expect(postedBody(fetchMock, 1).mutationId).toBe("retry-batch");
  });
});
