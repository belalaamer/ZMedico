import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public booking SQL invariants", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260828090000_stabilize_public_booking_schedule_and_doctors.sql"),
    "utf8",
  );

  it("steps slots by the selected service duration plus buffer", () => {
    expect(migration).toContain("make_interval(mins => v_duration + GREATEST(COALESCE(v_settings.buffer_minutes, 0), 0))");
    expect(migration).not.toContain("make_interval(mins => COALESCE(v_settings.slot_duration_minutes, 30) + COALESCE(v_settings.buffer_minutes, 0))");
  });

  it("keeps procedure lookup tenant-scoped", () => {
    expect(migration).toContain("pr.tenant_id = p_tenant_id");
  });

  it("uses an assigned doctor for Any available doctor bookings", () => {
    expect(migration).toContain("v_effective_doctor_id := v_candidate_doctor_id");
    expect(migration).toContain("v_has_doctor_assignments");
    expect(migration).toContain("patient_id, doctor_id, branch_id, resource_id, room, scheduled_at");
  });

  it("allows public doctor lookup only for active subscribed branches", () => {
    expect(migration).toContain("public.tenant_has_active_subscription(b.tenant_id)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.list_doctors_for_service(uuid, uuid, text) TO anon");
  });
});
