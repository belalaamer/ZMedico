import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import PatientProfile from "./PatientProfile";

const mocks = vi.hoisted(() => ({
  invoices: [] as Array<Record<string, unknown>>,
  payments: [] as Array<Record<string, unknown>>,
  queries: [] as Array<{ table: string; filters: string[] }>,
}));

function builder(table: string): any {
  const filters: string[] = [];
  const api: Record<string, unknown> = {};
  const again = () => api;
  api.select = (cols: string) => { filters.push(`select:${cols}`); return again(); };
  for (const m of ["eq", "in", "order", "limit", "gte", "lte"]) {
    api[m] = (...args: unknown[]) => { filters.push(`${m}:${args.join(",")}`); return again(); };
  }
  api.is = (col: string, value: unknown) => { filters.push(`is:${col}=${value}`); return again(); };
  const resolve = () => {
    mocks.queries.push({ table, filters });
    if (table === "patients") return Promise.resolve({ data: { id: "pat-1", first_name_en: "Aya", last_name_en: "Sameh", name_language: "en", branch_id: "branch-1" }, error: null });
    if (table === "invoices") return Promise.resolve({ data: mocks.invoices, error: null });
    if (table === "payments") return Promise.resolve({ data: mocks.payments, error: null });
    return Promise.resolve({ data: [], error: null });
  };
  api.maybeSingle = resolve;
  api.then = (onFulfilled?: (v: unknown) => unknown) => resolve().then(onFulfilled);
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => builder(table), rpc: vi.fn() } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true, subscription: { tenant_id: "tenant-1" } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/observability/phiAudit", () => ({ logPhiAccess: vi.fn() }));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { can: () => true, isSuperAdmin: () => true, hasRoleAny: () => true }, loading: false }),
}));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useParams: () => ({ id: "pat-1" }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams("tab=financial"), vi.fn()],
}));

vi.mock("./PatientMedicalTab", () => ({ default: () => null }));
vi.mock("./PatientTreatmentPlans", () => ({ default: () => null }));
vi.mock("./PatientTimeline", () => ({ default: () => null }));
vi.mock("./PatientWalletTab", () => ({ default: () => null }));
vi.mock("./PatientDocumentsTab", () => ({ default: () => null }));
vi.mock("./PatientSummaryStrip", () => ({ default: () => null }));
vi.mock("./PatientFinancialCard", () => ({ default: () => null }));
vi.mock("./PatientQuickActions", () => ({ default: () => null }));
vi.mock("./PatientPortalCard", () => ({ default: () => null }));
vi.mock("./PatientOverviewSnapshot", () => ({ default: () => null }));
vi.mock("./EditPatientDialog", () => ({ EditPatientDialog: () => null }));
vi.mock("../invoices/CreateInvoiceDialog", () => ({ CreateInvoiceDialog: () => null }));
vi.mock("../payments/RecordPaymentDialog", () => ({ RecordPaymentDialog: () => null }));

const inv = (n: number, id: string, status: string) => ({
  id, invoice_number: `INV-000${n}`, invoice_date: "2026-11-01", total: 100, paid_amount: 0, status, patient_id: "pat-1",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.invoices = [inv(1, "i1", "paid"), inv(9, "i9", "cancelled"), inv(2, "i2", "pending")];
  mocks.payments = [{ id: "p1", amount: 40, payment_method: "cash", payment_date: "2026-11-02", invoice_id: "i1" }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("cancelled records off the working screen", () => {
  it("keeps a cancelled invoice out of the list until the desk asks for it", async () => {
    render(<PatientProfile />);
    await waitFor(() => expect(screen.getByText("INV-0001")).toBeInTheDocument());

    expect(screen.queryByText("INV-0009")).not.toBeInTheDocument();
    expect(screen.getByText("INV-0002")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /showCancelled \(1\)/ }));
    expect(await screen.findByText("INV-0009")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "hideCancelled" }));
    await waitFor(() => expect(screen.queryByText("INV-0009")).not.toBeInTheDocument());
  });

  it("only asks the ledger for live rows, so a voided payment cannot come back as money", async () => {
    render(<PatientProfile />);
    await waitFor(() => expect(screen.getByText("INV-0001")).toBeInTheDocument());

    expect(mocks.queries.find((q) => q.table === "payments")?.filters).toContain("is:deleted_at=null");
    expect(mocks.queries.find((q) => q.table === "invoices")?.filters).toContain("is:deleted_at=null");
  });
});
