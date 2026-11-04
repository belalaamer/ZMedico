import { describe, expect, it } from "vitest";
import { buildPaymentRow, isWalletShortfall } from "./collectPayment";

const base = {
  patientId: "patient-1",
  invoiceId: "invoice-1",
  branchId: "branch-1",
  date: "2026-11-04",
  amount: 250.5,
  method: "cash" as const,
  reference: "R-77",
  notes: "front desk",
  receivedBy: "user-1",
};

describe("the one sanctioned payments-row shape", () => {
  it("maps every collection desk onto the same money columns", () => {
    expect(buildPaymentRow(base)).toEqual({
      patient_id: "patient-1",
      invoice_id: "invoice-1",
      branch_id: "branch-1",
      payment_date: "2026-11-04",
      reference_number: "R-77",
      notes: "front desk",
      received_by: "user-1",
      amount: 250.5,
      payment_method: "cash",
    });
  });

  it("keeps an absent invoice, reference, note and receiver as null, never an empty string", () => {
    const row = buildPaymentRow({
      ...base, invoiceId: "", reference: "", notes: "", receivedBy: null,
    });
    expect(row.invoice_id).toBeNull();
    expect(row.reference_number).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.received_by).toBeNull();
    expect(row.is_wallet_topup).toBeUndefined();
  });

  it("detaches a wallet top-up from any invoice so it cannot settle a bill twice", () => {
    const row = buildPaymentRow({ ...base, invoiceId: "invoice-1", walletTopup: true });
    expect(row.invoice_id).toBeNull();
    expect(row.is_wallet_topup).toBe(true);
  });

  it("leaves the amount exactly as the desk entered it", () => {
    expect(buildPaymentRow({ ...base, amount: 0.01 }).amount).toBe(0.01);
  });
});

describe("wallet shortfall detection", () => {
  it.each([
    [{ code: "23514" }, "the CHECK-violation SQLSTATE"],
    [{ message: "Wallet balance is insufficient" }, "the plain wording"],
    [{ details: "new row violates check constraint for payments_balance_check (balance >= 0)" }, "the constraint detail"],
  ])("recognises %s", (error, why) => {
    expect(isWalletShortfall(error)).toBe(true);
    expect(why).toBeTruthy();
  });

  it("does not call an unrelated rejection a shortfall", () => {
    expect(isWalletShortfall({ code: "23503", message: "invoice_id foreign key" })).toBe(false);
    expect(isWalletShortfall({})).toBe(false);
  });
});
