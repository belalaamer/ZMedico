import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261011215715_qualify_purchase_order_draft_item_delete.sql", "utf8");

describe("purchase order draft ambiguity migration", () => {
  it("refuses to rewrite an unreviewed function definition", () => {
    expect(migration).toContain("md5(v_definition) <> '44d1212cbef909df9ba2dffaa1dc5d43'");
    expect(migration).toContain("definition drifted; review before applying");
  });

  it("requires exactly one occurrence of the known ambiguous statement", () => {
    expect(migration).toContain("Expected one ambiguous purchase-order delete statement");
    expect(migration).toContain("length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old)");
  });

  it("changes only the delete target reference to an explicit table alias", () => {
    expect(migration).toContain("delete from public.purchase_order_items as poi");
    expect(migration).toContain("where poi.purchase_order_id = v_po.id;");
    expect(migration).toContain("execute replace(v_definition, v_old, v_new)");
  });
});
