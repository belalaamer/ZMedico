import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PostgREST answers a write that RLS filtered to zero rows with HTTP 2xx and no
// representation, so the only way to know a cancel cascade actually ran is to
// watch the statements the screen emits. This mock records every write and
// hands back the row set Production would return for it.
const api = vi.hoisted(() => ({
  statements: [] as { table: string; op: string; asked: boolean; filters: string[]; payload: any }[],
  rows: {} as Record<string, any[]>,
  plans: [] as any[],
  sessions: [] as any[],
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: null }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "staff-a", email: "staff-a@example.invalid" } }) }));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { can: () => true }, loading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));
vi.mock("react-router-dom", () => ({ Link: ({ children }: any) => children }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const st = { table, op: "select", asked: false, filters: [] as string[], payload: undefined as any };
    const run = () => {
      if (st.op === "select") {
        return { data: st.table === "treatment_plans" ? api.plans : st.table === "treatment_sessions" ? api.sessions : [], error: null };
      }
      api.statements.push(st);
      return { data: api.rows[st.table] ?? [], error: null };
    };
    const b: any = {
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
      select: () => { st.asked = true; return b; },
      update: (p: any) => { st.op = "update"; st.payload = p; return b; },
      insert: (p: any) => { st.op = "insert"; st.payload = p; return b; },
      delete: () => { st.op = "delete"; return b; },
      single: () => { const r = run(); return Promise.resolve({ data: (r.data ?? [])[0], error: r.error }); },
      maybeSingle: () => { const r = run(); return Promise.resolve({ data: (r.data ?? [])[0] ?? null, error: r.error }); },
    };
    for (const f of ["eq", "neq", "is", "in", "gte", "lte", "not", "ilike", "order", "limit"]) {
      b[f] = (...args: any[]) => { st.filters.push(`${f}(${args[0]})`); return b; };
    }
    return b;
  };
  return { supabase: { from: builder, rpc: () => Promise.resolve({ data: [], error: null }) } };
});

import PatientTreatmentPlans from "./PatientTreatmentPlans";

const plan = { id: "plan-1", patient_id: "patient-1", status: "active", name_en: "Rotator cuff rehab", total_sessions: 2, price: 0, doctor_id: null, invoice_id: null, deleted_at: null };
const sessions = [
  { id: "s-1", treatment_plan_id: "plan-1", session_number: 1, status: "pending", appointment_id: "appt-1", scheduled_date: "2026-10-05", performed_at: null, notes: null, doctor_id: null },
  { id: "s-2", treatment_plan_id: "plan-1", session_number: 2, status: "pending", appointment_id: "appt-2", scheduled_date: "2026-10-12", performed_at: null, notes: null, doctor_id: null },
];

async function openCancel() {
  render(<PatientTreatmentPlans patientId="patient-1" />);
  await screen.findByText("Rotator cuff rehab");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancel plan" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.statements = [];
  api.rows = {};
  api.plans = [plan];
  api.sessions = sessions;
});
afterEach(cleanup);

// Mounting the plan screen costs the whole first render, so the suite budget for
// this file is raised instead of the assertions being weakened.
describe("treatment plan cancellation", { timeout: 20000 }, () => {
  it("stops the cascade when the plan row itself was not written", async () => {
    // "tp update" only lets the plan's own doctor through, so a second doctor
    // pressing Cancel gets zero rows back for the plan.
    api.rows = { treatment_plans: [] };
    await openCancel();
    await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.statements.map((s) => s.table)).toEqual(["treatment_plans"]);
    expect(api.error).toHaveBeenCalledWith(expect.stringContaining("Nothing was saved"));
    expect(api.success).not.toHaveBeenCalled();
  });

  it("cancels the plan, its sessions and its appointments when every write lands", async () => {
    api.rows = { treatment_plans: [{ id: "plan-1" }], appointments: [{ id: "appt-1" }, { id: "appt-2" }], treatment_sessions: sessions };
    await openCancel();
    await waitFor(() => expect(api.success).toHaveBeenCalled());
    expect(api.statements.map((s) => s.table)).toEqual(["treatment_plans", "appointments", "treatment_sessions"]);
    expect(api.statements.every((s) => s.asked)).toBe(true);
    expect(api.error).not.toHaveBeenCalled();
  });

  it("says which half survived when no linked appointment was cancelled", async () => {
    api.rows = { treatment_plans: [{ id: "plan-1" }], appointments: [], treatment_sessions: sessions };
    await openCancel();
    await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.error).toHaveBeenCalledWith(expect.stringContaining("none of the linked appointments"));
    expect(api.success).not.toHaveBeenCalled();
  });

  it("warns when part of this plan's own sessions stayed pending", async () => {
    api.rows = { treatment_plans: [{ id: "plan-1" }], appointments: [{ id: "appt-1" }], treatment_sessions: [sessions[0]] };
    await openCancel();
    await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.error).toHaveBeenCalledWith(expect.stringContaining("some of its sessions were not"));
    expect(api.success).not.toHaveBeenCalled();
  });
});
