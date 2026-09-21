/**
 * Shared helpers for the Invoices / Finance vertical-slice shadow QA.
 * Mirrors `helpers/hrShadow.ts`; the `accountant` and `receptionist`
 * roles are the primary write-capable finance roles.
 */
import {
  SHADOW_INVOICES_ROLES,
  type ShadowInvoicesRole,
} from "../../../playwright.config";

export { SHADOW_INVOICES_ROLES };
export type { ShadowInvoicesRole };

export type RoleCreds = { email: string; password: string };

const ENV_MAP: Record<ShadowInvoicesRole, { email: string; pass: string }> = {
  admin:        { email: "TEST_ADMIN_EMAIL",        pass: "TEST_ADMIN_PASSWORD" },
  accountant:   { email: "TEST_ACCOUNTANT_EMAIL",   pass: "TEST_ACCOUNTANT_PASSWORD" },
  receptionist: { email: "TEST_RECEPTIONIST_EMAIL", pass: "TEST_RECEPTIONIST_PASSWORD" },
  doctor:       { email: "TEST_DOCTOR_EMAIL",       pass: "TEST_DOCTOR_PASSWORD" },
};

export function getInvoicesRoleCreds(role: ShadowInvoicesRole): RoleCreds | null {
  const spec = ENV_MAP[role];
  const email = process.env[spec.email];
  const password = process.env[spec.pass];
  if (!email || !password) return null;
  return { email, password };
}

/** Every Invoices / Finance route the shadow probe should cover. */
export const INVOICES_ROUTES = [
  "/invoices",
  "/payments",
] as const;