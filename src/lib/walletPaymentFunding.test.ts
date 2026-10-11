import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const source = readFileSync("supabase/migrations/20261010102734_authorize_exact_payment_wallet_funding.sql", "utf8");
it("requires exact finite wallet, optional reversal and payment callback prerequisites", () => {
  for (const hash of ["ce34cf6d3df9b58c89694f52509dac6e", "c432fe02b9a614fdf63da8725a4fa466", "51bdd17edeef8c9d3082951bb3ecbb3c"]) expect(source).toContain(hash);
  expect(source).toContain("WHERE convalidated");
  expect(source).toContain("patient_wallet_transactions_balance_after_finite");
  expect(source).toContain("Exact wallet funding insertion points changed");
});
it("authorizes exact payment funding before bypassing the clinical edit gate", () => {
  expect(source).toContain("_tx_type = 'topup' AND _reference_type = 'payment'");
  expect(source).toContain("public.has_permission(_uid, 'invoices.create') IS NOT TRUE");
  expect(source).toContain("public.user_has_branch_access(_branch_id) IS NOT TRUE");
  for (const field of ["funding.patient_id IS DISTINCT FROM _patient_id", "funding.branch_id IS DISTINCT FROM _branch_id", "funding.received_by IS DISTINCT FROM _uid", "funding.amount IS DISTINCT FROM _amount", "funding.invoice_id IS NOT NULL", "funding.deleted_at IS NOT NULL", "funding.is_wallet_topup IS DISTINCT FROM true"]) expect(source).toContain(field);
  expect(source.indexOf("SELECT * INTO funding")).toBeLessThan(source.indexOf("valid_funding := true"));
});
it("locks parent payment and refuses linked or recorded duplicate credit", () => {
  expect(source).toContain("WHERE id = _reference_id FOR UPDATE");
  expect(source).toContain("funding.wallet_credit_tx_id IS NOT NULL OR EXISTS");
  expect(source).toContain("reference_id = _reference_id AND tx_type = 'topup'");
  expect(source).toContain("Payment wallet credit already exists");
  expect(source).toContain("('cash', 'card', 'bank_transfer', 'insurance')) IS NOT TRUE");
});
it("preserves legacy clinical/manual, reversal and finite guards", () => {
  expect(source).toContain("IF NOT valid_funding AND NOT public.has_permission(_uid, _required_perm) THEN");
  expect(source).toContain("IF NOT valid_funding AND NOT v_valid_payment_reversal AND NOT public.has_permission(_uid, _required_perm) THEN");
  expect(source).toContain("Wallet balance invalid; financial review required");
  expect(source).toContain("at most two decimals");
});
it("accepts only reviewed post207 prerequisites and preserves its direct-call guard", () => {
  for (const hash of ["58bb8ea81f6754d0e7ea484b386403c4", "6c9ea7799a6ddaaf2c4642ed132a05e0"]) expect(source).toContain(hash);
  expect(source).toContain("Deployed207 direct-call protection must remain");
  expect(source).toContain("pg_catalog.pg_trigger_depth() = 0 AND NOT (");
  expect(source).toMatch(/old_gate := CASE WHEN md5\(original\) IN/);
});
it("does not rewrite money or broaden ACL, RLS, owner or execution mode", () => {
  for (const field of ["p.proacl IS DISTINCT FROM original_acl", "p.proowner IS DISTINCT FROM original_owner", "p.prosecdef IS DISTINCT FROM original_definer", "p.proconfig IS DISTINCT FROM original_config"]) expect(source).toContain(field);
  expect(source).not.toMatch(/\b(?:grant|revoke|alter\s+table|disable\s+(?:trigger|row\s+level\s+security)|insert\s+into\s+public\.|update\s+public\.|delete\s+from\s+public\.)\b/i);
  expect(source).not.toMatch(/auth\.jwt\(\).*user_metadata|service_role\s*=/i);
});
