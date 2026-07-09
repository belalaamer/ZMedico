import { describe, it, expect } from "vitest";
import {
  AuthorizationService,
  createAuthorizationServiceFromLegacy,
} from "./AuthorizationService";
import { DEFAULT_PERMISSIONS, ROLES } from "../rolePermissions";

/**
 * Settings vertical slice — regression harness (shadow mode).
 *
 * Locks in the Golden Baseline for the five new spec §31 permission keys
 * BEFORE any cutover. In shadow mode the frontend still uses the legacy
 * per-module permission map, so the AuthorizationService, which delegates
 * to that map via `legacyCan`, must:
 *
 *   1. Grant every new Settings key to `admin` (admin bypass).
 *   2. Deny every new Settings key to every non-admin role, because the
 *      legacy `DEFAULT_PERMISSIONS` map does not enumerate the new
 *      dotted-action keys (`org.update`, `pricing.update`, …).
 *
 * If either invariant flips, either:
 *   - the shadow layer has begun to affect real decisions (regression), or
 *   - the legacy map gained ad-hoc entries for the new keys (drift).
 *
 * Both cases MUST fail CI until Migration 2 (cutover) intentionally
 * rewrites this baseline.
 */

const SETTINGS_SLICE_KEYS = [
  "settings.org.update",
  "settings.branch.update",
  "settings.pricing.update",
  "settings.catalog.update",
  "settings.integrations.manage",
] as const;

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("Settings slice — shadow-mode parity baseline", () => {
  it("admin holds every new Settings permission (admin bypass)", () => {
    const svc = createAuthorizationServiceFromLegacy({
      can: legacyCanForRole("admin"),
      isAdmin: true,
      roles: ["admin"],
    });
    for (const key of SETTINGS_SLICE_KEYS) {
      expect(svc.can(key), `admin must hold ${key}`).toBe(true);
    }
  });

  it.each(ROLES.filter((r) => r !== "admin"))(
    "non-admin role %s holds none of the new Settings keys in shadow mode",
    (role) => {
      const svc = createAuthorizationServiceFromLegacy({
        can: legacyCanForRole(role),
        isAdmin: false,
        roles: [role],
      });
      for (const key of SETTINGS_SLICE_KEYS) {
        expect(svc.can(key), `${role} must NOT hold ${key} until cutover`).toBe(false);
      }
    }
  );

  it("canAll / canAny mirror the per-key baseline for admin and non-admin", () => {
    const admin = createAuthorizationServiceFromLegacy({
      can: legacyCanForRole("admin"),
      isAdmin: true,
      roles: ["admin"],
    });
    const nonAdmin = createAuthorizationServiceFromLegacy({
      can: legacyCanForRole("manager"),
      isAdmin: false,
      roles: ["manager"],
    });
    expect(admin.canAll(...SETTINGS_SLICE_KEYS)).toBe(true);
    expect(admin.canAny(...SETTINGS_SLICE_KEYS)).toBe(true);
    expect(nonAdmin.canAll(...SETTINGS_SLICE_KEYS)).toBe(false);
    expect(nonAdmin.canAny(...SETTINGS_SLICE_KEYS)).toBe(false);
  });
});
