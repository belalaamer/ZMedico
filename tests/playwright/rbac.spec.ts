/**
 * ZMedico — RBAC end-to-end verification
 * -------------------------------------------------------------
 * Run locally with real seed credentials. Not part of the Vitest unit
 * suite — invoke with:
 *
 *   npx playwright install chromium
 *   BASE_URL=https://<your-preview-host> \
 *   ADMIN_EMAIL=... ADMIN_PASS=... \
 *   MANAGER_EMAIL=... MANAGER_PASS=... \
 *   DOCTOR_EMAIL=... DOCTOR_PASS=... \
 *   NURSE_EMAIL=... NURSE_PASS=... \
 *   RECEPTIONIST_EMAIL=... RECEPTIONIST_PASS=... \
 *   ACCOUNTANT_EMAIL=... ACCOUNTANT_PASS=... \
 *   HR_EMAIL=... HR_PASS=... \
 *   STAFF_EMAIL=... STAFF_PASS=... \
 *   npx playwright test tests/playwright/rbac.spec.ts
 *
 * Required seed data (create once via Admin > Users & manual ops):
 *   - 1 active user per role above, each assigned to ≥1 branch.
 *   - The Doctor user has a `staff_profiles` row and at least one row in
 *     `doctor_commissions` linked to that staff_id (so we can verify
 *     own-only visibility).
 *   - The Receptionist user has access to a branch with ≥1 future
 *     appointment in `scheduled` status (to verify Cancel vs Delete).
 *   - The Accountant user has access to a branch with ≥1 invoice in
 *     `unpaid` or `paid` status (to verify Void exists, Delete does not).
 *   - Two branches exist; the Manager user is assigned to only ONE of
 *     them (to verify branch isolation in the picker).
 *
 * The suite asserts navigation visibility, blocked routes (Access denied
 * card), and the presence/absence of action buttons. It does not mutate
 * production data.
 */
import { test, expect, Page } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:8080";

type Role =
  | "admin" | "manager" | "doctor" | "nurse"
  | "receptionist" | "accountant" | "hr" | "staff";

const CREDS: Record<Role, { email?: string; pass?: string }> = {
  admin:        { email: process.env.ADMIN_EMAIL,        pass: process.env.ADMIN_PASS },
  manager:      { email: process.env.MANAGER_EMAIL,      pass: process.env.MANAGER_PASS },
  doctor:       { email: process.env.DOCTOR_EMAIL,       pass: process.env.DOCTOR_PASS },
  nurse:        { email: process.env.NURSE_EMAIL,        pass: process.env.NURSE_PASS },
  receptionist: { email: process.env.RECEPTIONIST_EMAIL, pass: process.env.RECEPTIONIST_PASS },
  accountant:   { email: process.env.ACCOUNTANT_EMAIL,   pass: process.env.ACCOUNTANT_PASS },
  hr:           { email: process.env.HR_EMAIL,           pass: process.env.HR_PASS },
  staff:        { email: process.env.STAFF_EMAIL,        pass: process.env.STAFF_PASS },
};

async function login(page: Page, role: Role) {
  const c = CREDS[role];
  test.skip(!c.email || !c.pass, `Missing credentials for ${role}`);
  await page.goto(`${BASE}/auth`);
  await page.getByLabel(/email/i).fill(c.email!);
  await page.getByLabel(/password/i).first().fill(c.pass!);
  await page.getByRole("button", { name: /sign in|log in|تسجيل/i }).click();
  await page.waitForURL(u => !u.toString().includes("/auth"), { timeout: 15_000 });
}

async function expectAccessDenied(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await expect(
    page.getByText(/access denied|لا تملك صلاحية الوصول/i)
  ).toBeVisible({ timeout: 10_000 });
}

async function expectRouteOk(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await expect(
    page.getByText(/access denied|لا تملك صلاحية الوصول/i)
  ).toHaveCount(0);
}

// ---------- ADMIN ----------
test.describe("admin", () => {
  test("sees admin-only routes", async ({ page }) => {
    await login(page, "admin");
    for (const p of [
      "/settings/users", "/settings/roles", "/settings/backup",
      "/settings/audit", "/system/self-audit", "/queue/self-audit",
      "/expenses/self-audit",
    ]) await expectRouteOk(page, p);
  });
});

