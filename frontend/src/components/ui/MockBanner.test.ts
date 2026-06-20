import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import MockBanner from "./MockBanner.svelte";

describe("MockBanner", () => {
  it("renders the text 'Mock mode'", () => {
    const { getByText } = render(MockBanner, { props: { onExit: vi.fn() } });
    expect(getByText("Mock mode")).toBeInTheDocument();
  });

  it("renders an Exit button", () => {
    const { getByRole } = render(MockBanner, { props: { onExit: vi.fn() } });
    expect(getByRole("button", { name: /exit/i })).toBeInTheDocument();
  });

  it("calls onExit when the Exit button is clicked", async () => {
    const onExit = vi.fn();
    const { getByRole } = render(MockBanner, { props: { onExit } });
    await fireEvent.click(getByRole("button", { name: /exit/i }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
