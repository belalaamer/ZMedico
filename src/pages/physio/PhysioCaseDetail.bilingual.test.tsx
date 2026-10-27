import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  lang: "en" as "en" | "ar",
  visible: true,
  cases: [] as Array<Record<string, any>>,
  sessions: [] as Array<Record<string, any>>,
  reassessments: [] as Array<Record<string, any>>,
  writes: [] as Array<Record<string, any>>,
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "case-1" }),
  Link: ({ children }: any) => <a>{children}</a>,
}));
vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ lang: state.lang, setLang: vi.fn(), t: (key: string) => key }),
}));
vi.mock("@/lib/authz/useAuthorization", () => ({ useAuthorization: () => ({ authz: { can: () => true } }) }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock("@/lib/realtime", () => ({ subscribeResilient: () => () => {} }));
vi.mock("@/lib/observability/phiAudit", () => ({ logPhiAccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

// Reads answer from the seeded rows; an update only applies when the row is
// visible, which is how RLS filtering to zero rows reaches the client.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const q: any = {
        _patch: null as Record<string, any> | null,
        _selected: false,
        select: () => { q._selected = true; return q; },
        update: (value: Record<string, any>) => { q._patch = value; state.writes.push(value); return q; },
        eq: (column: string, value: unknown) => { filters.push([column, value]); return q; },
        is: (column: string, value: unknown) => { filters.push([column, value]); return q; },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: any, reject: any) => settle().then(resolve, reject),
      };
      const rows = () => {
        const source = table === "physio_cases" ? state.cases
          : table === "physio_sessions" ? state.sessions
          : table === "physio_reassessments" ? state.reassessments
          : [];
        if (!state.visible) return [];
        return source.filter((r) => filters.every(([column, value]) => r[column] === value));
      };
      async function settle() {
        if (q._patch === null) return { data: rows(), error: null };
        const touched = rows();
        touched.forEach((r) => Object.assign(r, q._patch));
        return { data: q._selected ? touched.map((r) => ({ id: r.id })) : null, error: null };
      }
      return q;
    },
  },
}));

import PhysioCaseDetail from "./PhysioCaseDetail";

function seed() {
  state.visible = true;
  state.writes.length = 0;
  state.cases = [{
    id: "case-1", branch_id: "branch-a", patient_id: "patient-1", status: "active",
    diagnosis: "Low back pain", start_date: "2026-10-01", expected_sessions: 2,
    therapist_id: null, completion_summary: null, pause_reason: null,
    followup_enabled: false, followup_due_date: null, followup_interval_days: 14,
    treatment_goal: "Full ROM", treatment_plan: null, notes: null, deleted_at: null,
    patients: { first_name_en: "Mona", last_name_en: "Saleh", first_name_ar: "منى", last_name_ar: "صالح", name_language: "ar", patient_code: 12 },
    branches: { name_en: "Blitz", name_ar: "بلتس" },
  }];
  state.sessions = [
    { id: "s-1", case_id: "case-1", session_number: 1, session_date: "2026-10-05", attendance: "done", pain_level: 4, interventions: "ROM", progress_note: null, next_recommendation: null, appointment_id: null, deleted_at: null },
    { id: "s-2", case_id: "case-1", session_number: 2, session_date: "2026-10-08", attendance: "missed", pain_level: null, interventions: null, progress_note: null, next_recommendation: null, appointment_id: null, deleted_at: null },
  ];
  state.reassessments = [{ id: "r-1", case_id: "case-1", assessment_date: "2026-10-20", trend: "improving", initial_condition: "ROM limited", current_condition: null, plan_update: null, notes: null, deleted_at: null }];
}

beforeEach(() => { state.lang = "en"; seed(); vi.clearAllMocks(); });
afterEach(cleanup);

// A20: this screen used to speak English to an Arabic desk, raw status enums
// included. The reassessments and follow-up panels are lazy-mounted by Radix and
// cannot be opened under jsdom, so this covers the default Sessions panel and
// the chrome around it.
it("speaks Arabic to the Arabic desk, enums included", async () => {
  state.lang = "ar";
  render(<PhysioCaseDetail />);
  await screen.findByText("منى صالح");
  expect(screen.getByRole("tab", { name: "الجلسات" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "إعادة التقييم" })).toBeInTheDocument();
  expect(screen.getByText("إجراءات سريعة")).toBeInTheDocument();
  expect(screen.getByText("تسجيل جلسة")).toBeInTheDocument();
  expect(screen.getByText("تمت")).toBeInTheDocument();
  expect(screen.getByText("لم تحضر")).toBeInTheDocument();
  expect(screen.getByText("نشطة")).toBeInTheDocument();
  expect(screen.getByText("التدخلات:")).toBeInTheDocument();
  expect(screen.queryByText("Quick actions")).not.toBeInTheDocument();
  expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
  expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  expect(screen.queryByText("done")).not.toBeInTheDocument();
  expect(screen.queryByText("active")).not.toBeInTheDocument();
});

it("leaves the English desk exactly as it was", async () => {
  render(<PhysioCaseDetail />);
  await screen.findByText("Mona Saleh");
  expect(screen.getByRole("tab", { name: "Sessions" })).toBeInTheDocument();
  expect(screen.getByText("Quick actions")).toBeInTheDocument();
  expect(screen.getByText("Log session")).toBeInTheDocument();
  expect(screen.getByText("Interventions:")).toBeInTheDocument();
  expect(screen.getByText("done")).toBeInTheDocument();
  expect(screen.getByText("missed")).toBeInTheDocument();
  expect(screen.getByText("Active")).toBeInTheDocument();
});
