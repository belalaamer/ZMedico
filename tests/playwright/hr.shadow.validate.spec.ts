/**
 * HR vertical-slice shadow QA — validation.
 * Queries the four shadow reporting views after `hr-shadow-walk`
 * has produced traffic.
 */
import { test, expect, request as pwRequest } from "@playwright/test";
import fs from "fs";
import { hrShadowStorageState } from "../../playwright.config";
import { getHrRoleCreds } from "./helpers/hrShadow";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

function readAdminAccessToken(): string | null {
  const p = hrShadowStorageState("admin");
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

test("hr shadow gate is green", async () => {
  test.skip(
    !getHrRoleCreds("admin"),
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD required to query shadow views",
  );
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON,
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY required",
  );
  const token = readAdminAccessToken();
  test.skip(!token, "No admin storage state — setup:shadow-hr did not run");

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
    view("v_authz_shadow_parity_report", "&slice=eq.hr"),
    view("v_authz_shadow_matrix_hr"),
    view("v_authz_shadow_key_coverage", "&slice=eq.hr"),
    view("v_authz_shadow_exit_criteria", "&slice=eq.hr"),
  ]);

  console.log("\n===== SHADOW PARITY REPORT (hr) =====\n", JSON.stringify(parity, null, 2));
  console.log("\n===== SHADOW MATRIX (hr) =====\n", JSON.stringify(matrix, null, 2));
  console.log("\n===== SHADOW KEY COVERAGE (hr) =====\n", JSON.stringify(coverage, null, 2));
  console.log("\n===== SHADOW EXIT CRITERIA (hr) =====\n", JSON.stringify(exit, null, 2));

  const regressions = parity.reduce(
    (n, r) => n + Number(r.regressions ?? r.regression_count ?? 0),
    0,
  );
  const expansions = parity.reduce(
    (n, r) => n + Number(r.unexpected_expansions ?? r.expansion_count ?? r.expansions ?? 0),
    0,
  );
  expect(regressions, "hr shadow regressions must be zero").toBe(0);
  expect(expansions, "hr unexpected expansions must be zero").toBe(0);

  const gate = exit[0];
  expect(gate, "v_authz_shadow_exit_criteria returned no hr row").toBeTruthy();
  expect(gate.ready_for_cutover, "ready_for_cutover must be true").toBe(true);

  await api.dispose();
});