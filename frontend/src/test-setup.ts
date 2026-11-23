import "@testing-library/jest-dom";
import { act, cleanup } from "@testing-library/svelte/pure";
import { afterEach, vi } from "vitest";

process.env.STL_SKIP_AUTO_CLEANUP = "true";

// JSDOM has no layout or ResizeObserver; browser coverage verifies measured sizes.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
  // Keep the browser shim in place when a test restores its own Vitest mocks.
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
