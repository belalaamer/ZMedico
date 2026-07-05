import { describe, it, expect } from "vitest";
import { AuthorizationService } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS, MODULES } from "../rolePermissions";

/**
 * Sprint 1 · Batch 1 — navigation-layer parity tests.
 *
 * These assert that migrating Sidebar / MobileBottomNav / PermissionRoute
 * from `usePermissions().can(module)` / `isAdmin` to
 * `authz.can("<module>.view")` / `authz.isSuperAdmin()` produces IDENTICAL
 * visibility decisions for every legacy role across every module the
 * navigation surfaces reference.
 */

function legacyCanFor(role: string) {
  const map = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (map[module] ?? []).includes(action);
}

// Modules referenced by Sidebar / MobileBottomNav (union).
const NAV_MODULES = [
  "appointments",
  "patients",
  "medical_records",
  "invoices",
  "treasury",
  "coupons",
  "reports",
  "inventory",
  "hr",
  "settings",
] as const;

const ROLES = Object.keys(DEFAULT_PERMISSIONS);

describe("Batch 1 · navigation parity — Sidebar/MobileBottomNav", () => {
  for (const role of ROLES) {
    for (const mod of NAV_MODULES) {
      it(`role="${role}" module="${mod}": authz.can("${mod}.view") === legacy can("${mod}")`, () => {
        const legacy = legacyCanFor(role);
        const isAdmin = role === "admin";
        const authz = new AuthorizationService({ legacyCan: legacy, isAdmin });

        const legacyDecision = isAdmin ? true : legacy(mod, "view");
        const newDecision = authz.can(`${mod}.view`);
        expect(newDecision).toBe(legacyDecision);
      });
    }
  }
});

describe("Batch 1 · navigation parity — admin-only surfaces", () => {
  for (const role of ROLES) {
    it(`role="${role}": authz.isSuperAdmin() === (role === 'admin')`, () => {
      const isAdmin = role === "admin";
      const authz = new AuthorizationService({ legacyCan: legacyCanFor(role), isAdmin });
      expect(authz.isSuperAdmin()).toBe(isAdmin);
    });
  }
});

describe("Batch 1 · PermissionRoute parity — every module × every role", () => {
  for (const role of ROLES) {
    const isAdmin = role === "admin";
    const legacy = legacyCanFor(role);
    const authz = new AuthorizationService({ legacyCan: legacy, isAdmin });

    for (const mod of MODULES) {
      it(`role="${role}" module="${mod}": route gate parity`, () => {
        // Legacy PermissionRoute: isAdmin || can(mod, "view")
        const legacyAllowed = isAdmin || legacy(mod, "view");
        // New PermissionRoute: authz.isSuperAdmin() || authz.can(`${mod}.view`)
        const newAllowed = authz.isSuperAdmin() || authz.can(`${mod}.view`);
        expect(newAllowed).toBe(legacyAllowed);
      });
    }
  }
});