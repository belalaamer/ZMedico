/**
 * ZMedico — cross-tenant RLS isolation over PostgREST.
 *
 * This suite is intentionally skip-safe and read-only. It requires two
 * dedicated QA users, two fixture branch IDs, and one marker patient ID per
 * tenant. It never creates, edits, or deletes production data.
 *
 * Required environment variables:
 *   BASE_SUPABASE_URL / VITE_SUPABASE_URL
 *   BASE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY
 *   RLS_TENANT_A_EMAIL, RLS_TENANT_A_PASS, RLS_TENANT_A_BRANCH_ID,
 *   RLS_TENANT_A_MARKER_PATIENT_ID
 *   RLS_TENANT_B_EMAIL, RLS_TENANT_B_PASS, RLS_TENANT_B_BRANCH_ID,
 *   RLS_TENANT_B_MARKER_PATIENT_ID
 *
 * Run against a disposable QA project or a production-safe seeded fixture:
 *   npx playwright test tests/playwright/rls.tenant-isolation.spec.ts
 */
import { expect, request as pwRequest, test } from "@playwright/test";

type TenantKey = "A" | "B";
type AuthResult = { access_token?: string; user?: { id?: string } };
type PatientRow = { id: string; branch_id: string | null };
type RestResult<T> = { status: number; body: T | null; raw: string };

const SUPABASE_URL = process.env.BASE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const ANON_KEY = process.env.BASE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const config: Record<TenantKey, { email?: string; pass?: string; branchId?: string; markerPatientId?: string }> = {
  A: {
    email: process.env.RLS_TENANT_A_EMAIL,
    pass: process.env.RLS_TENANT_A_PASS,
    branchId: process.env.RLS_TENANT_A_BRANCH_ID,
    markerPatientId: process.env.RLS_TENANT_A_MARKER_PATIENT_ID,
  },
  B: {
    email: process.env.RLS_TENANT_B_EMAIL,
    pass: process.env.RLS_TENANT_B_PASS,
    branchId: process.env.RLS_TENANT_B_BRANCH_ID,
    markerPatientId: process.env.RLS_TENANT_B_MARKER_PATIENT_ID,
  },
};

function hasConfig(key: TenantKey) {
  const value = config[key];
  return Boolean(SUPABASE_URL && ANON_KEY && value.email && value.pass && value.branchId && value.markerPatientId);
}

async function tokenFor(key: TenantKey) {
  const value = config[key];
  if (!hasConfig(key)) return null;
  const ctx = await pwRequest.newContext();
  try {
    const response = await ctx.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      data: { email: value.email, password: value.pass },
    });
    if (!response.ok()) return null;
    const body = (await response.json()) as AuthResult;
    return body.access_token ? { token: body.access_token, userId: body.user?.id ?? null } : null;
  } finally {
    await ctx.dispose();
  }
}

async function rest<T>(token: string, path: string): Promise<RestResult<T>> {
  const ctx = await pwRequest.newContext();
  try {
    const response = await ctx.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    const raw = await response.text();
    let body: T | null = null;
    try { body = raw ? (JSON.parse(raw) as T) : null; } catch { /* preserve raw response */ }
    return { status: response.status(), body, raw };
  } finally {
    await ctx.dispose();
  }
}

function assertReadable(status: number, label: string) {
  expect([200, 206], `${label} should be readable for the owning QA user`).toContain(status);
}

function assertDeniedOrEmpty<T>(result: RestResult<T>, label: string) {
  const empty = Array.isArray(result.body) && result.body.length === 0;
  expect([401, 403, 404, 406].includes(result.status) || empty,
    `${label} should be denied or empty; got ${result.status} ${result.raw.slice(0, 200)}`).toBe(true);
}

test.describe("RLS: cross-tenant clinic isolation", () => {
  test("Tenant A sees only its fixture branch and cannot target Tenant B patient", async () => {
    const auth = await tokenFor("A");
    test.skip(!auth, "Tenant A QA credentials and fixture variables are not configured");
    const ownBranch = config.A.branchId!;
    const foreignPatient = config.B.markerPatientId!;
    const rows = await rest<PatientRow[]>(auth!.token, "patients?select=id,branch_id&limit=200");
    assertReadable(rows.status, "Tenant A patients");
    for (const row of rows.body ?? []) expect(row.branch_id).toBe(ownBranch);
    const targeted = await rest<PatientRow[]>(auth!.token, `patients?select=id,branch_id&id=eq.${foreignPatient}&limit=1`);
    assertDeniedOrEmpty(targeted, "Tenant A targeting Tenant B patient");
  });

  test("Tenant B sees only its fixture branch and cannot target Tenant A patient", async () => {
    const auth = await tokenFor("B");
    test.skip(!auth, "Tenant B QA credentials and fixture variables are not configured");
    const ownBranch = config.B.branchId!;
    const foreignPatient = config.A.markerPatientId!;
    const rows = await rest<PatientRow[]>(auth!.token, "patients?select=id,branch_id&limit=200");
    assertReadable(rows.status, "Tenant B patients");
    for (const row of rows.body ?? []) expect(row.branch_id).toBe(ownBranch);
    const targeted = await rest<PatientRow[]>(auth!.token, `patients?select=id,branch_id&id=eq.${foreignPatient}&limit=1`);
    assertDeniedOrEmpty(targeted, "Tenant B targeting Tenant A patient");
  });

  test("each tenant can read its own marker and not the foreign marker", async () => {
    const [authA, authB] = await Promise.all([tokenFor("A"), tokenFor("B")]);
    test.skip(!authA || !authB, "Both tenant QA credential sets are required");
    const ownA = await rest<PatientRow[]>(authA!.token, `patients?select=id,branch_id&id=eq.${config.A.markerPatientId}&limit=1`);
    const ownB = await rest<PatientRow[]>(authB!.token, `patients?select=id,branch_id&id=eq.${config.B.markerPatientId}&limit=1`);
    assertReadable(ownA.status, "Tenant A own marker");
    assertReadable(ownB.status, "Tenant B own marker");
    expect(ownA.body?.[0]?.id).toBe(config.A.markerPatientId);
    expect(ownB.body?.[0]?.id).toBe(config.B.markerPatientId);
    const foreignA = await rest<PatientRow[]>(authA!.token, `patients?select=id,branch_id&id=eq.${config.B.markerPatientId}&limit=1`);
    const foreignB = await rest<PatientRow[]>(authB!.token, `patients?select=id,branch_id&id=eq.${config.A.markerPatientId}&limit=1`);
    assertDeniedOrEmpty(foreignA, "Tenant A foreign marker");
    assertDeniedOrEmpty(foreignB, "Tenant B foreign marker");
  });
});
