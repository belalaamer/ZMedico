import { describe, expect, it } from "vitest";
import { dropReversedPairs } from "./treasuryVisibility";

type Row = {
  id: string;
  transaction_type: string;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
};

const row = (
  id: string,
  transaction_type: string,
  amount: number,
  reference_type: string | null,
  reference_id: string | null,
): Row => ({ id, transaction_type, amount, reference_type, reference_id });

const keep = (rows: Row[]) => dropReversedPairs(rows).map((r) => r.id);

describe("dropReversedPairs", () => {
  it("takes a cancelled payment out of the desk in one move", () => {
    const rows = [
      row("t1", "income", 500, "payment", "pay-9"),
      row("t2", "expense", 500, "payment_reversal", "pay-9"),
    ];
    // Both halves of the pair leave: one card showing the 500 in and another
    // showing the same 500 out is what made the desk totals unreadable.
    expect(keep(rows)).toEqual([]);
  });

  it("does the same for an expense and its reversal", () => {
    expect(
      keep([
        row("t1", "expense", 120, "expense", "exp-3"),
        row("t2", "income", 120, "expense_reversal", "exp-3"),
      ]),
    ).toEqual([]);
  });

  it("handles each half of a pair split across the fetched window", () => {
    // Only the reversal in view: it still leaves, because a lone reversal is
    // bookkeeping noise. Only the original in view: it stays, so the desk
    // overstates rather than erases money.
    expect(keep([row("t1", "income", 500, "payment", "pay-9")])).toEqual(["t1"]);
    expect(keep([row("t2", "expense", 500, "payment_reversal", "pay-9")])).toEqual([]);
  });

  it("pairs by reference type, not by id alone", () => {
    // Two different tables can share a uuid-shaped id; an expense reversal must
    // not cancel a payment that happens to carry the same reference_id.
    expect(
      keep([
        row("t1", "income", 500, "payment", "same-id"),
        row("t2", "income", 500, "expense_reversal", "same-id"),
      ]),
    ).toEqual(["t1"]);
  });

  it("leaves ordinary desk rows and manual movements untouched", () => {
    const rows = [
      row("t1", "income", 300, "payment", "pay-1"),
      row("t2", "expense", 40, null, null),
      row("t3", "expense", 25, "expense", "exp-7"),
      row("t4", "income", 80, "opening", null),
    ];
    expect(keep(rows)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("keeps the totals a cancelled invoice used to inflate", () => {
    // The regression this helper exists for: voiding an invoice posts a
    // payment_reversal next to the original cash-in. Summing what the desk shows
    // must net to zero, not to 500 in and 500 out.
    const rows = [
      row("t1", "income", 500, "payment", "pay-9"),
      row("t2", "expense", 500, "payment_reversal", "pay-9"),
      row("t3", "income", 150, "payment", "pay-10"),
    ];
    const visible = dropReversedPairs(rows);
    expect(visible.reduce((s, r) => s + (r.transaction_type === "income" ? r.amount : 0), 0)).toBe(150);
    expect(visible.reduce((s, r) => s + (r.transaction_type === "expense" ? r.amount : 0), 0)).toBe(0);
  });

  it("returns the same rows when nothing is reversed", () => {
    const rows = [row("t1", "income", 1, "payment", "a"), row("t2", "expense", 2, "expense", "b")];
    expect(dropReversedPairs(rows)).toHaveLength(2);
  });
});
