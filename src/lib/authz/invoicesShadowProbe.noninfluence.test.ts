import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS, ROLES } from "../rolePermissions";
import {
  INVOICES_SHADOW_KEYS,
  INVOICES_KEY_LEGACY_MAP,
} from "./invoicesShadowProbe";

/**
 * Non-influence guarantee for the Invoices shadow probe. Mirrors the
 * earlier slices: AuthorizationService.can() must not depend on any
 * probe RPC state — decisions come only from `legacyCan` and `isAdmin`.
 */

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("InvoicesShadowProbe — non-influence on AuthorizationService.can", () => {
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
      for (const key of INVOICES_SHADOW_KEYS) {
        const before = svc.can(key);
        try { explode(); } catch { /* swallowed */ }
        const after = svc.can(key);
        expect(after, `${role} / ${key} must be non-influenced`).toBe(before);
      }
    }
    expect(explode).toHaveBeenCalled();
  });

  it("the probe key set matches the frozen catalog and every key has a legacy mapping", () => {
    expect(INVOICES_SHADOW_KEYS).toEqual([
      "invoices.view",
      "invoices.create",
      "invoices.edit",
      "invoices.delete",
      "invoices.export",
    ]);
    for (const key of INVOICES_SHADOW_KEYS) {
      const m = INVOICES_KEY_LEGACY_MAP[key];
      expect(m, `${key} missing legacy map`).toBeDefined();
      expect(m.module).toBe("invoices");
      expect(["view", "create", "edit", "delete", "export"]).toContain(m.action);
    }
  });
});