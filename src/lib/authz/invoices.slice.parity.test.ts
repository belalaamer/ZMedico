import { describe, it, expect } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS } from "../rolePermissions";

/**
 * Invoices / Finance vertical slice — shadow-mode parity baseline.
 * Keys mirror legacy `invoices` module actions 1:1, so
 * `AuthorizationService.can("invoices.<action>")` in shadow mode MUST
 * equal the legacy per-role map. Any drift fails CI.
 */

const INVOICES_SLICE_KEYS = [
  "invoices.view",
  "invoices.create",
  "invoices.edit",
  "invoices.delete",
  "invoices.export",
] as const;

const EXPECTED: Record<string, Record<string, boolean>> = {
  admin:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
  manager:      { view: true,  create: false, edit: false, delete: false, export: true  },
  accountant:   { view: true,  create: true,  edit: true,  delete: false, export: true  },
  receptionist: { view: true,  create: true,  edit: false, delete: false, export: false },
  doctor:       { view: false, create: false, edit: false, delete: false, export: false },
  nurse:        { view: false, create: false, edit: false, delete: false, export: false },
  hr:           { view: false, create: false, edit: false, delete: false, export: false },
  staff:        { view: false, create: false, edit: false, delete: false, export: false },
};

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("Invoices/Finance slice — shadow-mode parity baseline", () => {
  it.each(Object.keys(EXPECTED))(
    "role %s matches the frozen legacy invoices baseline",
    (role) => {
      const svc = createAuthorizationServiceFromLegacy({
        can: legacyCanForRole(role),
        isAdmin: role === "admin",
        roles: [role],
      });
      for (const key of INVOICES_SLICE_KEYS) {
        const action = key.split(".")[1];
        const expected = EXPECTED[role][action];
        expect(svc.can(key), `${role} / ${key} expected=${expected}`).toBe(expected);
      }
    },
  );
});