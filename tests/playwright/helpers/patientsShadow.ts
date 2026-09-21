/**
 * Shared helpers for the Patients vertical-slice shadow QA.
 * Mirrors `helpers/shadowRoles.ts`; roles participating in the patients
 * gate include `receptionist` in place of `accountant`.
 */
import { SHADOW_PATIENTS_ROLES, type ShadowPatientsRole } from "../../../playwright.config";

export { SHADOW_PATIENTS_ROLES };
export type { ShadowPatientsRole };

export type RoleCreds = { email: string; password: string };

const ENV_MAP: Record<ShadowPatientsRole, { email: string; pass: string }> = {
  admin:        { email: "TEST_ADMIN_EMAIL",        pass: "TEST_ADMIN_PASSWORD" },
  manager:      { email: "TEST_MANAGER_EMAIL",      pass: "TEST_MANAGER_PASSWORD" },
  receptionist: { email: "TEST_RECEPTIONIST_EMAIL", pass: "TEST_RECEPTIONIST_PASSWORD" },
  hr:           { email: "TEST_HR_EMAIL",           pass: "TEST_HR_PASSWORD" },
};

export function getPatientsRoleCreds(role: ShadowPatientsRole): RoleCreds | null {
  const spec = ENV_MAP[role];
  const email = process.env[spec.email];
  const password = process.env[spec.pass];
  if (!email || !password) return null;
  return { email, password };
}

/** Every Patients route the shadow probe should cover. */
export const PATIENTS_ROUTES = [
  "/patients",
] as const;