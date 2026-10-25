import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { resolveAllLines, resolveLineCoverage } from "./insuranceContracts";

const line = { item_type: "service" as const, product_id: null, line_total: 250 };

beforeEach(() => vi.resetAllMocks());

describe("coverage resolution failures", () => {
  it("marks a refused call unresolved instead of a coverage decision", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied for function fn_resolve_coverage" } });
    expect(await resolveLineCoverage("contract-1", line)).toEqual({ rule_id: null, covered_amount: 0, unresolved: true });
  });

  it("marks an empty resolver answer unresolved", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await resolveLineCoverage("contract-1", line)).unresolved).toBe(true);
  });

  it("keeps a resolved zero as a decision, not a failure", async () => {
    rpc.mockResolvedValue({ data: [{ rule_id: null, covered_amount: 0 }], error: null });
    expect((await resolveLineCoverage("contract-1", line)).unresolved).toBeUndefined();
  });

  it("does not call the resolver for a zero-total line", async () => {
    const r = await resolveLineCoverage("contract-1", { ...line, line_total: 0 });
    expect(r.unresolved).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports nothing unresolved when there is no contract to resolve against", async () => {
    const rows = await resolveAllLines(null, [line, line]);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.unresolved)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
