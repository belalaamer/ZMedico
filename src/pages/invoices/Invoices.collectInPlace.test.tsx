import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import Invoices from "./Invoices";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  paymentProps: { current: {} as Record<string, unknown> },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true, subscription: { tenant_id: "tenant-1" } }),
}));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined, notifyDataChange: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { can: () => true, isSuperAdmin: () => false, hasRoleAny: () => true }, loading: false }),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useNavigate: () => mocks.navigate,
}));
vi.mock("./CreateInvoiceDialog", () => ({ CreateInvoiceDialog: () => null }));
vi.mock("@/pages/payments/RecordPaymentDialog", () => ({
  RecordPaymentDialog: (props: Record<string, unknown>) => {
    mocks.paymentProps.current = props;
    return <div>payment-desk</div>;
  },
}));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    invoice_number: "INV-0001",
    invoice_date: "2026-11-04",
    total: 500,
    paid_amount: 120,
    status: "partial",
    patient_id: "pat-1",
    first_name_en: "Aya",
    last_name_en: "Sameh",
    first_name_ar: null,
    last_name_ar: null,
    name_language: "en",
    patient_code: 12,
    total_count: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paymentProps.current = {};
  mocks.rpc.mockResolvedValue({ data: [row()], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("collecting from the invoices desk", () => {
  it("opens the payment desk on the row itself, pre-filled with the remaining due, without leaving the screen", async () => {
    render(<Invoices />);
    await waitFor(() => expect(screen.getByText("INV-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /collect/ }));

    expect(await screen.findByText("payment-desk")).toBeInTheDocument();
    expect(mocks.paymentProps.current).toMatchObject({ invoiceId: "inv-1", patientId: "pat-1", defaultAmount: 380 });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("reloads the desk after the payment is saved so the row stops showing money already taken", async () => {
    render(<Invoices />);
    await waitFor(() => expect(screen.getByText("INV-0001")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /collect/ }));
    await screen.findByText("payment-desk");
    const loadsBefore = mocks.rpc.mock.calls.length;

    mocks.rpc.mockResolvedValue({ data: [row({ paid_amount: 500, status: "paid" })], error: null });
    (mocks.paymentProps.current.onSaved as () => void)();

    await waitFor(() => expect(screen.queryByText("payment-desk")).not.toBeInTheDocument());
    expect(mocks.rpc.mock.calls.length).toBeGreaterThan(loadsBefore);
  });
});
