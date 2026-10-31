import { describe, expect, it } from "vitest";
import { showLoadingPlaceholder } from "./quietRefresh";

describe("showLoadingPlaceholder", () => {
  it("is blank on the first read, when nothing is on screen yet", () => {
    expect(showLoadingPlaceholder(true, 0)).toBe(true);
  });

  it("keeps the rows a refresh already had on screen instead of flashing", () => {
    expect(showLoadingPlaceholder(true, 12)).toBe(false);
  });

  it("lets the read finish for both a full board and an empty one", () => {
    expect(showLoadingPlaceholder(false, 0)).toBe(false);
    expect(showLoadingPlaceholder(false, 12)).toBe(false);
  });
});
