import { describe, it, expect } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS } from "../rolePermissions";

/**
 * Medical Records vertical slice — shadow-mode parity baseline.
 *
 * Keys mirror legacy `medical_records` module actions 1:1, so
 * `AuthorizationService.can("medical_records.<action>")` in shadow mode
 * MUST equal the legacy per-role map. Any drift fails CI.
 */

const MEDICAL_RECORDS_SLICE_KEYS = [
  "medical_records.view",
  "medical_records.create",
  "medical_records.edit",
  "medical_records.delete",
  "medical_records.export",
] as const;

const EXPECTED: Record<string, Record<string, boolean>> = {
  admin:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
  doctor:       { view: true,  create: true,  edit: true,  delete: false, export: false },
  manager:      { view: false, create: false, edit: false, delete: false, export: false },
  nurse:        { view: true,  create: false, edit: false, delete: false, export: false },
  receptionist: { view: false, create: false, edit: false, delete: false, export: false },
  accountant:   { view: false, create: false, edit: false, delete: false, export: false },
  hr:           { view: false, create: false, edit: false, delete: false, export: false },
  staff:        { view: false, create: false, edit: false, delete: false, export: false },
};

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("Medical Records slice — shadow-mode parity baseline", () => {
  it.each(Object.keys(EXPECTED))(
    "role %s matches the production-aligned medical_records baseline",
    (role) => {
      const svc = createAuthorizationServiceFromLegacy({
        can: legacyCanForRole(role),
        isAdmin: role === "admin",
        roles: [role],
      });
      for (const key of MEDICAL_RECORDS_SLICE_KEYS) {
        const action = key.split(".")[1];
        const expected = EXPECTED[role][action];
        expect(svc.can(key), `${role} / ${key} expected=${expected}`).toBe(expected);
      }
    },
  );
});