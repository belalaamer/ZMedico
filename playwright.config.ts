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

// Per-role storage state files for the Medical Records shadow QA.
// Mirrors the Patients shadow QA but swaps in `doctor` as the primary
// write-capable clinical role.
export const SHADOW_MEDICAL_ROLES = [
  "admin",
  "doctor",
  "manager",
  "staff",
] as const;
export type ShadowMedicalRole = (typeof SHADOW_MEDICAL_ROLES)[number];
export const medicalShadowStorageState = (role: ShadowMedicalRole) =>
  path.resolve(__dirname, `tests/playwright/.auth/shadow-medical-${role}.json`);

// Per-role storage state files for the HR shadow QA. Mirrors the
// Medical Records shadow QA but swaps `doctor` for `hr` because `hr` is
// the primary write-capable role in the HR slice.
export const SHADOW_HR_ROLES = [
  "admin",
  "hr",
  "manager",
  "staff",
] as const;
export type ShadowHrRole = (typeof SHADOW_HR_ROLES)[number];
export const hrShadowStorageState = (role: ShadowHrRole) =>
  path.resolve(__dirname, `tests/playwright/.auth/shadow-hr-${role}.json`);

// Per-role storage state files for the Invoices / Finance shadow QA.
// Uses accountant + receptionist as the two non-admin write roles;
// staff is the required denied role.
export const SHADOW_INVOICES_ROLES = [
  "admin",
  "accountant",
  "receptionist",
  "staff",
] as const;
export type ShadowInvoicesRole = (typeof SHADOW_INVOICES_ROLES)[number];
export const invoicesShadowStorageState = (role: ShadowInvoicesRole) =>
  path.resolve(__dirname, `tests/playwright/.auth/shadow-invoices-${role}.json`);

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

// Mobile viewports covered by the smoke suite (mobile.smoke.spec.ts).
// Each entry becomes its own Playwright project so failures are reported
// per-viewport and specs can run in parallel across sizes.
export const MOBILE_VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "pixel", width: 360, height: 800 },
  { name: "iphone-15-pro-max", width: 430, height: 932 },
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
    // Read-only cross-tenant RLS checks. The tests skip safely until two
    // dedicated QA identities and fixture marker IDs are configured.
    {
      name: "rls-tenant-isolation",
      testMatch: /rls\.tenant-isolation\.spec\.ts/,
      use: { baseURL: BASE_URL },
    },
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
    // Public unauthenticated mobile smoke projects. These deliberately do
    // not depend on setup:admin so the public landing/auth flow is covered.
    ...MOBILE_VIEWPORTS.map((vp) => ({
      name: `public-mobile:${vp.name}`,
      testMatch: /public-mobile\.spec\.ts/,
      use: {
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
    // Compact phone regression gate for the pricing comparison layout.
    {
      name: "public-mobile:compact-320",
      testMatch: /public-mobile\.spec\.ts/,
      use: {
        baseURL: BASE_URL,
        viewport: { width: 320, height: 568 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      },
    },
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
    // ---- Medical Records vertical-slice shadow QA -------------------
    {
      name: "setup:shadow-medical",
      testMatch: /medical\.setup\.ts/,
      use: { baseURL: BASE_URL },
    },
    {
      name: "medical-shadow-walk",
      testMatch: /medical\.shadow\.spec\.ts/,
      dependencies: ["setup:shadow-medical"],
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "medical-shadow-validate",
      testMatch: /medical\.shadow\.validate\.spec\.ts/,
      dependencies: ["medical-shadow-walk"],
      use: { baseURL: BASE_URL },
    },
    // ---- HR vertical-slice shadow QA --------------------------------
    {
      name: "setup:shadow-hr",
      testMatch: /hr\.setup\.ts/,
      use: { baseURL: BASE_URL },
    },
    {
      name: "hr-shadow-walk",
      testMatch: /hr\.shadow\.spec\.ts/,
      dependencies: ["setup:shadow-hr"],
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "hr-shadow-validate",
      testMatch: /hr\.shadow\.validate\.spec\.ts/,
      dependencies: ["hr-shadow-walk"],
      use: { baseURL: BASE_URL },
    },
    // ---- Invoices / Finance vertical-slice shadow QA ---------------
    {
      name: "setup:shadow-invoices",
      testMatch: /invoices\.setup\.ts/,
      use: { baseURL: BASE_URL },
    },
    {
      name: "invoices-shadow-walk",
      testMatch: /invoices\.shadow\.spec\.ts/,
      dependencies: ["setup:shadow-invoices"],
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "invoices-shadow-validate",
      testMatch: /invoices\.shadow\.validate\.spec\.ts/,
      dependencies: ["invoices-shadow-walk"],
      use: { baseURL: BASE_URL },
    },
  ],
});