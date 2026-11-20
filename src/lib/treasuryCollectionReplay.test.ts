import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20261120123000_treasury_collection_replay_before_overpayment.sql",
), "utf8");

describe("treasury collection lost-response replay", () => {
  it("resolves a committed idempotent batch before the invoice overpayment check", () => {
    expect(migration.indexOf("_fn_treasury_payment_replay("))
      .toBeLessThan(migration.indexOf("raise exception 'Overpayment blocked"));
  });

  it("still re-reads the batch after waiting for the collection lock", () => {
    expect(migration.match(/_fn_treasury_payment_replay\(/g)).toHaveLength(2);
    expect(migration.indexOf("payment-batch:"))
      .toBeLessThan(migration.lastIndexOf("_fn_treasury_payment_replay("));
  });
});
