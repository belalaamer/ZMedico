import { describe, expect, it } from "vitest";
import { isShadowProbeEnabled } from "./createShadowProbe";
import { COMPLETED_SLICES } from "./slices/completedSlices";

describe("shadow probe lifecycle", () => {
  it("disables runtime shadow traffic for every completed slice", () => {
    const completed = COMPLETED_SLICES.filter((slice) => slice.status === "complete");
    expect(completed.length).toBeGreaterThan(0);
    for (const slice of completed) {
      expect(isShadowProbeEnabled(slice.slice), slice.slice).toBe(false);
    }
  });

  it("keeps shadow telemetry available for future non-completed slices", () => {
    expect(isShadowProbeEnabled("future_shadow_slice")).toBe(true);
  });
});
