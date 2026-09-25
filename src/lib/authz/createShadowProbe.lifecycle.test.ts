import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isShadowProbeEnabled } from "./createShadowProbe";
import { COMPLETED_SLICES } from "./slices/completedSlices";

describe("completed authorization shadow lifecycle", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925165000_retire_completed_shadow_telemetry.sql"),
    "utf8",
  );

  it("disables frontend probes for every completed slice", () => {
    const completed = COMPLETED_SLICES.filter((slice) => slice.status === "complete");
    expect(completed.length).toBeGreaterThan(0);
    for (const slice of completed) {
      expect(isShadowProbeEnabled(slice.slice), slice.slice).toBe(false);
    }
  });

  it("keeps future shadow slices enabled", () => {
    expect(isShadowProbeEnabled("future_shadow_slice")).toBe(true);
  });

  it("adds a server-side active gate without deleting historical evidence", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true");
    expect(migration).toContain("g.is_active = false");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.authz_shadow_decisions/i);
    for (const slice of ["settings", "patients", "medical_records", "hr", "invoices"]) {
      expect(migration).toContain(`'${slice}'`);
    }
  });
});
