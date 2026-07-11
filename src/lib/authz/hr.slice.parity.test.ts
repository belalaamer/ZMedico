import { describe, it, expect } from "vitest";
import { createAuthorizationServiceFromLegacy } from "./AuthorizationService";
import { DEFAULT_PERMISSIONS } from "../rolePermissions";

/**
 * HR vertical slice — shadow-mode parity baseline. Keys mirror legacy
 * `hr` module actions 1:1, so `AuthorizationService.can("hr.<action>")`
 * in shadow mode MUST equal the legacy per-role map. Any drift fails CI.
 */

const HR_SLICE_KEYS = [
  "hr.view",
  "hr.create",
  "hr.edit",
  "hr.delete",
  "hr.export",
] as const;

const EXPECTED: Record<string, Record<string, boolean>> = {
  admin:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
  manager:      { view: true,  create: false, edit: false, delete: false, export: false },
  doctor:       { view: false, create: false, edit: false, delete: false, export: false },
  nurse:        { view: false, create: false, edit: false, delete: false, export: false },
  receptionist: { view: false, create: false, edit: false, delete: false, export: false },
  accountant:   { view: false, create: false, edit: false, delete: false, export: false },
  hr:           { view: true,  create: true,  edit: true,  delete: false, export: true  },
  staff:        { view: false, create: false, edit: false, delete: false, export: false },
};

function legacyCanForRole(role: string) {
  const perModule = DEFAULT_PERMISSIONS[role] ?? {};
  return (module: string, action: string = "view") =>
    (perModule[module] ?? []).includes(action);
}

describe("HR slice — shadow-mode parity baseline", () => {
  it.each(Object.keys(EXPECTED))(
    "role %s matches the frozen legacy hr baseline",
    (role) => {
      const svc = createAuthorizationServiceFromLegacy({
        can: legacyCanForRole(role),
        isAdmin: role === "admin",
        roles: [role],
      });
      for (const key of HR_SLICE_KEYS) {
        const action = key.split(".")[1];
        const expected = EXPECTED[role][action];
        expect(svc.can(key), `${role} / ${key} expected=${expected}`).toBe(expected);
      }
    },
  );
});