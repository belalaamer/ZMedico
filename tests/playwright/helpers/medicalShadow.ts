/**
 * Shared helpers for the Medical Records vertical-slice shadow QA.
 * Mirrors `helpers/patientsShadow.ts`; the doctor role replaces
 * receptionist as the primary write-capable clinical role.
 */
import {
  SHADOW_MEDICAL_ROLES,
  type ShadowMedicalRole,
} from "../../../playwright.config";

export { SHADOW_MEDICAL_ROLES };
export type { ShadowMedicalRole };

export type RoleCreds = { email: string; password: string };

const ENV_MAP: Record<ShadowMedicalRole, { email: string; pass: string }> = {
  admin:   { email: "TEST_ADMIN_EMAIL",   pass: "TEST_ADMIN_PASSWORD" },
  doctor:  { email: "TEST_DOCTOR_EMAIL",  pass: "TEST_DOCTOR_PASSWORD" },
  manager: { email: "TEST_MANAGER_EMAIL", pass: "TEST_MANAGER_PASSWORD" },
  accountant: { email: "TEST_ACCOUNTANT_EMAIL", pass: "TEST_ACCOUNTANT_PASSWORD" },
};

export function getMedicalRoleCreds(role: ShadowMedicalRole): RoleCreds | null {
  const spec = ENV_MAP[role];
  const email = process.env[spec.email];
  const password = process.env[spec.pass];
  if (!email || !password) return null;
  return { email, password };
}

/** Every Medical Records route the shadow probe should cover. */
export const MEDICAL_ROUTES = [
  "/medical/records",
  "/medical/prescriptions",
] as const;