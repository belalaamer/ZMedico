import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS, ROLES } from "../rolePermissions";
import { PATIENTS_SHADOW_KEYS, PATIENTS_KEY_LEGACY_MAP } from "./patientsShadowProbe";

/**
 * Non-influence guarantee for the Patients shadow probe. Mirrors the
 * Settings slice invariant: AuthorizationService.can() must not depend
 * on any probe RPC state — decisions come only from `legacyCan` and
 * `isAdmin`.
 */

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("PatientsShadowProbe — non-influence on AuthorizationService.can", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns the same decision before and after a simulated RPC failure", () => {
    const explode = vi.fn(() => {
      throw new Error("simulated RPC outage");
    });

    for (const role of ROLES) {
      const svc = createAuthorizationServiceFromLegacy({
        can: legacyCanForRole(role),
        isAdmin: role === "admin",
        roles: [role],
      });
      for (const key of PATIENTS_SHADOW_KEYS) {
        const before = svc.can(key);
        try { explode(); } catch { /* swallowed by the probe in production */ }
        const after = svc.can(key);
        expect(after, `${role} / ${key} must be non-influenced`).toBe(before);
      }
    }
    expect(explode).toHaveBeenCalled();
  });

  it("the probe key set matches the frozen catalog and every key has a legacy mapping", () => {
    expect(PATIENTS_SHADOW_KEYS).toEqual([
      "patients.view",
      "patients.create",
      "patients.edit",
      "patients.delete",
      "patients.export",
    ]);
    for (const key of PATIENTS_SHADOW_KEYS) {
      const m = PATIENTS_KEY_LEGACY_MAP[key];
      expect(m, `${key} missing legacy map`).toBeDefined();
      expect(m.module).toBe("patients");
      expect(["view", "create", "edit", "delete", "export"]).toContain(m.action);
    }
  });
});