import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public booking cron cadence", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925173000_reduce_booking_cron_overhead.sql"),
    "utf8",
  );

  it("halves the two per-minute maintenance schedules", () => {
    expect(migration).toContain("'*/2 * * * *'");
    expect(migration).toContain("'1-59/2 * * * *'");
  });

  it("stagger schedules so expiry and warning do not wake together", () => {
    const schedules = migration.match(/'(?:\*\/2|1-59\/2) \* \* \* \*'/g) ?? [];
    expect(new Set(schedules).size).toBe(2);
  });

  it("keeps the same maintenance RPCs", () => {
    expect(migration).toContain("cron_expire_public_booking_requests");
    expect(migration).toContain("notify_pending_booking_expiry_soon");
  });
});
