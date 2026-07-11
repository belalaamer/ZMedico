/**
 * Patients shadow QA — per-role auth setup.
 * Mirrors `settings.setup.ts`; runs as the `setup:shadow-patients`
 * Playwright project.
 */
import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";
import {
  patientsShadowStorageState,
  SHADOW_PATIENTS_ROLES,
} from "../../playwright.config";
import { getPatientsRoleCreds } from "./helpers/patientsShadow";
import { loginViaUI } from "./helpers/shadowRoles";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

for (const role of SHADOW_PATIENTS_ROLES) {
  setup(`auth: ${role}`, async ({ browser }) => {
    const creds = getPatientsRoleCreds(role);
    setup.skip(!creds, `Missing TEST_${role.toUpperCase()}_EMAIL / _PASSWORD`);
    const target = patientsShadowStorageState(role);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await loginViaUI(page, creds!, BASE_URL);
    await context.storageState({ path: target });
    await context.close();
  });
}