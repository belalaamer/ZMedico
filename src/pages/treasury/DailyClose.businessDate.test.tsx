import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { localDateOnly } from "@/lib/localDate";
import DailyClose from "./DailyClose";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(table === "treasury" ? { data: treasuries, error: null } : { data: null, error: null }).then(resolve),
      };
      for (const verb of ["select", "eq", "is", "in", "gte", "lte", "order", "limit", "maybeSingle", "single"]) {
        chain[verb] = () => chain;
      }
      return chain;
    },
  },
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (key: string) => key, lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { hasRoleAny: () => true, can: () => true, isSuperAdmin: () => false }, loading: false }),
}));
vi.mock("react-router-dom", () => ({ Link: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}><option value="" />{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

const treasuries = [{ id: "t1", branch_id: "branch-1", name_en: "Main till", name_ar: null, currency: "EGP", current_balance: 0 }];

const yesterday = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateOnly(d);
})();
const today = localDateOnly(new Date());

const dateInput = () => document.querySelector<HTMLInputElement>('input[type="date"]');

async function mount() {
  render(<DailyClose />);
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the day the close screen opens on", () => {
  it("defaults to the day that has ended, and still refuses a future one", async () => {
    await mount();
    expect(dateInput()?.value).toBe(yesterday);
    expect(dateInput()?.value).not.toBe(today);
    // max={today} stays: yesterday is the default, not the only legal answer.
    expect(dateInput()?.getAttribute("max")).toBe(today);
    expect(screen.getByText(/Close the day that has ended/)).toBeInTheDocument();
  });

  it("asks the ledger for the day it opened on once a till is chosen", async () => {
    await mount();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "t1" } });

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fn_treasury_day_cash_summary", {
      _treasury_id: "t1",
      _business_date: yesterday,
    }));
  });

  it("still closes today when the manager picks it", async () => {
    await mount();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "t1" } });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());

    fireEvent.change(dateInput() as HTMLElement, { target: { value: today } });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fn_treasury_day_cash_summary", {
      _treasury_id: "t1",
      _business_date: today,
    }));
  });
});
