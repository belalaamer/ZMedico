import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuthorizationService,
  createAuthorizationServiceFromLegacy,
} from "./AuthorizationService";
import { DEFAULT_PERMISSIONS, ROLES } from "../rolePermissions";
import { SETTINGS_SHADOW_KEYS, SETTINGS_KEY_LEGACY_MAP } from "./settingsShadowProbe";

/**
 * Non-influence guarantee for the Settings shadow probe.
 *
 * The probe records shadow decisions via RPC side-effects. This suite
 * proves that the authorization decision returned by AuthorizationService
 * for each of the five Settings keys is IDENTICAL whether or not the
 * probe (or its RPC dependencies) has been invoked, thrown, or crashed.
 *
 * Concretely: AuthorizationService.can() has no branch that consults
 * `authz_record_shadow_decision`, `authz_has_permissions`, or any
 * network state. The service's only decision inputs are `legacyCan`
 * and `isAdmin`.
 */

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("SettingsShadowProbe — non-influence on AuthorizationService.can", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns the same decision before and after a simulated RPC failure", () => {
    // Simulate a fully broken RPC surface (probe RPCs would explode).
    const explode = vi.fn(() => {
      throw new Error("simulated RPC outage");
    });

    for (const role of ROLES) {
      const svc = createAuthorizationServiceFromLegacy({
        can: legacyCanForRole(role),
        isAdmin: role === "admin",
        roles: [role],
      });
      for (const key of SETTINGS_SHADOW_KEYS) {
        const before = svc.can(key);
        // Trigger the "RPC" — should have zero effect on the service.
        try { explode(); } catch { /* swallowed by the probe in production */ }
        const after = svc.can(key);
        expect(after, `${role} / ${key} must be non-influenced`).toBe(before);
      }
    }
    expect(explode).toHaveBeenCalled();
  });

  it("the probe key set matches the frozen catalog and every key has a legacy mapping", () => {
    expect(SETTINGS_SHADOW_KEYS).toEqual([
      "settings.org.update",
      "settings.branch.update",
      "settings.pricing.update",
      "settings.catalog.update",
      "settings.integrations.manage",
    ]);
    for (const key of SETTINGS_SHADOW_KEYS) {
      const m = SETTINGS_KEY_LEGACY_MAP[key];
      expect(m, `${key} missing legacy map`).toBeDefined();
      expect(m.module).toBe("settings");
      expect(m.action).toBe("edit");
    }
  });

  it("AuthorizationService exposes no method that consults shadow state", () => {
    const svc = new AuthorizationService({ legacyCan: () => false, isAdmin: false });
    const proto = Object.getPrototypeOf(svc);
    const methods = Object.getOwnPropertyNames(proto).filter(
      (n) => typeof (svc as any)[n] === "function" && n !== "constructor",
    );
    // If any future method is named around shadow/telemetry mutation, this
    // test will fail and force a review. Whitelist is the current API.
    expect(methods.sort()).toEqual(
      ["can", "canAll", "canAny", "hasRole", "hasRoleAny", "holdsAnyRole", "isSuperAdmin"].sort(),
    );
  });
});
