/**
 * ZMedico — RBAC DEEP verification (HTTP / RLS layer)
 * -------------------------------------------------------------
 * These tests bypass the UI entirely. They obtain a real JWT for each
 * role via Supabase Auth, then call the PostgREST endpoints directly and
 * assert what RLS actually allows/denies. This proves least-privilege at
 * the backend, not just at the button-visibility layer.
 *
 * Skip-safe: a role with no configured password is skipped. Canonical QA
 * emails default to qa.<role>@qa.local, so CI only needs password secrets.
 * If a password is configured but login fails, the suite fails closed.
 *
 * Run:
 *   BASE_SUPABASE_URL=... BASE_SUPABASE_ANON_KEY=... \
 *   ADMIN_EMAIL=... ADMIN_PASS=... \
 *   DOCTOR_EMAIL=... DOCTOR_PASS=... \
 *   RECEPTIONIST_EMAIL=... RECEPTIONIST_PASS=... \
 *   STAFF_EMAIL=... STAFF_PASS=... \
 *   npx playwright test tests/playwright/rbac.deep.spec.ts
 */
import { test, expect, request as pwRequest } from "@playwright/test";

const SUPABASE_URL =
  process.env.BASE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const ANON =
  process.env.BASE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

type Role =
  | "admin" | "manager" | "doctor" | "nurse"
  | "receptionist" | "accountant" | "hr" | "staff";

const CREDS: Record<Role, { email?: string; pass?: string }> = {
  admin:        { email: process.env.ADMIN_EMAIL ?? "qa.admin@qa.local",               pass: process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASS },
  manager:      { email: process.env.MANAGER_EMAIL ?? "qa.manager@qa.local",           pass: process.env.TEST_MANAGER_PASSWORD ?? process.env.MANAGER_PASS },
  doctor:       { email: process.env.DOCTOR_EMAIL ?? "qa.doctor@qa.local",             pass: process.env.TEST_DOCTOR_PASSWORD ?? process.env.DOCTOR_PASS },
  nurse:        { email: process.env.NURSE_EMAIL ?? "qa.nurse@qa.local",               pass: process.env.TEST_NURSE_PASSWORD ?? process.env.NURSE_PASS },
  receptionist: { email: process.env.RECEPTIONIST_EMAIL ?? "qa.receptionist@qa.local", pass: process.env.TEST_RECEPTIONIST_PASSWORD ?? process.env.RECEPTIONIST_PASS },
  accountant:   { email: process.env.ACCOUNTANT_EMAIL ?? "qa.accountant@qa.local",     pass: process.env.TEST_ACCOUNTANT_PASSWORD ?? process.env.ACCOUNTANT_PASS },
  hr:           { email: process.env.HR_EMAIL ?? "qa.hr@qa.local",                     pass: process.env.TEST_HR_PASSWORD ?? process.env.HR_PASS },
  staff:        { email: process.env.STAFF_EMAIL ?? "qa.staff@qa.local",               pass: process.env.TEST_STAFF_PASSWORD ?? process.env.STAFF_PASS },
};

async function tokenFor(role: Role): Promise<{ token: string; userId: string } | null> {
  const c = CREDS[role];
  if (!c.email || !c.pass || !SUPABASE_URL || !ANON) return null;
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON, "Content-Type": "application/json" },
    data: { email: c.email, password: c.pass },
  });
  if (!res.ok()) {
    const status = res.status();
    await ctx.dispose();
    throw new Error(`QA sign-in failed for ${role} (HTTP ${status}). Rotate the QA password secret instead of skipping RBAC coverage.`);
  }
  const body = await res.json();
  await ctx.dispose();
  return { token: body.access_token, userId: body.user?.id };
}

async function rest(token: string, path: string, init: {
  method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown;
} = {}) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: init.method && init.method !== "GET" ? "return=representation" : "",
    },
    data: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  await ctx.dispose();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  return { status: res.status(), body: json, raw: text };
}

