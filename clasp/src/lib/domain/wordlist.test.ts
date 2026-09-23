import { afterEach, describe, expect, it, vi } from "vitest";
import { ADJECTIVES, NOUNS, generatePascalSecret } from "./wordlist";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generatePascalSecret", () => {
  it("selects three adjectives followed by one noun in PascalCase", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1 / ADJECTIVES.length)
      .mockReturnValueOnce(2 / ADJECTIVES.length)
      .mockReturnValueOnce(3 / NOUNS.length);

    expect(generatePascalSecret()).toBe("AbleActiveAgileApron");
  });

  it("uses focused adjective and noun vocabularies", () => {
    for (const words of [ADJECTIVES, NOUNS]) {
      expect(words.length).toBeGreaterThanOrEqual(150);
      expect(words.length).toBeLessThanOrEqual(200);
      expect(new Set(words).size).toBe(words.length);
      expect(words.every((word) => /^[a-z]+$/.test(word))).toBe(true);
    }
  });
});
