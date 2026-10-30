import { describe, expect, it } from "vitest";
import { showQueueSkeleton } from "./queueRefresh";

describe("showQueueSkeleton", () => {
  it("is blank on the first read, when nothing is on screen yet", () => {
    expect(showQueueSkeleton(true, 0)).toBe(true);
  });

  it("keeps the rows a refresh already had on screen instead of flashing", () => {
    expect(showQueueSkeleton(true, 12)).toBe(false);
  });

  it("lets the read finish for both a full board and an empty one", () => {
    expect(showQueueSkeleton(false, 0)).toBe(false);
    expect(showQueueSkeleton(false, 12)).toBe(false);
  });
});
