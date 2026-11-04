import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261104130000_notification_clinic_time_12h.sql",
  "utf8",
);

describe("notification clinic-time migration", () => {
  it("renders the clinic zone on a 12-hour clock and drops the old UTC pattern", () => {
    expect(migration).toContain("Africa/Cairo");
    expect(migration).toContain("FMHH12:MI AM");
    expect(migration).not.toContain("'YYYY-MM-DD HH24:MI'");
  });

  it("replaces every appointment-time producer", () => {
    for (const fn of [
      "tg_appointment_create_notifications",
      "tg_appointment_create_reminders",
      "ensure_appointment_reminders",
      "enqueue_appointment_event",
    ]) {
      expect(migration).toContain(`FUNCTION public.${fn}`);
    }
  });

  it("keeps the consent and template gates untouched", () => {
    expect(migration).toContain("communication_event_enabled");
    expect(migration).toContain("communication_templates");
    expect(migration).toContain("whatsapp_opt_in");
  });

  it("asserts the rendered values in the postflight", () => {
    expect(migration).toContain("2026-11-04 8:00 PM");
    expect(migration).toContain("2026-11-04 8:00 م");
    expect(migration).toContain("RAISE EXCEPTION");
  });
});
