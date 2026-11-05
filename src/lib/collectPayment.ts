import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type { PaymentMethod };

// Payments are written from two desks now: the standalone record-payment dialog
// and the "collect payment now" step inside invoice creation. Both build their
// row here so the attribution fields the ledger triggers read (`received_by`,
// `branch_id`, `is_wallet_topup`) cannot drift apart between the two screens.
export function buildPaymentRow(input: {
  patientId: string;
  invoiceId: string | null;
  branchId: string | null;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  receivedBy?: string | null;
  walletTopup?: boolean;
}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    patient_id: input.patientId,
    invoice_id: input.walletTopup ? null : (input.invoiceId || null),
    branch_id: input.branchId,
    payment_date: input.date,
    reference_number: input.reference || null,
    notes: input.notes || null,
    received_by: input.receivedBy ?? null,
    amount: input.amount,
    payment_method: input.method,
  };
  if (input.walletTopup) row.is_wallet_topup = true;
  return row;
}

// A wallet spend that passes the on-screen check can still lose to the balance
// row at insert time. The balance CHECK surfaces as SQLSTATE 23514, which says
// "a constraint failed" without saying whose money it was -- so the copy here is
// what turns a generic rejection back into "insufficient wallet balance".
export function isWalletShortfall(error: { code?: string; message?: string; details?: string; hint?: string }): boolean {
  const raw = `${error.message ?? ""} ${(error as { details?: string }).details ?? ""} ${(error as { hint?: string }).hint ?? ""}`.toLowerCase();
  return (
    error.code === "23514" ||
    raw.includes("insufficient") ||
    (raw.includes("balance") && (raw.includes("check") || raw.includes("negative") || raw.includes(">= 0") || raw.includes(">=0")))
  );
}
