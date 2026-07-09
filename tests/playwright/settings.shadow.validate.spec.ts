/**
 * Settings vertical-slice shadow QA — validation.
 *
 * Runs after `settings-shadow-walk` has produced real shadow traffic
 * for every role whose credentials were available. Queries the four
 * shadow reporting views and fails if the cutover gate is not green.
 *
 * Views queried (all read-only):
 *   - v_authz_shadow_parity_report
 *   - v_authz_shadow_matrix_settings
 *   - v_authz_shadow_key_coverage
 *   - v_authz_shadow_exit_criteria
 *
 * The suite requires the admin storage state produced by
 * `setup:shadow` (admin credentials must be supplied) so it can call
 * the Data API with a valid access token. If admin credentials are
 * absent the suite is skipped — never bypassed.
 *
 * Failure conditions:
 *   - regressions > 0
 *   - unexpected_expansions > 0
 *   - ready_for_cutover !== true
 */
import { test, expect, request as pwRequest } from "@playwright/test";
import fs from "fs";
import { shadowStorageState } from "../../playwright.config";
import { getRoleCreds } from "./helpers/shadowRoles";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

function readAdminAccessToken(): string | null {
  const p = shadowStorageState("admin");
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

test("settings shadow gate is green", async () => {
  test.skip(
    !getRoleCreds("admin"),
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD required to query shadow views",
  );
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON,
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY required",
  );
  const token = readAdminAccessToken();
  test.skip(!token, "No admin storage state — setup:shadow did not run");

  const api = await pwRequest.newContext({
    baseURL: SUPABASE_URL!,
    extraHTTPHeaders: {
      apikey: SUPABASE_ANON!,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  async function view(name: string) {
    const res = await api.get(`/rest/v1/${name}?select=*`);
    expect(res.ok(), `${name} query failed: ${res.status()}`).toBeTruthy();
    return (await res.json()) as any[];
  }

  const [parity, matrix, coverage, exit] = await Promise.all([
    view("v_authz_shadow_parity_report"),
    view("v_authz_shadow_matrix_settings"),
    view("v_authz_shadow_key_coverage"),
    view("v_authz_shadow_exit_criteria"),
  ]);

  // Emit the reports into the test output so CI logs preserve them.
  console.log("\n===== SHADOW PARITY REPORT =====\n", JSON.stringify(parity, null, 2));
  console.log("\n===== SHADOW MATRIX (settings) =====\n", JSON.stringify(matrix, null, 2));
  console.log("\n===== SHADOW KEY COVERAGE =====\n", JSON.stringify(coverage, null, 2));
  console.log("\n===== SHADOW EXIT CRITERIA =====\n", JSON.stringify(exit, null, 2));

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
  expect(regressions, "shadow regressions must be zero").toBe(0);
  expect(expansions, "unexpected expansions must be zero").toBe(0);

  const gate = exit[0];
  expect(gate, "v_authz_shadow_exit_criteria returned no rows").toBeTruthy();
  expect(gate.ready_for_cutover, "ready_for_cutover must be true").toBe(true);

  await api.dispose();
});