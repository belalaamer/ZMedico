import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import PatientsPage from "./Patients";

const mocks = vi.hoisted(() => ({
  duplicateHit: null as { first_name_en: string | null; first_name_ar: string | null } | null,
  duplicateChecks: [] as string[],
}));

function builder(table: string): any {
  const filters: string[] = [];
  const api: Record<string, unknown> = {};
  const again = () => api;
  api.select = (cols: string) => { filters.push(`select:${cols}`); return again(); };
  api.insert = () => again();
  api.update = () => again();
  for (const m of ["eq", "in", "order", "limit", "range", "gte", "lte", "or"]) {
    api[m] = (...args: unknown[]) => { filters.push(`${m}:${args.join(",")}`); return again(); };
  }
  api.is = (col: string, value: unknown) => { filters.push(`is:${col}=${value}`); return again(); };
  const resolve = () => {
    if (filters[0] === "select:first_name_en,first_name_ar") {
      const phone = String(filters.find((f) => f.startsWith("eq:phone,"))?.split(",")[1] ?? "");
      mocks.duplicateChecks.push(phone);
      return Promise.resolve({ data: mocks.duplicateHit ? [mocks.duplicateHit] : [], error: null });
    }
    if (table === "patients") return Promise.resolve({ data: [], error: null, count: 0 });
    return Promise.resolve({ data: [], error: null });
  };
  api.single = resolve;
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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined, notifyDataChange: vi.fn() }));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { can: () => true, isSuperAdmin: () => true, hasRoleAny: () => true }, loading: false }),
}));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useNavigate: () => vi.fn(),
}));
vi.mock("./ReferrerPicker", () => ({ ReferrerPicker: () => null }));
vi.mock("../invoices/CreateInvoiceDialog", () => ({ CreateInvoiceDialog: () => null }));

function openForm() {
  render(<PatientsPage />);
  fireEvent.click(screen.getAllByRole("button", { name: "addPatient" })[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.duplicateHit = null;
  mocks.duplicateChecks.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("walking up a new patient at a busy desk", () => {
  it("shows only the identifying fields until the desk asks for the rest", () => {
    openForm();
    expect(screen.getByPlaceholderText("+20...")).toBeInTheDocument();
    expect(screen.queryByText("dob")).not.toBeInTheDocument();
    expect(screen.queryByText("phone2")).not.toBeInTheDocument();
    expect(screen.queryByText("notes")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /More details/ }));
    expect(screen.getByText("phone2")).toBeInTheDocument();
    expect(screen.getByText("notes")).toBeInTheDocument();
  });

  it("warns while typing when the phone already belongs to a chart", async () => {
    mocks.duplicateHit = { first_name_en: "Aya", first_name_ar: null };
    openForm();
    fireEvent.change(screen.getByPlaceholderText("+20..."), { target: { value: "01000000000" } });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("This number is already on file for Aya"));
  });

  it("stays quiet when the number is new", async () => {
    openForm();
    fireEvent.change(screen.getByPlaceholderText("+20..."), { target: { value: "01000000000" } });

    await waitFor(() => expect(mocks.duplicateChecks).toContain("01000000000"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not ask the database while the desk is still dialling", async () => {
    openForm();
    fireEvent.change(screen.getByPlaceholderText("+20..."), { target: { value: "0100" } });
    await new Promise((r) => window.setTimeout(r, 550));

    expect(mocks.duplicateChecks).toHaveLength(0);
  });
});
