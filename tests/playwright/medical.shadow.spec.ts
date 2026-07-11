/**
 * Medical Records vertical-slice shadow QA — walkthrough.
 * Mirrors `patients.shadow.spec.ts`. Roles without credentials skip.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import { medicalShadowStorageState } from "../../playwright.config";
import {
  SHADOW_MEDICAL_ROLES,
  MEDICAL_ROUTES,
  getMedicalRoleCreds,
} from "./helpers/medicalShadow";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const SHADOW_SETTLE_MS = 2_500;

for (const role of SHADOW_MEDICAL_ROLES) {
  test.describe(`medical shadow walk — ${role}`, () => {
    test(`${role} walks Medical Records pages`, async ({ browser }) => {
      const creds = getMedicalRoleCreds(role);
      test.skip(!creds, `Missing TEST_${role.toUpperCase()}_* env vars`);
      const storagePath = medicalShadowStorageState(role);
      test.skip(
        !fs.existsSync(storagePath),
        `No storage state for ${role} (setup:shadow-medical did not run)`,
      );

      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: storagePath,
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("pageerror", (e) => consoleErrors.push(String(e)));

      for (const route of MEDICAL_ROUTES) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page
          .waitForSelector(
            'h1, h2, [role="heading"], text=/access denied|لا تملك صلاحية/i',
            { timeout: 10_000 },
          )
          .catch(() => {});

        const trigger = page
          .getByRole("button", {
            name: /add|new|create|save|edit|delete|إضافة|جديد|حفظ|تعديل|حذف/i,
          })
          .first();
        if (await trigger.count()) {
          await trigger.click({ trial: false, timeout: 2_000 }).catch(() => {});
          await page.keyboard.press("Escape").catch(() => {});
        }

        await page.waitForTimeout(SHADOW_SETTLE_MS);
      }

      expect(consoleErrors, `page errors for ${role}`).toEqual([]);
      await context.close();
    });
  });
}