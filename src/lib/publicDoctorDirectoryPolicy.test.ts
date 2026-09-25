import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public doctor directory hardening", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925142500_harden_public_doctor_directory.sql"),
    "utf8",
  );

  it("requires a bookable branch and an online service from the same tenant", () => {
    expect(migration).toContain("COALESCE(aps.allow_online_booking, true) = true");
    expect(migration).toContain("s.tenant_id = b.tenant_id");
    expect(migration).toContain("s.available_online = true");
    expect(migration).toContain("s.deleted_at IS NULL");
    expect(migration).toContain("tenant_has_active_subscription");
  });

  it("only exposes active doctors", () => {
    expect(migration).toContain("sp.status = 'active'::public.staff_status");
    expect(migration).toContain("ur.role = 'doctor'::public.app_role");
  });

  it("keeps only the public directory RPC exposed", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.list_doctors_for_service");
    expect(migration).toContain("TO anon, authenticated, service_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.doctor_service_assignment_allowed");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("filters the initial booking options doctor array to online-bookable branches", () => {
    const optionsStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.public_booking_options_for_tenant",
    );
    expect(optionsStart).toBeGreaterThanOrEqual(0);
    const options = migration.slice(optionsStart);
    expect(options).toContain("b.is_active = true");
    expect(options).toContain("COALESCE(aps.allow_online_booking, true) = true");
    expect(options).toContain("sp.status = 'active'::public.staff_status");
  });
});