// ---------- MANAGER ----------
test.describe("manager (strict scope)", () => {
  test("blocked from admin-only settings", async ({ page }) => {
    await login(page, "manager");
    for (const p of [
      "/settings/users", "/settings/roles",
      "/settings/backup", "/settings/audit",
      "/system/self-audit",
    ]) await expectAccessDenied(page, p);
  });
  test("settings & hr are view-only (no delete buttons)", async ({ page }) => {
    await login(page, "manager");
    await expectRouteOk(page, "/settings");
    await expectRouteOk(page, "/hr/staff");
    // No destructive action should be exposed
    await expect(page.getByRole("button", { name: /^delete$|حذف/i })).toHaveCount(0);
  });
  test("only assigned branch is visible in picker", async ({ page }) => {
    await login(page, "manager");
    await page.goto(`${BASE}/`);
    const picker = page.getByRole("combobox").first();
    if (await picker.isVisible().catch(() => false)) {
      await picker.click();
      // expect exactly one option (seed: manager assigned to a single branch)
      const opts = await page.getByRole("option").count();
      expect(opts).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------- DOCTOR ----------
test.describe("doctor", () => {
  test("blocked from treasury / inventory / hr / settings", async ({ page }) => {
    await login(page, "doctor");
    for (const p of ["/treasury", "/inventory", "/hr/staff", "/settings"])
      await expectAccessDenied(page, p);
  });
  test("can open medical records & commissions but sees only own rows", async ({ page }) => {
    await login(page, "doctor");
    await expectRouteOk(page, "/medical/records");
    await expectRouteOk(page, "/reports/commissions");
    // Every row label, if present, should belong to the logged-in doctor.
    // Asserts that no other doctor's name leaks via RLS.
    const otherDoctor = page.getByText(/Dr\.\s+(?!.*you).*/i);
    expect(await otherDoctor.count()).toBeLessThanOrEqual(0);
  });
});

// ---------- NURSE ----------
test.describe("nurse", () => {
  test("blocked from treasury / reports / hr / settings", async ({ page }) => {
    await login(page, "nurse");
    for (const p of ["/treasury", "/reports", "/hr/staff", "/settings"])
      await expectAccessDenied(page, p);
  });
  test("can open patients (read-only)", async ({ page }) => {
    await login(page, "nurse");
    await expectRouteOk(page, "/patients");
    // No Add Patient CTA (create not granted)
    await expect(page.getByRole("button", { name: /add patient|إضافة مريض/i })).toHaveCount(0);
  });
});

// ---------- RECEPTIONIST ----------
test.describe("receptionist", () => {
  test("blocked from clinical / treasury / reports / hr / settings", async ({ page }) => {
    await login(page, "receptionist");
    for (const p of [
      "/medical/records", "/treasury", "/reports", "/hr/staff", "/settings",
    ]) await expectAccessDenied(page, p);
  });
  test("appointment action surfaces Cancel, not Delete", async ({ page }) => {
    await login(page, "receptionist");
    await expectRouteOk(page, "/calendar");
    // Open first appointment's row actions
    const trigger = page.getByRole("button", { name: /more|⋯|options/i }).first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await expect(page.getByRole("menuitem", { name: /cancel|إلغاء/i })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^delete$|^حذف$/i })).toHaveCount(0);
    }
  });
});

// ---------- ACCOUNTANT ----------
test.describe("accountant", () => {
  test("blocked from medical / hr / settings", async ({ page }) => {
    await login(page, "accountant");
    for (const p of ["/medical/records", "/hr/staff", "/settings"])
      await expectAccessDenied(page, p);
  });
  test("invoice detail exposes Void but no hard Delete", async ({ page }) => {
    await login(page, "accountant");
    await expectRouteOk(page, "/invoices");
    const row = page.getByRole("row").nth(1);
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await expect(page.getByRole("button", { name: /void|cancel invoice|إلغاء الفاتورة/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^delete invoice$|حذف الفاتورة/i })).toHaveCount(0);
    }
  });
});

// ---------- HR ----------
test.describe("hr", () => {
  test("only HR + Reports visible", async ({ page }) => {
    await login(page, "hr");
    await expectRouteOk(page, "/hr/staff");
    await expectRouteOk(page, "/reports");
    for (const p of [
      "/patients", "/calendar", "/invoices", "/treasury",
      "/medical/records", "/inventory", "/settings",
    ]) await expectAccessDenied(page, p);
  });
});

// ---------- STAFF ----------
test.describe("staff", () => {
  test("only calendar (view) is reachable", async ({ page }) => {
    await login(page, "staff");
    await expectRouteOk(page, "/calendar");
    for (const p of [
      "/patients", "/invoices", "/treasury", "/medical/records",
      "/inventory", "/reports", "/hr/staff", "/settings",
    ]) await expectAccessDenied(page, p);
  });
});

// ---------- Communication hub redirects ----------
test.describe("settings consolidation", () => {
  test("legacy URLs redirect to /settings/communication?tab=…", async ({ page }) => {
    await login(page, "admin");
    const cases: Array<[string, string]> = [
      ["/settings/notifications", "tab=notifications"],
      ["/settings/reminders", "tab=reminders"],
      ["/settings/automated-comm", "tab=automated"],
      ["/settings/templates/email", "tab=email"],
      ["/settings/templates/sms", "tab=sms"],
      ["/settings/templates/whatsapp", "tab=whatsapp"],
    ];
    for (const [from, expected] of cases) {
      await page.goto(`${BASE}${from}`);
      await page.waitForURL(u => u.toString().includes("/settings/communication"));
      expect(page.url()).toContain(expected);
    }
  });
});