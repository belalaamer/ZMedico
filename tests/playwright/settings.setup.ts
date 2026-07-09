/**
 * Settings shadow QA — per-role auth setup.
 *
 * For every role in SHADOW_ROLES whose TEST_<ROLE>_EMAIL /
 * TEST_<ROLE>_PASSWORD env vars are present, sign in via the real /auth
 * UI and persist a per-role Playwright storageState under
 * `tests/playwright/.auth/shadow-<role>.json`.
 *
 * Roles with missing credentials are skipped — never fabricated.
 * Runs as the `setup:shadow` Playwright project.
 */
import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";
import { shadowStorageState, SHADOW_ROLES } from "../../playwright.config";
import { getRoleCreds, loginViaUI } from "./helpers/shadowRoles";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

for (const role of SHADOW_ROLES) {
  setup(`auth: ${role}`, async ({ browser }) => {
    const creds = getRoleCreds(role);
    setup.skip(!creds, `Missing TEST_${role.toUpperCase()}_EMAIL / _PASSWORD`);
    const target = shadowStorageState(role);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await loginViaUI(page, creds!, BASE_URL);
    await context.storageState({ path: target });
    await context.close();
  });
}