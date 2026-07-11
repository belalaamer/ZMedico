/**
 * Invoices / Finance vertical-slice shadow QA — walkthrough.
 * Mirrors `hr.shadow.spec.ts`. Roles without credentials skip.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import { invoicesShadowStorageState } from "../../playwright.config";
import {
  SHADOW_INVOICES_ROLES,
  INVOICES_ROUTES,
  getInvoicesRoleCreds,
} from "./helpers/invoicesShadow";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const SHADOW_SETTLE_MS = 2_500;

for (const role of SHADOW_INVOICES_ROLES) {
  test.describe(`invoices shadow walk — ${role}`, () => {
    test(`${role} walks Invoices / Payments pages`, async ({ browser }) => {
      const creds = getInvoicesRoleCreds(role);
      test.skip(!creds, `Missing TEST_${role.toUpperCase()}_* env vars`);
      const storagePath = invoicesShadowStorageState(role);
      test.skip(
        !fs.existsSync(storagePath),
        `No storage state for ${role} (setup:shadow-invoices did not run)`,
      );

      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: storagePath,
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("pageerror", (e) => consoleErrors.push(String(e)));

      for (const route of INVOICES_ROUTES) {
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