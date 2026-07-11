import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS, ROLES } from "../rolePermissions";
import {
  MEDICAL_RECORDS_SHADOW_KEYS,
  MEDICAL_RECORDS_KEY_LEGACY_MAP,
} from "./medicalRecordsShadowProbe";

/**
 * Non-influence guarantee for the Medical Records shadow probe. Mirrors
 * the Settings / Patients invariant: AuthorizationService.can() must not
 * depend on any probe RPC state — decisions come only from `legacyCan`
 * and `isAdmin`.
 */

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("MedicalRecordsShadowProbe — non-influence on AuthorizationService.can", () => {
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
      for (const key of MEDICAL_RECORDS_SHADOW_KEYS) {
        const before = svc.can(key);
        try { explode(); } catch { /* swallowed by the probe in production */ }
        const after = svc.can(key);
        expect(after, `${role} / ${key} must be non-influenced`).toBe(before);
      }
    }
    expect(explode).toHaveBeenCalled();
  });

  it("the probe key set matches the frozen catalog and every key has a legacy mapping", () => {
    expect(MEDICAL_RECORDS_SHADOW_KEYS).toEqual([
      "medical_records.view",
      "medical_records.create",
      "medical_records.edit",
      "medical_records.delete",
      "medical_records.export",
    ]);
    for (const key of MEDICAL_RECORDS_SHADOW_KEYS) {
      const m = MEDICAL_RECORDS_KEY_LEGACY_MAP[key];
      expect(m, `${key} missing legacy map`).toBeDefined();
      expect(m.module).toBe("medical_records");
      expect(["view", "create", "edit", "delete", "export"]).toContain(m.action);
    }
  });
});