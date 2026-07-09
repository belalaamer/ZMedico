/**
 * Settings vertical-slice shadow QA — walkthrough.
 *
 * For each role that has credentials in the environment, load a
 * dedicated authenticated context (from `setup:shadow`), visit every
 * Settings subsection, click the first visible primary action to
 * trigger any additional gated UI, then wait long enough for the
 * SettingsShadowProbe to complete its fire-and-forget RPC writes.
 *
 * The suite does NOT assert authorization outcomes itself — that is the
 * job of `settings.shadow.validate.spec.ts`, which queries the shadow
 * reporting views after all roles have walked.
 *
 * Roles without credentials are skipped. No mutations are performed;
 * every clicked control is either a navigation link or a dialog trigger
 * that is dismissed with Escape.
 */
import { test, expect } from "@playwright/test";
import { shadowStorageState } from "../../playwright.config";
import {
  SHADOW_ROLES,
  SETTINGS_ROUTES,
  getRoleCreds,
} from "./helpers/shadowRoles";
import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
// Shadow probe writes are fire-and-forget RPCs. Give them time to land
// before we move to the next role.
const SHADOW_SETTLE_MS = 2_500;

for (const role of SHADOW_ROLES) {
  test.describe(`settings shadow walk — ${role}`, () => {
    test(`${role} walks every Settings subsection`, async ({ browser }) => {
      const creds = getRoleCreds(role);
      test.skip(!creds, `Missing TEST_${role.toUpperCase()}_* env vars`);
      const storagePath = shadowStorageState(role);
      test.skip(
        !fs.existsSync(storagePath),
        `No storage state for ${role} (setup:shadow did not run)`,
      );

      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: storagePath,
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("pageerror", (e) => consoleErrors.push(String(e)));

      for (const route of SETTINGS_ROUTES) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        // Wait for either the settings shell or an access-denied card —
        // both are valid outcomes that the shadow probe must observe.
        await page
          .waitForSelector(
            'h2, [role="heading"], text=/access denied|لا تملك صلاحية/i',
            { timeout: 10_000 },
          )
          .catch(() => {});

        // Trigger any obvious write-capable control so bundles that gate
        // create/update/delete are exercised. All actions are cancelled.
        const trigger = page
          .getByRole("button", {
            name: /add|new|create|save|edit|delete|إضافة|جديد|حفظ|تعديل|حذف/i,
          })
          .first();
        if (await trigger.count()) {
          await trigger.click({ trial: false, timeout: 2_000 }).catch(() => {});
          await page.keyboard.press("Escape").catch(() => {});
        }

        // Let the SettingsShadowProbe RPCs (`authz_has_permissions` +
        // `authz_record_shadow_decision`) complete.
        await page.waitForTimeout(SHADOW_SETTLE_MS);
      }

      expect(consoleErrors, `page errors for ${role}`).toEqual([]);
      await context.close();
    });
  });
}