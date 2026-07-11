import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STORAGE_STATE_ADMIN = path.resolve(
  __dirname,
  "tests/playwright/.auth/admin.json",
);

// Per-role storage state files for the Settings shadow QA. Files are
// written by `settings.setup.ts` if the corresponding TEST_<ROLE>_EMAIL /
// TEST_<ROLE>_PASSWORD env vars are set; otherwise that role is skipped.
export const SHADOW_ROLES = ["admin", "manager", "accountant", "staff"] as const;
export type ShadowRole = (typeof SHADOW_ROLES)[number];
export const shadowStorageState = (role: ShadowRole) =>
  path.resolve(__dirname, `tests/playwright/.auth/shadow-${role}.json`);

// Per-role storage state files for the Patients shadow QA. Mirrors the
// Settings shadow QA but swaps `accountant` for `receptionist` because
// `receptionist` is the third write-capable role in the patients slice.
export const SHADOW_PATIENTS_ROLES = [
  "admin",
  "manager",
  "receptionist",
  "staff",
] as const;
export type ShadowPatientsRole = (typeof SHADOW_PATIENTS_ROLES)[number];
export const patientsShadowStorageState = (role: ShadowPatientsRole) =>
  path.resolve(__dirname, `tests/playwright/.auth/shadow-patients-${role}.json`);

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

// Mobile viewports covered by the smoke suite (mobile.smoke.spec.ts).
// Each entry becomes its own Playwright project so failures are reported
// per-viewport and specs can run in parallel across sizes.
export const MOBILE_VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "pixel", width: 360, height: 800 },
  { name: "ipad-mini", width: 768, height: 1024 },
] as const;

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "setup:admin",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "admin-desktop",
      testMatch: /.*\.admin\.spec\.ts/,
      dependencies: ["setup:admin"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE_ADMIN,
        baseURL: BASE_URL,
      },
    },
    {
      name: "admin-mobile",
      testMatch: /.*\.admin\.spec\.ts/,
      dependencies: ["setup:admin"],
      use: {
        ...devices["iPhone 14"],
        storageState: STORAGE_STATE_ADMIN,
        baseURL: BASE_URL,
      },
    },
    // Per-viewport mobile smoke projects. Each runs the same
    // `mobile.smoke.spec.ts` at its own size so we can see which viewport
    // regresses. All reuse the seeded admin storage state.
    ...MOBILE_VIEWPORTS.map((vp) => ({
      name: `mobile-smoke:${vp.name}`,
      testMatch: /mobile\.smoke\.spec\.ts/,
      dependencies: ["setup:admin"],
      use: {
        storageState: STORAGE_STATE_ADMIN,
        baseURL: BASE_URL,
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: vp.width < 600,
        hasTouch: true,
        userAgent:
          vp.width < 600
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
            : undefined,
      },
    })),
    // ---- Settings vertical-slice shadow QA ----------------------------
    // `setup:shadow` mints one storageState per role whose credentials
    // are present in the environment. The walk spec exercises Settings
    // for each role; the validate spec queries the shadow reporting
    // views and fails if the exit-criteria gate is not green.
    {
      name: "setup:shadow",
      testMatch: /settings\.setup\.ts/,
      use: { baseURL: BASE_URL },
    },
    {
      name: "settings-shadow-walk",
      testMatch: /settings\.shadow\.spec\.ts/,
      dependencies: ["setup:shadow"],
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "settings-shadow-validate",
      testMatch: /settings\.shadow\.validate\.spec\.ts/,
      dependencies: ["settings-shadow-walk"],
      use: { baseURL: BASE_URL },
    },
    // ---- Patients vertical-slice shadow QA ---------------------------
    {
      name: "setup:shadow-patients",
      testMatch: /patients\.setup\.ts/,
      use: { baseURL: BASE_URL },
    },
    {
      name: "patients-shadow-walk",
      testMatch: /patients\.shadow\.spec\.ts/,
      dependencies: ["setup:shadow-patients"],
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "patients-shadow-validate",
      testMatch: /patients\.shadow\.validate\.spec\.ts/,
      dependencies: ["patients-shadow-walk"],
      use: { baseURL: BASE_URL },
    },
  ],
});