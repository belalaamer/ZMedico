/**
 * Shared helpers for the HR vertical-slice shadow QA. Mirrors
 * `helpers/medicalShadow.ts`; the `hr` role replaces `doctor` as the
 * primary write-capable role.
 */
import {
  SHADOW_HR_ROLES,
  type ShadowHrRole,
} from "../../../playwright.config";

export { SHADOW_HR_ROLES };
export type { ShadowHrRole };

export type RoleCreds = { email: string; password: string };

const ENV_MAP: Record<ShadowHrRole, { email: string; pass: string }> = {
  admin:   { email: "TEST_ADMIN_EMAIL",   pass: "TEST_ADMIN_PASSWORD" },
  hr:      { email: "TEST_HR_EMAIL",      pass: "TEST_HR_PASSWORD" },
  manager: { email: "TEST_MANAGER_EMAIL", pass: "TEST_MANAGER_PASSWORD" },
  staff:   { email: "TEST_STAFF_EMAIL",   pass: "TEST_STAFF_PASSWORD" },
};

export function getHrRoleCreds(role: ShadowHrRole): RoleCreds | null {
  const spec = ENV_MAP[role];
  const email = process.env[spec.email];
  const password = process.env[spec.pass];
  if (!email || !password) return null;
  return { email, password };
}

/** Every HR route the shadow probe should cover. */
export const HR_ROUTES = [
  "/hr/staff",
  "/hr/departments",
  "/hr/positions",
  "/hr/attendance",
  "/hr/leaves",
  "/hr/payroll",
] as const;