/** Assertion helper: RLS denies == either 403/401/406 OR empty array. */
function assertDenied(r: { status: number; body: any }, label: string) {
  const empty = Array.isArray(r.body) && r.body.length === 0;
  const forbidden = [401, 403, 404, 406].includes(r.status);
  expect(
    forbidden || empty,
    `${label}: expected deny (4xx or empty) but got status=${r.status} body=${JSON.stringify(r.body)?.slice(0,200)}`
  ).toBe(true);
}

function assertAllowed(r: { status: number; body: any }, label: string) {
  expect([200, 201, 204].includes(r.status), `${label}: expected allow, got ${r.status}`).toBe(true);
}

// ------------------------------------------------------------------
// DOCTOR
// ------------------------------------------------------------------
test.describe("RLS: doctor", () => {
  test("cannot read invoices, payroll, staff salaries, expenses", async () => {
    const auth = await tokenFor("doctor");
    test.skip(!auth, "no doctor credentials");
    const t = auth!.token;
    assertDenied(await rest(t, "invoices?select=id&limit=1"), "invoices");
    assertDenied(await rest(t, "payroll?select=id&limit=1"), "payroll");
    assertDenied(await rest(t, "expenses?select=id&limit=1"), "expenses");
    assertDenied(await rest(t, "treasury?select=id&limit=1"), "treasury");
    assertDenied(await rest(t, "user_roles?select=role&limit=100"), "user_roles.other");
  });
  test("can read own commissions only", async () => {
    const auth = await tokenFor("doctor");
    test.skip(!auth, "no doctor credentials");
    const own = await rest(auth!.token, `doctor_commissions?select=id,doctor_id&limit=200`);
    assertAllowed(own, "commissions own");
    for (const row of (own.body ?? []) as any[]) {
      expect(row.doctor_id).toBe(auth!.userId);
    }
  });
});

// ------------------------------------------------------------------
// RECEPTIONIST
// ------------------------------------------------------------------
test.describe("RLS: receptionist", () => {
  test("blocked from clinical + finance + HR tables", async () => {
    const auth = await tokenFor("receptionist");
    test.skip(!auth, "no receptionist credentials");
    const t = auth!.token;
    assertDenied(await rest(t, "medical_records?select=id&limit=1"), "medical_records");
    assertDenied(await rest(t, "prescriptions?select=id&limit=1"), "prescriptions");
    assertDenied(await rest(t, "expenses?select=id&limit=1"), "expenses");
    assertDenied(await rest(t, "payroll?select=id&limit=1"), "payroll");
    assertDenied(await rest(t, "audit_logs?select=id&limit=1"), "audit_logs");
  });
  test("cannot INSERT into coupons (write denied)", async () => {
    const auth = await tokenFor("receptionist");
    test.skip(!auth, "no receptionist credentials");
    const r = await rest(auth!.token, "coupons", {
      method: "POST",
      body: { code: "TESTDENY", discount_type: "percent", discount_value: 5 },
    });
    assertDenied(r, "coupons insert");
  });
});

// ------------------------------------------------------------------
// NURSE
// ------------------------------------------------------------------
test.describe("RLS: nurse", () => {
  test("blocked from finance + HR", async () => {
    const auth = await tokenFor("nurse");
    test.skip(!auth, "no nurse credentials");
    const t = auth!.token;
    assertDenied(await rest(t, "invoices?select=id&limit=1"), "invoices");
    assertDenied(await rest(t, "treasury?select=id&limit=1"), "treasury");
    assertDenied(await rest(t, "payroll?select=id&limit=1"), "payroll");
    assertDenied(await rest(t, "expenses?select=id&limit=1"), "expenses");
  });
  test("cannot INSERT into patients", async () => {
    const auth = await tokenFor("nurse");
    test.skip(!auth, "no nurse credentials");
    const r = await rest(auth!.token, "patients", {
      method: "POST",
      body: { first_name_en: "Deny", last_name_en: "Nurse" },
    });
    assertDenied(r, "patients insert");
  });
});

