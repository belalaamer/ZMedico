/**
 * Patients vertical-slice shadow QA — walkthrough.
 * Mirrors `settings.shadow.spec.ts`. Roles without credentials skip.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import { patientsShadowStorageState } from "../../playwright.config";
import {
  SHADOW_PATIENTS_ROLES,
  PATIENTS_ROUTES,
  getPatientsRoleCreds,
} from "./helpers/patientsShadow";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const SHADOW_SETTLE_MS = 2_500;

for (const role of SHADOW_PATIENTS_ROLES) {
  test.describe(`patients shadow walk — ${role}`, () => {
    test(`${role} walks Patients pages`, async ({ browser }) => {
      const creds = getPatientsRoleCreds(role);
      test.skip(!creds, `Missing TEST_${role.toUpperCase()}_* env vars`);
      const storagePath = patientsShadowStorageState(role);
      test.skip(
        !fs.existsSync(storagePath),
        `No storage state for ${role} (setup:shadow-patients did not run)`,
      );

      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: storagePath,
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("pageerror", (e) => consoleErrors.push(String(e)));

      for (const route of PATIENTS_ROUTES) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page
          .waitForSelector(
            'h1, h2, [role="heading"], text=/access denied|لا تملك صلاحية/i',
            { timeout: 10_000 },
          )
          .catch(() => {});

        // Exercise any obvious write-capable control so create/edit
        // bundles are exercised. All actions cancelled.
        const trigger = page
          .getByRole("button", {
            name: /add|new|create|save|edit|delete|إضافة|جديد|حفظ|تعديل|حذف/i,
          })
          .first();
        if (await trigger.count()) {
          await trigger.click({ trial: false, timeout: 2_000 }).catch(() => {});
          await page.keyboard.press("Escape").catch(() => {});
        }

        // Try opening a patient profile if any row link is present.
        const firstRow = page.locator('a[href^="/patients/"]').first();
        if (await firstRow.count()) {
          await firstRow.click({ timeout: 2_000 }).catch(() => {});
          await page.waitForTimeout(SHADOW_SETTLE_MS);
        }

        await page.waitForTimeout(SHADOW_SETTLE_MS);
      }

      expect(consoleErrors, `page errors for ${role}`).toEqual([]);
      await context.close();
    });
  });
}