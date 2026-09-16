import "@testing-library/jest-dom";
import { act, cleanup } from "@testing-library/svelte/pure";
import { afterEach, vi } from "vitest";

process.env.STL_SKIP_AUTO_CLEANUP = "true";

afterEach(async () => {
  await act();
  vi.useFakeTimers();

  try {
    cleanup();
    await vi.runAllTimersAsync();
  } finally {
    vi.useRealTimers();
  }
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
