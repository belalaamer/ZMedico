import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import Shift from "./Shift";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true }),
}));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
// Radix Select cannot be opened in jsdom; this is the same stub
// TransferDialog.test.tsx uses, so the handover choice is a plain option list.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

/** The rows fn_treasury_shift_state answers with, set per test. */
const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

/** Every column the state RPC returns, for a till with no open shift. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    treasury_id: "t1",
    name_en: "Main till",
    name_ar: "الخزينة الرئيسية",
    currency: "EGP",
    shift_id: null,
    shift_status: "idle",
    opened_at: null,
    opened_by: null,
    opener_name: null,
    opening_counted: null,
    opening_book: null,
    opening_gap: null,
    inherited_counted: null,
    opening_variance: null,
    shift_cash_income: null,
    shift_cash_outflow: null,
    shift_non_cash_income: null,
    shift_non_cash_outflow: null,
    shift_entries: null,
    expected_cash: null,
    cumulative_cash: 4000,
    unexplained_book_movement: null,
    last_closed_at: null,
    last_closer_name: null,
    last_counted: null,
    last_variance: null,
    last_handed_over_name: null,
    ...overrides,
  };
}

const openRow = (overrides: Record<string, unknown> = {}) =>
  row({
    shift_id: "s1",
    shift_status: "open",
    opened_at: "2026-11-05T09:00:00.000Z",
    opened_by: "user-1",
    opener_name: "Nour",
    opening_counted: 200,
    opening_book: 200,
    opening_gap: 0,
    shift_cash_income: 60,
    shift_cash_outflow: 10,
    shift_non_cash_income: 0,
    shift_non_cash_outflow: 0,
    shift_entries: 4,
    expected_cash: 250,
    unexplained_book_movement: 0,
    ...overrides,
  });

async function mountDesk() {
  const view = render(<Shift />);
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fn_treasury_shift_state", { _branch_id: "branch-1" }));
  return view;
}

/** Mounts an open till and returns its close dialog. */
async function mountCloseDialog(till = openRow()) {
  state.rows = [till];
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "fn_treasury_shift_state") return { data: state.rows, error: null };
    if (name === "fn_treasury_shift_handover_candidates") {
      return { data: [{ user_id: "user-2", full_name: "Salma", roles: "receptionist" }], error: null };
    }
    return { error: null };
  });
  await mountDesk();
  fireEvent.click(screen.getByRole("button", { name: "shiftClose" }));
  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "fn_treasury_shift_state" ? { data: state.rows, error: null } : { error: null },
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the shift desk writes nothing but through the shift RPCs", () => {
  it("reads through fn_treasury_shift_state and never touches the table", async () => {
    state.rows = [openRow()];
    await mountDesk();
    await waitFor(() => expect(screen.getByText("Main till")).toBeInTheDocument());
    // authenticated holds no table privilege on treasury_shifts at all, so a
    // `from(...)` here is a request the server answers with 42501.
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("opens a shift with the counted amount and nothing else", async () => {
    state.rows = [row()];
    await mountDesk();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "shiftOpen" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fn_treasury_shift_open", {
      _treasury_id: "t1",
      _opening_counted: 300,
      _notes: null,
    }));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps the drawer's figure and the cumulative figure two different numbers", async () => {
    state.rows = [openRow()];
    const { container } = await mountDesk();
    await waitFor(() => expect(screen.getByText("Main till")).toBeInTheDocument());
    expect(container.textContent).toContain(formatMoney(250, "en", "EGP"));
    expect(container.textContent).toContain(formatMoney(4000, "en", "EGP"));
    expect(screen.getByText("cumulativeNotYours")).toBeInTheDocument();
    // The desk must never add the two: cumulative cash is not custody money.
    expect(container.textContent).not.toContain(formatMoney(4250, "en", "EGP"));
  });

  it("calls out the gap the opening count left against the books", async () => {
    state.rows = [openRow({ opening_book: 215, opening_gap: -15 })];
    const { container } = await mountDesk();
    await waitFor(() => expect(container.textContent).toMatch(/openingGap.*short of/));
  });
});

describe("closing a shift", () => {
  it("sends the counted amount and the chosen receiver, and no variance", async () => {
    const dialog = await mountCloseDialog();
    fireEvent.change(dialog.getByRole("spinbutton"), { target: { value: "240" } });
    fireEvent.change(dialog.getByRole("combobox"), { target: { value: "user-2" } });
    fireEvent.click(dialog.getByRole("button", { name: "shiftClose" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fn_treasury_shift_close", {
      _treasury_id: "t1",
      _closing_counted: 240,
      _handed_over_to: "user-2",
      _notes: null,
    }));
    const body = mocks.rpc.mock.calls.find((call) => call[0] === "fn_treasury_shift_close")?.[1] as Record<string, unknown>;
    // The stored variance is the figure fn_treasury_shift_close computes from the
    // ledger; a number invented here is the old daily close's mistake.
    expect(Object.keys(body)).toEqual(["_treasury_id", "_closing_counted", "_handed_over_to", "_notes"]);
  });

  it("sends no receiver when the till is closed without a handover", async () => {
    const dialog = await mountCloseDialog();
    fireEvent.change(dialog.getByRole("spinbutton"), { target: { value: "250" } });
    fireEvent.click(dialog.getByRole("button", { name: "shiftClose" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fn_treasury_shift_close", expect.objectContaining({
      _closing_counted: 250,
      _handed_over_to: null,
    })));
  });

  it("says the shift was already closed instead of reporting a success", async () => {
    const dialog = await mountCloseDialog();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fn_treasury_shift_close") {
        return { error: { code: "55000", message: "No open shift for this till" } };
      }
      return { data: state.rows, error: null };
    });
    fireEvent.change(dialog.getByRole("spinbutton"), { target: { value: "250" } });
    fireEvent.click(dialog.getByRole("button", { name: "shiftClose" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("There is no open shift on this till."));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("prints a dash for a custody line whose person has no name on file", async () => {
    state.rows = [row({
      last_closed_at: "2026-11-04T18:00:00.000Z",
      last_closer_name: null,
      last_counted: 980,
      last_variance: -20,
    })];
    await mountDesk();
    await waitFor(() => expect(screen.getByText("Closed by")).toBeInTheDocument());
    // profiles.full_name is NULL for the identities Production actually holds.
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});

describe("a failed read is never mistaken for an empty desk", () => {
  it("shows the refusal instead of the no-tills card", async () => {
    mocks.rpc.mockImplementation(async () => ({
      data: null,
      error: { code: "42501", message: 'permission denied for table "treasury_shifts"' },
    }));
    const { container } = await mountDesk();

    await waitFor(() => expect(container.textContent).toMatch(/not allowed to make this change/));
    expect(screen.queryByText("This branch has no treasuries yet.")).not.toBeInTheDocument();
    // A till that simply failed to load must not offer an opening count: the
    // drawer would be counted against a shift that is already running.
    expect(screen.queryByRole("button", { name: "shiftOpen" })).not.toBeInTheDocument();
  });

  it("re-reads through the same RPC when the desk taps try again", async () => {
    let refusal = true;
    mocks.rpc.mockImplementation(async () => {
      if (refusal) {
        refusal = false;
        return { data: null, error: { code: "42501", message: "permission denied" } };
      }
      return { data: state.rows, error: null };
    });
    state.rows = [openRow()];
    const { container } = await mountDesk();
    await waitFor(() => expect(container.textContent).toMatch(/not allowed to make this change/));

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Main till")).toBeInTheDocument());
  });
});
