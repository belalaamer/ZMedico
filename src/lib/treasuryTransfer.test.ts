import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20261003230000_atomic_idempotent_treasury_transfer.sql",
), "utf8");

describe("atomic treasury transfer migration", () => {
  it("checks locked available cash only after read-only replay reconciliation", () => {
    expect(migration).toContain('v_from.current_balance < p_amount');
    expect(migration.indexOf('v_from.current_balance < p_amount')).toBeGreaterThan(migration.indexOf("'idempotent_replay', true"));
    expect(migration.indexOf('v_from.current_balance < p_amount')).toBeLessThan(migration.indexOf('v_debit_id := public.add_treasury_tx'));
  });
  it("posts both ledger sides inside one database function", () => {
    expect(migration).toContain("create function public.transfer_treasury_funds");
    expect(migration.match(/public\.add_treasury_tx\(/g)).toHaveLength(2);
    expect(migration).toContain("'expense'::public.treasury_tx_type");
    expect(migration).toContain("'income'::public.treasury_tx_type");
  });
  it("rejects non-finite PostgreSQL numeric transfer amounts", () => {
    expect(migration).toContain("p_amount::text in ('NaN', 'Infinity', '-Infinity')");
  });
  it("requires matching known currencies before ledger writes", () => {
    expect(migration).toContain("v_from.currency is distinct from v_to.currency");
    expect(migration.indexOf("Transfers require treasuries with the same known currency"))
      .toBeLessThan(migration.indexOf("v_debit_id := public.add_treasury_tx"));
  });
  it("checks both closed periods after replay and before ledger writes", () => {
    expect(migration.match(/perform public\._treasury_assert_open_period\(/g)).toHaveLength(2);
    const guard = migration.indexOf("perform public._treasury_assert_open_period(");
    expect(guard).toBeGreaterThan(migration.indexOf("'idempotent_replay', true"));
    expect(guard).toBeLessThan(migration.indexOf("v_debit_id := public.add_treasury_tx"));
  });

  it("serializes idempotent retries and validates an existing pair", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_existing_count = 2");
    expect(migration).toContain("'idempotent_replay', true");
    expect(migration).toContain("Transfer reference conflicts");
  });

  it("locks both treasuries in deterministic order", () => {
    expect(migration).toMatch(/where t\.id in \(p_from_treasury_id, p_to_treasury_id\)[\s\S]*order by t\.id[\s\S]*for update/);
  });

  it("requires authentication, permission and branch access", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("public.has_permission(v_actor, 'treasury.tx.write')");
    expect(migration.match(/public\.user_has_branch_access/g)).toHaveLength(2);
    expect(migration).toContain("from public, anon, service_role");
    expect(migration).toContain("to authenticated;");
    expect(migration).toContain("current_setting('role', true) <> 'authenticated'");
    expect(migration.indexOf('not coalesce(zmedico_security.session_is_active(), false)')).toBeLessThan(migration.indexOf('if v_actor is null'));
  });
  it("checks current branch access before returning an idempotent replay", () => {
    expect(migration.indexOf("public.user_has_branch_access(v_to.branch_id)"))
      .toBeLessThan(migration.indexOf("if v_existing_count > 0 then"));
  });
});
