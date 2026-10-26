import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { formatMoney } from "@/lib/format";

const mocks = vi.hoisted(() => ({
  treasury: [] as Record<string, unknown>[],
  ledger: [] as Record<string, unknown>[],
  today: [] as Record<string, unknown>[],
}));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/RowActions", () => ({ RowActions: () => null }));
vi.mock("./TransferDialog", () => ({ TransferDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let selected = "";
      const api: Record<string, unknown> = {
        select: (columns: string) => { selected = columns; return api; },
        then: (resolve: (value: unknown) => unknown) => {
          const rows = table === "treasury"
            ? { data: mocks.treasury, error: null }
            : selected === "*" ? { data: mocks.ledger, error: null } : { data: mocks.today, error: null };
          return Promise.resolve(rows).then(resolve);
        },
      };
      for (const method of ["eq", "is", "in", "gte", "order", "limit"]) api[method] = () => api;
      return api;
    },
  },
}));

import Treasury from "./Treasury";

const treasuryRow = (id: string, currency: string, cash: number) => ({
  id, currency, current_balance: cash, non_cash_balance: 0,
  name_en: `Treasury ${id}`, name_ar: `خزينة ${id}`, branch_id: "branch-1", deleted_at: null,
});
const txRow = (id: string, treasury_id: string, amount: number, balance_after: number) => ({
  id, treasury_id, transaction_type: "income", amount, balance_after,
  reference_type: "payment", reference_id: null, created_at: "2026-10-26T09:00:00.000Z",
  description_en: `Income ${id}`, description_ar: null,
});

async function openPage() {
  const view = render(<MemoryRouter><Treasury /></MemoryRouter>);
  await act(async () => { await Promise.resolve(); });
  return view;
}

describe("treasury money truthfulness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.treasury = [];
    mocks.ledger = [];
    mocks.today = [];
  });
  afterEach(cleanup);

  it("shows one number per card while the branch holds a single currency", async () => {
    mocks.treasury = [treasuryRow("t1", "EGP", 1000), treasuryRow("t2", "EGP", 10)];
    const { container } = await openPage();
    await waitFor(() => expect(container.textContent).toContain(formatMoney(1010, "en", "EGP")));
  });

  it("splits a headline balance by currency instead of adding two currencies together", async () => {
    mocks.treasury = [treasuryRow("t1", "EGP", 1000), treasuryRow("t2", "USD", 10)];
    const { container } = await openPage();
    const egp = formatMoney(1000, "en", "EGP");
    const usd = formatMoney(10, "en", "USD");
    await waitFor(() => expect(container.textContent).toContain(usd));
    expect(container.textContent).toContain(egp);
    expect(container.textContent).not.toContain(formatMoney(1010, "en", "EGP"));
  });

  it("keeps today's figures split by the currency each treasury holds", async () => {
    mocks.treasury = [treasuryRow("t1", "EGP", 1000), treasuryRow("t2", "USD", 10)];
    mocks.today = [txRow("x1", "t1", 7, 1007), txRow("x2", "t2", 5, 15)];
    const { container } = await openPage();
    await waitFor(() => expect(container.textContent).toContain(formatMoney(5, "en", "USD")));
    expect(container.textContent).toContain(formatMoney(7, "en", "EGP"));
    expect(container.textContent).not.toContain(formatMoney(12, "en", "EGP"));
  });

  it("labels a ledger row in the currency of the treasury it was posted to", async () => {
    mocks.treasury = [treasuryRow("t1", "EGP", 1000), treasuryRow("t2", "USD", 10)];
    mocks.ledger = [txRow("x1", "t1", 7, 1007), txRow("x2", "t2", 5, 15)];
    mocks.today = mocks.ledger;
    const { container } = await openPage();
    await waitFor(() => expect(container.textContent).toContain(formatMoney(15, "en", "USD")));
    expect(container.textContent).not.toContain(formatMoney(5, "en", "EGP"));
    expect(container.textContent).not.toContain(formatMoney(15, "en", "EGP"));
  });
});
