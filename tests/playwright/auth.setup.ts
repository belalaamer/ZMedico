/**
 * Playwright auth setup — seeded Admin login.
 *
 * Runs once (as the `setup:admin` project) before any authenticated
 * spec. Logs in with a real seeded QA account via the normal /auth UI
 * and persists the resulting browser state (cookies + localStorage,
 * including the Supabase session key) to a JSON file that all
 * `*.admin.spec.ts` tests reuse via `storageState`.
 *
 * Why this exists:
 *   Sandbox preview session injection is unreliable. Seeded login gives
 *   us a deterministic authenticated context for mobile + desktop QA
 *   without ever touching app auth code.
 *
 * Required env vars:
 *   BASE_URL      – target origin (defaults to http://localhost:8080)
 *   ADMIN_EMAIL   – seeded QA admin email
 *   ADMIN_PASS    – seeded QA admin password
 *
 * Run setup only:
 *   npx playwright test --project=setup:admin
 *
 * Run authenticated suite (setup runs automatically as a dependency):
 *   npx playwright test --project=admin-desktop
 *   npx playwright test --project=admin-mobile
 */
import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { STORAGE_STATE_ADMIN } from "../../playwright.config";

setup("authenticate as admin", async ({ page }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASS;
  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASS env vars are required for auth setup.",
    );
  }

  fs.mkdirSync(path.dirname(STORAGE_STATE_ADMIN), { recursive: true });

  await page.goto("/auth", { waitUntil: "domcontentloaded" });

  // App renders auth UI in Arabic by default (dir=rtl), so match by input
  // type rather than a locale-specific label. The primary submit button
  // reads "تسجيل الدخول" in Arabic and "Sign in" / "Log in" in English.
  await page.locator('input[type="email"]').first().waitFor({ timeout: 30_000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);

  await Promise.all([
    page.waitForURL(
      (url) => !url.pathname.startsWith("/auth"),
      { timeout: 30_000 },
    ),
    page
      .getByRole("button", {
        name: /تسجيل الدخول|sign in|log in|login/i,
      })
      .first()
      .click(),
  ]);

  // Ensure the Supabase session key landed in localStorage before saving.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const key = Object.keys(window.localStorage).find((k) =>
            k.startsWith("sb-") && k.endsWith("-auth-token"),
          );
          if (!key) return null;
          try {
            const raw = window.localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed?.access_token ? "ok" : null;
          } catch {
            return null;
          }
        }),
      { timeout: 15_000, message: "Supabase session was not persisted after login" },
    )
    .toBe("ok");

  await page.context().storageState({ path: STORAGE_STATE_ADMIN });
});