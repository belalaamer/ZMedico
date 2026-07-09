/**
 * Shared helpers for the Settings vertical-slice shadow QA.
 *
 * Reads role credentials strictly from environment variables. No
 * credentials are ever committed. When a role's credentials are absent
 * the caller must skip work for that role — never fabricate identities.
 */
import type { Page } from "@playwright/test";
import { SHADOW_ROLES, type ShadowRole } from "../../../playwright.config";

export { SHADOW_ROLES };
export type { ShadowRole };

export type RoleCreds = { email: string; password: string };

const ENV_MAP: Record<ShadowRole, { email: string; pass: string }> = {
  admin:      { email: "TEST_ADMIN_EMAIL",      pass: "TEST_ADMIN_PASSWORD" },
  manager:    { email: "TEST_MANAGER_EMAIL",    pass: "TEST_MANAGER_PASSWORD" },
  accountant: { email: "TEST_ACCOUNTANT_EMAIL", pass: "TEST_ACCOUNTANT_PASSWORD" },
  staff:      { email: "TEST_STAFF_EMAIL",      pass: "TEST_STAFF_PASSWORD" },
};

export function getRoleCreds(role: ShadowRole): RoleCreds | null {
  const spec = ENV_MAP[role];
  const email = process.env[spec.email];
  const password = process.env[spec.pass];
  if (!email || !password) return null;
  return { email, password };
}

export function availableRoles(): ShadowRole[] {
  return SHADOW_ROLES.filter((r) => getRoleCreds(r) !== null);
}

/**
 * Sign in via the real /auth UI. Matches Arabic + English submit labels
 * so RTL default locale works without extra configuration.
 */
export async function loginViaUI(
  page: Page,
  creds: RoleCreds,
  baseURL: string,
) {
  await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').first().waitFor({ timeout: 30_000 });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30_000 }),
    page
      .getByRole("button", { name: /تسجيل الدخول|sign in|log in|login/i })
      .first()
      .click(),
  ]);
  // Ensure the Supabase session key was persisted before we snapshot state.
  await page.waitForFunction(
    () => {
      const k = Object.keys(window.localStorage).find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      if (!k) return false;
      try {
        const raw = window.localStorage.getItem(k);
        return !!(raw && JSON.parse(raw)?.access_token);
      } catch {
        return false;
      }
    },
    { timeout: 15_000 },
  );
}

/**
 * Extract the Supabase access token from a page's localStorage.
 * Returns null if no session is present.
 */
export async function readAccessToken(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const k = Object.keys(window.localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!k) return null;
    try {
      const raw = window.localStorage.getItem(k);
      return raw ? JSON.parse(raw)?.access_token ?? null : null;
    } catch {
      return null;
    }
  });
}

/**
 * Every Settings subsection the shadow probe should cover. Mirrors the
 * routes registered under /settings/* by SettingsLayout.
 */
export const SETTINGS_ROUTES = [
  "/settings/general",
  "/settings/branches",
  "/settings/appointments",
  "/settings/invoices",
  "/settings/payments",
  "/settings/services",
  "/settings/insurance",
  "/settings/insurance-contracts",
  "/settings/communication",
  "/settings/languages",
  "/settings/roles",
  "/settings/users",
  "/settings/backup",
  "/settings/audit",
  "/settings/system",
] as const;