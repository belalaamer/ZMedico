/**
 * Medical Records shadow QA — per-role auth setup.
 * Mirrors `patients.setup.ts`; runs as the `setup:shadow-medical` project.
 */
import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";
import {
  medicalShadowStorageState,
  SHADOW_MEDICAL_ROLES,
} from "../../playwright.config";
import { getMedicalRoleCreds } from "./helpers/medicalShadow";
import { loginViaUI } from "./helpers/shadowRoles";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

for (const role of SHADOW_MEDICAL_ROLES) {
  setup(`auth: ${role}`, async ({ browser }) => {
    const creds = getMedicalRoleCreds(role);
    setup.skip(!creds, `Missing TEST_${role.toUpperCase()}_EMAIL / _PASSWORD`);
    const target = medicalShadowStorageState(role);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await loginViaUI(page, creds!, BASE_URL);
    await context.storageState({ path: target });
    await context.close();
  });
}