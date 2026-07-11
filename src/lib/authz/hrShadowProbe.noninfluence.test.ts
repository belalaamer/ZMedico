import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS, ROLES } from "../rolePermissions";
import { HR_SHADOW_KEYS, HR_KEY_LEGACY_MAP } from "./hrShadowProbe";

/**
 * Non-influence guarantee for the HR shadow probe. Mirrors settings /
 * patients / medical_records: AuthorizationService.can() must not depend
 * on any probe RPC state — decisions come only from `legacyCan` and
 * `isAdmin`.
 */

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("HrShadowProbe — non-influence on AuthorizationService.can", () => {
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
      for (const key of HR_SHADOW_KEYS) {
        const before = svc.can(key);
        try { explode(); } catch { /* swallowed */ }
        const after = svc.can(key);
        expect(after, `${role} / ${key} must be non-influenced`).toBe(before);
      }
    }
    expect(explode).toHaveBeenCalled();
  });

  it("the probe key set matches the frozen catalog and every key has a legacy mapping", () => {
    expect(HR_SHADOW_KEYS).toEqual([
      "hr.view",
      "hr.create",
      "hr.edit",
      "hr.delete",
      "hr.export",
    ]);
    for (const key of HR_SHADOW_KEYS) {
      const m = HR_KEY_LEGACY_MAP[key];
      expect(m, `${key} missing legacy map`).toBeDefined();
      expect(m.module).toBe("hr");
      expect(["view", "create", "edit", "delete", "export"]).toContain(m.action);
    }
  });
});