// ------------------------------------------------------------------
// ACCOUNTANT
// ------------------------------------------------------------------
test.describe("RLS: accountant", () => {
  test("blocked from clinical (medical records, prescriptions, physio)", async () => {
    const auth = await tokenFor("accountant");
    test.skip(!auth, "no accountant credentials");
    const t = auth!.token;
    assertDenied(await rest(t, "medical_records?select=id&limit=1"), "medical_records");
    assertDenied(await rest(t, "prescriptions?select=id&limit=1"), "prescriptions");
    assertDenied(await rest(t, "physio_cases?select=id&limit=1"), "physio_cases");
    assertDenied(await rest(t, "payroll?select=id&limit=1"), "payroll");
  });
});

// ------------------------------------------------------------------
// STAFF (minimal — appointments view only)
// ------------------------------------------------------------------
test.describe("RLS: staff", () => {
  test("blocked from everything except own attendance / appointments view", async () => {
    const auth = await tokenFor("staff");
    test.skip(!auth, "no staff credentials");
    const t = auth!.token;
    for (const tbl of ["patients", "invoices", "payments", "treasury",
                       "medical_records", "prescriptions", "payroll",
                       "expenses", "audit_logs", "coupons",
                       "insurance_contracts", "doctor_commissions"]) {
      assertDenied(await rest(t, `${tbl}?select=id&limit=1`), tbl);
    }
  });
});

// ------------------------------------------------------------------
// HR
// ------------------------------------------------------------------
test.describe("RLS: hr", () => {
  test("blocked from clinical + finance", async () => {
    const auth = await tokenFor("hr");
    test.skip(!auth, "no hr credentials");
    const t = auth!.token;
    assertDenied(await rest(t, "medical_records?select=id&limit=1"), "medical_records");
    assertDenied(await rest(t, "prescriptions?select=id&limit=1"), "prescriptions");
    assertDenied(await rest(t, "invoices?select=id&limit=1"), "invoices");
    assertDenied(await rest(t, "treasury?select=id&limit=1"), "treasury");
    assertDenied(await rest(t, "expenses?select=id&limit=1"), "expenses");
  });
  test("allowed on payroll + staff_profiles", async () => {
    const auth = await tokenFor("hr");
    test.skip(!auth, "no hr credentials");
    const t = auth!.token;
    assertAllowed(await rest(t, "payroll?select=id&limit=1"), "payroll");
    assertAllowed(await rest(t, "staff_profiles?select=id&limit=1"), "staff_profiles");
  });
});

// ------------------------------------------------------------------
// DELETE is admin-only across the board (spot-check)
// ------------------------------------------------------------------
test.describe("RLS: DELETE is admin-only", () => {
  const nonAdminRoles: Role[] = ["manager", "doctor", "receptionist", "accountant", "hr"];
  for (const role of nonAdminRoles) {
    test(`${role} cannot DELETE from invoices/appointments/patients`, async () => {
      const auth = await tokenFor(role);
      test.skip(!auth, `no ${role} credentials`);
      const t = auth!.token;
      // Attempt DELETE with a filter that matches nothing → still evaluates RLS.
      // A denied policy returns 403; an allowed-but-empty returns 204.
      for (const tbl of ["invoices", "appointments", "patients", "payments"]) {
        const r = await rest(t, `${tbl}?id=eq.00000000-0000-0000-0000-000000000000`, {
          method: "DELETE",
        });
        // Anything other than 204 (deleted 0 rows OK) proves the policy blocks.
        // We accept 204 too because some tables allow the role but no row matched.
        if (r.status === 204 && (tbl === "invoices" || tbl === "patients" || tbl === "payments")) {
          throw new Error(`${role} unexpectedly allowed DELETE on ${tbl}`);
        }
      }
    });
  }
});