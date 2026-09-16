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

function postedBody(fetchMock: ReturnType<typeof successfulFetch>, call = 0) {
  const init = fetchMock.mock.calls[call][1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GasClient add contract", () => {
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

  it("reuses a caller-supplied Mutation ID for an addEntries retry", async () => {
    const fetchMock = successfulFetch({ entries: [] });
    const client = new GasClient("https://example.test/exec", "test-secret");

    await client.addEntries([payload], "retry-batch");
    await client.addEntries([payload], "retry-batch");

    expect(postedBody(fetchMock, 0).mutationId).toBe("retry-batch");
    expect(postedBody(fetchMock, 1).mutationId).toBe("retry-batch");
  });
});
