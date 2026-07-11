/**
 * Patients vertical-slice shadow QA — validation.
 * Queries the four shadow reporting views (parity, matrix_patients,
 * key_coverage, exit_criteria) after `patients-shadow-walk` has
 * produced traffic. Fails if regressions>0, unexpected_expansions>0,
 * or ready_for_cutover !== true for the patients slice.
 */
import { test, expect, request as pwRequest } from "@playwright/test";
import fs from "fs";
import { patientsShadowStorageState } from "../../playwright.config";
import { getPatientsRoleCreds } from "./helpers/patientsShadow";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

function readAdminAccessToken(): string | null {
  const p = patientsShadowStorageState("admin");
  if (!fs.existsSync(p)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(p, "utf8"));
    const origin = state.origins?.[0];
    const entry = origin?.localStorage?.find((e: any) =>
      typeof e.name === "string" &&
      e.name.startsWith("sb-") &&
      e.name.endsWith("-auth-token"),
    );
    if (!entry) return null;
    return JSON.parse(entry.value)?.access_token ?? null;
  } catch {
    return null;
  }
}

test("patients shadow gate is green", async () => {
  test.skip(
    !getPatientsRoleCreds("admin"),
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD required to query shadow views",
  );
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON,
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY required",
  );
  const token = readAdminAccessToken();
  test.skip(!token, "No admin storage state — setup:shadow-patients did not run");

  const api = await pwRequest.newContext({
    baseURL: SUPABASE_URL!,
    extraHTTPHeaders: {
      apikey: SUPABASE_ANON!,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  async function view(name: string, filter = "") {
    const res = await api.get(`/rest/v1/${name}?select=*${filter}`);
    expect(res.ok(), `${name} query failed: ${res.status()}`).toBeTruthy();
    return (await res.json()) as any[];
  }

  const [parity, matrix, coverage, exit] = await Promise.all([
    view("v_authz_shadow_parity_report", "&slice=eq.patients"),
    view("v_authz_shadow_matrix_patients"),
    view("v_authz_shadow_key_coverage", "&slice=eq.patients"),
    view("v_authz_shadow_exit_criteria", "&slice=eq.patients"),
  ]);

  console.log("\n===== SHADOW PARITY REPORT (patients) =====\n", JSON.stringify(parity, null, 2));
  console.log("\n===== SHADOW MATRIX (patients) =====\n", JSON.stringify(matrix, null, 2));
  console.log("\n===== SHADOW KEY COVERAGE (patients) =====\n", JSON.stringify(coverage, null, 2));
  console.log("\n===== SHADOW EXIT CRITERIA (patients) =====\n", JSON.stringify(exit, null, 2));

  const regressions = parity.reduce(
    (n, r) => n + Number(r.regressions ?? r.regression_count ?? 0),
    0,
  );
  const expansions = parity.reduce(
    (n, r) =>
      n +
      Number(
        r.unexpected_expansions ??
          r.expansion_count ??
          r.expansions ??
          0,
      ),
    0,
  );
  expect(regressions, "patients shadow regressions must be zero").toBe(0);
  expect(expansions, "patients unexpected expansions must be zero").toBe(0);

  const gate = exit[0];
  expect(gate, "v_authz_shadow_exit_criteria returned no patients row").toBeTruthy();
  expect(gate.ready_for_cutover, "ready_for_cutover must be true").toBe(true);

  await api.dispose();
});