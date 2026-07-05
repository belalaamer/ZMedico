import { describe, it, expect } from "vitest";
import {
  AuthorizationService,
  parsePermissionKey,
  createAuthorizationServiceFromLegacy,
} from "./AuthorizationService";

function legacyCanFrom(map: Record<string, string[]>) {
  return (module: string, action: string = "view") =>
    (map[module] ?? []).includes(action);
}

describe("parsePermissionKey", () => {
  it("splits '<module>.<action>' into parts", () => {
    expect(parsePermissionKey("invoices.create")).toEqual({ module: "invoices", action: "create" });
  });
  it("defaults action to 'view' when no dot present", () => {
    expect(parsePermissionKey("dashboard")).toEqual({ module: "dashboard", action: "view" });
  });
  it("keeps everything after the first dot as the action", () => {
    expect(parsePermissionKey("reports_finance.export")).toEqual({
      module: "reports_finance",
      action: "export",
    });
  });
});

describe("AuthorizationService.can", () => {
  it("admins bypass every check", () => {
    const s = new AuthorizationService({ legacyCan: () => false, isAdmin: true });
    expect(s.can("invoices.delete")).toBe(true);
    expect(s.can("hr.export")).toBe(true);
  });

  it("delegates to legacyCan by module/action for non-admins", () => {
    const s = new AuthorizationService({
      legacyCan: legacyCanFrom({ invoices: ["view", "create"] }),
      isAdmin: false,
    });
    expect(s.can("invoices.view")).toBe(true);
    expect(s.can("invoices.create")).toBe(true);
    expect(s.can("invoices.delete")).toBe(false);
    expect(s.can("patients.view")).toBe(false);
  });
});

describe("AuthorizationService.canAny / canAll", () => {
  const s = new AuthorizationService({
    legacyCan: legacyCanFrom({ invoices: ["view"], patients: ["view", "create"] }),
    isAdmin: false,
  });

  it("canAny returns true when at least one permission is granted", () => {
    expect(s.canAny("invoices.delete", "patients.create")).toBe(true);
    expect(s.canAny("invoices.delete", "hr.view")).toBe(false);
  });

  it("canAll requires every permission", () => {
    expect(s.canAll("invoices.view", "patients.view")).toBe(true);
    expect(s.canAll("invoices.view", "patients.delete")).toBe(false);
  });

  it("canAll on empty list is vacuously true", () => {
    expect(s.canAll()).toBe(true);
  });

  it("admin short-circuits canAny/canAll", () => {
    const admin = new AuthorizationService({ legacyCan: () => false, isAdmin: true });
    expect(admin.canAny("nope.x")).toBe(true);
    expect(admin.canAll("nope.x", "nope.y")).toBe(true);
  });
});

describe("createAuthorizationServiceFromLegacy adapter", () => {
  it("wraps a legacy (can, isAdmin) pair unchanged", () => {
    const svc = createAuthorizationServiceFromLegacy({
      can: legacyCanFrom({ appointments: ["view"] }),
      isAdmin: false,
    });
    expect(svc.can("appointments.view")).toBe(true);
    expect(svc.can("appointments.edit")).toBe(false);
  });

  it("preserves admin bypass through the adapter", () => {
    const svc = createAuthorizationServiceFromLegacy({
      can: () => false,
      isAdmin: true,
    });
    expect(svc.can("anything.at.all")).toBe(true);
  });
});

/**
 * Wave 1 acceptance: for every legacy role in DEFAULT_PERMISSIONS,
 * the AuthorizationService returns the exact same allow/deny answers
 * as the legacy can(module, action) function. This is the safety net
 * that guarantees "no visible behavior changes".
 */
describe("Wave 1 parity: legacy DEFAULT_PERMISSIONS -> AuthorizationService", () => {
  // Import here (inside describe) so top-level imports stay stable.
  const { DEFAULT_PERMISSIONS, MODULES, ACTIONS } = require("../rolePermissions") as typeof import("../rolePermissions");

  for (const role of Object.keys(DEFAULT_PERMISSIONS)) {
    it(`role='${role}' produces identical decisions across every (module,action)`, () => {
      const map = DEFAULT_PERMISSIONS[role];
      const legacyCan = (module: string, action: string = "view") =>
        (map[module] ?? []).includes(action);
      const svc = new AuthorizationService({ legacyCan, isAdmin: role === "admin" });

      for (const module of MODULES) {
        for (const action of ACTIONS) {
          const legacy = role === "admin" ? true : legacyCan(module, action);
          const modern = svc.can(`${module}.${action}`);
          expect(modern, `${role}: ${module}.${action}`).toBe(legacy);
        }
      }
    });
  }
});