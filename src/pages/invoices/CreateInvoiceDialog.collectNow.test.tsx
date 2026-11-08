import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { localDateOnly } from "@/lib/localDate";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  notifyDataChange: vi.fn(),
  inserts: [] as Array<{ table: string; rows: unknown }>,
}));

type Resp = { data?: unknown; error?: { message: string } | null };
let invoicesResponse: Resp = {};
let paymentsResponse: Resp = {};
let walletResponse: Resp = {};
let servicesResponse: Resp = { data: [], error: null };

function responseFor(table: string): Resp {
  if (table === "invoices") return invoicesResponse;
  if (table === "payments") return paymentsResponse;
  if (table === "patient_wallets") return walletResponse;
  if (table === "services") return servicesResponse;
  if (table === "patients") return { data: { id: "pat-1", insurance_company_id: null } };
  return { data: [], error: null };
}

function queryBuilder(table: string): any {
  const api: Record<string, unknown> = {};
  const again = () => api;
  api.insert = (rows: unknown) => { mocks.inserts.push({ table, rows }); return again(); };
  api.update = () => again();
  api.delete = () => again();
  api.select = () => again();
  for (const m of ["eq", "neq", "is", "in", "gt", "gte", "lt", "lte", "like", "ilike", "or", "not", "order", "limit", "range", "contains", "match"]) {
    api[m] = () => again();
  }
  const resolve = () => Promise.resolve(responseFor(table));
  api.single = resolve;
  api.maybeSingle = resolve;
  api.then = (onFulfilled?: (v: Resp) => unknown) => resolve().then(onFulfilled);
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => queryBuilder(table), rpc: mocks.rpc },
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true, subscription: { tenant_id: "tenant-1" } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess, info: mocks.toastInfo } }));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined, notifyDataChange: mocks.notifyDataChange }));
vi.mock("@/hooks/usePatientSearch", () => ({
  usePatientSearch: () => ({ options: [], searching: false, failed: false, search: vi.fn(), reload: vi.fn() }),
}));
vi.mock("@/lib/insuranceContracts", () => ({
  fetchActiveContract: vi.fn().mockResolvedValue(null),
  resolveAllLines: vi.fn().mockReturnValue([]),
  distributeClaim: vi.fn().mockReturnValue([]),
}));
vi.mock("@/components/ui/combobox", () => ({ Combobox: () => null }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}><option value="" />{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

/** The collect strip is the block the "Collect payment now" label opens. */
function strip() {
  return within(screen.getByText("collectNow").closest("div") as HTMLElement);
}

function setup() {
  const onSaved = vi.fn();
  render(<CreateInvoiceDialog open onOpenChange={vi.fn()} onSaved={onSaved} presetPatientId="pat-1" />);
  fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Consultation" } });
  fireEvent.click(within(screen.getByText("collectNow").closest("div") as HTMLElement).getByRole("checkbox"));
  return { onSaved, primary: () => screen.getByRole("button", { name: "saveAndCollect" }) };
}

function amountInput() {
  return strip().getAllByRole("textbox")[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserts.length = 0;
  invoicesResponse = { data: { id: "inv-1", invoice_number: "INV-0001" }, error: null };
  paymentsResponse = { data: null, error: null };
  walletResponse = { data: { balance: 100 } };
  servicesResponse = { data: [], error: null };
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("dialog layout", () => {
  it("keeps the header and footer fixed and scrolls only the body", () => {
    render(<CreateInvoiceDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} presetPatientId="pat-1" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[90vh]");

    const body = screen.getByTestId("invoice-dialog-body");
    expect(body.className).toContain("overflow-y-auto");
    expect(body.contains(screen.getByRole("button", { name: "save" }))).toBe(false);
    expect(body.contains(screen.getByRole("button", { name: "cancel" }))).toBe(false);
  });

  it("keeps the item columns on one grid with a real gap and shrinkable cells", () => {
    render(<CreateInvoiceDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} presetPatientId="pat-1" />);
    const row = screen.getAllByTestId("invoice-item-row")[0];
    expect(row.className).toContain("gap-3");
    expect(row.className).toContain("md:grid-cols-12");
    expect(screen.getByTestId("invoice-item-description").className).toContain("min-w-0");
  });
});

describe("service line types", () => {
  it("collapses the description after a registered service is picked, and re-opens it with the pencil", async () => {
    servicesResponse = {
      data: [{ id: "svc-1", name_en: "Physiotherapy", name_ar: "علاج طبيعي", default_price: 250, is_active: true, deleted_at: null }],
      error: null,
    };
    render(<CreateInvoiceDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} presetPatientId="pat-1" />);

    expect(screen.getByPlaceholderText("Description")).toBeInTheDocument();
    const option = await screen.findByRole("option", { name: /Physiotherapy/ });
    fireEvent.change(option.closest("select") as HTMLSelectElement, { target: { value: "svc-1" } });

    await waitFor(() => expect(screen.queryByPlaceholderText("Description")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    expect(screen.getByPlaceholderText("Description")).toBeInTheDocument();
  });

  it("offers the tenant's services with their price, and picks that price", async () => {
    servicesResponse = {
      data: [{ id: "svc-1", name_en: "Physiotherapy", name_ar: "علاج طبيعي", default_price: 250, is_active: true, deleted_at: null }],
      error: null,
    };
    render(<CreateInvoiceDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} presetPatientId="pat-1" />);

    const option = await screen.findByRole("option", { name: /Physiotherapy/ });
    const select = option.closest("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "svc-1" } });

    expect(screen.getByDisplayValue("250")).toBeInTheDocument();
  });
});

describe("collecting money on the invoice screen", () => {
  it("posts the invoice and the payment from one click, with the money columns the ledger expects", async () => {
    const { onSaved, primary } = setup();
    fireEvent.change(amountInput(), { target: { value: "150" } });
    fireEvent.change(strip().getByRole("combobox"), { target: { value: "card" } });
    fireEvent.change(strip().getAllByRole("textbox")[1], { target: { value: "R-9" } });
    fireEvent.click(primary());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("inv-1"));
    const tables = mocks.inserts.map((i) => i.table);
    expect(tables.slice(0, 3)).toEqual(["invoices", "invoice_items", "payments"]);
    expect(mocks.inserts[2].rows).toEqual([{
      patient_id: "pat-1",
      invoice_id: "inv-1",
      branch_id: "branch-1",
      payment_date: localDateOnly(new Date()),
      reference_number: "R-9",
      notes: null,
      received_by: "user-1",
      amount: 150,
      payment_method: "card",
    }]);
    expect(mocks.notifyDataChange).toHaveBeenCalledWith("payments");
  });

  it("leaves the ledger untouched when the desk does not tick collect", async () => {
    const onSaved = vi.fn();
    render(<CreateInvoiceDialog open onOpenChange={vi.fn()} onSaved={onSaved} presetPatientId="pat-1" />);
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Consultation" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("inv-1"));
    expect(mocks.inserts.map((i) => i.table)).toEqual(["invoices", "invoice_items"]);
  });

  it("refuses to start writing when the collect amount is zero", async () => {
    const { onSaved, primary } = setup();
    fireEvent.change(amountInput(), { target: { value: "0" } });
    fireEvent.click(primary());

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("amountRequired"));
    expect(mocks.inserts).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("refuses a wallet collection above the recorded balance before any invoice exists", async () => {
    const { primary } = setup();
    fireEvent.change(strip().getByRole("combobox"), { target: { value: "wallet" } });
    await waitFor(() => expect(strip().getByText(/walletBalanceLabel/)).toBeInTheDocument());
    fireEvent.change(amountInput(), { target: { value: "250" } });
    fireEvent.click(primary());

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("walletInsufficient"));
    expect(mocks.inserts).toHaveLength(0);
  });

  it("still reports the saved invoice when the payment is rejected, and never claims the money arrived", async () => {
    paymentsResponse = { error: { message: "duplicate payment rejected" } };
    const { primary } = setup();
    fireEvent.change(amountInput(), { target: { value: "40" } });
    fireEvent.click(primary());

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("paymentNotRecorded"));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("invoice INV-0001");
    expect(mocks.notifyDataChange).not.toHaveBeenCalledWith("payments");
    expect(mocks.inserts.some((i) => i.table === "invoices")).toBe(true);
  });

  it("says so when a draft carries a collect tick, because a draft is not a bill yet", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "saveDraft" }));

    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledWith("draftSavedNoPayment"));
    expect(mocks.inserts.some((i) => i.table === "payments")).toBe(false);
  });
});
