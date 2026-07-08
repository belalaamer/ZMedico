import { describe, it, expect } from "vitest";
import { AuthorizationService } from "./AuthorizationService";

/**
 * R2 — Role-identity adapter tests. These lock in the byte-identical
 * semantics that pages/components used to compute inline with
 * `isAdmin || roles.includes(x)` and `roles.some(...)`.
 */
describe("AuthorizationService — role adapters (R2)", () => {
  const svc = (roles: string[], isAdmin = false) =>
    new AuthorizationService({
      legacyCan: () => false,
      isAdmin,
      roles,
    });

  it("hasRole(x) matches admin-override semantics", () => {
    expect(svc([]).hasRole("hr")).toBe(false);
    expect(svc(["hr"]).hasRole("hr")).toBe(true);
    expect(svc([], true).hasRole("hr")).toBe(true);
  });

  it("hasRoleAny(...) matches `isAdmin || roles.includes(...)`", () => {
    expect(svc(["manager"]).hasRoleAny("admin", "manager")).toBe(true);
    expect(svc(["doctor"]).hasRoleAny("admin", "manager")).toBe(false);
    expect(svc([], true).hasRoleAny("manager")).toBe(true);
    expect(svc([]).hasRoleAny()).toBe(false);
  });

  it("holdsAnyRole(...) is strict (does NOT admin-override)", () => {
    expect(svc([], true).holdsAnyRole("doctor")).toBe(false);
    expect(svc(["doctor"]).holdsAnyRole("doctor")).toBe(true);
    expect(svc(["doctor", "manager"]).holdsAnyRole("manager", "hr")).toBe(true);
  });

  it("mirrors the DoctorCommissions scoping (admin, doctor+manager, pure doctor)", () => {
    const admin = svc(["admin"], true);
    const doctorMgr = svc(["doctor", "manager"]);
    const pureDoctor = svc(["doctor"]);
    const isDoctorOnly = (s: AuthorizationService) =>
      !s.isSuperAdmin() && s.holdsAnyRole("doctor") && !s.holdsAnyRole("manager", "hr");
    expect(isDoctorOnly(admin)).toBe(false);
    expect(isDoctorOnly(doctorMgr)).toBe(false);
    expect(isDoctorOnly(pureDoctor)).toBe(true);
  });
});