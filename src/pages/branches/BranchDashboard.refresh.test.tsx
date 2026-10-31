import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

// C6 follow-up. The dashboard re-reads five queries on every `postgres_changes`
// event, every window focus and every desk mutation. It used to gate all nine KPI
// slots on that read's `loading` flag, so a busy branch saw its day's numbers turn
// into "—" several times a minute. The two things that must stay true: a re-read of
// the branch already on screen keeps its numbers, and a re-read that belongs to a
// branch the desk has left can never paint under the new branch's name.

const mocks = vi.hoisted(() => {
  const makeGate = () => {
    let release: () => void = () => {};
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
  };
  return {
    branch: { currentBranchId: "branch-a" as string | null },
    syncCb: null as null | (() => void),
    gates: new Map<string, ReturnType<typeof makeGate>>(),
    rows: new Map<string, unknown[]>(),
    makeGate,
  };
});

vi.mock("@/lib/dataSync", () => ({
  useDataSync: (_tables: unknown, cb: () => void) => { mocks.syncCb = cb; },
  notifyDataChange: () => {},
}));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: mocks.branch.currentBranchId, subscription: null, subscriptionLoading: false }),
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@/lib/realtime", () => ({ subscribeResilient: () => () => {} }));
vi.mock("@/lib/queueSettings", () => ({ fetchQueueSettings: async () => null }));
vi.mock("@/lib/queueAlerts", () => ({
  listOpenAlerts: async () => [],
  listRecentAlerts: async () => [],
  snoozeAlert: async () => ({ ok: true }),
  acknowledgeAlert: async () => ({ ok: true }),
  unsnoozeAlert: async () => ({ ok: true }),
  effectiveState: () => "active",
  snoozePresets: [],
}));

// Every read waits on that branch's gate when one is set, so a test can hold a
// realtime re-read open and look at the board while it is in flight.
vi.mock("@/integrations/supabase/client", () => {
  const answer = (table: string, branchId: string) => {
    const gate = mocks.gates.get(branchId);
    return (gate ? gate.promise : Promise.resolve()).then(() => ({
      data: table === "branches" ? { name_en: `Branch ${branchId}`, name_ar: `فرع ${branchId}` } : mocks.rows.get(branchId) ?? [],
      error: null,
    }));
  };
  return {
    supabase: {
      from: (table: string) => {
        let branchId = "";
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (field: string, value: string) => {
            if (field === "branch_id" || (field === "id" && table === "branches")) branchId = value;
            return chain;
          },
          gte: () => chain,
          lte: () => chain,
          is: () => chain,
          maybeSingle: () => answer(table, branchId),
          then: (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
            answer(table, branchId).then(onFulfilled, onRejected),
        };
        return chain;
      },
    },
  };
});

import BranchDashboard from "./BranchDashboard";

const MINUTE = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString();

// One waiting patient checked in ten minutes ago: the day has a number to show and
// the longest-wait slot is a duration, so "—" only ever means "still reading".
const day = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `appt-${i}`,
  status: "confirmed",
  scheduled_at: ago(30),
  checked_in_at: ago(10),
  started_at: null,
  patients: { first_name_en: "Pat", last_name_en: String(i), first_name_ar: null, last_name_ar: null },
}));

const statValue = (label: string) => {
  const labelEl = screen.getByText(label);
  return labelEl.parentElement?.children[1]?.textContent ?? null;
};

const open = () => render(<MemoryRouter><BranchDashboard /></MemoryRouter>);

afterEach(() => {
  cleanup();
  mocks.gates.clear();
  mocks.rows.clear();
  mocks.branch.currentBranchId = "branch-a";
  mocks.syncCb = null;
});

it("keeps the day's numbers on screen while a realtime re-read is in flight", async () => {
  mocks.rows.set("branch-a", day(3));
  open();
  await waitFor(() => expect(statValue("Total today")).toBe("3"));
  const dashesAtRest = screen.queryAllByText("—").length;

  const reread = mocks.makeGate();
  mocks.gates.set("branch-a", reread);
  mocks.rows.set("branch-a", day(5));
  act(() => { mocks.syncCb?.(); });

  expect(statValue("Total today")).toBe("3");
  expect(screen.queryAllByText("—")).toHaveLength(dashesAtRest);

  await act(async () => { reread.release(); });
  await waitFor(() => expect(statValue("Total today")).toBe("5"));
});

it("never paints one branch's day under another branch's name", async () => {
  mocks.rows.set("branch-a", day(3));
  mocks.rows.set("branch-b", day(7));
  const view = open();
  await waitFor(() => expect(statValue("Total today")).toBe("3"));

  const bRead = mocks.makeGate();
  mocks.gates.set("branch-b", bRead);
  mocks.branch.currentBranchId = "branch-b";
  view.rerender(<MemoryRouter><BranchDashboard /></MemoryRouter>);

  expect(statValue("Total today")).toBe("—");

  await act(async () => { bRead.release(); });
  await waitFor(() => expect(statValue("Total today")).toBe("7"));
});

it("drops a read that answers after the desk has left its branch", async () => {
  mocks.rows.set("branch-a", day(3));
  mocks.rows.set("branch-b", day(7));
  const aRead = mocks.makeGate();
  mocks.gates.set("branch-a", aRead);
  const view = open();
  expect(statValue("Total today")).toBe("—");

  mocks.branch.currentBranchId = "branch-b";
  view.rerender(<MemoryRouter><BranchDashboard /></MemoryRouter>);
  await waitFor(() => expect(statValue("Total today")).toBe("7"));

  await act(async () => { aRead.release(); });
  expect(statValue("Total today")).toBe("7");
});
