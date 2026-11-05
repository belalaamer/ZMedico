type TreasuryTxRow = {
  reference_type?: string | null;
  reference_id?: string | null;
};

// A reversal row names the row it cancels through reference_id, and the pair
// shares that id: payment/payment_reversal carry the payment id, as
// expense/expense_reversal carry the expense id
// (supabase/migrations/20260520202944_9db66294-cf24-4caf-bca5-c8378a0fc1f7.sql:24).
const REVERSAL_OF: Record<string, string> = {
  expense_reversal: "expense",
  payment_reversal: "payment",
};

// Drops a reversal and the row it cancels together, so a cancelled movement
// leaves the desk instead of showing as money in and the same money out. When
// only one half of a pair is inside the fetched window, the reversal goes and
// the original stays: that overstates rather than erases money.
export function dropReversedPairs<T extends TreasuryTxRow>(rows: readonly T[]): T[] {
  const cancelled = new Set<string>();
  for (const r of rows) {
    const originalType = r.reference_type ? REVERSAL_OF[r.reference_type] : undefined;
    if (originalType && r.reference_id) cancelled.add(`${originalType}:${r.reference_id}`);
  }
  return rows.filter((r) => {
    if (r.reference_type && REVERSAL_OF[r.reference_type]) return false;
    if (r.reference_id && cancelled.has(`${r.reference_type}:${r.reference_id}`)) return false;
    return true;
  });
}
