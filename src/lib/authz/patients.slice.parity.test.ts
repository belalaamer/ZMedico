import { describe, it, expect } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS } from "../rolePermissions";

/**
 * Patients vertical slice — shadow-mode parity baseline.
 *
 * Unlike the Settings slice (dotted new keys with no legacy equivalent),
 * the Patients slice keys mirror legacy `patients` module actions 1:1,
 * so `AuthorizationService.can("patients.<action>")` in shadow mode
 * MUST equal the legacy per-role map. This locks that alignment before
 * cutover — any drift fails CI.
 */

const PATIENTS_SLICE_KEYS = [
  "patients.view",
  "patients.create",
  "patients.edit",
  "patients.delete",
  "patients.export",
] as const;

const EXPECTED: Record<string, Record<string, boolean>> = {
  admin:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
  manager:      { view: true,  create: true,  edit: true,  delete: false, export: true  },
  receptionist: { view: true,  create: true,  edit: true,  delete: false, export: false },
  doctor:       { view: true,  create: false, edit: false, delete: false, export: false },
  nurse:        { view: true,  create: false, edit: false, delete: false, export: false },
  accountant:   { view: true,  create: false, edit: false, delete: false, export: false },
  hr:           { view: false, create: false, edit: false, delete: false, export: false },
  staff:        { view: false, create: false, edit: false, delete: false, export: false },
};

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("Patients slice — shadow-mode parity baseline", () => {
  it.each(Object.keys(EXPECTED))(
    "role %s matches the frozen legacy patients baseline",
    (role) => {
      const svc = createAuthorizationServiceFromLegacy({
        can: legacyCanForRole(role),
        isAdmin: role === "admin",
        roles: [role],
      });
      for (const key of PATIENTS_SLICE_KEYS) {
        const action = key.split(".")[1];
        const expected = EXPECTED[role][action];
        expect(svc.can(key), `${role} / ${key} expected=${expected}`).toBe(expected);
      }
    },
  );
});