import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import Invoices from "./Invoices";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true, subscription: { tenant_id: "tenant-1" } }),
}));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined, notifyDataChange: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { can: () => true, isSuperAdmin: () => false, hasRoleAny: () => true }, loading: false }),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useNavigate: () => vi.fn(),
}));
vi.mock("./CreateInvoiceDialog", () => ({ CreateInvoiceDialog: () => null }));
vi.mock("@/pages/payments/RecordPaymentDialog", () => ({ RecordPaymentDialog: () => null }));

function row(totalCount: number) {
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
    total_count: totalCount,
  };
}

/** The body of the most recent search_invoices_page call. */
const lastQuery = () =>
  mocks.rpc.mock.calls.filter((call) => call[0] === "search_invoices_page").at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [row(120)], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("showing cancelled invoices", () => {
  it("asks the RPC to hide cancelled rows by default", async () => {
    render(<Invoices />);
    await waitFor(() => expect(screen.getByText("INV-0001")).toBeInTheDocument());
    expect(mocks.rpc).toHaveBeenCalledWith("search_invoices_page", expect.objectContaining({ p_include_cancelled: false }));
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("brings the voided rows back when the desk switches them on", async () => {
    render(<Invoices />);
    await waitFor(() => expect(screen.getByText("INV-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(lastQuery().p_include_cancelled).toBe(true));
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("sends the desk back to the first page, because the toggle changes which rows exist", async () => {
    render(<Invoices />);
    await waitFor(() => expect(screen.getByText("INV-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(lastQuery().p_offset).toBe(50));

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(lastQuery().p_include_cancelled).toBe(true));
    expect(lastQuery().p_offset).toBe(0);
  });
});
